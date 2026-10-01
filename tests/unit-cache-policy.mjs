import { describe, it } from "node:test";
import assert from "node:assert/strict";

const {
	resolvePiCacheRetention,
	providerCacheControls,
	summaryCacheControls,
	providerThinkingOptions,
} = await import("../src/cache-policy.js");
const { __test } = await import("../src/index.js");

describe("Pi-owned cache retention", () => {
	it("uses explicit options before request env and the short default", () => {
		assert.equal(resolvePiCacheRetention({ cacheRetention: "none", env: { PI_CACHE_RETENTION: "long" } }, { PI_CACHE_RETENTION: "long" }), "none");
		assert.equal(resolvePiCacheRetention({ cacheRetention: "short", env: { PI_CACHE_RETENTION: "long" } }, {}), "short");
		assert.equal(resolvePiCacheRetention({ env: { PI_CACHE_RETENTION: "long" } }, {}), "long");
		assert.equal(resolvePiCacheRetention({ env: { PI_CACHE_RETENTION: "none" } }, {}), "short");
		assert.equal(resolvePiCacheRetention(undefined, {}), "short");
	});

	it("matches Pi provider-env fallback for absent, undefined, null, and empty scoped values", () => {
		const processEnv = { PI_CACHE_RETENTION: "long" };
		assert.equal(resolvePiCacheRetention({}, processEnv), "long");
		assert.equal(resolvePiCacheRetention({ env: { PI_CACHE_RETENTION: undefined } }, processEnv), "long");
		assert.equal(resolvePiCacheRetention({ env: { PI_CACHE_RETENTION: null } }, processEnv), "long");
		assert.equal(resolvePiCacheRetention({ env: { PI_CACHE_RETENTION: "" } }, processEnv), "long");
	});

	it("makes provider controls authoritative without mutating the inherited env", () => {
		const inherited = {
			DISABLE_PROMPT_CACHING: "1",
			DISABLE_PROMPT_CACHING_OPUS: "1",
			FORCE_PROMPT_CACHING_5M: "1",
			ENABLE_PROMPT_CACHING_1H: "1",
			CLAUDE_CODE_PROMPT_CACHE_TTL: "ambient",
			KEEP: "yes",
		};
		const short = providerCacheControls(inherited, "short");
		assert.deepEqual(inherited, {
			DISABLE_PROMPT_CACHING: "1", DISABLE_PROMPT_CACHING_OPUS: "1",
			FORCE_PROMPT_CACHING_5M: "1", ENABLE_PROMPT_CACHING_1H: "1",
			CLAUDE_CODE_PROMPT_CACHE_TTL: "ambient", KEEP: "yes",
		});
		assert.equal(short.env.KEEP, "yes");
		assert.equal(short.env.CLAUDE_CODE_PROMPT_CACHE_TTL, "5m");
		assert.equal(short.env.DISABLE_PROMPT_CACHING, "0");
		assert.equal(short.env.DISABLE_PROMPT_CACHING_OPUS, "0");
		assert.equal(short.env.FORCE_PROMPT_CACHING_5M, "0");
		assert.equal(short.env.ENABLE_PROMPT_CACHING_1H, "0");
		assert.equal(short.settings.promptCacheTtl, "5m");

		const long = providerCacheControls({}, "long");
		assert.equal(long.env.CLAUDE_CODE_PROMPT_CACHE_TTL, "1h");
		assert.equal(long.settings.promptCacheTtl, "1h");

		const none = providerCacheControls({}, "none");
		assert.equal(none.env.DISABLE_PROMPT_CACHING, "1");
		assert.equal(none.env.DISABLE_PROMPT_CACHING_HAIKU, "1");
		assert.equal(none.env.DISABLE_PROMPT_CACHING_SONNET, "1");
		assert.equal(none.settings.promptCacheTtl, undefined);
	});

	it("mirrors exactly ten owned cache controls into settings, never inherited secrets", () => {
		const inherited = Object.freeze({ ANTHROPIC_API_KEY: "synthetic-secret", KEEP: "yes", DISABLE_PROMPT_CACHING: "conflict" });
		const before = { ...process.env };
		for (const mode of ["short", "long", "none"]) {
			const controls = providerCacheControls(inherited, mode);
			const disabled = mode === "none" ? "1" : "0";
			const expected = {
				CLAUDE_CODE_PROMPT_CACHE_TTL: mode === "long" ? "1h" : "5m",
				DISABLE_PROMPT_CACHING: disabled, FORCE_PROMPT_CACHING_5M: "0",
				ENABLE_PROMPT_CACHING_1H: "0", ENABLE_PROMPT_CACHING_1H_BEDROCK: "0",
				...Object.fromEntries(["FABLE", "HAIKU", "MYTHOS", "OPUS", "SONNET"].map(name => [`DISABLE_PROMPT_CACHING_${name}`, disabled])),
			};
			assert.deepEqual(controls.settings, { env: expected, ...(mode === "none" ? {} : { promptCacheTtl: expected.CLAUDE_CODE_PROMPT_CACHE_TTL }) });
			assert.deepEqual(controls.env, { ...inherited, ...expected });
		}
		assert.deepEqual(summaryCacheControls(inherited), providerCacheControls(inherited, "none"));
		assert.deepEqual(inherited, { ANTHROPIC_API_KEY: "synthetic-secret", KEEP: "yes", DISABLE_PROMPT_CACHING: "conflict" });
		assert.equal(JSON.stringify({ ...process.env }) === JSON.stringify(before), true);
	});

	it("remembers every resolved plugin id per cwd, sorted and cumulative", () => {
		// CLI 2.1.285 loads cc-plugin-agents-md@builtin by default, injecting AGENTS.md
		// (offline probe); only the exact @builtin id switches it off.
		const builtin = "cc-plugin-agents-md@builtin";
		__test.resetPluginIds();
		assert.deepEqual(__test.pluginIdsFor("/p"), [builtin]);
		__test.rememberPluginIds("/p", { enabledPlugins: { "z@m": true, "a@m": false } });
		__test.rememberPluginIds("/p", { enabledPlugins: { "b@m": true } });
		__test.rememberPluginIds("/p", {});
		assert.deepEqual(__test.pluginIdsFor("/p"), ["a@m", "b@m", builtin, "z@m"], "a later resolve never re-enables a known plugin");
		assert.deepEqual(__test.pluginIdsFor("/other"), [builtin]);
		__test.resetPluginIds();
	});

	it("switches off plugins a query's init reported, from the next query on", () => {
		__test.resetPluginIds();
		__test.rememberInitPlugins("/p", [{ name: "cc-plugin-telemetry", path: "builtin", source: "cc-plugin-telemetry@builtin" }, { name: "x", path: "/x" }, null]);
		__test.rememberInitPlugins("/p", undefined);
		assert.deepEqual(__test.pluginIdsFor("/p"), ["cc-plugin-agents-md@builtin", "cc-plugin-telemetry@builtin"]);
		assert.deepEqual(__test.pluginIdsFor("/other"), ["cc-plugin-agents-md@builtin"]);
		__test.resetPluginIds();
	});

	it("preserves explicit unrelated provider settings.env while owned cache keys win", () => {
		const settings = Object.freeze({ autoMemoryEnabled: false, env: Object.freeze({ KEEP: "explicit", DISABLE_PROMPT_CACHING: "1" }) });
		for (const mode of ["short", "long", "none"]) {
			const cache = providerCacheControls({}, mode).settings;
			const merged = __test.providerQuerySettings(settings, cache);
			assert.deepEqual(merged.env, { KEEP: "explicit", ...cache.env });
			assert.equal(merged.env.DISABLE_PROMPT_CACHING, mode === "none" ? "1" : "0");
			assert.equal(merged.autoMemoryEnabled, false);
			assert.equal(merged.includeGitInstructions, false);
			assert.equal(merged.disableAllHooks, true, "Pi owns the turn; Claude Code settings/plugin hooks must not run");
			assert.equal(merged.enabledPlugins, undefined, "no known plugins adds no plugin settings");
			assert.deepEqual(__test.providerQuerySettings(settings, cache, ["a@m", "b@m"]).enabledPlugins, { "a@m": false, "b@m": false });
		}
		assert.deepEqual(settings.env, { KEEP: "explicit", DISABLE_PROMPT_CACHING: "1" });
	});

	it("always disables cache in isolated Pi summaries", () => {
		const controls = summaryCacheControls({ DISABLE_PROMPT_CACHING: "0", ENABLE_PROMPT_CACHING_1H: "1" });
		assert.equal(controls.env.DISABLE_PROMPT_CACHING, "1");
		assert.equal(controls.env.ENABLE_PROMPT_CACHING_1H, "0");
	});

	it("explicitly disables thinking only when Pi reasoning is absent", () => {
		assert.deepEqual(providerThinkingOptions(undefined, undefined), { thinking: { type: "disabled" } });
	});

	it("leaves Claude thinking defaults intact when requested reasoning has no accepted effort", () => {
		assert.deepEqual(providerThinkingOptions("high", undefined), {});
		// A model-level `max: null` map produces this same requested/max + omitted-effort pair.
		assert.deepEqual(providerThinkingOptions("max", undefined), {});
	});

	it("preserves supported effort mappings", () => {
		assert.deepEqual(providerThinkingOptions("low", "low"), { effort: "low" });
		assert.deepEqual(providerThinkingOptions("max", "max"), { effort: "max" });
	});
});

describe("uncached request routing", () => {
	it("routes only tool-less single-message uncached calls as one-off summaries", () => {
		const user = { role: "user", content: "summarize", timestamp: 1 };
		const summary = { systemPrompt: "any summarizer", messages: [user] };
		assert.equal(__test.isOneOffSummary(summary, { cacheRetention: "none" }), true);
		assert.equal(__test.isOneOffSummary(summary, { cacheRetention: "short" }), false);
		assert.equal(__test.isOneOffSummary({ ...summary, tools: [{ name: "read", description: "", parameters: {} }] }, { cacheRetention: "none" }), false);
		assert.equal(__test.isOneOffSummary({ ...summary, messages: [user, { role: "assistant", content: [], timestamp: 2 }, user] }, { cacheRetention: "none" }), false);
		assert.equal(__test.isOneOffSummary({ ...summary, messages: [{ role: "assistant", content: [], timestamp: 1 }] }, { cacheRetention: "none" }), false);
	});
});
