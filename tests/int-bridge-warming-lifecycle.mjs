// OFFLINE ONLY: registered provider + actual SDK source + installed native CacheWarmer.
// Subscription metadata is simulation; qualification is exact, source-derived and test-local.
// node --experimental-test-module-mocks --import tsx --import ./tests/lib/setup.mjs --test tests/int-bridge-warming-lifecycle.mjs
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setImmediate as nextTurn } from "node:timers/promises";
import { bridgeSdkHarness, MODEL, REFRESH_USAGE } from "./lib/bridge-sdk-harness.mjs";

const coordinatorKey = Symbol.for("claude-bridge:cacheWarmingCoordinator");
const ownerKey = Symbol.for("claude-bridge:activeStreamSimple");
const scenarios = ["admission-tool-cycle", "thinking-source", "api-key", "environment-decision", "settings-decision",
	"environment-dispatch", "settings-dispatch", "hook-dispatch", "lifecycle-dispatch",
	"account-release", "account-cancel", "account-new-work", "account-settings", "refresh-tool-use", "prefix-miss-recovery"];
const scenario = process.env.BRIDGE_LIFECYCLE_SCENARIO;
if (!scenario) {
	for (const name of scenarios) test(`actual native lifecycle: ${name}`, { timeout: 60_000 }, async t => {
		const env = { ...process.env, BRIDGE_LIFECYCLE_SCENARIO: name };
		delete env.NODE_TEST_CONTEXT;
		try {
			const { stdout } = await promisify(execFile)(process.execPath, [
				"--experimental-test-module-mocks", "--import", "tsx", "--import", "./tests/lib/setup.mjs",
				"--test", fileURLToPath(import.meta.url),
			], { env, timeout: 55_000 });
			assert.match(stdout, /# pass 1|ℹ pass 1/, "child must genuinely execute assertions");
			t.diagnostic(stdout);
		} catch (error) {
			t.diagnostic(error.stdout ?? ""); t.diagnostic(error.stderr ?? "");
			throw error;
		}
	});
} else test(scenario, { timeout: 50_000 }, async t => {
	assert.ok(scenarios.includes(scenario));
	const toolCycle = scenario === "admission-tool-cycle" || scenario === "refresh-tool-use";
	const parked = scenario.startsWith("account-");
	const recovery = scenario === "prefix-miss-recovery";
	const failedRefresh = recovery || scenario === "refresh-tool-use";
	const newWork = scenario === "account-new-work" || recovery;
	const expectedQueries = newWork ? 4 : parked || failedRefresh ? 2 : 1;
	const expectedRequests = recovery ? 4 : scenario === "account-new-work" || scenario === "refresh-tool-use" ? 3
		: scenario === "account-release" || toolCycle ? 2 : 1;
	const h = await bridgeSdkHarness({ sourceToolCycle: toolCycle, maxQueries: expectedQueries, maxModelRequests: scenario === "account-settings" ? 2 : expectedRequests,
		simulateSubscription: scenario !== "api-key", parkFirstRefreshAccount: parked,
		firstRefreshResponse: recovery ? "prefix-miss" : scenario === "refresh-tool-use" ? "tool-use" : "normal" });
	let warmer;
	const entries = [], decisions = [], replays = [], results = [], toolExecutions = [];
	let directReservedDispatches = 0;
	try {
		// Do not move warming/index above the SDK fixture's module mock.
		const warming = await import("../src/cache-warming.ts");
		const qualified = new Set(); // test-local; production lanes never apply to the simulated account
		const coordinator = new warming.CacheWarmingCoordinator({ qualified });
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
		const model = { ...provider.models.find(m => m.id === MODEL), provider: "claude-bridge", api: "claude-bridge", baseUrl: "claude-bridge" };
		const systemPrompt = "Synthetic offline native lifecycle system.";
		for (const handler of handlers.get("before_agent_start")) await handler({ systemPrompt,
			systemPromptOptions: { customPrompt: systemPrompt, contextFiles: [], skills: [] } });
		const context = { systemPrompt, messages: [{ role: "user", content: "Synthetic lifecycle source. Reply K.", timestamp: 1 }],
			tools: [{ name: "sentinel", description: "Synthetic sentinel.", parameters: { type: "object", properties: { value: { type: "string" } }, required: ["value"] } }] };
		const options = { cacheRetention: "short", sessionId: "offline-lifecycle-session", ...(scenario === "thinking-source" ? { reasoning: "low" } : {}) };
		// This executor is wired to BOTH ordinary and reserved provider results. The
		// real ordinary MCP cycle demonstrates that it observes actual Pi tool calls.
		function executeDeliveredTools(message) {
			return message.content.filter(block => block.type === "toolCall").map(call => {
				assert.equal(call.name, "sentinel"); assert.deepEqual(call.arguments, { value: "synthetic" });
				toolExecutions.push(call.id);
				return { role: "toolResult", toolCallId: call.id, toolName: call.name,
					content: [{ type: "text", text: "Synthetic sentinel result." }], isError: false, timestamp: 2 };
			});
		}
		let sourceResult = await provider.streamSimple(model, context, options).result();
		const eventContext = { model, thinkingLevel: scenario === "thinking-source" ? "low" : "off",
			isIdle: () => true, sessionManager: { getSessionId: () => options.sessionId } };
		const nativeModule = pathToFileURL(join(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))), "core/cache-warmer.js"));
		const { CacheWarmer } = await import(nativeModule.href);
		let beforeDispatch;
		warmer = new CacheWarmer({ streamSimple(m, c, o) {
			replays.push(o);
			assert.equal(o.maxTokens, 1); assert.equal(o.maxRetries, 0);
			beforeDispatch?.();
			const stream = provider.streamSimple(m, c, o);
			return { async result() { const result = await stream.result(); results.push(result); executeDeliveredTools(result); return result; } };
		} }, { getBranch: () => [{ type: "message", message: sourceResult }],
			appendUsage(...args) { entries.push(args); return args; } }, () => "idle", async event => {
			assert.equal(event.type, "cache_warming_decision"); assert.equal(event.action, "stop");
			const [handler] = handlers.get("cache_warming_decision");
			const decision = await handler(event, eventContext);
			decisions.push(decision); return decision?.action ?? event.action;
		});
		function startNative() { warmer.start({ model, context, options }, () => true); warmer.onAgentSettled(); }
		async function tickNative() {
			const run = warmer.run; assert.ok(run, "installed native run missing");
			clearTimeout(run.timer); await warmer.refresh(run);
		}
		async function reserved(c = context) {
			directReservedDispatches++;
			const result = await provider.streamSimple(model, c, { ...options, maxTokens: 1, maxRetries: 0 }).result();
			executeDeliveredTools(result);
			assert.equal(result.stopReason, "error"); assert.match(result.errorMessage, /native warming consent missing/);
			return result;
		}
		const transcripts = () => {
			const directory = join(h.config, "projects");
			return existsSync(directory) ? Object.fromEntries(readdirSync(directory, { recursive: true }).filter(p => p.endsWith(".jsonl"))
				.sort().map(p => [p, readFileSync(join(directory, p)).toString("base64")])) : {};
		};
		if (toolCycle) {
			assert.equal(sourceResult.stopReason, "toolUse", sourceResult.errorMessage);
			assert.equal(coordinator.snapshot(), undefined);
			const toolResults = executeDeliveredTools(sourceResult);
			// The SDK need not persist a JSONL before its first tool result. Preserve
			// whatever exists now; completed-source bytes are mandatory below.
			const activeBytes = transcripts();
			const continuation = { ...context, messages: [...context.messages, sourceResult, ...toolResults] };
			if (scenario === "admission-tool-cycle") {
				// Even a candidate carrying a real pending tool result must not deliver it.
				await reserved(continuation);
				startNative(); await tickNative();
				assert.deepEqual(decisions, [{ action: "stop" }]); assert.equal(replays.length, 0);
				assert.equal(h.requests.length, 1); assert.equal(h.queries.length, 1);
				assert.deepEqual(transcripts(), activeBytes);
			}
			context.messages = continuation.messages;
			sourceResult = await provider.streamSimple(model, context, options).result();
		}
		assert.equal(sourceResult.stopReason, "stop", sourceResult.errorMessage);
		await nextTurn(); // ordinary consumer's finally removes the active context
		const sourceRequests = toolCycle ? 2 : 1;
		assert.equal(h.requests.length, sourceRequests); assert.equal(h.queries.length, 1);
		assert.equal(warming.accountEvidence(h.actualAccounts[0]).eligible, false, "actual fake-key account must independently fail eligibility");
		const snapshot = coordinator.snapshot();
		if (scenario === "thinking-source") {
			assert.equal(snapshot, undefined, "thinking-enabled source must not publish warming authority");
			assert.notDeepEqual(h.queries[0].options.thinking, { type: "disabled" });
		} else {
			assert.ok(snapshot, "ordinary completion must publish the actual source");
			assert.equal(snapshot.owner, provider.streamSimple); assert.deepEqual(snapshot.context, context);
			assert.deepEqual(snapshot.requestOptions, options); assert.ok(Object.isFrozen(snapshot.context));
			assert.equal(snapshot.sourceTranscript.bytesBase64, readFileSync(snapshot.sourceTranscript.path).toString("base64"));
			assert.equal(snapshot.evidence.account.eligible, scenario !== "api-key");
			qualified.add(warming.warmingQualificationKey(snapshot));
		}
		let originalContext = structuredClone(context), sourceBytes = transcripts();
		assert.ok(Object.keys(sourceBytes).length);
		const marker = join(h.root, "hook-must-not-run");
		async function ordinaryNewWork() {
			// Ordinary writes are legitimate. Freeze new bytes only after real work,
			// never refresh or fabricate a snapshot to restore warming eligibility.
			context.messages.push(sourceResult, { role: "user", content: "Synthetic new ordinary work. Reply K.", timestamp: 3 });
			sourceResult = await provider.streamSimple(model, context, options).result();
			assert.equal(sourceResult.stopReason, "stop", sourceResult.errorMessage); await nextTurn();
			assert.equal(h.queries.at(-1).refresh, false); assert.equal(h.queries.at(-1).requests.length, 1);
			const current = coordinator.snapshot();
			assert.ok(current); assert.notEqual(current, snapshot);
			assert.deepEqual(current.context, context); assert.deepEqual(current.requestOptions, options);
			assert.equal(current.sourceTranscript.bytesBase64, readFileSync(current.sourceTranscript.path).toString("base64"));
			assert.ok(qualified.has(warming.warmingQualificationKey(current)), "new source must reuse existing exact qualification, not require a test promotion");
			sourceBytes = transcripts(); originalContext = structuredClone(context);
		}
		function assertAccounting() {
			assert.equal(entries.length, 1); assert.equal(entries[0][0], "cache_warm");
			assert.deepEqual(Object.fromEntries(["input", "output", "cacheRead", "cacheWrite"].map(key => [key, entries[0][3][key]])),
				{ input: REFRESH_USAGE.input_tokens, output: 1, cacheRead: REFRESH_USAGE.cache_read_input_tokens, cacheWrite: 0 });
		}
		function changeControls() {
			if (scenario.startsWith("environment-")) process.env.PI_CACHE_RETENTION = "long";
			else if (scenario.startsWith("settings-")) writeFileSync(join(h.config, "settings.json"), JSON.stringify({ includeGitInstructions: false }));
			else if (scenario === "hook-dispatch") writeFileSync(join(h.config, "settings.json"), JSON.stringify({
				hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command: `touch '${marker}'` }] }] },
			}));
			else if (scenario === "lifecycle-dispatch") for (const handler of handlers.get("model_select")) handler({ model }, eventContext);
		}
		if (parked) {
			startNative();
			const pending = tickNative();
			const oldRefresh = await h.refreshAccountGate.reached;
			assert.deepEqual(decisions, [{ action: "warm" }]);
			assert.equal(h.actualAccounts.length, 2, "park must follow real public accountInfo lookup");
			assert.equal(warming.accountEvidence(h.actualAccounts[1]).eligible, false);
			assert.equal(h.queries.length, 2); assert.equal(oldRefresh.requests.length, 0);
			assert.equal(h.requests.length, 1, "no refresh model input before simulated account release");
			assert.equal(entries.length, 0); assert.deepEqual(transcripts(), sourceBytes);
			if (scenario === "account-settings") {
				const settingsPath = join(h.config, "settings.json");
				const previousSettings = existsSync(settingsPath) ? readFileSync(settingsPath, "utf8") : undefined;
				// The hook alone is inert under the query's disableAllHooks; raw env is not.
				writeFileSync(settingsPath, JSON.stringify({ env: { KEEP: "unsafe" }, hooks: { UserPromptSubmit: [
					{ hooks: [{ type: "command", command: `touch '${marker}'` }] },
				] } }));
				const { resolveSettings } = await import("@anthropic-ai/claude-agent-sdk");
				const current = warming.warmingRuntime(await resolveSettings({ cwd: snapshot.cwd, settingSources: snapshot.settingSources }), snapshot.flagSettings);
				assert.equal(warming.preflightRuntime(current).ok, false, "actual public resolver must observe unsafe settings while account is parked");
				assert.notDeepEqual(current, snapshot.settings);
				h.refreshAccountGate.release(); await pending;
				assert.equal(oldRefresh.requests.length, 0, "changed settings must not release model input");
				assert.equal(entries.length, 0); assert.equal(results[0].stopReason, "error");
				assert.match(results[0].errorMessage, /effective settings changed/);
				assert.equal(oldRefresh.options.abortController.signal.aborted, true);
				assert.equal(coordinator.snapshot(), snapshot);
				assert.deepEqual(transcripts(), sourceBytes); assert.equal(existsSync(marker), false);
				// Restore only the disposable fixture: failure must remain suppressed even
				// when current settings again match the unchanged source snapshot.
				if (previousSettings === undefined) unlinkSync(settingsPath); else writeFileSync(settingsPath, previousSettings);
				startNative(); await tickNative();
				assert.deepEqual(decisions, [{ action: "warm" }, { action: "stop" }]);
				await reserved();
			} else if (scenario === "account-release") {
				h.refreshAccountGate.release(); await pending;
				assert.equal(results[0].stopReason, "stop", results[0].errorMessage);
				assert.equal(oldRefresh.requests.length, 1);
			} else {
				if (newWork) await ordinaryNewWork();
				else warmer.cancel(); // installed native cancel -> reserved dispatch signal
				await pending; // cancellation must settle WITHOUT releasing account metadata
				assert.equal(oldRefresh.options.abortController.signal.aborted, true);
				assert.equal(oldRefresh.requests.length, 0); assert.equal(entries.length, 0);
				assert.match(results[0].stopReason, /error|aborted/);
				// New ordinary work can legitimately replace the old transcript before
				// cancelled refresh cleanup checks it. Neither outcome may publish usage.
				assert.match(results[0].errorMessage, newWork ? /refresh aborted|refresh mutated source transcript/ : /refresh aborted/);
				const current = coordinator.snapshot();
				h.refreshAccountGate.release(); await h.refreshAccountGate.returned; await nextTurn();
				assert.equal(coordinator.snapshot(), current, "late cancelled lookup must not revive/replace generation");
				assert.deepEqual(transcripts(), sourceBytes); assert.equal(entries.length, 0);
				assert.equal(oldRefresh.requests.length, 0, "late metadata must not start model input");
				startNative(); await tickNative();
				assert.deepEqual(decisions, [{ action: "warm" }, { action: newWork ? "warm" : "stop" }]);
				if (newWork) assert.equal(results.at(-1).stopReason, "stop", results.at(-1).errorMessage);
			}
			const successful = scenario === "account-release" || newWork;
			assert.equal(entries.length, successful ? 1 : 0);
			if (successful) assertAccounting();
		} else if (failedRefresh) {
			startNative(); await tickNative();
			assert.deepEqual(decisions, [{ action: "warm" }]);
			assert.equal(results.length, 1); assert.equal(results[0].stopReason, "error");
			assert.match(results[0].errorMessage, recovery ? /refresh prefix cache miss/ : /refresh attempted a tool|unexpected refresh assistant/);
			assert.equal(h.queries[1].refresh, true); assert.equal(h.queries[1].requests.length, 1);
			assert.equal(h.requests.at(-1).max_tokens, 1); assert.equal(entries.length, 0);
			if (!recovery) {
				assert.equal(h.queries[1].sentToolCall, true);
				assert.ok(h.queries[1].toolEvents > 0, "actual SDK must deliver tool attempt to public refresh consumer");
				assert.equal(toolExecutions.length, 1, "shared executor sees source tool, never maintenance tool");
				assert.equal(h.queries[1].options.abortController.signal.aborted, true);
			}
			assert.equal(coordinator.snapshot(), snapshot);
			assert.deepEqual(transcripts(), sourceBytes, "failed refresh preserves source/no fork");
			await tickNative(); // native reschedule must stop; do not manually change coordinator
			assert.deepEqual(decisions, [{ action: "warm" }, { action: "stop" }]);
			startNative(); await tickNative(); // restarting native scheduling cannot bypass failure
			assert.equal(decisions.at(-1).action, "stop");
			assert.equal(h.queries.length, 2); assert.equal(h.requests.length, sourceRequests + 1);
			await reserved(); assert.equal(entries.length, 0);
			if (recovery) {
				await ordinaryNewWork();
				startNative(); await tickNative();
				assert.equal(decisions.at(-1).action, "warm");
				assert.equal(results.at(-1).stopReason, "stop", results.at(-1).errorMessage);
				assertAccounting();
			}
		} else if (scenario === "admission-tool-cycle") {
			await reserved(); // no decision/consent even after successful source publication
			eventContext.thinkingLevel = "low";
			startNative(); await tickNative(); await reserved();
			assert.deepEqual(decisions, [{ action: "stop" }, { action: "stop" }]);
		} else {
			if (scenario.endsWith("-decision")) changeControls();
			if (scenario.endsWith("-dispatch")) beforeDispatch = changeControls;
			startNative(); await tickNative();
			if (scenario.endsWith("-dispatch")) {
				assert.deepEqual(decisions, [{ action: "warm" }]); assert.equal(results.length, 1);
				assert.equal(results[0].stopReason, "error", results[0].errorMessage);
				assert.match(results[0].errorMessage, /controls changed|effective settings changed|native warming consent missing/);
			} else { assert.deepEqual(decisions, [{ action: "stop" }]); await reserved(); }
		}
		assert.equal(h.queries.length, expectedQueries, "exact scenario SDK startup budget");
		assert.equal(h.requests.length, expectedRequests);
		for (const refresh of h.queries.filter(query => query.refresh)) {
			assert.ok(refresh.attempts <= 1); assert.equal(refresh.options.persistSession, false);
			assert.deepEqual(refresh.options.thinking, { type: "disabled" });
			assert.deepEqual(refresh.options.tools, []); assert.deepEqual(refresh.options.hooks, {});
			for (const request of refresh.requests) assert.equal(request.max_tokens, 1);
		}
		if (!parked && !recovery) assert.equal(entries.length, 0);
		assert.equal(toolExecutions.length, toolCycle ? 1 : 0);
		assert.deepEqual(transcripts(), sourceBytes, "maintenance must not mutate source or persist forks");
		assert.deepEqual(context, originalContext); assert.equal(existsSync(marker), false);
		assert.deepEqual(h.unexpected, []);
		if (newWork) assert.deepEqual(coordinator.snapshot().context, context);
		t.diagnostic(JSON.stringify({ scenario, sdk: warming.WARMING_SDK_VERSION, cli: h.actualInits[0].claude_code_version,
			sdkQueries: h.queries.length, modelRequests: h.requests.length,
			decisions, reservedNativeDispatches: replays.length, directReservedDispatches, nativeUsageEntries: entries.length, piToolExecutions: toolExecutions.length,
			refusals: results.filter(result => result.stopReason !== "stop").map(result => result.errorMessage),
			maintenanceSourceUnchanged: true, noFork: true, ordinaryNewWork: newWork, subscriptionMetadata: scenario === "api-key" ? "actual fake-key lane" : "offline simulation" }));
	} finally {
		warmer?.cancel(); delete globalThis[coordinatorKey]; delete globalThis[ownerKey]; await h.close();
	}
});
