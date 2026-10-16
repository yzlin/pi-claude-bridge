// Internal IPC worker. Not a standalone command and never an auth probe.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { COHORT, LANES } from "./opus-thinking-budget.mjs";
import { observeSdk, hash } from "./native-cache-qualification-transport.mjs";

if (!process.send || process.argv.length !== 2) throw new Error("parent IPC required");
const pending = new Map(); let sequence = 0, h, warmer, fatal = false, initialized = false;
function rpc(operation, fields) {
	const id = sequence++;
	return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); process.send({ type: "budget", requestId: id, operation, ...fields }); });
}
async function cleanup() { warmer?.cancel(); await h?.close(); }
process.on("disconnect", () => { void cleanup().finally(() => process.exit(1)); setTimeout(() => process.exit(1), 1000).unref(); });
process.on("SIGTERM", () => { void cleanup().finally(() => process.exit(1)); setTimeout(() => process.exit(1), 1000).unref(); });
let execute;
process.on("message", async message => {
	if (message.type === "budget-result") {
		const request = pending.get(message.requestId); pending.delete(message.requestId);
		if (!request) { fatal = true; return; }
		if (message.ok) request.resolve(message.value); else request.reject(new Error("budget refused"));
		return;
	}
	try {
		if (message.type === "init") {
			assert.ok(!initialized && COHORT.includes(message.model) && LANES.includes(message.lane) && typeof message.offline === "boolean");
			initialized = true; execute = await initialize(message); process.send({ type: "ready" });
		} else if (message.type === "command") {
			assert.ok(execute && !fatal);
			const value = await execute(message.command);
			process.send({ type: "result", id: message.id, value });
		} else if (message.type === "close") { await cleanup(); process.exit(0); }
		else throw new Error("invalid parent message");
	} catch {
		fatal = true;
		// Errors may contain SDK account data, prompts, or local paths. Never send
		// their messages/stacks. Partial wire/usage evidence is separately sanitized.
		process.send({ type: "failure", reason: "worker gate or execution failed", records: summaries() });
		await cleanup(); process.exit(1);
	}
});
function summaries() {
	return (h?.records ?? []).map(row => ({ id: row.id, phase: row.phase, refresh: row.refresh, requestAt: row.requestAt,
		wire: row.wire, provider: row.provider, sdkUsage: row.sdkUsage, accountLane: row.accountLane, runtimeHash: row.runtimeHash, optionsShape: row.optionsShape }));
}
export function workerConfigRoot(cwd, offline, env = process.env) {
	assert.equal(typeof offline, "boolean");
	assert.ok(typeof env.TMPDIR === "string" && isAbsolute(env.TMPDIR));
	assert.match(basename(env.TMPDIR), /^arm-\d+$/);
	assert.equal(cwd, join(env.TMPDIR, "project"));
	assert.equal(env.PI_CODING_AGENT_DIR, join(env.TMPDIR, "pi-agent"));
	if (offline) {
		assert.equal(env.HOME, join(env.TMPDIR, "home"));
		assert.equal(env.CLAUDE_CONFIG_DIR, join(env.HOME, ".claude"));
		return join(env.HOME, ".claude");
	}
	// Live keeps the real HOME; never scan it whole. Transcripts are scoped to this
	// arm's own project directory once the seed has created it.
	assert.ok(typeof env.HOME === "string" && isAbsolute(env.HOME) && !env.TMPDIR.startsWith(env.HOME + "/.claude"));
	assert.ok(!Object.hasOwn(env, "CLAUDE_CONFIG_DIR"));
	return undefined;
}
export function transcripts(root = process.env.CLAUDE_CONFIG_DIR ?? join(process.env.HOME, ".claude")) {
	const result = {};
	function walk(path, prefix) { for (const entry of readdirSync(path, { withFileTypes: true })) {
		const next = join(path, entry.name), name = `${prefix}/${entry.name}`;
		if (entry.isDirectory()) walk(next, name);
		else if (entry.name.endsWith(".jsonl")) result[name] = hash(readFileSync(next));
	} }
	walk(root, ""); return result;
}
// Exact ordinary options the bridge sends per Pi level (Opus 5.5 thinkingLevelMap:
// minimal -> null, so no effort and Claude Code's default adaptive thinking).
export function laneThinking(lane) {
	if (lane === "off") return { thinking: { type: "disabled" }, effort: undefined };
	return { thinking: undefined, effort: lane === "minimal" ? undefined : lane };
}
export function laneWire(lane) {
	return body => {
		if (lane === "off") { assert.ok(!body.thinking || body.thinking.type === "disabled", "wire thinking enabled"); return; }
		assert.equal(body.thinking?.type, "adaptive", "wire thinking not adaptive");
		if (lane !== "minimal") assert.equal(body.output_config?.effort, lane, "wire effort differs from lane");
	};
}
async function initialize({ offline, model: modelId, lane, nonce, cwd, offlineFault, deadlineAt }) {
	assert.ok(Number.isSafeInteger(deadlineAt) && deadlineAt > Date.now());
	setTimeout(() => { fatal = true; void cleanup().finally(() => process.exit(1)); }, deadlineAt - Date.now()).unref();
	assert.ok(offline || offlineFault === undefined);
	assert.match(nonce, /^[a-f0-9-]{36}$/);
	let configRoot = workerConfigRoot(cwd, offline);
	process.chdir(cwd);
	let warming;
	h = await observeSdk({ offline, offlineFault, deadlineAt, rpc, onFatal: () => { fatal = true; },
		wireThinking: laneWire(lane), simulatedServedModel: modelId,
		evidenceAccount: account => warming.accountEvidence(account),
		async preflight(options, resolveSettings) {
			assert.ok(!options.pathToClaudeCodeExecutable && !options.spawnClaudeCodeProcess);
			assert.deepEqual({ thinking: options.thinking, effort: options.effort }, laneThinking(lane));
			if (!options.forkSession) assert.equal(options.settingSources, undefined, "ordinary settingSources must remain default");
			const resolved = await resolveSettings({ cwd: options.cwd, settingSources: options.settingSources });
			const runtime = warming.warmingRuntime(resolved, options.settings);
			assert.ok(warming.preflightRuntime(runtime).ok, "pre-spawn runtime refused");
			return hash(runtime);
		},
	});
	// Must follow SDK instrumentation: both production imports see the wrapper.
	warming = await import("../../src/cache-warming.ts");
	assert.equal(warming.WARMING_SDK_VERSION, "0.3.293");
	const qualified = new Set(), coordinator = new warming.CacheWarmingCoordinator({ qualified });
	globalThis[Symbol.for("claude-bridge:cacheWarmingCoordinator")] = coordinator;
	delete globalThis[Symbol.for("claude-bridge:activeStreamSimple")];
	const { default: activate, __test: bridge } = await import("../../src/index.ts");
	const handlers = new Map(); let provider;
	activate({ on(name, handler) { const list = handlers.get(name) ?? []; list.push(handler); handlers.set(name, list); }, registerProvider(_id, config) { provider = config; } });
	assert.equal(provider.streamSimple, bridge.streamClaudeAgentSdk);
	// Production plugin switch-off learns ids at session start; give it the same start.
	for (const handler of handlers.get("session_start") ?? []) handler({ reason: "startup" }, { ui: undefined, mode: "print", cwd, sessionManager: { getSessionId: () => nonce } });
	await delay(1000);
	const registered = provider.models.find(model => model.id === modelId);
	assert.ok(registered, "cohort model absent");
	const model = { ...registered, provider: "claude-bridge", api: "claude-bridge", baseUrl: "claude-bridge" };
	assert.ok(Object.values(model.cost).every(price => price === 0));
	const filler = Array.from({ length: 600 }, (_, i) => `Synthetic inert record ${i}: amber quartz beside blue cedar; no instructions or real information.`).join("\n");
	const systemPrompt = `Synthetic qualification ${nonce}. Never call tools. Reply only K.`;
	for (const handler of handlers.get("before_agent_start")) await handler({ systemPrompt, systemPromptOptions: { customPrompt: systemPrompt, contextFiles: [], skills: [] } });
	assert.ok(bridge.promptCaptures.resolve(systemPrompt));
	const context = { systemPrompt, messages: [{ role: "user", content: `${nonce}\n${filler}\nReply K only, never call tools.`, timestamp: 1 }],
		tools: [{ name: "sentinel", description: `Inert arm-specific sentinel ${nonce}. Never execute.\n${filler}`, parameters: { type: "object", properties: {} } }] };
	const options = { cacheRetention: "short", sessionId: nonce, ...(lane === "off" ? {} : { reasoning: lane }) };
	const piDist = dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")));
	const piVersion = JSON.parse(readFileSync(join(dirname(piDist), "package.json"), "utf8")).version;
	assert.equal(piVersion, "1.2.0"); // the repo's dev Pi; its cache-warmer.js is byte-identical to 0.99.1's (qualified) and 0.87.1's
	const nativeModule = pathToFileURL(join(piDist, "core/cache-warmer.js"));
	const { CacheWarmer } = await import(nativeModule.href);
	let sourceResult, snapshot, sourceWire, initialContext, initialFiles, initialBytes;
	const entries = [], decisions = [], replays = [];
	const eventContext = { model, thinkingLevel: offline && offlineFault === "native-rejection" ? (lane === "high" ? "low" : "high") : lane, isIdle: () => true, sessionManager: { getSessionId: () => options.sessionId } };
	warmer = new CacheWarmer({ streamSimple(replayModel, replayContext, replayOptions) {
		assert.equal(replayOptions.maxTokens, 1); assert.equal(replayOptions.maxRetries, 0);
		replays.push({ maxTokens: replayOptions.maxTokens, maxRetries: replayOptions.maxRetries });
		return provider.streamSimple(replayModel, replayContext, replayOptions);
	} }, { getBranch: () => [{ type: "message", message: sourceResult }], appendUsage(...args) { entries.push(args); return args; } }, () => "idle", async event => {
		assert.equal(event.type, "cache_warming_decision"); assert.equal(event.action, "stop");
		const decision = await handlers.get("cache_warming_decision")[0](event, eventContext);
		decisions.push(decision?.action ?? "stop"); return decision?.action ?? event.action;
	});
	function preserve() {
		assert.deepEqual(context, initialContext);
		assert.equal(hash(readFileSync(snapshot.sourceTranscript.path)), initialBytes);
		assert.deepEqual(transcripts(configRoot), initialFiles);
	}
	return async command => {
		assert.ok(["seed", "refresh", "followup"].includes(command));
		const controller = new AbortController(), timer = setTimeout(() => { controller.abort(); void cleanup(); }, 115_000);
		try {
			if (command === "seed") {
				assert.ok(!snapshot);
				// 5.5 warms only after two consecutive successful SDK sources in one session.
				sourceResult = await provider.streamSimple(model, context, { ...options, signal: controller.signal }).result();
				assert.equal(sourceResult.stopReason, "stop"); await delay(0); assert.ok(!fatal);
				assert.equal(coordinator.snapshot()?.sourceQueryCount, 1);
				context.messages.push(sourceResult, { role: "user", content: "Second synthetic source turn. Reply K only; never call tools.", timestamp: 2 });
				sourceResult = await provider.streamSimple(model, context, { ...options, signal: controller.signal }).result();
				assert.equal(sourceResult.stopReason, "stop"); await delay(0);
				if (offlineFault === "extra-attempt") await h.extraAttempt(h.records[0].id);
				assert.ok(!fatal);
				snapshot = coordinator.snapshot(); assert.ok(snapshot?.sourceTranscript);
				assert.equal(snapshot.owner, provider.streamSimple); assert.deepEqual(snapshot.context, context);
				assert.ok(Object.isFrozen(snapshot.context)); assert.equal(snapshot.settingSources, undefined);
				assert.ok(warming.preflightRuntime(snapshot.settings).ok);
				assert.equal(snapshot.evidence.init.claude_code_version, "2.1.293");
				assert.equal(snapshot.evidence.sourceCachedTokens, sourceResult.usage.cacheRead + sourceResult.usage.cacheWrite);
				qualified.add(warming.warmingQualificationKey(snapshot)); // diagnostic ONLY, derived AFTER actual completion
				if (!offline) {
					const projects = join(process.env.HOME, ".claude", "projects") + "/";
					configRoot = dirname(snapshot.sourceTranscript.path);
					assert.ok(configRoot.startsWith(projects) && !configRoot.slice(projects.length).includes("/"), "source transcript outside its arm project directory");
				}
				initialContext = structuredClone(context); initialFiles = transcripts(configRoot);
				initialBytes = hash(readFileSync(snapshot.sourceTranscript.path));
				const sourceRecord = h.records.at(-1);
				sourceWire = sourceRecord.wire;
				assert.equal(h.records.length, 2); assert.ok(sourceWire);
				assert.equal(snapshot.sourceQueryCount, 2);
				const expected = laneThinking(lane);
				assert.deepEqual(snapshot.thinkingOptions, expected.thinking ? { thinking: expected.thinking } : expected.effort ? { effort: expected.effort } : {});
				assert.equal(sourceRecord.runtimeHash, hash(snapshot.settings), "source snapshot and pre-spawn runtime differ");
				assert.deepEqual(sourceRecord.sdkUsage, sourceRecord.provider.usage);
				assert.deepEqual(Object.fromEntries(["input", "output", "cacheRead", "cacheWrite"].map(key => [key, sourceResult.usage[key]])), {
					input: sourceRecord.sdkUsage.input_tokens, output: sourceRecord.sdkUsage.output_tokens,
					cacheRead: sourceRecord.sdkUsage.cache_read_input_tokens, cacheWrite: sourceRecord.sdkUsage.cache_creation_input_tokens,
				});
				return { kind: "seed", lane, requestAt: h.records.at(-1).requestAt, wireThinking: sourceWire.thinking, wireEffort: sourceWire.effort, sdk: warming.WARMING_SDK_VERSION, pi: piVersion,
					cli: snapshot.evidence.init.claude_code_version, initApiKeySource: snapshot.evidence.init.apiKeySource, initPlugins: (snapshot.evidence.init.plugins ?? []).map(p => p?.source ?? null), cliModel: snapshot.cliModel, servedModel: snapshot.evidence.servedModel,
					backend: snapshot.evidence.usage.provider, canonicalModel: snapshot.evidence.usage.canonicalModel, pricing: snapshot.evidence.usage.costBasis,
					accountLane: snapshot.evidence.account.lane, cachedTokens: snapshot.evidence.sourceCachedTokens,
					runtimeHash: hash(snapshot.settings), contextHash: hash(context), sourceHash: initialBytes,
					pricesZero: true, quotaSavings: "unknown", records: summaries() };
			}
			assert.ok(snapshot); preserve();
			if (command === "refresh") {
				assert.equal(decisions.length, 0, "no refresh retries");
				warmer.start({ model, context, options }, () => true); warmer.onAgentSettled();
				const run = warmer.run; assert.ok(run); clearTimeout(run.timer);
				await warmer.refresh(run); warmer.cancel(); preserve();
				if (decisions[0] !== "warm") return { kind: "rejected", nativeDecision: decisions[0] ?? "missing", records: summaries() };
				assert.equal(entries.length, 1); assert.equal(entries[0][0], "cache_warm"); assert.equal(replays.length, 1); assert.equal(h.records.length, 3);
				const refresh = h.records.at(-1);
				assert.ok(refresh.refresh && refresh.provider);
				assert.deepEqual(refresh.sdkUsage, refresh.provider.usage);
				assert.equal(refresh.provider.usage.output_tokens, 1); assert.equal(refresh.provider.stop, "max_tokens");
				assert.equal(refresh.wire.system, sourceWire.system); assert.equal(refresh.wire.tools, sourceWire.tools);
				assert.deepEqual(refresh.wire.messages.slice(0, sourceWire.messages.length), sourceWire.messages);
				assert.deepEqual([refresh.wire.thinking, refresh.wire.effort], [sourceWire.thinking, sourceWire.effort], "refresh must replay source thinking");
				const usage = Object.fromEntries(["input", "output", "cacheRead", "cacheWrite"].map(key => [key, entries[0][3][key]]));
				assert.deepEqual(usage, { input: refresh.sdkUsage.input_tokens, output: 1, cacheRead: refresh.sdkUsage.cache_read_input_tokens, cacheWrite: refresh.sdkUsage.cache_creation_input_tokens });
				return { kind: "refresh", nativeUsage: usage, requestAt: refresh.requestAt, nativeDecision: decisions[0], sourceUnchanged: true,
					noFork: true, noTools: true, hooks: "preflight-hook-free", prefixExact: true, records: summaries() };
			}
			// An ordinary followup deliberately advances this arm's source history.
			context.messages.push(sourceResult, { role: "user", content: "Synthetic followup. Reply K only; never call tools.", timestamp: 2 });
			const result = await provider.streamSimple(model, context, { ...options, signal: controller.signal }).result();
			assert.equal(result.stopReason, "stop"); await delay(0); assert.ok(!fatal);
			const row = h.records.at(-1); assert.deepEqual(row.sdkUsage, row.provider.usage);
			assert.equal(row.wire.system, sourceWire.system); assert.equal(row.wire.tools, sourceWire.tools);
			assert.deepEqual(row.wire.messages.slice(0, sourceWire.messages.length), sourceWire.messages);
			return { kind: "followup", ordinaryWritesAllowed: true, requestAt: row.requestAt, usage: row.sdkUsage, records: summaries() };
		} finally { clearTimeout(timer); }
	};
}
