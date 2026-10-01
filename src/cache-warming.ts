import { createHash } from "node:crypto";
import { providerCacheControls, resolvePiCacheRetention } from "./cache-policy.js";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context, Model, SimpleStreamOptions, Tool } from "@earendil-works/pi-ai";
import { query as sdkQuery, resolveSettings as sdkResolveSettings, type SettingSource, type SDKMessage, type AccountInfo } from "@anthropic-ai/claude-agent-sdk";
import { createToolServer } from "./mcp-server.js";
import { makePromptStream, userMessage } from "./prompt-stream.js";
import { MCP_SERVER_NAME } from "./skills.js";

export type RuntimeSettings = {
	effective: Record<string, unknown>;
	/** Unmodified resolver output: flag settings must not hide policy evidence. */
	resolvedEffective?: Record<string, unknown>;
	sources: Array<{ source?: string; settings?: Record<string, unknown> }>;
};

/** Package metadata, not a claimed CLI/runtime qualification. */
export const WARMING_SDK_VERSION: string = (() => {
	try { return JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.resolve("@anthropic-ai/claude-agent-sdk"))), "package.json"), "utf8")).version; }
	catch { return "unknown"; }
})();

export function accountEvidence(account: AccountInfo): WarmingEvidence["account"] {
	return {
		// Stored subscriptions use display labels and omit both optional source fields.
		// This account gate alone establishes neither auth nor runtime/model qualification.
		eligible: account.apiProvider === "firstParty"
			&& ["Claude Pro", "Claude Max", "Claude Team", "Claude Enterprise"].includes(account.subscriptionType ?? "")
			&& account.tokenSource === undefined && account.apiKeySource === undefined,
		fingerprint: warmingControlsFingerprint(account, {}),
		lane: identity([account.apiProvider, account.subscriptionType, account.tokenSource, account.apiKeySource]),
	};
}

/** The live API serves an alias request under its dated snapshot id (claude-haiku-4-5 ->
 *  claude-haiku-4-5-20251001), while SDK modelUsage keys the requested alias. Only that
 *  exact alias or alias + "-YYYYMMDD" counts as the same served model. */
function servesAs(served: string | undefined, requested: string | undefined): boolean {
	return typeof served === "string" && typeof requested === "string"
		&& (served === requested || (served.startsWith(`${requested}-`) && /^\d{8}$/.test(served.slice(requested.length + 1))));
}

export function selectModelUsage(rows: Record<string, WarmingEvidence["usage"]> | undefined, servedModel: string | undefined, cliModel?: string): WarmingEvidence["usage"] | undefined {
	if (!rows || !servedModel) return undefined;
	// Only the qualified Opus request suffix is reconciled. Include all candidate
	// rows before selecting: a direct served row must not hide ambiguous accounting.
	if (cliModel === "claude-opus-5-5[1m]") {
		const bare = "claude-opus-5-5";
		if (!servesAs(servedModel, bare)) return undefined;
		const matches = Object.entries(rows).filter(([key, row]) => servesAs(servedModel, key) || key === cliModel
			|| row.canonicalModel === servedModel || row.canonicalModel === bare || row.canonicalModel === cliModel);
		if (matches.length !== 1) return undefined;
		const [key, row] = matches[0];
		if (!(servesAs(servedModel, key) || key === cliModel)
			|| (row.canonicalModel !== bare && row.canonicalModel !== cliModel)) return undefined;
		return { provider: row.provider, canonicalModel: bare, costBasis: row.costBasis };
	}
	const aliased = Object.keys(rows).filter(key => servesAs(servedModel, key));
	let matches: WarmingEvidence["usage"][];
	if (rows[servedModel]) {
		matches = [rows[servedModel]];
	} else if (aliased.length) {
		matches = aliased.map(key => rows[key]);
	} else {
		matches = Object.values(rows).filter(row => row.canonicalModel === servedModel);
	}
	if (matches.length !== 1) return undefined;
	const { provider, canonicalModel, costBasis } = matches[0];
	return { provider, canonicalModel, costBasis };
}

/** The refresh only needs the forked prefix read; its own turn is uncached tail.
 *  Re-sending the source's last user turn cache-wrote it again (~13k unread tokens
 *  per refresh in native-cache-haiku-v2.live), so the turn is fixed and tiny. */
export const REFRESH_PROMPT = ".";

/** A model id alone never qualifies. Each exact SDK/runtime/accounting lane needs evidence. */
export function warmingQualificationKey(source: WarmingSource): string {
	return identity(["budget-max-tokens-tiny-prompt-v2", source.model.id, source.cliModel, source.evidence.sdkVersion,
		source.evidence.init.claude_code_version, source.evidence.usage.provider,
		source.evidence.usage.canonicalModel, source.evidence.usage.costBasis, source.evidence.account.lane]);
}

export type WarmingEvidence = {
	account: { eligible: boolean; fingerprint: string; lane: string };
	sdkVersion: string;
	servedModel?: string;
	init: { claude_code_version?: string; apiKeySource?: string; tools?: unknown[]; mcp_servers?: unknown[]; plugins?: unknown[] };
	usage: { provider?: string; canonicalModel?: string; costBasis?: string };
	/** Cached prefix only: cache read + cache creation, never uncached input_tokens. */
	sourceCachedTokens?: number;
};

export type WarmingSource = {
	owner: unknown;
	model: Model<any>;
	cliModel: string;
	reasoning?: string;
	retention: "short" | "long" | "none";
	sessionId: string;
	context: Context;
	requestOptions?: SimpleStreamOptions;
	controlsFingerprint?: string;
	processFingerprint?: string;
	systemPrompt: NonNullable<Parameters<typeof sdkQuery>[0]["options"]>["systemPrompt"];
	/** Actual ordinary SDK option; refresh must preserve it. */
	verbatimPrompts?: boolean;
	mcpTools: Tool[];
	settings: RuntimeSettings;
	cwd?: string;
	settingSources?: SettingSource[];
	flagSettings?: Record<string, unknown>;
	extraArgs?: Record<string, string | null>;
	pathToClaudeCodeExecutable?: string;
	env: NodeJS.ProcessEnv;
	evidence: WarmingEvidence;
	sourceTranscript?: { path: string; bytesBase64: string };
};

export type RefreshUsage = { input: number; output: number; cacheRead: number; cacheWrite: number };
export type RefreshResult = { kind: "success"; usage: RefreshUsage } | { kind: "failed"; reason: string };
type Refresh = (source: Readonly<WarmingSource>, signal: AbortSignal) => Promise<RefreshResult>;

export function isWarmingCandidate(options?: Pick<SimpleStreamOptions, "maxTokens" | "maxRetries">): boolean {
	return options?.maxTokens === 1 && options?.maxRetries === 0;
}

function hasEntries(value: unknown): boolean {
	if (Array.isArray(value)) return value.length > 0;
	if (value && typeof value === "object") return Object.keys(value).length > 0;
	return value !== undefined && value !== null && value !== false && value !== "";
}

/** Unknown controls are deliberately ineligible until their isolation is established. */
export function preflightRuntime(runtime: RuntimeSettings): { ok: true } | { ok: false; reason: string } {
	// Display/attribution settings do nothing in a tool-less headless refresh (statusLine
	// never runs headless), and the refresh passes an explicit model.
	// Known marketplaces only name plugin sources; with no plugins enabled nothing is
	// fetched (tests/int-warming-user-settings-offline.mjs).
	const supported = new Set(["autoMemoryEnabled", "disableAllHooks", "includeGitInstructions", "claudeMdExcludes", "promptCacheTtl",
		"theme", "tui", "statusLine", "model", "attribution", "extraKnownMarketplaces"]);
	// Settings-file env names the same contract test shows leave the tool-less,
	// thinking-disabled refresh wire and side effects unchanged. Exact names only.
	const inertSettingsEnv = new Set(["MAX_THINKING_TOKENS", "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE", "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS"]);
	// Permission rules are inert with no tools; modes and extra directories are not.
	const permissionRules = new Set(["allow", "deny", "ask"]);
	for (const source of runtime.sources ?? []) {
		// Public resolution skips policyHelper, and flags cannot override managed hooks.
		if (source.source === "managed" && hasEntries(source.settings)) return { ok: false, reason: "managed settings are not isolated" };
	}
	// Settings-file hooks and plugins are inert only when this query's own flags
	// switch them off: disableAllHooks, and every file plugin id explicitly false.
	// Managed sources were refused above; source isolation still checks init.plugins.
	const hooksOff = runtime.effective.disableAllHooks === true;
	const flagPlugins = runtime.effective.enabledPlugins;
	const pluginsOff = !!flagPlugins && typeof flagPlugins === "object" && !Array.isArray(flagPlugins)
		&& Object.values(flagPlugins).every(value => value === false)
		&& [runtime.resolvedEffective, ...runtime.sources.map(s => s.settings)].every(settings =>
			Object.keys((settings?.enabledPlugins ?? {}) as Record<string, unknown>).every(id => Object.hasOwn(flagPlugins, id)));
	const ttl = runtime.effective.promptCacheTtl;
	const generatedCacheEnv = ttl === "5m" || ttl === "1h"
		? providerCacheControls({}, ttl === "1h" ? "long" : "short").settings.env : undefined;
	for (const [index, settings] of [runtime.effective, runtime.resolvedEffective, ...runtime.sources.map(s => s.settings)].entries()) {
		for (const [key, value] of Object.entries(settings ?? {})) {
			// Only exact generated cache flags are safe. Never mask raw/source policy,
			// admit unrelated provider env, or exempt a cache-key prefix.
			if (index === 0 && key === "env" && generatedCacheEnv && value && typeof value === "object" && !Array.isArray(value)
				&& Object.keys(value).length === Object.keys(generatedCacheEnv).length
				&& Object.entries(value).every(([name, entry]) => Object.hasOwn(generatedCacheEnv, name) && entry === generatedCacheEnv[name])) continue;
			if ((key === "hooks" && hooksOff) || (key === "enabledPlugins" && pluginsOff)) continue;
			if (index > 0 && key === "env" && value && typeof value === "object" && !Array.isArray(value)
				&& Object.keys(value).every(name => inertSettingsEnv.has(name))) continue;
			if (key === "permissions" && value && typeof value === "object" && !Array.isArray(value)
				&& Object.keys(value).every(name => permissionRules.has(name))) continue;
			if (!supported.has(key) && hasEntries(value)) return { ok: false, reason: "unsupported runtime control" };
		}
	}
	if (runtime.effective.autoMemoryEnabled !== false) return { ok: false, reason: "auto-memory is not explicitly disabled" };
	return { ok: true };
}

export function warmingRuntime(resolved: RuntimeSettings, flags?: Record<string, unknown>): RuntimeSettings {
	return { effective: { ...resolved.effective, ...flags }, resolvedEffective: resolved.effective, sources: resolved.sources };
}

/** Only a digest is retained; never log environment values or account identifiers. */
export function warmingControlsFingerprint(bridgeControls: unknown, env: NodeJS.ProcessEnv = process.env): string {
	const normalizedEnv = { ...env };
	// The SDK adds its pinned version on first query; qualification checks it separately.
	if (normalizedEnv.CLAUDE_AGENT_SDK_VERSION === WARMING_SDK_VERSION) delete normalizedEnv.CLAUDE_AGENT_SDK_VERSION;
	return createHash("sha256").update(identity({ bridgeControls, env: normalizedEnv })).digest("hex");
}

function isolatedSource(source: Readonly<WarmingSource>): boolean {
	const init = source.evidence.init;
	if (source.pathToClaudeCodeExecutable || Object.keys(source.extraArgs ?? {}).some(key => key !== "model" && key !== "strict-mcp-config")) return false;
	if (source.extraArgs?.["strict-mcp-config"] !== null || source.env.ENABLE_CLAUDEAI_MCP_SERVERS !== "0") return false;
	if (Object.entries(source.env).some(([key, value]) => value && key !== "CLAUDE_CODE_PROMPT_CACHE_TTL" && !(key === "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC" && value === "1") && /^(ANTHROPIC_|AWS_|BEDROCK_|GOOGLE_|VERTEX_|AZURE_|FOUNDRY_|MANTLE_|CLAUDE_CODE_|NODE_OPTIONS|NODE_EXTRA_CA_CERTS|HTTPS?_PROXY|ALL_PROXY)/i.test(key))) return false;
	if (!Array.isArray(init.plugins) || init.plugins.length !== 0 || !Array.isArray(init.mcp_servers) || !Array.isArray(init.tools)) return false;
	const servers = source.mcpTools.length ? [{ name: MCP_SERVER_NAME, status: "connected", source: "sdk" }] : [];
	const tools = source.mcpTools.map(t => `mcp__${MCP_SERVER_NAME}__${t.name}`).sort();
	return identity(init.mcp_servers) === identity(servers) && identity([...init.tools].sort()) === identity(tools);
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
	if (!value || typeof value !== "object" || seen.has(value as object)) return value;
	seen.add(value as object);
	for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
	return Object.freeze(value);
}

export function captureWarmingRequest(context: Context, options?: SimpleStreamOptions, model?: Model<any>): { context: Context; options: SimpleStreamOptions; model?: Model<any> } | undefined {
	try {
		const { maxTokens, maxRetries, signal, onPayload, onResponse, ...identityOptions } = options ?? {};
		return deepFreeze(structuredClone({ context, options: identityOptions, ...(model ? { model } : {}) }));
	} catch { return undefined; }
}

function identity(value: unknown): string {
	return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
		? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}

function sameIdentity(a: unknown, b: unknown): boolean {
	try { return identity(a) === identity(b); } catch { return false; }
}

function subscriptionEvidence(evidence: WarmingEvidence, cliModel: string): boolean {
	// SDK ModelUsage documents firstParty as the backend. An undocumented/absent
	// value (including "anthropic") stays ineligible, not silently aliased.
	return Boolean(evidence.account.eligible && evidence.account.fingerprint
		&& evidence.sdkVersion !== "unknown" && evidence.sdkVersion === WARMING_SDK_VERSION
		&& evidence.init.apiKeySource === "none" && evidence.init.claude_code_version
		&& evidence.usage.provider === "firstParty" && evidence.usage.costBasis === "list"
		&& servesAs(evidence.servedModel, cliModel === "claude-opus-5-5[1m]" ? "claude-opus-5-5" : cliModel)
		&& servesAs(evidence.servedModel, evidence.usage.canonicalModel)
		&& Number.isFinite(evidence.sourceCachedTokens) && (evidence.sourceCachedTokens ?? 0) > 0);
}

export class CacheWarmingCoordinator {
	private generation = 0;
	private owner: unknown;
	private current?: Readonly<WarmingSource> & { generation: number; runtimeIdentity: string; sourceQueryCount: number };
	private sourceSequence?: { owner: unknown; key: string; count: number; generation: number };
	private sourcePending = false;
	private consent?: number;
	private failedGeneration?: number;
	private refreshController?: AbortController;
	private readonly qualified: ReadonlySet<string>;
	private readonly refresh?: Refresh;

	constructor(options: { qualified: ReadonlySet<string>; refresh?: Refresh }) {
		this.qualified = options.qualified;
		this.refresh = options.refresh;
	}

	begin(owner: unknown): number {
		if (this.sourcePending) this.sourceSequence = undefined;
		this.invalidate("new work", true);
		this.sourcePending = true;
		this.owner = owner;
		return this.generation;
	}

	complete(generation: number, source: WarmingSource, resetSourceSequence = false): void {
		if (generation !== this.generation || source.owner !== this.owner) return;
		this.sourcePending = false;
		if (source.retention === "none" || source.reasoning) { this.sourceSequence = undefined; return; }
		if (resetSourceSequence) this.sourceSequence = undefined;
		try {
			const { owner, ...data } = source;
			const copy = deepFreeze(structuredClone(data));
			// Count completed SDK queries, not Pi tool-result callbacks or refreshes.
			// A changed SDK/Pi session, controls, definitions or evidence starts over.
			const key = warmingControlsFingerprint({ sessionId: copy.sessionId, model: copy.model, cliModel: copy.cliModel,
				requestOptions: copy.requestOptions, retention: copy.retention, cwd: copy.cwd,
				controls: copy.controlsFingerprint, process: copy.processFingerprint,
				systemPrompt: copy.systemPrompt, tools: copy.mcpTools, verbatimPrompts: copy.verbatimPrompts,
				settings: copy.settings, evidence: { ...copy.evidence, sourceCachedTokens: undefined } }, {});
			const previous = this.sourceSequence;
			const count = previous?.owner === owner && previous.key === key
				? previous.count + (previous.generation === generation ? 0 : 1) : 1;
			this.sourceSequence = { owner, key, count, generation };
			this.current = Object.freeze({ ...copy, owner, generation, sourceQueryCount: count,
				runtimeIdentity: identity(copy.settings) });
		} catch { this.current = undefined; this.sourceSequence = undefined; } // Maintenance must never fail ordinary chat.
	}

	snapshot(): (Readonly<WarmingSource> & { sourceQueryCount: number }) | undefined { return this.current; }

	decide(candidate: {
		owner: unknown; piSessionId?: string; model: Model<any>; idle: boolean; reasoning?: string;
		retention: "short" | "long" | "none"; runtime: RuntimeSettings; controlsFingerprint?: string;
	}): "warm" | "stop" {
		const source = this.current;
		this.consent = undefined;
		if (!source || this.failedGeneration === source.generation || !candidate.idle) return "stop";
		if (!candidate.piSessionId || candidate.piSessionId !== source.requestOptions?.sessionId) return "stop";
		if (candidate.owner !== source.owner || !sameIdentity(candidate.model, source.model)) return "stop";
		if (candidate.reasoning || source.reasoning || candidate.retention === "none" || candidate.retention !== source.retention) return "stop";
		if (!this.qualified.has(warmingQualificationKey(source)) || !subscriptionEvidence(source.evidence, source.cliModel)) return "stop";
		if ((source.model.id === "claude-sonnet-5-5" || source.model.id === "claude-opus-5-5")
			&& (source.sourceQueryCount < 2 || source.verbatimPrompts !== true || source.retention !== "short"
				|| source.evidence.servedModel !== source.model.id)) return "stop";
		if (candidate.controlsFingerprint !== source.controlsFingerprint || !isolatedSource(source)) return "stop";
		if (!preflightRuntime(candidate.runtime).ok || !preflightRuntime(source.settings).ok || identity(candidate.runtime) !== source.runtimeIdentity) return "stop";
		this.consent = source.generation;
		return "warm";
	}

	async intercept(model: Model<any>, context: Context, options?: SimpleStreamOptions, owner?: unknown, validateControls?: () => boolean): Promise<({ ok: true; usage: RefreshUsage } | { ok: false; reason: string })> {
		const source = this.current;
		if (!isWarmingCandidate(options)) return { ok: false, reason: "not a warming candidate" };
		if (!source || this.consent !== source.generation) return { ok: false, reason: "native warming consent missing" };
		this.consent = undefined; // one decision authorizes one dispatch only
		if (owner !== source.owner || !sameIdentity(model, source.model) || !sameIdentity(context, source.context)
			|| !sameIdentity(captureWarmingRequest(context, options)?.options, source.requestOptions ?? {})) {
			this.failedGeneration = source.generation;
			return { ok: false, reason: "warming request does not match snapshot" };
		}
		const controller = new AbortController();
		const onAbort = () => controller.abort();
		if (options?.signal?.aborted) onAbort();
		else options?.signal?.addEventListener("abort", onAbort, { once: true });
		this.refreshController = controller;
		try {
			if (controller.signal.aborted) {
				this.failedGeneration = source.generation;
				return { ok: false, reason: "refresh aborted" };
			}
			if (validateControls && !validateControls()) {
				this.failedGeneration = source.generation;
				return { ok: false, reason: "refresh controls changed" };
			}
			const result = await (this.refresh ? this.refresh(source, controller.signal)
				: runIsolatedRefresh(source, controller.signal, { validateControls }));
			if (result.kind === "success" && this.current?.generation === source.generation && !controller.signal.aborted) {
				return { ok: true, usage: result.usage };
			}
			if (this.current?.generation === source.generation) this.failedGeneration = source.generation;
			return { ok: false, reason: result.kind === "failed" ? result.reason : "refresh invalidated" };
		} catch {
			if (this.current?.generation === source.generation) this.failedGeneration = source.generation;
			return { ok: false, reason: "refresh execution failed" };
		} finally {
			options?.signal?.removeEventListener("abort", onAbort);
			if (this.refreshController === controller) this.refreshController = undefined;
		}
	}

	invalidate(_reason: string, preserveSourceSequence = false): void {
		if (!preserveSourceSequence) { this.sourceSequence = undefined; this.sourcePending = false; }
		// Advance even without a current snapshot: an ordinary source query may still
		// complete later, and must not republish state from before this boundary.
		this.generation++;
		this.refreshController?.abort();
		this.refreshController = undefined;
		this.current = undefined;
		this.consent = undefined;
		this.failedGeneration = undefined;
	}
}

/** Same dispatch used by the extension; unrelated providers must not be overridden. */
export async function nativeWarmingDecision(
	coordinator: CacheWarmingCoordinator,
	ctx: { model?: Model<any>; thinkingLevel: string; isIdle(): boolean; sessionManager: { getSessionId(): string } },
	owner: unknown,
	current: (source: Readonly<WarmingSource>) => Promise<{ runtime: RuntimeSettings; controlsFingerprint: string }>,
): Promise<{ action: "warm" | "stop" } | undefined> {
	if (ctx.model?.baseUrl !== "claude-bridge") return undefined;
	const source = coordinator.snapshot();
	if (!source) return { action: "stop" };
	if (source.owner !== owner) return undefined;
	if (source.requestOptions?.sessionId !== ctx.sessionManager.getSessionId()) return { action: "stop" };
	try {
		const state = await current(source);
		if (coordinator.snapshot() !== source) return { action: "stop" };
		return { action: coordinator.decide({ owner, piSessionId: ctx.sessionManager.getSessionId(), model: ctx.model,
			idle: ctx.isIdle(), reasoning: ctx.thinkingLevel === "off" ? undefined : ctx.thinkingLevel,
			retention: resolvePiCacheRetention(source.requestOptions), ...state }) };
	} catch { return { action: "stop" }; }
}

type QueryLike = AsyncIterable<SDKMessage> & { close(): void; accountInfo(): Promise<AccountInfo> };

/** Public-SDK-only isolated refresh, after coordinator qualification. The budget is
 * a post-response guard, NOT a hard spend cap or proof of no hidden SDK requests. */
export async function runIsolatedRefresh(
	source: Readonly<WarmingSource>,
	signal: AbortSignal,
	adapter: {
		query?: (params: Parameters<typeof sdkQuery>[0]) => QueryLike;
		resolveSettings?: typeof sdkResolveSettings;
		validateControls?: () => boolean;
	} = {},
): Promise<RefreshResult> {
	const failed = (reason: string): RefreshResult => ({ kind: "failed", reason });
	const transcript = source.sourceTranscript;
	const sourceUnchanged = () => {
		try { return Boolean(transcript && readFileSync(transcript.path).toString("base64") === transcript.bytesBase64); }
		catch { return false; }
	};
	if (!sourceUnchanged()) return failed("source transcript unavailable or changed before refresh");
	const controller = new AbortController();
	const abort = () => controller.abort();
	let q: QueryLike | undefined;
	const prompt = makePromptStream();
	let cancelLookup: (() => void) | undefined;
	let toolServer: ReturnType<typeof createToolServer> | undefined;
	let filesBefore: string[] | undefined;
	const transcriptFiles = () => readdirSync(dirname(transcript!.path)).filter(name => name.endsWith(".jsonl")).sort();
	const controlsUnchanged = () => source.processFingerprint === warmingControlsFingerprint(undefined)
		&& (adapter.validateControls?.() ?? true);
	let result: RefreshResult;
	if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
	try {
		result = await (async (): Promise<RefreshResult> => {
			if (controller.signal.aborted) return failed("refresh aborted");
			if (!isolatedSource(source) || !subscriptionEvidence(source.evidence, source.cliModel) || !preflightRuntime(source.settings).ok) return failed("source isolation is unverified");
			if (!controlsUnchanged()) return failed("refresh controls changed");
			const current = await (adapter.resolveSettings ?? sdkResolveSettings)({ cwd: source.cwd, settingSources: source.settingSources });
			if (controller.signal.aborted) return failed("refresh aborted");
			const runtime = warmingRuntime(current as RuntimeSettings, source.flagSettings);
			if (!preflightRuntime(runtime).ok || identity(runtime) !== identity(source.settings)) return failed("effective settings changed");
			if (!controlsUnchanged() || !sourceUnchanged()) return failed("refresh source or controls changed");
			filesBefore = transcriptFiles();
			if (source.mcpTools.length) toolServer = createToolServer(MCP_SERVER_NAME, source.mcpTools.map(tool => ({
				name: tool.name, description: tool.description, inputSchema: tool.parameters,
				handler: async () => { controller.abort(); throw new Error("cache refresh cannot execute tools"); },
			})));
			const options: NonNullable<Parameters<typeof sdkQuery>[0]["options"]> = {
				cwd: source.cwd ?? process.cwd(), resume: source.sessionId, forkSession: true, persistSession: false,
				model: source.cliModel, extraArgs: source.extraArgs, tools: [], strictMcpConfig: true,
				permissionMode: "bypassPermissions", allowDangerouslySkipPermissions: true,
				includePartialMessages: true, maxTurns: 1, maxBudgetUsd: 0.000001,
				abortController: controller, thinking: { type: "disabled" },
				systemPrompt: source.systemPrompt,
				...(source.verbatimPrompts === true ? { verbatimPrompts: true } : {}),
				settings: { ...source.flagSettings, disableAllHooks: true, autoMemoryEnabled: false }, hooks: {},
				settingSources: source.settingSources,
				env: { ...source.env, CLAUDE_CODE_MAX_OUTPUT_TOKENS: "1", CLAUDE_CODE_MAX_RETRIES: "0" },
				...(toolServer ? { mcpServers: { [MCP_SERVER_NAME]: toolServer } } : {}),
			};
			if (controller.signal.aborted) return failed("refresh aborted");
			// An eager SDK may pump input immediately. Initialize with no user turn:
			// accountInfo is the public initialization boundary, not system:init
			// (which may require a user message before it is emitted).
			q = (adapter.query ?? sdkQuery)({ prompt: prompt.stream, options });
			if (controller.signal.aborted) return failed("refresh aborted");
			const cancelled = new Promise<undefined>(resolve => {
				cancelLookup = () => resolve(undefined);
				controller.signal.addEventListener("abort", cancelLookup, { once: true });
			});
			const account = await Promise.race([q.accountInfo(), cancelled]);
			if (controller.signal.aborted) return failed("refresh aborted");
			if (!account || identity(accountEvidence(account)) !== identity(source.evidence.account)) return failed("refresh account changed");
			// Initialization/account lookup may outlive the pre-start settings check.
			// Revalidate before releasing input, without letting a stalled resolver
			// hold cancellation or query/prompt cleanup hostage.
			const latest = await Promise.race([
				(adapter.resolveSettings ?? sdkResolveSettings)({ cwd: source.cwd, settingSources: source.settingSources }), cancelled,
			]);
			if (controller.signal.aborted) return failed("refresh aborted");
			if (!latest) return failed("effective settings unavailable");
			const latestRuntime = warmingRuntime(latest as RuntimeSettings, source.flagSettings);
			if (!preflightRuntime(latestRuntime).ok || identity(latestRuntime) !== identity(source.settings)) return failed("effective settings changed");
			if (!controlsUnchanged() || !sourceUnchanged()) return failed("refresh source or controls changed");
			// Keep stdin open for the query lifetime. Cleanup settles the write ack
			// even if the SDK abandons its input pump on an error or cancellation.
			void prompt.push(userMessage(REFRESH_PROMPT)).catch(() => {});
			let usage: RefreshUsage | undefined;
			let requests = 0, assistants = 0;
			let initialized = false, stopReason: string | null | undefined;
			for await (const message of q) {
				if (controller.signal.aborted) return failed("refresh aborted");
				if (message.type === "system" && message.subtype === "init") {
					if (initialized || message.session_id === source.sessionId || !message.session_id
						|| message.claude_code_version !== source.evidence.init.claude_code_version
						|| message.apiKeySource !== source.evidence.init.apiKeySource
						|| !isolatedSource({ ...source, evidence: { ...source.evidence, init: message } })) return failed("refresh runtime changed");
					initialized = true;
				} else if (message.type === "stream_event") {
					const event = message.event;
					if (event.type === "message_start") {
						if (++requests !== 1) return failed("refresh observed another model request");
						if (!initialized || event.message.model !== source.evidence.servedModel) return failed("refresh served model changed");
						const u = event.message.usage;
						if (!u || ![u.input_tokens, u.output_tokens, u.cache_read_input_tokens, u.cache_creation_input_tokens].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0)) return failed("refresh usage missing");
						usage = { input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens!, cacheWrite: u.cache_creation_input_tokens! };
					} else if (event.type === "message_delta") {
						if (!usage) return failed("refresh usage missing");
						usage.output = event.usage.output_tokens;
						if (event.usage.input_tokens != null) usage.input = event.usage.input_tokens;
						if (event.usage.cache_read_input_tokens != null) usage.cacheRead = event.usage.cache_read_input_tokens;
						if (event.usage.cache_creation_input_tokens != null) usage.cacheWrite = event.usage.cache_creation_input_tokens;
						stopReason = event.delta.stop_reason;
					} else if (event.type === "content_block_start" && event.content_block.type === "tool_use") return failed("refresh attempted a tool");
				} else if (message.type === "assistant") {
					if (++assistants !== 1 || message.message.model !== source.evidence.servedModel
						|| message.message.content.some(block => block.type !== "text")) return failed("unexpected refresh assistant");
					// SDK may publish an unfinished assistant before the authoritative message_delta.
					if (message.message.stop_reason != null && message.message.stop_reason !== "max_tokens") return failed("unqualified refresh stop reason");
				} else if (message.type === "result") {
					const accounting = selectModelUsage(message.modelUsage, source.evidence.servedModel, source.cliModel);
					if (message.subtype !== "error_max_budget_usd" || stopReason !== "max_tokens" || requests !== 1 || assistants !== 1
						|| usage?.output !== 1 || identity(accounting) !== identity(source.evidence.usage)) return failed("unqualified refresh result");
					// No guessed tolerance: uncached input is NOT part of this baseline.
					if (usage.cacheRead < source.evidence.sourceCachedTokens!) return failed("refresh prefix cache miss");
					return { kind: "success", usage };
				}
			}
			return failed("refresh ended without a validated result");
		})();
	} catch { result = failed(controller.signal.aborted ? "refresh aborted" : "refresh execution failed"); }
	finally {
		signal.removeEventListener("abort", abort);
		if (cancelLookup) controller.signal.removeEventListener("abort", cancelLookup);
		prompt.fail(new Error("cache refresh ended"));
		controller.abort();
		try { q?.close(); } catch { /* Still verify source below. */ }
		try { await prompt.stream.return(undefined); } catch { /* Input failure is already settled. */ }
		try { await toolServer?.instance.close(); } catch { /* No executable handlers. */ }
	}
	// Check on *every* exit, after cleanup, including constructor errors/cancellation.
	if (!sourceUnchanged()) return failed("refresh mutated source transcript");
	try {
		if (filesBefore && identity(transcriptFiles()) !== identity(filesBefore)) return failed("refresh persisted a transcript");
	} catch { return failed("source transcript directory unavailable"); }
	return result;
}

// Exact live-proven lanes, explicitly approved for native integration.
// Haiku: native-cache-3m-v3 + expiry comparisons. 5.5: five-expiry-v2,
// two comparisons/model with verbatim prompts after two completed source queries.
// 5.5 first-turn, one-hour and adjacent lanes remain gated (see decide()).
export const PRODUCTION_QUALIFIED_WARMING_MODELS: ReadonlySet<string> = new Set([
	identity(["budget-max-tokens-tiny-prompt-v2", "claude-haiku-4-5", "claude-haiku-4-5", "0.3.285", "2.1.285",
		"firstParty", "claude-haiku-4-5", "list", identity(["firstParty", "Claude Team", null, null])]),
	identity(["budget-max-tokens-tiny-prompt-v2", "claude-sonnet-5-5", "claude-sonnet-5-5", "0.3.285", "2.1.285",
		"firstParty", "claude-sonnet-5-5", "list", identity(["firstParty", "Claude Team", null, null])]),
	identity(["budget-max-tokens-tiny-prompt-v2", "claude-opus-5-5", "claude-opus-5-5[1m]", "0.3.285", "2.1.285",
		"firstParty", "claude-opus-5-5", "list", identity(["firstParty", "Claude Team", null, null])]),
]);
