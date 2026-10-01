// OFFLINE ONLY: registered bridge -> actual SDK sources -> installed Pi CacheWarmer.
// Fake-key account/init metadata is explicitly simulated, never real account or expiry evidence.
// node --experimental-test-module-mocks --import tsx --import ./tests/lib/setup.mjs --test tests/int-bridge-five-warming.mjs
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setImmediate as nextTurn } from "node:timers/promises";
import { bridgeSdkHarness, SOURCE_USAGE, REFRESH_USAGE } from "./lib/bridge-sdk-harness.mjs";
import { MCP_TOOL_PREFIX } from "../src/skills.ts";

const coordinatorKey = Symbol.for("claude-bridge:cacheWarmingCoordinator");
const ownerKey = Symbol.for("claude-bridge:activeStreamSimple");
const scenarios = {
	"sonnet-ordinary": { modelId: "claude-sonnet-5-5", cliModel: "claude-sonnet-5-5", toolCycle: false },
	"sonnet-tool-cycle": { modelId: "claude-sonnet-5-5", cliModel: "claude-sonnet-5-5", toolCycle: true },
	"opus-ordinary": { modelId: "claude-opus-5-5", cliModel: "claude-opus-5-5[1m]", toolCycle: false },
	"opus-tool-cycle": { modelId: "claude-opus-5-5", cliModel: "claude-opus-5-5[1m]", toolCycle: true },
};
const scenario = process.env.BRIDGE_FIVE_WARMING_SCENARIO;
if (!scenario) {
	// Each child has its own module mock, bridge globals, fake-key HOME and request caps.
	for (const name of Object.keys(scenarios)) test(`offline actual native 5.5: ${name}`, { timeout: 60_000 }, async t => {
		const env = { ...process.env, BRIDGE_FIVE_WARMING_SCENARIO: name };
		delete env.NODE_TEST_CONTEXT;
		try {
			const { stdout } = await promisify(execFile)(process.execPath, [
				"--experimental-test-module-mocks", "--import", "tsx", "--import", "./tests/lib/setup.mjs",
				"--test", fileURLToPath(import.meta.url),
			], { env, timeout: 55_000 });
			assert.match(stdout, /# pass 1|ℹ pass 1/, "child must actually execute its assertions");
			t.diagnostic(stdout);
		} catch (error) {
			t.diagnostic(error.stdout ?? ""); t.diagnostic(error.stderr ?? "");
			throw error;
		}
	});
} else test(`two distinct successful SDK sources authorize native warming: ${scenario}`, { timeout: 50_000 }, async t => {
	assert.ok(Object.hasOwn(scenarios, scenario));
	const { modelId, cliModel, toolCycle } = scenarios[scenario];
	const firstSourceRequests = toolCycle ? 2 : 1;
	const h = await bridgeSdkHarness({ modelId: cliModel, subscriptionType: "Claude Team", sourceToolCycle: toolCycle,
		maxQueries: 3, maxModelRequests: firstSourceRequests + 2 });
	let warmer;
	try {
		// Upstream defaults Sonnet 5.5 to [1m]; only its bare lane is qualified.
		if (cliModel === "claude-sonnet-5-5") {
			const configPath = join(h.home, ".pi", "agent", "claude-bridge.json");
			const config = JSON.parse(readFileSync(configPath, "utf8"));
			config.provider.forceTwoHundredK = [modelId];
			writeFileSync(configPath, JSON.stringify(config));
		}
		// No test-local qualification additions: use the approved production lanes as-is.
		const warming = await import("../src/cache-warming.ts");
		const coordinator = new warming.CacheWarmingCoordinator({ qualified: warming.PRODUCTION_QUALIFIED_WARMING_MODELS });
		globalThis[coordinatorKey] = coordinator; delete globalThis[ownerKey];
		const { default: activate, __test: bridge } = await import("../src/index.ts");
		const handlers = new Map();
		let provider;
		activate({
			on(name, handler) { const list = handlers.get(name) ?? []; list.push(handler); handlers.set(name, list); },
			registerProvider(_id, config) { provider = config; },
		});
		assert.equal(provider.streamSimple, bridge.streamClaudeAgentSdk);
		assert.equal(globalThis[ownerKey], provider.streamSimple);
		const registeredModel = provider.models.find(m => m.id === modelId);
		assert.ok(registeredModel, `missing registered ${modelId}`);
		const model = { ...registeredModel, provider: "claude-bridge", api: "claude-bridge", baseUrl: "claude-bridge" };
		const systemPrompt = "Synthetic offline native 5.5 integration system.";
		for (const handler of handlers.get("before_agent_start")) await handler({ systemPrompt,
			systemPromptOptions: { customPrompt: systemPrompt, contextFiles: [], skills: [] } });
		const context = { systemPrompt,
			messages: [{ role: "user", content: "Synthetic offline first source. Reply K.", timestamp: 1 }],
			tools: [{ name: "sentinel", description: "Inert synthetic Pi tool.", parameters: {
				type: "object", properties: { value: { type: "string" } }, required: ["value"],
			} }],
		};
		const options = { cacheRetention: "short", sessionId: "offline-five-pi-session" };
		let piToolExecutions = 0;
		function executeDeliveredTools(message) {
			return message.content.filter(block => block.type === "toolCall").map(call => {
				assert.equal(call.name, "sentinel"); assert.deepEqual(call.arguments, { value: "synthetic" });
				piToolExecutions++;
				return { role: "toolResult", toolCallId: call.id, toolName: call.name,
					content: [{ type: "text", text: "Synthetic inert tool result." }], isError: false, timestamp: 2 };
			});
		}
		let sourceResult = await provider.streamSimple(model, context, options).result();
		if (toolCycle) {
			assert.equal(sourceResult.stopReason, "toolUse", sourceResult.errorMessage);
			assert.equal(coordinator.snapshot(), undefined, "pending tool query cannot publish source authority");
			context.messages.push(sourceResult, ...executeDeliveredTools(sourceResult));
			sourceResult = await provider.streamSimple(model, context, options).result();
		}
		assert.equal(sourceResult.stopReason, "stop", sourceResult.errorMessage);
		await nextTurn();
		assert.equal(h.queries.length, 1, "an entire Pi tool cycle is ONE SDK query completion");
		assert.equal(h.requests.length, firstSourceRequests);
		assert.equal(h.queries[0].requests.length, firstSourceRequests);
		assert.equal(h.queries[0].result.subtype, "success");
		assert.equal(h.queries[0].result.is_error, false);
		const first = coordinator.snapshot();
		assert.ok(first, "first successful SDK query must publish its source");
		assert.equal(first.verbatimPrompts, true);
		assert.equal(first.cliModel, cliModel);
		assert.equal(h.queries[0].options.extraArgs.model, cliModel);
		assert.equal(h.queries[0].options.verbatimPrompts, true);
		assert.ok(warming.PRODUCTION_QUALIFIED_WARMING_MODELS.has(warming.warmingQualificationKey(first)),
			"production must qualify this model/runtime/accounting lane without test additions");
		assert.equal(warming.accountEvidence(h.actualAccounts[0]).eligible, false,
			"the ACTUAL fake-API-key SDK account must remain ineligible");
		assert.notEqual(h.actualInits[0].apiKeySource, "none");
		assert.equal(first.evidence.account.eligible, true, "explicit offline public account simulation");
		assert.equal(first.evidence.init.apiKeySource, "none", "explicit offline public init simulation");
		assert.ok(h.requests[0].tools.some(tool => tool.name === `${MCP_TOOL_PREFIX}sentinel`));

		const nativeModule = pathToFileURL(join(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))), "core/cache-warmer.js"));
		const { CacheWarmer } = await import(nativeModule.href);
		const entries = [], decisions = [], replays = [], refreshResults = [];
		const eventContext = { model, thinkingLevel: "off", isIdle: () => true,
			sessionManager: { getSessionId: () => options.sessionId } };
		warmer = new CacheWarmer({ streamSimple(m, c, o) {
			replays.push(o);
			const stream = provider.streamSimple(m, c, o);
			return { async result() {
				const result = await stream.result(); refreshResults.push(result); executeDeliveredTools(result); return result;
			} };
		} }, { getBranch: () => [{ type: "message", message: sourceResult }],
			appendUsage(...args) { entries.push(args); return args; },
		}, () => "idle", async event => {
			assert.equal(event.type, "cache_warming_decision");
			assert.equal(event.action, "stop", "zero-priced bridge requires native extension override");
			const [handler] = handlers.get("cache_warming_decision");
			const decision = await handler(event, eventContext);
			decisions.push(decision); return decision?.action ?? event.action;
		});
		async function tickNative() {
			warmer.start({ model, context, options }, () => true); warmer.onAgentSettled();
			const run = warmer.run; assert.ok(run, "installed native run missing");
			clearTimeout(run.timer);
			// Invoke the real native timer callback immediately. No expiry is fabricated.
			await warmer.refresh(run);
		}
		const inventory = () => Object.fromEntries(readdirSync(dirname(first.sourceTranscript.path))
			.filter(path => path.endsWith(".jsonl")).sort()
			.map(path => [path, readFileSync(join(dirname(first.sourceTranscript.path), path)).toString("base64")]));
		const firstInventory = inventory();
		await tickNative();
		assert.deepEqual(decisions, [{ action: "stop" }], "first source, even two HTTP tool turns, must NOT qualify");
		assert.equal(replays.length, 0, "first-source block must precede provider refresh dispatch");
		assert.equal(h.queries.length, 1, "first-source block must precede refresh SDK creation");
		assert.equal(h.requests.length, firstSourceRequests, "first-source block must precede refresh HTTP");
		assert.equal(entries.length, 0);
		assert.deepEqual(inventory(), firstInventory);

		for (const handler of handlers.get("input")) await handler({ text: "Synthetic second ordinary input.", source: "interactive" }, eventContext);
		assert.equal(coordinator.snapshot(), undefined, "input invalidates current snapshot, not completion sequence");
		context.messages.push(sourceResult, { role: "user", content: "Synthetic offline second source. Reply K.", timestamp: 3 });
		sourceResult = await provider.streamSimple(model, context, options).result();
		assert.equal(sourceResult.stopReason, "stop", sourceResult.errorMessage);
		await nextTurn();
		assert.equal(h.queries.length, 2);
		assert.equal(h.requests.length, firstSourceRequests + 1);
		assert.equal(h.queries[1].refresh, false);
		assert.equal(h.queries[1].requests.length, 1);
		assert.equal(h.queries[1].result.subtype, "success");
		assert.equal(h.queries[1].result.is_error, false);
		assert.notEqual(h.queries[1].result.uuid, h.queries[0].result.uuid, "two distinct SDK result completions");
		assert.equal(h.queries[1].result.session_id, h.queries[0].result.session_id);
		const second = coordinator.snapshot();
		assert.ok(second); assert.notEqual(second, first);
		assert.equal(second.sessionId, first.sessionId, "both ordinary SDK queries must share SDK session");
		assert.equal(second.requestOptions.sessionId, options.sessionId);
		assert.equal(second.verbatimPrompts, true);
		assert.equal(second.controlsFingerprint, first.controlsFingerprint);
		assert.deepEqual(second.settings, first.settings);
		assert.deepEqual(second.systemPrompt, first.systemPrompt);
		assert.deepEqual(second.mcpTools, first.mcpTools);
		assert.deepEqual(second.evidence.account, first.evidence.account);
		assert.deepEqual(second.evidence.usage, first.evidence.usage);
		assert.ok(warming.PRODUCTION_QUALIFIED_WARMING_MODELS.has(warming.warmingQualificationKey(second)));
		// Public SDK ModelUsage stays untouched: Opus may key/canonicalize the [1m] request.
		for (const record of h.queries) {
			assert.equal(record.options.extraArgs.model, cliModel);
			assert.equal(record.options.verbatimPrompts, true);
			assert.deepEqual(record.options.thinking, { type: "disabled" });
			assert.ok(record.result.modelUsage[cliModel], "real SDK requested-model usage row missing");
			const row = record.result.modelUsage[cliModel];
			assert.deepEqual(second.evidence.usage, { provider: row.provider, canonicalModel: modelId, costBasis: row.costBasis });
			assert.deepEqual(warming.selectModelUsage(record.result.modelUsage, modelId, cliModel), second.evidence.usage);
		}
		assert.equal(second.evidence.sourceCachedTokens, SOURCE_USAGE.cache_read_input_tokens + SOURCE_USAGE.cache_creation_input_tokens);
		const sourceBytes = readFileSync(second.sourceTranscript.path), beforeRefresh = inventory();
		assert.equal(sourceBytes.toString("base64"), second.sourceTranscript.bytesBase64);
		const originalContext = structuredClone(context);
		const toolsBeforeRefresh = piToolExecutions;
		await tickNative();
		assert.deepEqual(decisions, [{ action: "stop" }, { action: "warm" }], "input must preserve two-completion authority");
		assert.equal(replays.length, 1); assert.equal(refreshResults.length, 1);
		assert.notEqual(refreshResults[0].stopReason, "error", refreshResults[0].errorMessage);
		assert.equal(replays[0].maxTokens, 1); assert.equal(replays[0].maxRetries, 0);
		assert.equal(h.queries.length, 3); assert.equal(h.requests.length, firstSourceRequests + 2);
		const refresh = h.queries[2];
		assert.equal(refresh.refresh, true); assert.equal(refresh.options.resume, second.sessionId);
		assert.equal(refresh.options.verbatimPrompts, true);
		assert.deepEqual(refresh.options.systemPrompt, h.queries[1].options.systemPrompt);
		assert.equal(refresh.options.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, "1");
		assert.equal(refresh.options.env.CLAUDE_CODE_MAX_RETRIES, "0");
		assert.equal(refresh.options.maxTurns, 1); assert.equal(refresh.options.persistSession, false);
		assert.equal(refresh.toolEvents, 0);
		assert.equal(piToolExecutions, toolsBeforeRefresh, "refresh executes zero Pi tools");
		assert.equal(piToolExecutions, toolCycle ? 1 : 0);
		assert.deepEqual(h.unexpected, []);
		assert.equal(entries.length, 1); assert.equal(entries[0][0], "cache_warm");
		assert.equal(entries[0][1], "claude-bridge"); assert.equal(entries[0][2], modelId);
		assert.equal(entries[0][4], "extension override");
		assert.deepEqual(Object.fromEntries(["input", "output", "cacheRead", "cacheWrite"].map(key => [key, entries[0][3][key]])), {
			input: REFRESH_USAGE.input_tokens, output: 1, cacheRead: REFRESH_USAGE.cache_read_input_tokens, cacheWrite: 0,
		});
		assert.equal(entries[0][3].cacheRead, second.evidence.sourceCachedTokens, "refresh must read the entire cached source prefix");
		assert.deepEqual(context, originalContext);
		assert.deepEqual(readFileSync(second.sourceTranscript.path), sourceBytes);
		assert.deepEqual(inventory(), beforeRefresh, "refresh must not create or rewrite transcript files");
		const sourceWire = h.queries[1].requests[0], refreshWire = refresh.requests[0];
		assert.equal(refreshWire.model, modelId, "Opus [1m] is bare on the actual Messages API wire");
		assert.equal(refreshWire.max_tokens, 1);
		assert.deepEqual(refreshWire.system, sourceWire.system);
		assert.deepEqual(refreshWire.tools, sourceWire.tools);
		// Do not compare transcript message prefixes: SDK tool representation can change.
		// Current 5.5 SDK wire can append an inline system-role message.
		const turn = refreshWire.messages.findLast(message => message.role === "user");
		assert.ok(turn, "refresh user turn missing");
		const text = typeof turn.content === "string" ? [turn.content] : turn.content.filter(b => b.type === "text").map(b => b.text);
		assert.equal(turn.role, "user"); assert.ok(text.includes(warming.REFRESH_PROMPT));
		assert.ok(!text.some(value => value.includes("Synthetic offline")), "refresh must not repeat ordinary user input");
		assert.ok(h.actualAccounts.every(account => !warming.accountEvidence(account).eligible));
		t.diagnostic(JSON.stringify({ offlineOnly: true, subscriptionSimulation: "public accountInfo + init apiKeySource only; Claude Team",
			actualFakeKeyAccountRejected: true, sdkQueries: h.queries.length, modelRequests: h.requests.length,
			modelId, cliModel, toolCycle, decisions, nativeUsageEntries: entries.length, expiryEvidence: false }));
	} finally {
		warmer?.cancel(); delete globalThis[coordinatorKey]; delete globalThis[ownerKey];
		await h.close();
	}
});
