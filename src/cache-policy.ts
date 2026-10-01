import type { SimpleStreamOptions } from "@earendil-works/pi-ai";
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk";

export type PiCacheRetention = NonNullable<SimpleStreamOptions["cacheRetention"]>;
export type CacheControls = {
	env: NodeJS.ProcessEnv;
	settings: { env: Record<string, string>; promptCacheTtl?: "5m" | "1h" };
};

const MODEL_CACHE_DISABLE_FLAGS = [
	"DISABLE_PROMPT_CACHING_FABLE",
	"DISABLE_PROMPT_CACHING_HAIKU",
	"DISABLE_PROMPT_CACHING_MYTHOS",
	"DISABLE_PROMPT_CACHING_OPUS",
	"DISABLE_PROMPT_CACHING_SONNET",
] as const;

/** Match pi-ai's native retention resolution: only `long` in the scoped/process
 * environment changes the default. Falsy scoped values fall through to process.env. */
export function resolvePiCacheRetention(
	options?: Pick<SimpleStreamOptions, "cacheRetention" | "env">,
	processEnv: NodeJS.ProcessEnv = process.env,
): PiCacheRetention {
	if (options?.cacheRetention) return options.cacheRetention;
	const scoped = options?.env?.PI_CACHE_RETENTION;
	return (scoped || processEnv.PI_CACHE_RETENTION) === "long" ? "long" : "short";
}

/** Build child-only SDK controls. Settings initialization can overwrite inherited
 * variables, so mirror ONLY owned cache keys into flag settings (never secrets). */
export function providerCacheControls(env: NodeJS.ProcessEnv, retention: PiCacheRetention): CacheControls {
	const disabled = retention === "none";
	const ttl = retention === "long" ? "1h" : "5m";
	const cacheEnv: Record<string, string> = {
		CLAUDE_CODE_PROMPT_CACHE_TTL: ttl,
		DISABLE_PROMPT_CACHING: disabled ? "1" : "0",
		FORCE_PROMPT_CACHING_5M: "0",
		ENABLE_PROMPT_CACHING_1H: "0",
		ENABLE_PROMPT_CACHING_1H_BEDROCK: "0",
	};
	for (const flag of MODEL_CACHE_DISABLE_FLAGS) cacheEnv[flag] = disabled ? "1" : "0";
	return {
		env: { ...env, ...cacheEnv },
		settings: { env: cacheEnv, ...(!disabled ? { promptCacheTtl: ttl } : {}) },
	};
}

/** Pi summaries are one-off maintenance calls and never write prompt cache entries. */
export function summaryCacheControls(env: NodeJS.ProcessEnv): CacheControls {
	return providerCacheControls(env, "none");
}

/** Omitting effort is not an off switch when Pi requested reasoning: a model map
 * may deliberately reject that level, in which case Claude's own default applies. */
export function providerThinkingOptions(
	reasoning: SimpleStreamOptions["reasoning"],
	effort: EffortLevel | undefined,
): { effort: EffortLevel } | { thinking: { type: "disabled" } } | Record<string, never> {
	if (!reasoning) return { thinking: { type: "disabled" } };
	return effort ? { effort } : {};
}
