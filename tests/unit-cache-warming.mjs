#!/usr/bin/env node
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { __test as bridgeTest } from "../src/index.js";
import {
	CacheWarmingCoordinator, accountEvidence, warmingQualificationKey, warmingControlsFingerprint, WARMING_SDK_VERSION,
	isWarmingCandidate,
	preflightRuntime, warmingRuntime,
	runIsolatedRefresh, REFRESH_PROMPT,
} from "../src/cache-warming.js";

// Independent expected flags: admission tests must not weaken if the generator changes.
function cacheFlags(mode) {
	const disabled = mode === "none" ? "1" : "0";
	return { ...(mode === "none" ? {} : { promptCacheTtl: mode === "long" ? "1h" : "5m" }), env: {
		CLAUDE_CODE_PROMPT_CACHE_TTL: mode === "long" ? "1h" : "5m",
		DISABLE_PROMPT_CACHING: disabled, FORCE_PROMPT_CACHING_5M: "0", ENABLE_PROMPT_CACHING_1H: "0", ENABLE_PROMPT_CACHING_1H_BEDROCK: "0",
		...Object.fromEntries(["FABLE", "HAIKU", "MYTHOS", "OPUS", "SONNET"].map(name => [`DISABLE_PROMPT_CACHING_${name}`, disabled])),
	} };
}

const model = { provider: "claude-bridge", id: "claude-haiku-4-5", baseUrl: "claude-bridge", cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
const safeRuntime = { effective: { disableAllHooks: true, autoMemoryEnabled: false }, sources: [], resolvedEffective: { disableAllHooks: true, autoMemoryEnabled: false } };
// OFFLINE simulation of the source-derived stored-subscription contract, not runtime qualification.
const rawAccount = { subscriptionType: "Claude Max", apiProvider: "firstParty" };
const evidence = {
	account: accountEvidence(rawAccount), sdkVersion: WARMING_SDK_VERSION, servedModel: model.id,
	init: { claude_code_version: "2.1.280", apiKeySource: "none", tools: [], mcp_servers: [], plugins: [] },
	usage: { provider: "firstParty", canonicalModel: "claude-haiku-4-5", costBasis: "list" },
	sourceCachedTokens: 7,
};
const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const fixtureDir = mkdtempSync(`${tmpdir()}/warming-fixture-`);
const fixturePath = `${fixtureDir}/source.jsonl`; writeFileSync(fixturePath, "synthetic-source");
process.on("exit", () => rmSync(fixtureDir, { recursive: true, force: true }));
const source = {
	requestOptions: { sessionId: "pi-session" }, processFingerprint: warmingControlsFingerprint(undefined),
	sourceTranscript: { path: fixturePath, bytesBase64: Buffer.from("synthetic-source").toString("base64") },
	owner: "owner", model, cliModel: model.id, reasoning: undefined, retention: "short", sessionId: "session",
	context: { systemPrompt: "system", messages: [{ role: "user", content: "hello", timestamp: 1 }], tools: [] },
	systemPrompt: { type: "preset", preset: "claude_code", append: "safe" },
	mcpTools: [], settings: safeRuntime, env: { SAFE: "1", ENABLE_CLAUDEAI_MCP_SERVERS: "0" }, extraArgs: { "strict-mcp-config": null }, evidence,
};

// Literal public-contract fixtures: SDK 0.3.280 AccountInfo plus installed CLI
// Gde/ERt and JLn. OFFLINE simulation, not observed auth/runtime qualification.
describe("stored-subscription account metadata contract", () => {
	for (const subscriptionType of ["Claude Pro", "Claude Max", "Claude Team", "Claude Enterprise"]) {
		for (const explicitUndefined of [false, true]) {
			it(`accepts ${subscriptionType} with ${explicitUndefined ? "undefined" : "omitted"} source fields`, () => {
				const account = Object.freeze({ subscriptionType, apiProvider: "firstParty",
					...(explicitUndefined ? { tokenSource: undefined, apiKeySource: undefined } : {}) });
				const before = { ...account };
				assert.equal(accountEvidence(account).eligible, true);
				assert.deepEqual(account, before);
			});
		}
	}
	it("rejects the observed failed live lane and missing positive evidence", () => {
		for (const account of [
			{ apiProvider: "firstParty", tokenSource: "none" }, {},
			{ apiProvider: "firstParty" }, { subscriptionType: "Claude Max" },
			{ tokenSource: undefined, apiKeySource: undefined },
		]) assert.equal(accountEvidence(account).eligible, false, JSON.stringify(account));
	});
	it("rejects absent, unknown, API, free and non-display plans without normalization", () => {
		for (const subscriptionType of [undefined, null, "", "unknown", "max", "pro", "team", "enterprise", "Claude API", "api", "free", "Claude Free", " Claude Max", "Claude Max ", "claude max"]) {
			assert.equal(accountEvidence({ subscriptionType, apiProvider: "firstParty" }).eligible, false, String(subscriptionType));
		}
	});
	it("rejects every public non-first-party backend and malformed providers", () => {
		for (const apiProvider of ["bedrock", "vertex", "foundry", "anthropicAws", "anthropicGoogleCloud", "mantle", "gateway", "anthropic", "unknown", "", null, undefined]) {
			assert.equal(accountEvidence({ subscriptionType: "Claude Max", apiProvider }).eligible, false, String(apiProvider));
		}
	});
	for (const field of ["tokenSource", "apiKeySource"]) {
		it(`rejects any present ${field}, including none and malformed empty/null`, () => {
			for (const value of ["none", "oauth", "env", "fd", "helper", "profile", "claude.ai", "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR", "ANTHROPIC_API_KEY", "apiKeyHelper", "/login managed key", "", null]) {
				assert.equal(accountEvidence({ subscriptionType: "Claude Max", apiProvider: "firstParty", [field]: value }).eligible, false, `${field}: ${JSON.stringify(value)}`);
			}
		});
	}
	it("rejects the former invented positive fixture and contradictory combined metadata", () => {
		for (const subscriptionType of ["max", "Claude Max"]) {
			assert.equal(accountEvidence({ subscriptionType, tokenSource: "oauth", apiProvider: "firstParty", apiKeySource: "none" }).eligible, false);
		}
	});
	it("preserves raw account fingerprints and separates two eligible subscription lanes", () => {
		const max = { subscriptionType: "Claude Max", apiProvider: "firstParty", email: "one@example.invalid" };
		const pro = { ...max, subscriptionType: "Claude Pro" };
		const a = accountEvidence(max), b = accountEvidence(pro);
		assert.equal(a.eligible, true); assert.equal(b.eligible, true);
		assert.equal(a.fingerprint, warmingControlsFingerprint(max, {}));
		assert.equal(b.fingerprint, warmingControlsFingerprint(pro, {}));
		assert.equal(a.lane, '["firstParty","Claude Max",null,null]');
		assert.equal(b.lane, '["firstParty","Claude Pro",null,null]');
		assert.notEqual(a.fingerprint, b.fingerprint); assert.notEqual(a.lane, b.lane);
		const changedIdentity = accountEvidence({ ...max, email: "two@example.invalid" });
		assert.equal(changedIdentity.eligible, true);
		assert.equal(changedIdentity.lane, a.lane);
		assert.notEqual(changedIdentity.fingerprint, a.fingerprint);
	});
});

describe("SDK metadata fingerprint normalization", () => {
	const controls = { cacheRetention: "short", config: "synthetic" };
	const env = Object.freeze({ SAFE: "1", PI_CACHE_RETENTION: "short" });

	it("treats absent and exact installed SDK metadata identically without mutating inputs", () => {
		const withMetadata = Object.freeze({ ...env, CLAUDE_AGENT_SDK_VERSION: WARMING_SDK_VERSION });
		const processBefore = { ...process.env };
		assert.equal(warmingControlsFingerprint(controls, env), warmingControlsFingerprint(controls, withMetadata));
		assert.deepEqual(env, { SAFE: "1", PI_CACHE_RETENTION: "short" });
		assert.deepEqual(withMetadata, { ...env, CLAUDE_AGENT_SDK_VERSION: WARMING_SDK_VERSION });
		assert.equal(JSON.stringify({ ...process.env }) === JSON.stringify(processBefore), true, "process environment remains unchanged");
	});

	it("retains unexpected metadata and every other environment or bridge control change", () => {
		const baseline = warmingControlsFingerprint(controls, env);
		for (const patch of [
			{ CLAUDE_AGENT_SDK_VERSION: "" },
			{ CLAUDE_AGENT_SDK_VERSION: `${WARMING_SDK_VERSION}-other` },
			{ CLAUDE_AGENT_SDK_VERSION_EXTRA: WARMING_SDK_VERSION },
			{ claude_agent_sdk_version: WARMING_SDK_VERSION },
			{ SAFE: "2" }, { PI_CACHE_RETENTION: "long" },
			{ ANTHROPIC_API_KEY: "synthetic" }, { CLAUDE_CONFIG_DIR: "/synthetic" },
		]) assert.notEqual(warmingControlsFingerprint(controls, { ...env, ...patch }), baseline, JSON.stringify(patch));
		assert.notEqual(warmingControlsFingerprint({ ...controls, cacheRetention: "long" }, env), baseline);
		assert.notEqual(warmingControlsFingerprint({ ...controls, config: "changed" }, env), baseline);
	});
});

describe("native cache warming contract", () => {
	it("recognizes only the exact reserved request shape", () => {
		assert.equal(isWarmingCandidate({ maxTokens: 1, maxRetries: 0, sessionId: "pi-session" }), true);
		assert.equal(isWarmingCandidate({ maxTokens: 1, maxRetries: 1 }), false);
		assert.equal(isWarmingCandidate({ maxTokens: 2, maxRetries: 0 }), false);
	});

	it("intercepts an unauthorized reserved request before shared-session side effects", async () => {
		const shared = { sessionId: "source-session", cursor: 4, cwd: process.cwd() };
		bridgeTest.setSharedSession("pi-session", shared);
		const stream = bridgeTest.streamClaudeAgentSdk(model, source.context, { maxTokens: 1, maxRetries: 0, sessionId: "pi-session" });
		const result = await stream.result();
		assert.equal(result.stopReason, "error");
		assert.match(result.errorMessage, /consent missing/);
		assert.deepEqual(bridgeTest.getSharedSession("pi-session"), shared);
		bridgeTest.resetSharedSession();
	});

	it("requires native consent and exact immutable request/settings identity", async () => {
		const calls = [];
		const c = new CacheWarmingCoordinator({ qualified: new Set([warmingQualificationKey(source)]), refresh: async (s, signal) => { calls.push(s); return { kind: "success", usage: { input: 3, output: 1, cacheRead: 7, cacheWrite: 0 } }; } });
		const generation = c.begin("owner");
		c.complete(generation, source);
		assert.equal((await c.intercept(model, source.context, { maxTokens: 1, maxRetries: 0, sessionId: "pi-session" }, "owner")).ok, false, "direct reserved request lacks consent");
		assert.equal(c.decide({ owner: "owner", piSessionId: "pi-session", model, idle: true, reasoning: undefined, retention: "short", runtime: safeRuntime }), "warm");
		const changed = structuredClone(source.context); changed.messages[0].content = "mutated";
		assert.equal((await c.intercept(model, changed, { maxTokens: 1, maxRetries: 0, sessionId: "pi-session" }, "owner")).ok, false, "snapshot mismatch fails closed");
		assert.equal(c.decide({ owner: "owner", piSessionId: "pi-session", model, idle: true, reasoning: undefined, retention: "short", runtime: safeRuntime }), "stop", "mismatch suppresses repeats");
		const next = c.begin("owner"); c.complete(next, source);
		assert.equal(c.decide({ owner: "owner", piSessionId: "pi-session", model, idle: true, reasoning: undefined, retention: "short", runtime: safeRuntime }), "warm");
		const result = await c.intercept(model, structuredClone(source.context), { maxTokens: 1, maxRetries: 0, sessionId: "pi-session" }, "owner");
		assert.equal(result.ok, true);
		assert.deepEqual(result.usage, { input: 3, output: 1, cacheRead: 7, cacheWrite: 0 });
		assert.equal(calls.length, 1);
		assert.throws(() => { calls[0].context.messages[0].content = "changed"; }, TypeError);
	});

	it("rejects thinking, wrong auth/runtime/accounting, active work, stale generations and suppresses failed repeats", async () => {
		for (const bad of [
			{ reasoning: "high" },
			{ idle: false },
			{ retention: "none" },
			{ evidence: { ...evidence, account: { ...evidence.account, eligible: false } } },
			{ evidence: { ...evidence, usage: { ...evidence.usage, costBasis: "managed" } } },
			{ settings: { effective: { hooks: { PreToolUse: [] } }, sources: [] } },
		]) {
			const c = new CacheWarmingCoordinator({ qualified: new Set([warmingQualificationKey(source)]), refresh: async () => ({ kind: "failed", reason: "no" }) });
			const generation = c.begin("owner"); c.complete(generation, { ...source, ...bad });
			assert.equal(c.decide({ owner: "owner", piSessionId: "pi-session", model, idle: bad.idle ?? true, reasoning: bad.reasoning, retention: bad.retention ?? "short", runtime: bad.settings ?? safeRuntime }), "stop");
		}
		const c = new CacheWarmingCoordinator({ qualified: new Set([warmingQualificationKey(source)]), refresh: async () => ({ kind: "failed", reason: "expected" }) });
		const old = c.begin("owner"); const fresh = c.begin("owner");
		c.complete(old, source); assert.equal(c.snapshot(), undefined, "late completion cannot replace newer generation");
		c.complete(fresh, source); assert.equal(c.decide({ owner: "owner", piSessionId: "pi-session", model, idle: true, retention: "short", runtime: safeRuntime }), "warm");
		assert.equal((await c.intercept(model, source.context, { maxTokens: 1, maxRetries: 0, sessionId: "pi-session" }, "owner")).ok, false);
		assert.equal(c.decide({ owner: "owner", piSessionId: "pi-session", model, idle: true, retention: "short", runtime: safeRuntime }), "stop", "failure suppressed until new work");
	});

	it("cancels refresh on invalidation", async () => {
		let aborted = false;
		const c = new CacheWarmingCoordinator({ qualified: new Set([warmingQualificationKey(source)]), refresh: (_s, signal) => new Promise((resolve) => signal.addEventListener("abort", () => { aborted = true; resolve({ kind: "failed", reason: "aborted" }); }, { once: true })) });
		const generation = c.begin("owner"); c.complete(generation, source);
		assert.equal(c.decide({ owner: "owner", piSessionId: "pi-session", model, idle: true, retention: "short", runtime: safeRuntime }), "warm");
		const pending = c.intercept(model, source.context, { maxTokens: 1, maxRetries: 0, sessionId: "pi-session" }, "owner");
		c.invalidate("new work"); await pending; assert.equal(aborted, true);
	});
});

describe("generated cache settings preflight", () => {
	for (const mode of ["short", "long"]) {
		it(`admits only exact ${mode} generated effective flags`, () => {
			const flags = cacheFlags(mode);
			const runtime = warmingRuntime(safeRuntime, flags);
			assert.equal(preflightRuntime(runtime).ok, true);
			const c = new CacheWarmingCoordinator({ qualified: new Set([warmingQualificationKey(source)]) });
			c.complete(c.begin("owner"), { ...source, retention: mode, settings: runtime, flagSettings: flags });
			assert.equal(c.decide({ owner: "owner", piSessionId: "pi-session", model, idle: true, retention: mode, runtime }), "warm");
		});

		it(`rejects altered, incomplete or unrelated ${mode} generated flags`, () => {
			const flags = cacheFlags(mode);
			assert.ok(flags.env, "generated env exists");
			const reject = patch => assert.equal(preflightRuntime(warmingRuntime(safeRuntime, { ...flags, ...patch })).ok, false);
			for (const key of Object.keys(flags.env)) {
				const missing = { ...flags.env }; delete missing[key];
				reject({ env: missing });
				for (const value of ["modified", "", undefined, 0, false, flags.env[key] === "0" ? "1" : mode === "short" ? "1h" : "5m"]) reject({ env: { ...flags.env, [key]: value } });
			}
			for (const key of ["KEEP", "DISABLE_PROMPT_CACHING_EXTRA", "claude_code_prompt_cache_ttl"]) {
				for (const value of ["0", "", undefined]) reject({ env: { ...flags.env, [key]: value } });
			}
			for (const promptCacheTtl of [undefined, "", "other", mode === "short" ? "1h" : "5m"]) reject({ promptCacheTtl });
		});

		it(`rejects raw/source/managed env even when ${mode} flags mask it`, () => {
			const flags = cacheFlags(mode);
			assert.ok(flags.env, "generated env exists");
			for (const env of [flags.env, { KEEP: "unsafe" }, { DISABLE_PROMPT_CACHING: "1" }]) {
				assert.equal(preflightRuntime(warmingRuntime({ ...safeRuntime, effective: { ...safeRuntime.effective, env } }, flags)).ok, false);
				for (const source of ["user", "project", "local", "managed"]) {
					assert.equal(preflightRuntime(warmingRuntime({ ...safeRuntime, sources: [{ source, settings: { env } }] }, flags)).ok, false);
				}
			}
			assert.equal(preflightRuntime(warmingRuntime({ ...safeRuntime, sources: [{ source: "managed", settings: flags }] }, flags)).ok, false);
		});
	}
	it("does not admit disabled-cache generated flags as a cached warming policy", () => {
		const flags = cacheFlags("none");
		assert.ok(flags.env, "generated env exists");
		assert.equal(preflightRuntime(warmingRuntime(safeRuntime, flags)).ok, false);
	});
});

describe("refresh safety adapter", () => {
	it("fails closed for side-effecting effective settings", () => {
		assert.equal(preflightRuntime(safeRuntime).ok, true);
		assert.equal(preflightRuntime({ effective: { autoMemoryEnabled: false }, sources: [] }).ok, true, "no configured hooks is enforceable");
		for (const effective of [
			{ hooks: { Stop: [{}] } }, { enabledPlugins: { x: true } }, { mcpServers: { x: {} } },
			{ apiKeyHelper: "cmd" }, { policyHelper: "cmd" }, { autoMemoryEnabled: true }, { env: { X: "y" } },
		]) assert.equal(preflightRuntime({ effective, sources: [] }).ok, false);
		assert.equal(preflightRuntime({ effective: { disableAllHooks: true }, sources: [{ source: "managed", settings: { hooks: { Stop: [{}] } } }] }).ok, false, "managed hooks run despite disableAllHooks");
	});
	it("admits settings-file hooks and plugins only when the query flags switch them off", () => {
		const hooks = { SessionStart: [{ hooks: [{ type: "command", command: "x" }] }] };
		const file = { hooks, enabledPlugins: { "a@m": true, "b@m": false } };
		const run = (flags, settings = file, source = "user") => preflightRuntime(warmingRuntime(
			{ effective: { autoMemoryEnabled: false, ...settings }, sources: [{ source, settings }] }, { autoMemoryEnabled: false, ...flags })).ok;
		const off = { disableAllHooks: true, enabledPlugins: { "a@m": false, "b@m": false } };
		for (const source of ["user", "project", "local"]) assert.equal(run(off, file, source), true, source);
		assert.equal(run(off, file, "managed"), false, "managed hooks/plugins are not overridable");
		assert.equal(run({ enabledPlugins: off.enabledPlugins }), false, "hooks need disableAllHooks");
		assert.equal(run({ disableAllHooks: true }), false, "plugins need explicit flag switch-off");
		assert.equal(run({ disableAllHooks: true, enabledPlugins: { "a@m": false } }), false, "every file plugin id must be switched off");
		assert.equal(run({ disableAllHooks: true, enabledPlugins: { "a@m": false, "b@m": true } }), false, "flags must not enable a plugin");
		assert.equal(run({ disableAllHooks: true }, { hooks }), true, "hooks alone need only disableAllHooks");
	});
	it("admits only contract-proven settings-file env names and known marketplaces", () => {
		const flags = cacheFlags("short");
		const run = (settings, source = "user") => preflightRuntime(warmingRuntime(
			{ effective: { autoMemoryEnabled: false, ...settings }, resolvedEffective: { autoMemoryEnabled: false, ...settings }, sources: [{ source, settings }] },
			{ ...flags, disableAllHooks: true, autoMemoryEnabled: false })).ok;
		const env = { MAX_THINKING_TOKENS: "2048", CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "50", CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" };
		for (const source of ["user", "project", "local"]) assert.equal(run({ env, extraKnownMarketplaces: { m: { source: { source: "github", repo: "a/b" } } } }, source), true, source);
		assert.equal(run({ env }, "managed"), false);
		for (const extra of [{ KEEP: "x" }, { ANTHROPIC_BASE_URL: "http://x" }, { DISABLE_PROMPT_CACHING: "1" }, { CLAUDE_CODE_MAX_OUTPUT_TOKENS: "9" }]) {
			assert.equal(run({ env: { ...env, ...extra } }), false, JSON.stringify(extra));
		}
	});
	it("admits inert display, attribution, model and permission-rule settings", () => {
		const inert = { theme: "dark", tui: "default", statusLine: { type: "command", command: "status" }, model: "opus",
			attribution: { commit: "x", pr: "y" }, permissions: { allow: ["Bash(ls)"], deny: ["Read(x)"], ask: ["Edit"] } };
		for (const source of ["user", "project", "local"]) {
			assert.equal(preflightRuntime({ effective: { ...safeRuntime.effective, ...inert }, sources: [{ source, settings: inert }] }).ok, true, source);
		}
		assert.equal(preflightRuntime({ ...safeRuntime, sources: [{ source: "managed", settings: { theme: "dark" } }] }).ok, false, "managed stays refused");
		for (const permissions of [{ defaultMode: "plan" }, { allow: [], additionalDirectories: ["/x"] }]) {
			assert.equal(preflightRuntime({ effective: { ...safeRuntime.effective, permissions }, sources: [] }).ok, false, JSON.stringify(permissions));
		}
		for (const settings of [{ env: { MAX_THINKING_TOKENS: "1" } }, { mcpServers: { x: {} } }]) {
			assert.equal(preflightRuntime({ effective: { ...safeRuntime.effective, ...settings }, sources: [] }).ok, false, JSON.stringify(settings));
		}
	});

	it("uses a non-persisting fork, blocks tools, accepts validated budget terminal, and reports event usage", async () => {
		let options;
		let closed = 0;
		const messages = [
			{ type: "system", subtype: "init", session_id: "11111111-1111-4111-8111-111111111111", ...evidence.init },
			{ type: "stream_event", event: { type: "message_start", message: { model: model.id, usage: { input_tokens: 2, cache_read_input_tokens: 8, cache_creation_input_tokens: 1, output_tokens: 0 } } } },
			{ type: "stream_event", event: { type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: { output_tokens: 1 } } },
			{ type: "assistant", message: { model: model.id, content: [{ type: "text", text: "x" }], stop_reason: "max_tokens" } },
			{ type: "result", subtype: "error_max_budget_usd", errors: ["budget"], modelUsage: { [model.id]: evidence.usage } },
		];
		const suppressedSource = { ...source, env: { ...source.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" } };
		const result = await runIsolatedRefresh(suppressedSource, new AbortController().signal, {
			resolveSettings: async () => ({ effective: safeRuntime.effective, sources: safeRuntime.sources, provenance: {} }),
			query: ({ options: o }) => { options = o; return { accountInfo: async () => rawAccount, async *[Symbol.asyncIterator]() { yield* messages; }, close() { closed++; } }; },
		});
		assert.equal(result.kind, "success");
		assert.deepEqual(result.usage, { input: 2, output: 1, cacheRead: 8, cacheWrite: 1 });
		assert.equal(options.resume, "session"); assert.equal(options.forkSession, true); assert.equal(options.persistSession, false);
		assert.equal(options.maxBudgetUsd, 0.000001); assert.equal(options.maxTurns, 1); assert.deepEqual(options.thinking, { type: "disabled" });
		assert.equal(options.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, "1"); assert.equal(options.env.CLAUDE_CODE_MAX_RETRIES, "0");
		assert.equal(options.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, "1");
		assert.equal(suppressedSource.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, "1");
		assert.equal(closed, 1);
	});
});

describe("snapshot repair regressions", () => {
	it("preserves the real stream function owner without cloning it", () => {
		const c = new CacheWarmingCoordinator({ qualified: new Set() });
		const owner = bridgeTest.streamClaudeAgentSdk;
		const s = { ...source, owner };
		assert.doesNotThrow(() => c.complete(c.begin(owner), s));
		assert.equal(c.snapshot()?.owner, owner);
	});

	it("maintenance publication failures cannot fail ordinary provider completion", async () => {
		const { QueryContext } = await import("../src/query-state.js");
		const { createAssistantMessageEventStream } = await import("@earendil-works/pi-ai");
		const c = new QueryContext(); c.resetTurnState(model);
		const stream = createAssistantMessageEventStream(); c.currentPiStream = stream;
		const shared = { sessionId: "successful-chat", cursor: 2, cwd: process.cwd() };
		bridgeTest.setSharedSession("pi-session", shared);
		await bridgeTest.completeProviderTurn(c, async () => { throw new Error("bookkeeping failure"); });
		assert.equal((await stream.result()).stopReason, "stop");
		assert.deepEqual(bridgeTest.getSharedSession("pi-session"), shared);
		bridgeTest.resetSharedSession();
	});

	it("captures native transcript and options immutably before async work, including tool continuation", async () => {
		const { captureWarmingRequest } = await import("../src/cache-warming.js");
		const raw = { messages: [
			{ role: "system", content: "system", tools: [], timestamp: 1 },
			{ role: "user", content: "hello", timestamp: 2 },
			{ role: "toolResult", toolCallId: "call", toolName: "read", content: [{ type: "text", text: "result" }], isError: false, timestamp: 3 },
		] };
		const options = { sessionId: "pi-session", env: { PI_CACHE_RETENTION: "short" } };
		const captured = captureWarmingRequest(raw, options);
		raw.messages[0].content = "changed"; options.env.PI_CACHE_RETENTION = "long";
		assert.equal(captured.context.messages[0].content, "system");
		assert.equal(captured.options.env.PI_CACHE_RETENTION, "short");
		assert.equal(captured.context.messages.at(-1).role, "toolResult");
	});

	it("rejects changed Pi identity options even when raw context matches", async () => {
		const c = new CacheWarmingCoordinator({ qualified: new Set([warmingQualificationKey(source)]), refresh: async () => ({ kind: "success", usage: {} }) });
		c.complete(c.begin("owner"), { ...source, requestOptions: { sessionId: "pi-session" } });
		assert.equal(c.decide({ owner: "owner", piSessionId: "pi-session", model, idle: true, retention: "short", runtime: safeRuntime }), "warm");
		assert.equal((await c.intercept(model, source.context, { maxTokens: 1, maxRetries: 0, sessionId: "different", reasoning: "high", cacheRetention: "none" }, "owner")).ok, false);
	});

	it("does not let sibling Pi sessions supply consent", () => {
		const c = new CacheWarmingCoordinator({ qualified: new Set([warmingQualificationKey(source)]) });
		c.complete(c.begin("owner"), { ...source, requestOptions: { sessionId: "parent" } });
		assert.equal(c.decide({ owner: "owner", piSessionId: "sibling", model, idle: true, retention: "short", runtime: safeRuntime }), "stop");
	});

	it("does not stop unrelated providers at native decision dispatch", async () => {
		const { default: activate } = await import("../src/index.js");
		let handler;
		activate({ on: (name, fn) => { if (name === "cache_warming_decision") handler = fn; }, registerProvider() {}, registerTool() {} });
		assert.equal(await handler({}, { model: { ...model, baseUrl: "other" } }), undefined);
	});
});

describe("preflight repair regressions", () => {
	it("allows only the exact bridge-owned nonessential traffic suppression flag", () => {
		const c = new CacheWarmingCoordinator({ qualified: new Set([warmingQualificationKey(source)]) });
		const candidate = { owner: "owner", piSessionId: "pi-session", model, idle: true, retention: "short", runtime: safeRuntime };
		const eligible = { ...source, env: { ...source.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" } };
		c.complete(c.begin("owner"), eligible);
		assert.equal(c.decide(candidate), "warm", "otherwise eligible source retains bridge suppression");
		assert.equal(c.snapshot().env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, "1");
		for (const patch of [
			...['0', 'false', 'true', '2', 'arbitrary', ' 1', '1 '].map(value => ({ CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: value })),
			{ CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC_EXTRA: "1" },
			{ claude_code_disable_nonessential_traffic: "1" },
			{ CLAUDE_CODE_UNKNOWN: "1" },
		]) {
			c.complete(c.begin("owner"), { ...eligible, env: { ...eligible.env, ...patch } });
			assert.equal(c.decide(candidate), "stop", JSON.stringify(patch));
		}
	});
	for (const [key, value] of Object.entries({ apiKeyHelper: "never-execute-me", policyHelper: "never-execute-me", processWrapper: "never-execute-me", awsAuthRefresh: "never-execute-me", outputStyle: "unsafe", autoDreamEnabled: true, modelPricing: 2 })) {
		it(`rejects ${key} in an otherwise safe runtime`, () => {
			assert.equal(preflightRuntime({ effective: { ...safeRuntime.effective, [key]: value }, sources: [] }).ok, false);
		});
	}
	it("cannot overwrite managed memory/cache evidence with flag settings", () => {
		for (const settings of [{ autoMemoryEnabled: true }, { promptCacheTtl: "1h" }, { hooks: { Stop: [{}] } }]) {
			assert.equal(preflightRuntime({ ...safeRuntime, sources: [{ source: "managed", settings }] }).ok, false);
		}
	});
	it("rejects an external init MCP server or plugin and requires strict isolation", () => {
		for (const bad of [
			{ evidence: { ...evidence, init: { ...evidence.init, plugins: [{ name: "external" }] } } },
			{ evidence: { ...evidence, init: { ...evidence.init, mcp_servers: [{ name: "external", status: "connected" }] } } },
			{ extraArgs: {} }, { env: { ...source.env, ANTHROPIC_BASE_URL: "https://elsewhere.invalid" } },
		]) {
			const c = new CacheWarmingCoordinator({ qualified: new Set([warmingQualificationKey(source)]) });
			c.complete(c.begin("owner"), { ...source, ...bad });
			assert.equal(c.decide({ owner: "owner", piSessionId: "pi-session", model, idle: true, retention: "short", runtime: safeRuntime }), "stop");
		}
	});
	it("accepts only the expected SDK-owned server and exact tools on otherwise eligible sources", () => {
		const server = { name: "custom-tools", status: "connected", source: "sdk" };
		const tool = { name: "read", description: "synthetic", parameters: { type: "object", properties: {} } };
		const init = { ...evidence.init, mcp_servers: [server], tools: ["mcp__custom-tools__read"] };
		const eligible = { ...source, mcpTools: [tool], evidence: { ...evidence, init } };
		const c = new CacheWarmingCoordinator({ qualified: new Set([warmingQualificationKey(eligible)]) });
		const candidate = { owner: "owner", piSessionId: "pi-session", model, idle: true, retention: "short", runtime: safeRuntime };
		c.complete(c.begin("owner"), eligible);
		assert.equal(c.decide(candidate), "warm", "measured SDK provenance must be eligible before testing rejections");
		for (const [label, patch] of [
			["missing provenance", { mcp_servers: [{ name: server.name, status: server.status }] }],
			...['unknown', 'config', 'plugin', 'user', 'project', 'local', 'managed', '', null].map(provenance =>
				[`untrusted provenance ${JSON.stringify(provenance)}`, { mcp_servers: [{ ...server, source: provenance }] }]),
			["wrong name", { mcp_servers: [{ ...server, name: "external" }] }],
			["wrong status", { mcp_servers: [{ ...server, status: "disconnected" }] }],
			["additional server", { mcp_servers: [server, { ...server, name: "external" }] }],
			["missing server", { mcp_servers: [] }],
			["additional plugin", { plugins: [{ name: "external" }] }],
			["missing tool", { tools: [] }],
			["wrong tool", { tools: ["mcp__custom-tools__other"] }],
			["additional tool", { tools: [...init.tools, "mcp__custom-tools__other"] }],
		]) {
			c.complete(c.begin("owner"), { ...eligible, evidence: { ...eligible.evidence, init: { ...init, ...patch } } });
			assert.equal(c.decide(candidate), "stop", label);
		}
	});
	it("binds mutable process and bridge controls even with explicit retention", () => {
		const c = new CacheWarmingCoordinator({ qualified: new Set([warmingQualificationKey(source)]) });
		c.complete(c.begin("owner"), { ...source, controlsFingerprint: "original" });
		assert.equal(c.decide({ owner: "owner", piSessionId: "pi-session", model, idle: true, retention: "short", runtime: safeRuntime, controlsFingerprint: "changed" }), "stop");
	});
});

describe("refresh execution repair regressions", () => {
	const resolve = async () => ({ effective: safeRuntime.effective, sources: safeRuntime.sources, provenance: {} });
	function events(overrides = {}) {
		return [
			{ type: "system", subtype: "init", session_id: "11111111-1111-4111-8111-111111111111", ...evidence.init },
			{ type: "stream_event", event: { type: "message_start", message: { model: model.id, usage: { input_tokens: 2, cache_read_input_tokens: 7, cache_creation_input_tokens: 0, output_tokens: 0, ...overrides.usage } } } },
			{ type: "stream_event", event: { type: "message_delta", delta: { stop_reason: overrides.stop ?? "max_tokens" }, usage: { output_tokens: 1 } } },
			{ type: "assistant", message: { model: model.id, content: [{ type: "text", text: "x" }], stop_reason: overrides.stop ?? "max_tokens" } },
			{ type: "result", subtype: "error_max_budget_usd", modelUsage: { [model.id]: evidence.usage } },
		];
	}
	for (const outcome of ["success", "changed account", "rejected account", "cancelled", "changed controls", "changed source",
		"changed settings", "unsafe settings", "failed settings", "settings cancellation", "settings controls", "settings source"]) {
		it(`withholds eagerly consumed input until account verification: ${outcome}`, async () => {
			const { getEventListeners } = await import("node:events");
			const tick = () => new Promise(resolve => setImmediate(resolve));
			const dir = mkdtempSync(`${tmpdir()}/warming-account-`);
			const path = `${dir}/source.jsonl`; writeFileSync(path, "original");
			const s = { ...source, cwd: dir, settingSources: ["user"], sourceTranscript: { path, bytesBase64: Buffer.from("original").toString("base64") } };
			const originalSettings = structuredClone(s.settings);
			const controller = new AbortController();
			let resolveAccount, rejectAccount, accountCalled;
			const account = new Promise((resolve, reject) => { resolveAccount = resolve; rejectAccount = reject; });
			const called = new Promise(resolve => { accountCalled = resolve; });
			const yielded = [];
			let options, closed = 0, attempts = 0, pumpSettled = false, completed = false, controls = true;
			let settingsCalls = 0, releaseSettings, latestSettings;
			const settingsGate = new Promise(resolve => { releaseSettings = resolve; });
			const delayedSettings = outcome.startsWith("settings ");
			let firstInput;
			const received = new Promise(resolve => { firstInput = resolve; });
			try {
				const pending = runIsolatedRefresh(s, controller.signal, {
					resolveSettings: async params => {
						assert.deepEqual(params, { cwd: s.cwd, settingSources: s.settingSources });
						if (++settingsCalls === 1) return resolve();
						if (delayedSettings) await settingsGate;
						if (outcome === "failed settings") throw new Error("SYNTHETIC-PRIVATE-SECRET");
						const current = await resolve();
						if (outcome === "changed settings") current.effective = { ...current.effective, includeGitInstructions: true };
						if (outcome === "unsafe settings") current.effective = { ...current.effective, mcpServers: { unsafe: { command: "false" } } };
						latestSettings = warmingRuntime(current, s.flagSettings);
						return current;
					},
					validateControls: () => controls,
					query: ({ prompt, options: o }) => {
						options = o;
						// Start consuming in the factory, not when accountInfo or output iteration runs.
						void (async () => {
							attempts++;
							if (typeof prompt === "string") { yielded.push(prompt); firstInput(); }
							else for await (const message of prompt) { yielded.push(message); firstInput(); }
						})().catch(() => {}).finally(() => { pumpSettled = true; });
						return {
							accountInfo() { accountCalled(); return account; },
							async *[Symbol.asyncIterator]() { await received; yield* events(); },
							close() { closed++; },
						};
					},
				}).then(result => { completed = true; return result; });
				await called; await tick();
				const beforeVerification = yielded.length;
				if (outcome === "changed controls") controls = false;
				if (outcome === "changed source") writeFileSync(path, "changed");
				let cancelledPromptly;
				if (outcome === "cancelled") {
					controller.abort(); await tick();
					cancelledPromptly = completed && pumpSettled && closed === 1;
				}
				if (outcome === "rejected account") rejectAccount(new Error("SYNTHETIC-PRIVATE-SECRET"));
				else resolveAccount(outcome === "changed account" ? { ...rawAccount, subscriptionType: "Claude Pro" } : rawAccount);
				let beforeSettingsRelease, settingsPending;
				if (delayedSettings) {
					await tick();
					beforeSettingsRelease = yielded.length;
					settingsPending = !completed;
					if (outcome === "settings cancellation") {
						controller.abort(); await tick();
						cancelledPromptly = completed && pumpSettled && closed === 1;
					}
					if (outcome === "settings controls") controls = false;
					if (outcome === "settings source") writeFileSync(path, "changed");
					releaseSettings();
				}
				const result = await pending; await tick();
				if (delayedSettings) {
					assert.equal(settingsCalls, 2);
					assert.equal(settingsPending, true, "must await post-account settings with input withheld");
					assert.equal(beforeSettingsRelease, 0);
					if (outcome === "settings cancellation") assert.equal(cancelledPromptly, true, "cancellation must settle before delayed settings resolve");
				}
				assert.deepEqual(s.settings, originalSettings, "validation must not replace or mutate source settings");
				if (outcome === "changed settings" || outcome === "unsafe settings") {
					assert.equal(preflightRuntime(latestSettings).ok, outcome === "changed settings");
					assert.notDeepEqual(latestSettings, s.settings);
					assert.equal(result.reason, "effective settings changed");
				}
				assert.equal(attempts, 1, "fake must eagerly attempt to consume input");
				assert.equal(beforeVerification, 0, "no prompt may reach the SDK before account verification");
				assert.equal(closed, 1);
				assert.equal(pumpSettled, true, "input consumer must not remain parked after cleanup");
				assert.equal(getEventListeners(controller.signal, "abort").length, 0);
				assert.equal(getEventListeners(options.abortController.signal, "abort").length, 0);
				if (outcome === "success") {
					assert.equal(settingsCalls, 2, "unchanged settings must be checked again after account lookup");
					// Live v2: re-sending the source's last user turn cache-wrote ~13k unread tokens per refresh.
					assert.equal(typeof REFRESH_PROMPT, "string"); assert.ok(REFRESH_PROMPT.length > 0 && REFRESH_PROMPT.length <= 8);
					assert.deepEqual(yielded, [{ type: "user", message: { role: "user", content: REFRESH_PROMPT }, parent_tool_use_id: null }]);
					assert.deepEqual(result, { kind: "success", usage: { input: 2, output: 1, cacheRead: 7, cacheWrite: 0 } });
					assert.deepEqual(options.systemPrompt, source.systemPrompt);
					assert.deepEqual(options.tools, []); assert.equal(options.strictMcpConfig, true);
					assert.equal(options.resume, source.sessionId); assert.equal(options.forkSession, true); assert.equal(options.persistSession, false);
					assert.equal(options.maxBudgetUsd, 0.000001); assert.equal(options.maxTurns, 1);
					assert.equal(options.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, "1"); assert.equal(options.env.CLAUDE_CODE_MAX_RETRIES, "0");
				} else {
					assert.deepEqual(yielded, [], "failed validation must never release a prompt");
					assert.equal(result.kind, "failed");
					assert.equal(result.usage, undefined);
					assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC-PRIVATE-SECRET/);
					if (outcome === "cancelled") assert.equal(cancelledPromptly, true, "cancellation must settle without waiting for account lookup");
				}
			} finally { rmSync(dir, { recursive: true, force: true }); }
		});
	}
	async function run(messages, opts = {}) {
		let closed = false;
		const result = await runIsolatedRefresh(source, opts.signal ?? new AbortController().signal, {
			resolveSettings: resolve,
			query: () => ({ accountInfo: async () => rawAccount, async *[Symbol.asyncIterator]() { yield* messages; }, close() { closed = true; } }),
		});
		assert.equal(closed, true);
		return result;
	}
	function earlyAssistantEvents() {
		const messages = events();
		[messages[2], messages[3]] = [messages[3], messages[2]];
		messages[2].message.stop_reason = null;
		return messages;
	}
	it("accepts unfinished assistant only after authoritative delta and validated budget, without draining", async () => {
		for (const reason of [null, undefined, "max_tokens"]) {
			const messages = earlyAssistantEvents(); messages[2].message.stop_reason = reason;
			let consumed = 0;
			const iterable = { *[Symbol.iterator]() { for (const message of messages) { consumed++; yield message; } throw new Error("must not drain beyond budget"); } };
			assert.deepEqual(await run(iterable), { kind: "success", usage: { input: 2, output: 1, cacheRead: 7, cacheWrite: 0 } });
			assert.equal(consumed, 5);
		}
	});
	it("rejects incomplete or contradictory terminals in measured assistant-before-delta order", async () => {
		for (const change of [
			m => { m.splice(3, 1); m[1].event.message.usage.output_tokens = 1; },
			m => { m[3].event.delta.stop_reason = "end_turn"; },
			m => { delete m[3].event.delta.stop_reason; },
			m => { m[2].message.stop_reason = "end_turn"; },
			m => { m[3].event.usage.output_tokens = 2; },
			m => { m[4].subtype = "error_during_execution"; },
			m => { m[4].subtype = "success"; },
			m => { m.pop(); },
			m => { m.splice(3, 0, structuredClone(m[2])); },
			m => { m[2].message.model = "wrong-model"; },
			m => { m[2].message.content = [{ type: "tool_use", name: "read" }]; },
		]) { const messages = earlyAssistantEvents(); change(messages); assert.equal((await run(messages)).kind, "failed"); }
	});
	it("rejects a full prefix miss even if it writes the entire prefix", async () => {
		assert.equal((await run(events({ usage: { cache_read_input_tokens: 0, cache_creation_input_tokens: 7 } }))).kind, "failed");
	});
	it("rejects a generic budget error without the measured stop reason", async () => {
		assert.equal((await run(events({ stop: "end_turn" }))).kind, "failed");
	});
	it("requires matching init runtime and actual served model", async () => {
		for (const change of [
			m => { m[0].claude_code_version = "unknown"; },
			m => { m[1].event.message.model = "wrong-model"; },
			m => { delete m[1].event.message.usage; },
			m => { m.at(-1).subtype = "error_during_execution"; },
			m => { m.splice(2, 0, structuredClone(m[1])); },
			m => { m.at(-1).modelUsage = { other: { ...evidence.usage, canonicalModel: "other" } }; },
		]) { const m = events(); change(m); assert.equal((await run(m)).kind, "failed"); }
	});
	it("does not construct a query when already cancelled or cancelled during preflight", async () => {
		for (const before of [true, false]) {
			let calls = 0;
			const c = new AbortController(); if (before) c.abort();
			const result = await runIsolatedRefresh(source, c.signal, { resolveSettings: async () => { c.abort(); return resolve(); }, query: () => { calls++; throw new Error("must not construct"); } });
			assert.equal(calls, 0); assert.equal(result.kind, "failed");
		}
	});
	it("sanitizes constructor and iteration errors and removes abort listeners", async () => {
		const { getEventListeners } = await import("node:events");
		for (const constructor of [true, false]) {
			const c = new AbortController(); let closed = 0;
			const result = await runIsolatedRefresh(source, c.signal, {
				resolveSettings: resolve,
				query: () => { if (constructor) throw new Error("SYNTHETIC-PRIVATE-SECRET"); return { accountInfo: async () => rawAccount, async *[Symbol.asyncIterator]() { throw new Error("SYNTHETIC-PRIVATE-SECRET"); }, close() { closed++; } }; },
			});
			assert.equal(result.kind, "failed"); assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC-PRIVATE-SECRET/);
			assert.equal(getEventListeners(c.signal, "abort").length, 0); assert.equal(closed, constructor ? 0 : 1);
		}
	});
	it("checks source bytes on errors and cancellation, not just success", async () => {
		const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
		const { tmpdir } = await import("node:os");
		const dir = mkdtempSync(`${tmpdir()}/warming-source-`); const path = `${dir}/source.jsonl`;
		try {
			for (const abort of [true, false]) {
				writeFileSync(path, "original"); const c = new AbortController();
				const result = await runIsolatedRefresh({ ...source, sourceTranscript: { path, bytesBase64: Buffer.from("original").toString("base64") } }, c.signal, {
					resolveSettings: resolve,
					query: () => ({ accountInfo: async () => rawAccount, async *[Symbol.asyncIterator]() { writeFileSync(path, "mutated"); if (abort) c.abort(); throw new Error("error"); }, close() {} }),
				});
				assert.match(result.reason, /mutated source/);
			}
		} finally { rmSync(dir, { recursive: true, force: true }); }
	});
});

describe("qualification repair regressions", () => {
	it("does not accept a bare model id as runtime/accounting qualification", () => {
		const c = new CacheWarmingCoordinator({ qualified: new Set([model.id]) });
		c.complete(c.begin("owner"), source);
		assert.equal(c.decide({ owner: "owner", piSessionId: "pi-session", model, idle: true, retention: "short", runtime: safeRuntime }), "stop");
	});
	it("does not retain raw account identity and selects only actual served accounting", async () => {
		const { accountEvidence, selectModelUsage } = await import("../src/cache-warming.js");
		const derived = accountEvidence({ ...rawAccount, email: "private@example.invalid", organization: "private-org" });
		assert.doesNotMatch(JSON.stringify(derived), /private/);
		assert.equal(selectModelUsage({ other: { canonicalModel: "other", provider: "firstParty", costBasis: "list" } }, model.id), undefined);
	});
	it("accepts the live API's dated snapshot of the requested alias, nothing looser", async () => {
		const { selectModelUsage } = await import("../src/cache-warming.js");
		// Live: modelUsage is keyed by the requested alias, the response carries the dated id.
		const row = { canonicalModel: model.id, provider: "firstParty", costBasis: "list" };
		assert.deepEqual(selectModelUsage({ [model.id]: row }, `${model.id}-20251001`), row);
		for (const served of [`${model.id}-evil`, `${model.id}-2025100`, `${model.id}-20251001-x`, `x${model.id}-20251001`]) {
			assert.equal(selectModelUsage({ [model.id]: row }, served), undefined, served);
		}
		const dated = { ...source, evidence: { ...source.evidence, servedModel: `${model.id}-20251001` } };
		const c = new CacheWarmingCoordinator({ qualified: new Set([warmingQualificationKey(dated)]) });
		c.complete(c.begin("owner"), dated);
		assert.equal(c.decide({ owner: "owner", piSessionId: "pi-session", model, idle: true, retention: "short", runtime: safeRuntime }), "warm");
		const other = { ...source, evidence: { ...source.evidence, servedModel: `${model.id}-evil` } };
		const d = new CacheWarmingCoordinator({ qualified: new Set([warmingQualificationKey(other)]) });
		d.complete(d.begin("owner"), other);
		assert.equal(d.decide({ owner: "owner", piSessionId: "pi-session", model, idle: true, retention: "short", runtime: safeRuntime }), "stop");
	});
});

describe("ownership and current-state races", () => {
	it("requires the invoking stream owner, not just a matching transcript/session", async () => {
		const c = new CacheWarmingCoordinator({ qualified: new Set([warmingQualificationKey(source)]), refresh: async () => ({ kind: "success", usage: {} }) });
		c.complete(c.begin("owner"), source);
		assert.equal(c.decide({ owner: "owner", piSessionId: "pi-session", model, idle: true, retention: "short", runtime: safeRuntime }), "warm");
		assert.equal((await c.intercept(model, source.context, { maxTokens: 1, maxRetries: 0, sessionId: "pi-session" }, () => {})).ok, false);
	});
	it("rejects inherited body/auth/process controls before creating a child", async () => {
		for (const key of ["CLAUDE_CODE_EXTRA_BODY", "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_PROCESS_WRAPPER"]) {
			let calls = 0;
			const result = await runIsolatedRefresh({ ...source, env: { ...source.env, [key]: "unsafe" } }, new AbortController().signal, {
				resolveSettings: async () => ({ effective: safeRuntime.effective, sources: [], provenance: {} }),
				query: () => { calls++; throw new Error("must not create"); },
			});
			assert.equal(result.kind, "failed"); assert.equal(calls, 0, key);
		}
	});
});

describe("public-boundary coverage", () => {
	it("publishes ordinary success with the real owner and replays the final raw native transcript", async () => {
		const { captureWarmingRequest, nativeWarmingDecision } = await import("../src/cache-warming.js");
		const { QueryContext } = await import("../src/query-state.js");
		const { createAssistantMessageEventStream } = await import("@earendil-works/pi-ai");
		const owner = bridgeTest.streamClaudeAgentSdk;
		const raw = { messages: [
			{ role: "system", content: "system", tools: [], timestamp: 1 },
			{ role: "user", content: "hello", timestamp: 2 },
			{ role: "toolResult", toolCallId: "id", toolName: "read", content: [{ type: "text", text: "result" }], isError: false, timestamp: 3 },
		] };
		const options = { sessionId: "pi-session", cacheRetention: "short", env: { PI_CACHE_RETENTION: "short" }, onResponse() {} };
		const captured = captureWarmingRequest(raw, options, model);
		const expected = structuredClone(raw);
		raw.messages[0].content = "mutated after invocation"; options.env.PI_CACHE_RETENTION = "long";
		let refreshed = 0;
		const c = new CacheWarmingCoordinator({ qualified: new Set([warmingQualificationKey(source)]), refresh: async s => { assert.deepEqual(s.context, expected); refreshed++; return { kind: "success", usage: { input: 1, output: 1, cacheRead: 7, cacheWrite: 0 } }; } });
		const generation = c.begin(owner);
		const q = new QueryContext(); q.resetTurnState(model); q.warmingRequest = captured;
		const stream = createAssistantMessageEventStream(); q.currentPiStream = stream;
		await bridgeTest.completeProviderTurn(q, async () => c.complete(generation, { ...source, owner, context: q.warmingRequest.context, requestOptions: q.warmingRequest.options, controlsFingerprint: "stable" }));
		assert.equal((await stream.result()).stopReason, "stop"); assert.equal(c.snapshot().owner, owner);
		const eventCtx = { model, thinkingLevel: "off", isIdle: () => true, sessionManager: { getSessionId: () => "pi-session" } };
		const state = async () => ({ runtime: safeRuntime, controlsFingerprint: "stable" });
		assert.deepEqual(await nativeWarmingDecision(c, { ...eventCtx, sessionManager: { getSessionId: () => "sibling" } }, owner, state), { action: "stop" });
		assert.deepEqual(await nativeWarmingDecision(c, eventCtx, owner, state), { action: "warm" });
		assert.equal((await c.intercept(model, expected, { ...captured.options, maxTokens: 1, maxRetries: 0, signal: new AbortController().signal, onResponse() {} }, owner)).ok, true);
		assert.equal(refreshed, 1);
	});

	it("native dispatch revalidates current settings, bridge controls, retention, and invalidation during await", async () => {
		const { nativeWarmingDecision } = await import("../src/cache-warming.js");
		const c = new CacheWarmingCoordinator({ qualified: new Set([warmingQualificationKey(source)]) });
		const eventCtx = { model, thinkingLevel: "off", isIdle: () => true, sessionManager: { getSessionId: () => "pi-session" } };
		const publish = () => c.complete(c.begin("owner"), { ...source, controlsFingerprint: "original" });
		for (const state of [
			{ runtime: { ...safeRuntime, effective: { ...safeRuntime.effective, autoMemoryEnabled: true } }, controlsFingerprint: "original" },
			{ runtime: safeRuntime, controlsFingerprint: "mutated-long-context-policy" },
		]) { publish(); assert.deepEqual(await nativeWarmingDecision(c, eventCtx, "owner", async () => state), { action: "stop" }); }
		const old = process.env.PI_CACHE_RETENTION;
		try {
			process.env.PI_CACHE_RETENTION = "long"; publish();
			assert.deepEqual(await nativeWarmingDecision(c, eventCtx, "owner", async () => ({ runtime: safeRuntime, controlsFingerprint: "original" })), { action: "stop" });
		} finally { if (old === undefined) delete process.env.PI_CACHE_RETENTION; else process.env.PI_CACHE_RETENTION = old; }
		publish();
		assert.deepEqual(await nativeWarmingDecision(c, eventCtx, "owner", async () => { c.invalidate("new work"); return { runtime: safeRuntime, controlsFingerprint: "original" }; }), { action: "stop" });
	});

	it("actually rejects a tools/call without executing a Pi tool", async () => {
		const { MCP_SERVER_NAME } = await import("../src/skills.js");
		const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
		const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
		const tool = { name: "read", description: "synthetic", parameters: { type: "object", properties: {} } };
		const s = { ...source, mcpTools: [tool], evidence: { ...evidence, init: { ...evidence.init, mcp_servers: [{ name: MCP_SERVER_NAME, status: "connected", source: "sdk" }], tools: [`mcp__${MCP_SERVER_NAME}__read`] } } };
		let calls = 0, closed = 0, reply;
		const result = await runIsolatedRefresh(s, new AbortController().signal, {
			resolveSettings: async () => ({ effective: safeRuntime.effective, sources: [], provenance: {} }),
			query: ({ options }) => ({ accountInfo: async () => rawAccount, async *[Symbol.asyncIterator]() {
				const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
				const client = new Client({ name: "offline-warming-test", version: "1" });
				await options.mcpServers[MCP_SERVER_NAME].instance.connect(serverTransport); await client.connect(clientTransport);
				try { calls++; reply = await client.callTool({ name: "read", arguments: {}, _meta: { "claudecode/toolUseId": "call" } }).catch(e => e.message); }
				finally { await client.close(); }
				assert.equal(options.abortController.signal.aborted, true);
				yield { type: "result", subtype: "error_during_execution" };
			}, close() { closed++; } }),
		});
		assert.match(JSON.stringify(reply), /cannot execute tools/); assert.equal(calls, 1); assert.equal(closed, 1); assert.equal(result.kind, "failed");
	});

	it("detects a persisted fork even on an error exit and never deletes source history", async () => {
		const dir = mkdtempSync(`${tmpdir()}/warming-fork-`); const path = `${dir}/source.jsonl`;
		writeFileSync(path, "original");
		try {
			const result = await runIsolatedRefresh({ ...source, sourceTranscript: { path, bytesBase64: Buffer.from("original").toString("base64") } }, new AbortController().signal, {
				resolveSettings: async () => ({ effective: safeRuntime.effective, sources: [], provenance: {} }),
				query: () => ({ accountInfo: async () => rawAccount, async *[Symbol.asyncIterator]() { writeFileSync(`${dir}/fork.jsonl`, "unexpected"); throw new Error("failed"); }, close() {} }),
			});
			assert.match(result.reason, /persisted a transcript/);
			const { readFileSync } = await import("node:fs"); assert.equal(readFileSync(path, "utf8"), "original");
		} finally { rmSync(dir, { recursive: true, force: true }); }
	});

	it("cleans up on account/setup failure, settings races, and checks controls again after preflight", async () => {
		const { getEventListeners } = await import("node:events");
		for (const accountFails of [true, false]) {
			const controller = new AbortController(); let created = 0, closed = 0, checks = 0;
			const result = await runIsolatedRefresh(source, controller.signal, {
				validateControls: () => accountFails || ++checks === 1,
				resolveSettings: async () => ({ effective: safeRuntime.effective, sources: [], provenance: {} }),
				query: () => { created++; return { accountInfo: async () => { throw new Error("SYNTHETIC-PRIVATE-SECRET"); }, async *[Symbol.asyncIterator]() {}, close() { closed++; } }; },
			});
			assert.equal(result.kind, "failed"); assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC-PRIVATE-SECRET/);
			assert.equal(created, accountFails ? 1 : 0); assert.equal(closed, created);
			assert.equal(getEventListeners(controller.signal, "abort").length, 0);
		}
	});

	it("unknown accounting backends and SDKs remain ineligible even with injected qualification", () => {
		for (const patch of [{ usage: { ...evidence.usage, provider: "anthropic" } }, { usage: { ...evidence.usage, provider: undefined } }, { sdkVersion: "unknown" }]) {
			const s = { ...source, evidence: { ...evidence, ...patch } };
			const c = new CacheWarmingCoordinator({ qualified: new Set([warmingQualificationKey(s)]) }); c.complete(c.begin("owner"), s);
			assert.equal(c.decide({ owner: "owner", piSessionId: "pi-session", model, idle: true, retention: "short", runtime: safeRuntime }), "stop");
		}
	});
});

describe("terminal and owner-local dispatch guards", () => {
	it("sanitizes unexpected terminal-stream rejection", async () => {
		const coordinator = globalThis[Symbol.for("claude-bridge:cacheWarmingCoordinator")];
		const original = coordinator.intercept;
		try {
			coordinator.intercept = async () => { throw new Error("SYNTHETIC-PRIVATE-SECRET"); };
			const result = await bridgeTest.streamClaudeAgentSdk(model, source.context, { maxTokens: 1, maxRetries: 0 }).result();
			assert.equal(result.stopReason, "error"); assert.doesNotMatch(result.errorMessage, /SYNTHETIC-PRIVATE-SECRET/);
		} finally { coordinator.intercept = original; }
	});
	it("rechecks owner-local controls at dispatch after native consent", async () => {
		let calls = 0;
		const c = new CacheWarmingCoordinator({ qualified: new Set([warmingQualificationKey(source)]), refresh: async () => { calls++; return { kind: "success", usage: {} }; } });
		c.complete(c.begin("owner"), source);
		assert.equal(c.decide({ owner: "owner", piSessionId: "pi-session", model, idle: true, retention: "short", runtime: safeRuntime }), "warm");
		const result = await c.intercept(model, source.context, { maxTokens: 1, maxRetries: 0, sessionId: "pi-session" }, "owner", () => false);
		assert.equal(result.ok, false); assert.equal(calls, 0);
	});
});

describe("qualification declarations and late completion", () => {
	it("pins the public SDK backend declaration without guessing an alias or promoting production rows", async () => {
		const { readFileSync } = await import("node:fs");
		const { dirname, join } = await import("node:path");
		const { fileURLToPath } = await import("node:url");
		const { PRODUCTION_QUALIFIED_WARMING_MODELS } = await import("../src/cache-warming.js");
		const declaration = readFileSync(join(dirname(fileURLToPath(import.meta.resolve("@anthropic-ai/claude-agent-sdk"))), "sdk.d.ts"), "utf8");
		const usage = declaration.slice(declaration.indexOf("export declare type ModelUsage ="), declaration.indexOf("export declare type ModelUsage =") + 3500);
		assert.match(usage, /API provider that served this model \(e\.g\. 'firstParty'/);
		assert.equal(PRODUCTION_QUALIFIED_WARMING_MODELS.size, 3);
	});
	it("qualifies only the explicitly approved Haiku and 5.5 lanes, nothing adjacent", async () => {
		const { PRODUCTION_QUALIFIED_WARMING_MODELS: production } = await import("../src/cache-warming.js");
		const key = ({ model = "claude-haiku-4-5", cliModel = model, sdk = "0.3.285", cli = "2.1.285", provider = "firstParty", canonical = model, costBasis = "list", plan = "Claude Team" } = {}) =>
			warmingQualificationKey({ model: { id: model }, cliModel, evidence: { sdkVersion: sdk, init: { claude_code_version: cli },
				usage: { provider, canonicalModel: canonical, costBasis }, account: { lane: JSON.stringify(["firstParty", plan, null, null]) } } });
		assert.deepEqual([...production], [key(), key({ model: "claude-sonnet-5-5" }), key({ model: "claude-opus-5-5", cliModel: "claude-opus-5-5[1m]" })]);
		for (const change of [{ model: "claude-sonnet-5-5", cliModel: "claude-sonnet-5-5[1m]" }, { model: "claude-opus-5-5" }, { model: "claude-sonnet-4-6" }, { sdk: "0.3.286" }, { cli: "2.1.286" },
			{ plan: "Claude Max" }, { plan: "Claude Pro" }, { provider: "bedrock" }, { costBasis: "other" }]) assert.equal(production.has(key(change)), false, JSON.stringify(change));
	});
	it("ignores an old successful refresh after new work without suppressing the newer snapshot", async () => {
		let finish;
		const c = new CacheWarmingCoordinator({ qualified: new Set([warmingQualificationKey(source)]), refresh: () => new Promise(resolve => { finish = resolve; }) });
		const decision = { owner: "owner", piSessionId: "pi-session", model, idle: true, retention: "short", runtime: safeRuntime };
		c.complete(c.begin("owner"), source); assert.equal(c.decide(decision), "warm");
		const pending = c.intercept(model, source.context, { maxTokens: 1, maxRetries: 0, sessionId: "pi-session" }, "owner");
		c.complete(c.begin("owner"), source);
		finish({ kind: "success", usage: { input: 0, output: 1, cacheRead: 7, cacheWrite: 0 } });
		assert.equal((await pending).ok, false); assert.equal(c.decide(decision), "warm");
	});
});

describe("ordinary completion ordering", () => {
	it("keeps the query owned during bookkeeping and always releases it before finalizing", async () => {
		const { QueryContext } = await import("../src/query-state.js");
		const { createAssistantMessageEventStream } = await import("@earendil-works/pi-ai");
		for (const fails of [false, true]) {
			const c = new QueryContext(); c.resetTurnState(model); const active = {}; c.activeQuery = active;
			const stream = createAssistantMessageEventStream(); c.currentPiStream = stream;
			await bridgeTest.completeProviderTurn(c, async () => {
				await Promise.resolve(); assert.equal(c.activeQuery, active);
				if (fails) throw new Error("maintenance only");
			}, () => { c.activeQuery = null; });
			assert.equal(c.activeQuery, null); assert.equal((await stream.result()).stopReason, "stop");
		}
	});
});

describe("source accounting selection", () => {
	it("uses the actually served non-streaming fallback model, never an unrelated cumulative row", async () => {
		const { QueryContext } = await import("../src/query-state.js");
		const other = { provider: "firstParty", canonicalModel: "served-other", costBasis: "list" };
		const q = { async *[Symbol.asyncIterator]() {
			yield { type: "stream_event", event: { type: "message_start", message: { model: model.id } } };
			yield { type: "assistant", message: { model: "served-other", content: [], stop_reason: "end_turn" } };
			yield { type: "result", subtype: "success", modelUsage: { [model.id]: evidence.usage, "served-other": other } };
		} };
		const result = await bridgeTest.consumeQuery(q, new Map(), model, () => false, new QueryContext());
		assert.equal(result.servedModel, "served-other"); assert.deepEqual(result.usage, other);
	});
});
