// OFFLINE ONLY. Actual provider -> SDK source -> snapshot -> native CacheWarmer.
// node --experimental-test-module-mocks --import tsx --import ./tests/lib/setup.mjs --test tests/int-bridge-warming.mjs
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { bridgeSdkHarness, MODEL, REFRESH_USAGE, withoutCacheControls } from "./lib/bridge-sdk-harness.mjs";
import { MCP_TOOL_PREFIX } from "../src/skills.ts";

const coordinatorKey = Symbol.for("claude-bridge:cacheWarmingCoordinator");
const ownerKey = Symbol.for("claude-bridge:activeStreamSimple");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

const scenario = process.env.BRIDGE_OFFLINE_SCENARIO;
if (!scenario) {
	// dated-snapshot: the live API serves an alias request under its dated snapshot id
	// (claude-haiku-4-5 -> claude-haiku-4-5-20251001, seen in native-cache-haiku.live).
	for (const name of ["ordinary", "tool-cycle", "dated-snapshot"]) test(`actual bridge/native ${name}`, { timeout: 60_000 }, async t => {
		const env = { ...process.env, BRIDGE_OFFLINE_SCENARIO: name };
		delete env.NODE_TEST_CONTEXT; // do not inherit the parent's test-runner IPC mode
		const { stdout } = await promisify(execFile)(process.execPath, [
			"--experimental-test-module-mocks", "--import", "tsx", "--import", "./tests/lib/setup.mjs",
			"--test", fileURLToPath(import.meta.url),
		], { env, timeout: 55_000 });
		assert.match(stdout, /# pass 1|ℹ pass 1/, "subprocess must actually execute its test");
		t.diagnostic(stdout);
	});
} else test("ordinary bridge source reaches native idle refresh with request-bound usage", { timeout: 50_000 }, async t => {
	const toolCycle = scenario === "tool-cycle";
	const h = await bridgeSdkHarness({ sourceToolCycle: toolCycle, servedSuffix: scenario === "dated-snapshot" ? "-20251001" : "" });
	let warmer;
	try {
		// Imported after module mocking: both normal and refresh use the real SDK
		// with the same strictly offline observation/metadata adapter.
		const warming = await import("../src/cache-warming.ts");
		const qualified = new Set();
		const coordinator = new warming.CacheWarmingCoordinator({ qualified });
		globalThis[coordinatorKey] = coordinator;
		delete globalThis[ownerKey];
		const { default: activate, __test: bridge } = await import("../src/index.ts");
		const handlers = new Map();
		let provider;
		activate({
			on(name, handler) { const list = handlers.get(name) ?? []; list.push(handler); handlers.set(name, list); },
			registerProvider(_id, config) { provider = config; },
		});
		assert.equal(provider.streamSimple, bridge.streamClaudeAgentSdk);
		assert.equal(globalThis[ownerKey], bridge.streamClaudeAgentSdk);
		const model = { ...provider.models.find(model => model.id === MODEL), provider: "claude-bridge", api: "claude-bridge", baseUrl: "claude-bridge" };
		assert.equal(model.id, MODEL);
		const systemPrompt = "Synthetic offline bridge integration system.";
		for (const handler of handlers.get("before_agent_start")) await handler({ systemPrompt, systemPromptOptions: {
			customPrompt: systemPrompt, contextFiles: [], skills: [],
		} });
		assert.ok(bridge.promptCaptures.resolve(systemPrompt));
		const context = {
			systemPrompt,
			messages: [{ role: "user", content: "Synthetic offline source. Reply K; do not call sentinel.", timestamp: 1 }],
			tools: [{ name: "sentinel", description: "Inert synthetic tool; never call.", parameters: { type: "object", properties: { value: { type: "string" } }, required: ["value"] } }],
		};
		const options = { cacheRetention: "short", sessionId: "offline-pi-session" };
		let sourceResult = await provider.streamSimple(model, context, options).result();
		let piToolExecutions = 0;
		if (toolCycle) {
			assert.equal(sourceResult.stopReason, "toolUse", sourceResult.errorMessage);
			const call = sourceResult.content.find(block => block.type === "toolCall");
			assert.equal(call.name, "sentinel");
			assert.deepEqual(call.arguments, { value: "synthetic" });
			assert.equal(coordinator.snapshot(), undefined, "active tool query must not publish source authority");
			piToolExecutions++;
			context.messages.push(sourceResult, { role: "toolResult", toolCallId: call.id, toolName: call.name,
				content: [{ type: "text", text: "Synthetic tool result." }], isError: false, timestamp: 2 });
			sourceResult = await provider.streamSimple(model, context, options).result();
		}
		const originalContext = structuredClone(context);
		const sourceRequests = toolCycle ? 2 : 1;
		assert.equal(sourceResult.stopReason, "stop", sourceResult.errorMessage);
		await delay(0); // ordinary consumer finally releases activeQueryContexts
		assert.deepEqual(h.unexpected, []);
		assert.equal(h.requests.length, sourceRequests);
		assert.equal(h.queries.length, 1);
		assert.deepEqual(h.queries[0].options.thinking, { type: "disabled" });
		assert.ok(h.requests[0].tools.some(tool => tool.name === `${MCP_TOOL_PREFIX}sentinel`));
		const snapshot = coordinator.snapshot();
		assert.ok(snapshot, "normal source completion did not publish a snapshot");
		assert.equal(snapshot.owner, bridge.streamClaudeAgentSdk);
		assert.deepEqual(snapshot.context, originalContext);
		assert.deepEqual(snapshot.requestOptions, options);
		assert.ok(Object.isFrozen(snapshot.context));
		assert.ok(snapshot.sourceTranscript);
		assert.equal(warming.accountEvidence(h.actualAccounts[0]).eligible, false,
			"actual fake-API-key SDK account metadata must not pass subscription gate");
		assert.equal(snapshot.evidence.account.eligible, true, "offline subscription simulation missing");
		assert.ok(warming.preflightRuntime(snapshot.settings).ok);
		qualified.add(warming.warmingQualificationKey(snapshot)); // exact measured runtime + simulated lane; test-local only
		const sourceBytes = readFileSync(snapshot.sourceTranscript.path);
		assert.equal(sourceBytes.toString("base64"), snapshot.sourceTranscript.bytesBase64);
		const transcriptFiles = () => readdirSync(dirname(snapshot.sourceTranscript.path)).filter(path => path.endsWith(".jsonl")).sort();
		const filesBefore = transcriptFiles();
		const nativeModule = pathToFileURL(join(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))), "core/cache-warmer.js"));
		const { CacheWarmer } = await import(nativeModule.href);
		const entries = [], decisions = [], replays = [];
		const eventContext = { model, thinkingLevel: "off", isIdle: () => true, sessionManager: { getSessionId: () => options.sessionId } };
		warmer = new CacheWarmer({ streamSimple(replayModel, replayContext, replayOptions) {
			replays.push(replayOptions);
			return provider.streamSimple(replayModel, replayContext, replayOptions);
		} }, {
			getBranch: () => [{ type: "message", message: sourceResult }],
			appendUsage(...args) { entries.push(args); return args; },
		}, () => "idle", async event => {
			assert.equal(event.type, "cache_warming_decision");
			assert.equal(event.action, "stop", "zero-price provider should require native extension override");
			const [handler] = handlers.get("cache_warming_decision");
			const decision = await handler(event, eventContext);
			decisions.push(decision);
			return decision?.action ?? event.action;
		});
		warmer.start({ model, context, options }, () => true);
		warmer.onAgentSettled();
		// Invoke the installed native timer callback, not a replacement scheduler.
		// No simulated expiry or cache economics claims: loopback supplies usage.
		const run = warmer.run;
		assert.ok(run);
		clearTimeout(run.timer);
		await warmer.refresh(run);
		t.diagnostic(JSON.stringify({
			sdk: warming.WARMING_SDK_VERSION, cli: snapshot.evidence.init.claude_code_version,
			modelRequests: h.requests.length, sdkQueries: h.queries.length, decisions, nativeUsageEntries: entries.length,
			sourceSha256: hash(sourceBytes), sourceUnchanged: readFileSync(snapshot.sourceTranscript.path).equals(sourceBytes),
			bridgeNonessentialTrafficFlagPresent: snapshot.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC === "1",
			actualApiKeyAccountRejected: !warming.accountEvidence(h.actualAccounts[0]).eligible,
			productionQualifications: warming.PRODUCTION_QUALIFIED_WARMING_MODELS.size,
		}));
		assert.deepEqual(decisions, [{ action: "warm" }], "completed isolated bridge source must authorize native idle warming");
		assert.equal(replays.length, 1);
		assert.equal(replays[0].maxTokens, 1); assert.equal(replays[0].maxRetries, 0);
		assert.equal(h.requests.length, sourceRequests + 1); assert.equal(h.queries.length, 2);
		assert.equal(h.requests.at(-1).max_tokens, 1);
		assert.equal(piToolExecutions, toolCycle ? 1 : 0, "refresh must execute zero Pi tools");
		assert.deepEqual(h.unexpected, []);
		assert.equal(entries.length, 1);
		assert.equal(entries[0][0], "cache_warm");
		assert.deepEqual(Object.fromEntries(["input", "output", "cacheRead", "cacheWrite"].map(key => [key, entries[0][3][key]])), {
			input: REFRESH_USAGE.input_tokens, output: 1, cacheRead: REFRESH_USAGE.cache_read_input_tokens, cacheWrite: 0,
		});
		assert.deepEqual(context, originalContext);
		assert.deepEqual(readFileSync(snapshot.sourceTranscript.path), sourceBytes);
		assert.deepEqual(transcriptFiles(), filesBefore);
		const sourceWire = h.requests[sourceRequests - 1], refreshWire = h.requests.at(-1);
		assert.deepEqual(refreshWire.system, sourceWire.system);
		assert.deepEqual(withoutCacheControls(refreshWire.tools), withoutCacheControls(sourceWire.tools));
		assert.deepEqual(withoutCacheControls(refreshWire.messages.slice(0, sourceWire.messages.length)), withoutCacheControls(sourceWire.messages));
		// The refresh turn is a fixed tiny prompt: re-sending the source's last user turn cache-writes it again.
		const refreshTurn = refreshWire.messages.at(-1);
		const turnText = (typeof refreshTurn.content === "string" ? [refreshTurn.content] : refreshTurn.content.filter(b => b.type === "text").map(b => b.text));
		assert.equal(refreshTurn.role, "user");
		assert.ok(turnText.includes(warming.REFRESH_PROMPT), JSON.stringify(turnText));
		assert.ok(!turnText.some(text => text.includes("Synthetic offline source")), "refresh must not re-send the source prompt");
		// Test-local qualification only: the simulated lane is never production-qualified.
		assert.equal(warming.PRODUCTION_QUALIFIED_WARMING_MODELS.has(warming.warmingQualificationKey(snapshot)), false);
	} finally {
		warmer?.cancel();
		delete globalThis[coordinatorKey]; delete globalThis[ownerKey];
		await h.close();
	}
});
