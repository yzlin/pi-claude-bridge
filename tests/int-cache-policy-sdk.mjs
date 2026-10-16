// OFFLINE ONLY: actual registered provider and Pi's native summarizers, actual SDK wire.
// node --import tsx --import ./tests/lib/setup.mjs --test tests/int-cache-policy-sdk.mjs
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { bridgeSdkHarness, MODEL } from "./lib/bridge-sdk-harness.mjs";
import { MCP_TOOL_PREFIX } from "../src/skills.ts";

function breakpoints(value, result = []) {
	if (value && typeof value === "object") {
		if (value.cache_control) result.push(value.cache_control);
		for (const [key, child] of Object.entries(value)) if (key !== "cache_control") breakpoints(child, result);
	}
	return result;
}
function retention(body, expected) {
	const points = breakpoints(body);
	if (expected === "none") assert.deepEqual(points, [], "uncached wire must have no breakpoints");
	else {
		assert.ok(points.length > 0, "cached wire must contain breakpoints");
		for (const point of points) {
			assert.equal(point.type, "ephemeral");
			assert.equal(point.ttl ?? "5m", expected === "long" ? "1h" : "5m");
		}
	}
}
// Fixture scope correction: source/refresh thinking must be off; summaries keep
// their existing thinking behavior and are checked for uncached isolation only.
function ordinaryThinkingOff(body) {
	assert.ok(body.thinking === undefined || body.thinking.type === "disabled", "ordinary wire must not enable thinking");
}

if (!process.env.BRIDGE_CACHE_POLICY_SDK_CHILD) test("offline cache policy in a flagged child", { timeout: 100_000 }, async t => {
	const env = { ...process.env, BRIDGE_CACHE_POLICY_SDK_CHILD: "1" };
	delete env.NODE_TEST_CONTEXT;
	const { stdout } = await promisify(execFile)(process.execPath, [
		"--experimental-test-module-mocks", "--import", "tsx", "--import", "./tests/lib/setup.mjs",
		"--test", fileURLToPath(import.meta.url),
	], { env, timeout: 95_000 });
	assert.match(stdout, /# pass 1|ℹ pass 1/, "subprocess must actually execute its test");
	t.diagnostic(stdout);
});
else test("Pi retention owns real provider/summary wire under conflicting local settings", { timeout: 90_000 }, async t => {
	const conflicts = {
		CLAUDE_CODE_PROMPT_CACHE_TTL: "1h", FORCE_PROMPT_CACHING_5M: "1", ENABLE_PROMPT_CACHING_1H: "1",
		ENABLE_PROMPT_CACHING_1H_BEDROCK: "1", DISABLE_PROMPT_CACHING: "1",
		...Object.fromEntries(["FABLE", "HAIKU", "MYTHOS", "OPUS", "SONNET"].map(model => [`DISABLE_PROMPT_CACHING_${model}`, "1"])),
	};
	const h = await bridgeSdkHarness({ sourceToolCycle: true, maxQueries: 10,
		userSettings: { promptCacheTtl: "1h", env: conflicts },
		projectSettings: { promptCacheTtl: "5m", env: { ...conflicts, CLAUDE_CODE_PROMPT_CACHE_TTL: "5m" } },
		environment: { ...conflicts, PI_CACHE_RETENTION: "long" },
	});
	try {
		const { default: activate, __test: bridge } = await import("../src/index.ts");
		const handlers = new Map(); let provider;
		activate({ on(name, fn) { handlers.set(name, fn); }, registerProvider(_id, value) { provider = value; } });
		const model = { ...provider.models.find(m => m.id === MODEL), provider: "claude-bridge", api: "claude-bridge", baseUrl: "claude-bridge" };
		const systemPrompt = "Synthetic retention-wire system.";
		await handlers.get("before_agent_start")({ systemPrompt, systemPromptOptions: { customPrompt: systemPrompt, contextFiles: [], skills: [] } });
		const context = { systemPrompt, messages: [{ role: "user", content: "Synthetic retention conversation marker.", timestamp: 1 }],
			tools: [{ name: "sentinel", description: "Synthetic inert tool.", parameters: { type: "object", properties: { value: { type: "string" } }, required: ["value"] } }] };
		const configPaths = [join(h.config, "settings.json"), join(h.cwd, ".claude", "settings.json")];
		const configBytes = configPaths.map(path => readFileSync(path));
		const envBefore = Object.fromEntries(Object.keys(conflicts).map(key => [key, process.env[key]]));
		const options = { cacheRetention: "short", sessionId: "offline-retention" };
		const first = await provider.streamSimple(model, context, options).result();
		assert.equal(first.stopReason, "toolUse", first.errorMessage);
		assert.equal(h.requests.length, 1); assert.equal(h.queries.length, 1);
		assert.deepEqual(h.unexpected, [], "a policy failure must not be confused with transport rejection");
		assert.deepEqual(h.queries[0].options.thinking, { type: "disabled" });
		assert.equal(h.queries[0].options.env.CLAUDE_CODE_PROMPT_CACHE_TTL, "5m");
		assert.equal(h.queries[0].options.settings.promptCacheTtl, "5m");
		for (const key of Object.keys(conflicts).filter(key => key !== "CLAUDE_CODE_PROMPT_CACHE_TTL")) {
			assert.equal(h.queries[0].options.env[key], "0", `${key} must be neutralized in bridge child options`);
		}
		assert.deepEqual(configPaths.map(path => readFileSync(path)), configBytes);
		assert.deepEqual(Object.fromEntries(Object.keys(conflicts).map(key => [key, process.env[key]])), envBefore);
		t.diagnostic(JSON.stringify({ sdk: "0.3.293", cli: h.actualInits[0].claude_code_version,
			requestedRetention: "short", childTtl: h.queries[0].options.env.CLAUDE_CODE_PROMPT_CACHE_TTL,
			childGlobalDisable: h.queries[0].options.env.DISABLE_PROMPT_CACHING,
			childHaikuDisable: h.queries[0].options.env.DISABLE_PROMPT_CACHING_HAIKU,
			actualWireBreakpoints: breakpoints(h.requests[0]).length,
			modelRequests: h.requests.length, sdkQueries: h.queries.length, unexpectedTransport: h.unexpected.length,
			syntheticSettingsAndParentEnvUnchanged: true }));
		retention(h.requests[0], "short");
		ordinaryThinkingOff(h.requests[0]);
		const call = first.content.find(block => block.type === "toolCall");
		assert.equal(call.name, "sentinel");
		context.messages.push(first, { role: "toolResult", toolCallId: call.id, toolName: call.name,
			content: [{ type: "text", text: "Synthetic result marker." }], isError: false, timestamp: 2 });
		// Policy changed at a Pi callback, but an already running SDK query owns its tool loop.
		let result = await provider.streamSimple(model, context, { ...options, cacheRetention: "long" }).result();
		assert.equal(result.stopReason, "stop", result.errorMessage);
		assert.equal(h.queries.length, 1);
		retention(h.requests[1], "short");
		ordinaryThinkingOff(h.requests[1]);
		await delay(0);
		const cases = [
			["explicit long", { cacheRetention: "long" }, "long"],
			["ordinary none", { cacheRetention: "none" }, "none"],
			["scoped long", { env: { PI_CACHE_RETENTION: "long" } }, "long"],
			["process fallback", { env: { PI_CACHE_RETENTION: "" } }, "long"],
			["non-long scoped uses short", { env: { PI_CACHE_RETENTION: "none" } }, "short"],
			["short default", {}, "short"],
		];
		for (const [name, overrides, expected] of cases) {
			if (name === "short default") delete process.env.PI_CACHE_RETENTION;
			context.messages.push(result, { role: "user", content: `Synthetic next query: ${name}.`, timestamp: context.messages.length + 1 });
			result = await provider.streamSimple(model, context, { sessionId: options.sessionId, ...overrides }).result();
			assert.equal(result.stopReason, "stop", `${name}: ${result.errorMessage}`);
			retention(h.requests.at(-1), expected);
			ordinaryThinkingOff(h.requests.at(-1));
			assert.deepEqual(h.queries.at(-1).options.thinking, { type: "disabled" });
			assert.ok(h.requests.at(-1).tools.some(tool => tool.name === `${MCP_TOOL_PREFIX}sentinel`));
			assert.match(JSON.stringify(h.requests.at(-1).messages), /Synthetic retention conversation marker/);
			assert.match(JSON.stringify(h.requests.at(-1).messages), /Synthetic result marker/);
			await delay(0);
			t.diagnostic(`${name}: ${expected}, ${breakpoints(h.requests.at(-1)).length} actual wire breakpoints`);
		}
		const warming = await import("../src/cache-warming.ts");
		const snapshot = globalThis[Symbol.for("claude-bridge:cacheWarmingCoordinator")].snapshot();
		assert.ok(snapshot);
		assert.equal(warming.preflightRuntime(snapshot.settings).ok, false, "conflicting env settings must not become safe warming policy");
		const sourceBytes = readFileSync(snapshot.sourceTranscript.path);
		const files = () => readdirSync(dirname(snapshot.sourceTranscript.path)).filter(name => name.endsWith(".jsonl")).sort();
		const filesBefore = files();
		const summaryStart = h.requests.length;
		// Pi owns compaction and branch summaries; its native summarizers reach the
		// provider as tool-less single-message cacheRetention:"none" calls.
		const { compact, generateBranchSummary } = await import("@earendil-works/pi-coding-agent");
		const streamFn = (m, c, o) => provider.streamSimple(m, c, o);
		const bug = await provider.streamSimple(model, { systemPrompt: "Synthetic bug summarizer.",
			messages: [{ role: "user", content: "Synthetic bug summary marker.", timestamp: 1 }] }, { cacheRetention: "none" }).result();
		assert.equal(bug.stopReason, "stop", bug.errorMessage);
		const compaction = await compact({
			firstKeptEntryId: "kept", messagesToSummarize: context.messages, turnPrefixMessages: [], isSplitTurn: false,
			tokensBefore: 200, fileOps: { read: new Set(), edited: new Set(), written: new Set() },
			settings: { enabled: true, reserveTokens: 1000, keepRecentTokens: 100 },
		}, model, undefined, undefined, undefined, undefined, undefined, streamFn);
		assert.equal(compaction.summary, "K", JSON.stringify(compaction));
		const branch = await generateBranchSummary(context.messages.map((message, i) => ({ type: "message", id: String(i), message })),
			{ model, signal: new AbortController().signal, streamFn });
		assert.ok(branch.summary?.includes("K"), JSON.stringify(branch));
		assert.equal(h.requests.length, summaryStart + 3);
		for (const body of h.requests.slice(summaryStart)) { retention(body, "none"); assert.deepEqual(body.tools ?? [], []); }
		for (const record of h.queries.slice(-3)) {
			assert.equal(record.options.persistSession, false);
			assert.equal(record.options.resume, undefined);
			assert.deepEqual(record.options.settingSources, []);
		}
		assert.deepEqual(readFileSync(snapshot.sourceTranscript.path), sourceBytes);
		assert.deepEqual(files(), filesBefore);
		assert.deepEqual(configPaths.map(path => readFileSync(path)), configBytes);
		assert.deepEqual(Object.fromEntries(Object.keys(conflicts).map(key => [key, process.env[key]])), envBefore);
		assert.deepEqual(h.unexpected, []);
		assert.equal(h.queries.length, 10); assert.equal(h.requests.length, 11);
		t.diagnostic(`SDK ${warming.WARMING_SDK_VERSION}; CLI ${h.actualInits[0].claude_code_version}; 10 queries / 11 loopback requests; no live calls`);
	} finally { await h.close(); }
});
