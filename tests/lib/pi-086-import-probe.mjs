// Runs only in the isolated Pi 0.86.1 fixture; never imports repository node_modules.
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import childProcess from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import { mock } from "node:test";

const forbidden = () => { throw new Error("Pi 0.86.1 fixture forbids network and subprocess transport"); };
net.Socket.prototype.connect = forbidden;
tls.connect = forbidden;
http.request = http.get = https.request = https.get = forbidden;
globalThis.fetch = forbidden;
for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) {
	childProcess[name] = forbidden;
}
syncBuiltinESMExports();

const [mode, entry] = process.argv.slice(2);
const sanitize = (text) => String(text).split(process.cwd()).join("<fixture>");
const passed = [];
const piCore = () => join(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))), "core");
const internal = (path) => import(pathToFileURL(join(piCore(), path)).href);

async function register(factory) {
	const { loadExtensions, loadExtensionFromFactory, createExtensionRuntime } = await internal("extensions/loader.js");
	const { createEventBus } = await internal("event-bus.js");
	const { AuthStorage } = await internal("auth-storage.js");
	const { ModelRuntime, ModelRegistry } = await import("@earendil-works/pi-coding-agent");
	const runtime = createExtensionRuntime();
	let extension;
	if (factory) {
		extension = await loadExtensionFromFactory(factory, process.cwd(), createEventBus(), runtime, entry);
	} else {
		const loaded = await loadExtensions([entry], process.cwd(), createEventBus(), runtime);
		assert.deepEqual(loaded.errors, []);
		assert.equal(loaded.extensions.length, 1);
		extension = loaded.extensions[0];
	}
	assert.equal(runtime.pendingProviderRegistrations.length, 1);
	const modelRuntime = await ModelRuntime.create({ credentials: AuthStorage.inMemory(), modelsPath: null, allowModelNetwork: false, refreshOnCreate: false });
	const registry = new ModelRegistry(modelRuntime);
	for (const { name, config } of runtime.pendingProviderRegistrations) registry.registerProvider(name, config);
	assert.equal(registry.getError(), undefined);
	const model = registry.find("claude-bridge", "claude-haiku-4-5");
	assert.ok(model, "Pi's actual registry must resolve the bridge model");
	assert.equal(model.baseUrl, "claude-bridge");
	const emit = async (name, event, ctx = {}) => {
		const results = [];
		for (const handler of extension.handlers.get(name) ?? []) results.push(await handler(event, ctx));
		return results;
	};
	return { registry, model, emit };
}

async function contracts() {
	const sdk = await import("@anthropic-ai/claude-agent-sdk");
	const queries = [];
	const usage = { input_tokens: 10, output_tokens: 3, cache_read_input_tokens: 20, cache_creation_input_tokens: 4 };
	mock.module("@anthropic-ai/claude-agent-sdk", { namedExports: { ...sdk,
		resolveSettings: async () => ({ settings: {}, sources: [] }),
		query(params) {
			const record = { ...params };
			queries.push(record);
			return {
				accountInfo: async () => ({ apiKeySource: "api", tokenSource: "none" }),
				close() {}, interrupt: async () => {},
				async *[Symbol.asyncIterator]() {
					if (typeof params.prompt !== "string") record.firstPrompt = (await params.prompt[Symbol.asyncIterator]().next()).value;
					yield { type: "stream_event", event: { type: "message_start", message: { id: "msg_synthetic", model: "claude-haiku-4-5", usage } } };
					yield { type: "stream_event", event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } };
					yield { type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Synthetic reply" } } };
					yield { type: "stream_event", event: { type: "content_block_stop", index: 0 } };
					yield { type: "stream_event", event: { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } } };
					yield { type: "stream_event", event: { type: "message_stop" } };
					yield { type: "result", subtype: "success", is_error: false, result: "Synthetic reply", usage };
				},
			};
		},
	} });
	const bridge = await import(pathToFileURL(entry).href);
	const { registry, model, emit } = await register(bridge.default);
	passed.push("actual Pi factory API, provider composition and model lookup");
	const ai = await import("@earendil-works/pi-ai");
	const tool = { name: "read", description: "Read a synthetic file", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } };
	const user = { role: "user", content: "synthetic user turn", timestamp: 1 };
	const prompt = "Synthetic portable instructions";
	await emit("before_agent_start", { systemPrompt: prompt, systemPromptOptions: { customPrompt: prompt } });
	const context = ai.normalizeContext({ systemPrompt: prompt, tools: [tool], messages: [user] });
	assert.equal(context.messages[0].role, "system");
	const translated = bridge.__test.toBridgeContext(context);
	assert.equal(translated.systemPrompt, prompt);
	assert.deepEqual(translated.messages, [user]);
	assert.deepEqual(translated.tools, [tool]);
	passed.push("actual pi-ai normalizeContext transcript restores prompt, tools and conversation");

	async function ordinary(retention) {
		const before = queries.length;
		const stream = registry.streamSimple(model, context, { cacheRetention: retention });
		const events = [];
		for await (const event of stream) events.push(event.type);
		const result = await stream.result();
		assert.equal(result.stopReason, "stop", result.errorMessage);
		assert.equal(ai.contentText(result.content), "Synthetic reply");
		assert.deepEqual(events, ["start", "text_start", "text_delta", "text_end", "done"]);
		assert.equal(result.usage.input, 10);
		assert.equal(result.usage.output, 3);
		assert.equal(result.usage.cacheRead, 20);
		assert.equal(result.usage.cacheWrite, 4);
		assert.equal(result.usage.totalTokens, 37);
		assert.equal(queries.length, before + 1);
		const query = queries.at(-1);
		assert.equal(typeof query.prompt, "object", "ordinary request uses the managed prompt stream, not an isolated summary");
		assert.equal(query.options.systemPrompt.preset, "claude_code");
		assert.match(query.options.systemPrompt.append, /Synthetic portable instructions/);
		assert.deepEqual(query.options.tools, []);
		assert.ok(query.options.mcpServers?.["custom-tools"], "transcript tool definitions reach the SDK MCP server");
		assert.equal(query.firstPrompt.message.content[0].text, user.content);
		if (retention === "none") assert.equal(query.options.env.DISABLE_PROMPT_CACHING, "1");
		passed.push(`ordinary ${retention} via real ModelRegistry: event lifecycle, usage, prompt and tools`);
	}
	await ordinary("short");
	// Baseline shares the ordinary/summary ABI checks. The new `none` routing contract
	// is checked only on the working source; HEAD intentionally predates that fix.
	if (mode === "contracts-working") await ordinary("none");

	const { generateBugReportSummary } = await internal("bug-report.js");
	const summaries = [];
	const summaryStream = (m, c, o) => {
		assert.equal(c.messages[0].role, "system");
		assert.equal(o.cacheRetention, "none");
		summaries.push(c);
		return registry.streamSimple(m, c, o);
	};
	assert.equal(await generateBugReportSummary({ model, messages: [user], streamFn: summaryStream }), "Synthetic reply");
	assert.equal(summaries.length, 1);
	passed.push("actual Pi /bug summarizer through registered stream: transcript and uncached isolated routing");

	const ctx = { model, ui: { notify(message) { throw new Error(message); } } };
	const { compact, generateBranchSummary } = await import("@earendil-works/pi-coding-agent");
	const entries = [{ type: "message", id: "synthetic-user", parentId: null, timestamp: new Date(0).toISOString(), message: user }];
	const branchClaims = await emit("session_before_tree", { preparation: { entriesToSummarize: entries, userWantsSummary: true, targetId: "synthetic-target" } }, ctx);
	assert.ok(branchClaims.every(r => r === undefined), "bridge must not take over branch summaries");
	const branch = await generateBranchSummary(entries, { model, signal: new AbortController().signal, streamFn: summaryStream });
	assert.equal(branch.summary, "The user explored a different conversation branch before returning here.\nSummary of that exploration:\n\nSynthetic reply");
	passed.push("native Pi generateBranchSummary routes through the bridge's isolated path");
	const { prepareCompaction } = await internal("compaction/compaction.js");
	const compactEntries = [...entries, { ...entries[0], id: "synthetic-kept", parentId: entries[0].id, message: { ...user, content: "Keep this synthetic recent turn" } }];
	const preparation = prepareCompaction(compactEntries, { enabled: true, reserveTokens: 4096, keepRecentTokens: 1 });
	assert.ok(preparation?.messagesToSummarize.length > 0, "actual Pi compaction preparation selects synthetic history");
	const compactClaims = await emit("session_before_compact", { reason: "manual", willRetry: false, branchEntries: compactEntries, preparation }, ctx);
	assert.ok(compactClaims.every(r => r === undefined), "bridge must not take over compaction");
	const compaction = await compact(preparation, model, undefined, undefined, undefined, undefined, undefined, summaryStream);
	assert.match(compaction.summary, /Synthetic reply/);
	passed.push("native Pi compact routes through the bridge's isolated path");
	for (const query of queries.slice(mode === "contracts-working" ? 2 : 1)) {
		assert.equal(typeof query.prompt, "string");
		assert.equal(typeof query.options.systemPrompt, "string");
		// HEAD predates cache ownership: preserve that measured control difference,
		// rather than asking the baseline to satisfy the patch's new policy contract.
		assert.equal(query.options.env.DISABLE_PROMPT_CACHING, mode === "contracts-working" ? "1" : undefined);
		assert.deepEqual(query.options.tools, []);
		assert.deepEqual(query.options.settingSources, []);
		assert.equal(query.options.persistSession, false);
		assert.equal(query.options.resume, undefined);
	}
	passed.push(`all three summaries: no resume, no tools, no persistence; cache-disable env ${mode === "contracts-working" ? "enforced" : "absent in HEAD control"}`);
	await emit("session_shutdown", {});
	return { ok: true, passed, fakeSdkQueries: queries.length };
}

try {
	if (mode === "packages") {
		const ai = await import("@earendil-works/pi-ai");
		const compat = await import("@earendil-works/pi-ai/compat");
		const pi = await import("@earendil-works/pi-coding-agent");
		const tui = await import("@earendil-works/pi-tui");
		console.log(JSON.stringify({
			ok: true,
			ai: Object.fromEntries(["calculateCost", "createAssistantMessageEventStream", "contentText", "getCurrentSystemMessage", "getCurrentTools"].map((key) => [key, typeof ai[key]])),
			compatGetModels: typeof compat.getModels,
			pi: Object.fromEntries(["buildSessionContext", "compact", "generateBranchSummary", "keyHint", "loadExtensions"].map((key) => [key, typeof pi[key]])),
			tuiText: typeof tui.Text,
		}));
	} else if (mode === "registration") {
		const { model } = await register();
		console.log(JSON.stringify({ ok: true, model: model.id, loader: "actual Pi loadExtensions (jiti)" }));
	} else if (mode.startsWith("contracts-")) {
		console.log(JSON.stringify(await contracts()));
	} else {
		const module = await import(pathToFileURL(entry).href);
		console.log(JSON.stringify({ ok: true, activation: typeof module.default }));
	}
} catch (error) {
	console.log(JSON.stringify({ ok: false, passed, name: error.name, code: error.code, message: sanitize(error.message), stack: sanitize(error.stack) }));
	process.exitCode = 1;
}
