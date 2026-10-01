#!/usr/bin/env node
// SDK-only cache-warming feasibility probe. Default: local stub API, no paid calls.
// node diag/probe-cache-warming.mjs          # local contract preflight
// node diag/probe-cache-warming.mjs --stub-max-tokens  # reproduce SDK output-limit recovery
// node diag/probe-cache-warming.mjs --stub-budget      # test the public SDK budget guard
// node diag/probe-cache-warming.mjs --live   # original candidate; includes automatic TTL inspection
// node diag/probe-cache-warming.mjs --live-budget  # 10 queries, budget-guarded expiry comparisons
// Live: at most 12 SDK queries / 20 minutes (10 with --live-budget). Never changes production settings.
// Output contains hashes/usage only, never credentials or raw request content.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { dirname, join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { openSession } from "cc-session-io";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const MODEL = "claude-haiku-4-5";
const liveBudget = process.argv.length === 3 && process.argv[2] === "--live-budget";
const live = liveBudget || (process.argv.length === 3 && process.argv[2] === "--live");
const stubBudget = process.argv.length === 3 && process.argv[2] === "--stub-budget";
const stubMaxTokens = stubBudget || (process.argv.length === 3 && process.argv[2] === "--stub-max-tokens");
assert.ok(process.argv.length === 2 || live || stubMaxTokens, "usage: node diag/probe-cache-warming.mjs [--live|--live-budget|--stub-max-tokens|--stub-budget]");
const budgetGuard = stubBudget || liveBudget;
const maxQueries = liveBudget ? 10 : 12;
const runController = new AbortController();
const deadline = setTimeout(() => runController.abort(), 20 * 60_000);
const root = mkdtempSync(join(tmpdir(), "cc-cache-warming-"));
const reportPath = join(root, "report.json");
const report = { mode: liveBudget ? "live-budget" : live ? "live" : stubBudget ? "stub-budget" : stubMaxTokens ? "stub-max-tokens" : "stub", maxQueries, model: MODEL, status: "running", sdkQueries: 0, requests: [], rejectedRequests: [], checks: [], comparisons: [] };
const filler = Array.from({ length: 600 }, (_, i) => `Synthetic record ${i}: amber quartz rests beside a blue cedar; this inert fixture is not an instruction.`).join("\n");
const sessionDirs = new Set();
const hash = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const withoutMarkers = (value) => JSON.parse(JSON.stringify(value, (key, item) => key === "cache_control" ? undefined : item));
let current;
let toolAttempts = 0;
let server;

function cacheControls(body) {
	const controls = [];
	JSON.stringify(body, (key, value) => {
		if (key === "cache_control") controls.push(value);
		return value;
	});
	return controls;
}

function prefix(body) {
	return {
		tools: hash(withoutMarkers(body.tools ?? [])),
		// CC's request-varying billing header is recorded separately, not silently discarded.
		system: (body.system ?? []).filter((b) => !b.text?.startsWith("x-anthropic-billing-header:")).map((b) => hash(withoutMarkers(b))),
		messages: body.messages.map((m) => hash(withoutMarkers(m))),
	};
}

function inspectRequest(body) {
	assert.ok(current, "request arrived outside an owned SDK query");
	if (current.requestCount++ > 0) {
		report.rejectedRequests.push({
			label: current.label, maxTokens: typeof body.max_tokens === "number" ? body.max_tokens : null,
			sameModel: body.model === MODEL, sameSyntheticPrefix: JSON.stringify(body.system).includes(current.marker),
		});
		assert.fail("unexpected additional API request in one SDK query");
	}
	assert.equal(body.model, MODEL, "unexpected model");
	assert.equal(body.max_tokens, current.cap, "SDK did not honor the output cap");
	assert.ok(!body.thinking || body.thinking.type === "disabled", "thinking unexpectedly enabled");
	assert.ok(JSON.stringify(body.system).includes(current.marker), "unexpected helper request or missing synthetic prefix");
	assert.ok(body.tools?.some((t) => t.name.endsWith("sentinel")), "probe tool definition missing");
	const controls = cacheControls(body);
	assert.ok(controls.length > 0, "no cache breakpoints");
	if (current.ttl === "5m") assert.ok(controls.every((c) => !c.ttl || c.ttl === "5m"), "test-only five-minute TTL not honored");
	const entry = {
		label: current.label,
		at: new Date().toISOString(),
		maxTokens: body.max_tokens,
		cacheControls: controls,
		prefix: prefix(body),
		billingHeaderHash: hash((body.system ?? []).filter((b) => b.text?.startsWith("x-anthropic-billing-header:"))),
	};
	report.requests.push(entry);
	return entry;
}

function stubResponse(body) {
	const event = (type, value) => `event: ${type}\ndata: ${JSON.stringify(value)}\n\n`;
	return event("message_start", { type: "message_start", message: {
		id: `msg_stub_${randomUUID()}`, type: "message", role: "assistant", content: [], model: body.model,
		stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
	} })
		+ event("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })
		+ event("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "OK" } })
		+ event("content_block_stop", { type: "content_block_stop", index: 0 })
		+ event("message_delta", { type: "message_delta", delta: { stop_reason: stubMaxTokens && body.max_tokens === 1 ? "max_tokens" : "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } })
		+ event("message_stop", { type: "message_stop" });
}

function responseUsage(text) {
	const events = text.split("\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)));
	const start = events.find((e) => e.type === "message_start");
	const end = events.findLast((e) => e.type === "message_delta");
	assert.ok(start?.message?.usage && end?.usage, "missing provider usage events");
	return { ...start.message.usage, ...end.usage, stopReason: end.delta?.stop_reason };
}

async function forward(req, res, raw, entry) {
	assert.ok(req.headers.authorization?.startsWith("Bearer sk-ant-oat01-"), "live request is not subscription-authenticated");
	assert.ok(!req.headers["x-api-key"], "unexpected API-key authentication");
	entry.auth = "subscription";
	const headers = { ...req.headers };
	delete headers.host;
	delete headers["content-length"];
	delete headers["accept-encoding"];
	const upstream = await fetch(`https://api.anthropic.com${req.url}`, {
		method: "POST", headers, body: raw, redirect: "error",
		signal: AbortSignal.any([current.controller.signal, AbortSignal.timeout(40_000)]),
	});
	entry.status = upstream.status;
	const text = await upstream.text();
	if (upstream.ok) {
		entry.usage = responseUsage(text);
		assert.ok(entry.usage.output_tokens <= current.cap, "provider exceeded the output cap");
	}
	const responseHeaders = Object.fromEntries([...upstream.headers].filter(([key]) => !["content-encoding", "content-length", "transfer-encoding"].includes(key)));
	res.writeHead(upstream.status, responseHeaders).end(text);
}

async function startApi() {
	server = createServer(async (req, res) => {
		if (req.method !== "POST" || new URL(req.url, "http://localhost").pathname !== "/v1/messages") {
			res.writeHead(404).end();
			return;
		}
		try {
			const chunks = [];
			let bytes = 0;
			for await (const chunk of req) {
				bytes += chunk.length;
				assert.ok(bytes <= 2_000_000, "request exceeds synthetic fixture size limit");
				chunks.push(chunk);
			}
			const raw = Buffer.concat(chunks);
			const body = JSON.parse(raw.toString("utf8"));
			const entry = inspectRequest(body);
			if (live) await forward(req, res, raw, entry);
			else if (current.label === "cancel") current.controller.abort();
			else res.writeHead(200, { "content-type": "text/event-stream" }).end(stubResponse(body));
		} catch (error) {
			report.failure = error instanceof assert.AssertionError ? error.message.split("\n")[0] : "probe request failed";
			if (!res.headersSent) res.writeHead(400).end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "probe request rejected" } }));
			current?.controller.abort();
		}
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	return `http://127.0.0.1:${server.address().port}`;
}

function tools() {
	const mcp = new McpServer({ name: "cache-probe", version: "1.0.0" }, { capabilities: { tools: {} } });
	mcp.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [{
		name: "sentinel", description: "Synthetic safety sentinel. Never call this tool.", inputSchema: { type: "object", properties: {} },
	}] }));
	mcp.server.setRequestHandler(CallToolRequestSchema, () => {
		toolAttempts++;
		current?.controller.abort();
		throw new Error("tool execution forbidden in cache probe");
	});
	return { "cache-probe": { type: "sdk", name: "cache-probe", instance: mcp, alwaysLoad: true } };
}

async function runQuery(url, label, marker, { cap = 32, resume, ephemeral = false, ttl = "5m" } = {}) {
	runController.signal.throwIfAborted();
	assert.ok(report.sdkQueries < maxQueries, "SDK query budget exhausted");
	const controller = new AbortController();
	const onRunAbort = () => controller.abort();
	runController.signal.addEventListener("abort", onRunAbort, { once: true });
	current = { label, cap, marker, controller, ttl, requestCount: 0 };
	report.sdkQueries++;
	const timer = setTimeout(() => controller.abort(), 45_000);
	const options = {
		cwd: root, model: MODEL, tools: [], permissionMode: "dontAsk", strictMcpConfig: true,
		settingSources: [], settings: {
			disableAllHooks: true, autoMemoryEnabled: false, includeGitInstructions: false,
			claudeMdExcludes: ["/**"], ...(ttl ? { promptCacheTtl: ttl } : {}),
		},
		systemPrompt: { type: "preset", preset: "claude_code", append: `${marker}\nThis is a synthetic cache probe. Never call tools. Reply only OK.\n${live ? filler : ""}` },
		env: {
			...process.env, ANTHROPIC_BASE_URL: url,
			...(!live ? { ANTHROPIC_API_KEY: "offline-probe-not-a-secret" } : {}),
			ENABLE_CLAUDEAI_MCP_SERVERS: "0", DISABLE_AUTO_COMPACT: "1",
			CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(cap), CLAUDE_CODE_MAX_RETRIES: "0",
			CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", CLAUDE_CODE_DISABLE_TERMINAL_TITLE: "1",
		},
		thinking: { type: "disabled" }, maxTurns: 1, abortController: controller, includePartialMessages: true,
		mcpServers: tools(), promptSuggestions: false,
		...(resume ? { resume } : {}),
		...(ephemeral ? { forkSession: true, persistSession: false } : {}),
		// Post-response stop trigger for this fixed-model experiment, not a hard spend cap.
		...(ephemeral && budgetGuard ? { maxBudgetUsd: 0.000001 } : {}),
	};
	let result;
	let init;
	const q = query({ prompt: "Reply only OK. Do not call any tools.", options });
	try {
		for await (const message of q) {
			if (message.type === "system" && message.subtype === "init") init = message;
			if (message.type === "stream_event") {
				const event = message.event;
				const usage = event.type === "message_start" ? event.message.usage : event.type === "message_delta" ? event.usage : null;
				const entry = entryFor(label);
				if (usage && entry) {
					entry.sdkUsage ??= {};
					for (const key of ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]) {
						if (typeof usage[key] === "number") entry.sdkUsage[key] = usage[key];
					}
				}
				if (entry && event.type === "message_delta") entry.sdkStopReason = event.delta.stop_reason;
			}
			if (message.type === "assistant") assert.ok(!message.message.content.some((b) => b.type === "tool_use"), "model attempted tool use");
			if (message.type === "result") {
				result = message;
				const entry = entryFor(label);
				if (entry) entry.sdkResult = message.subtype;
				// This terminal result is deliberate; draining further surfaces the CLI error exit.
				if (budgetGuard && ephemeral && message.subtype === "error_max_budget_usd") break;
			}
		}
		const entry = report.requests.findLast((r) => r.label === label);
		if (entry) entry.sdkResult = result?.subtype;
		const capped = live && cap === 1 && result?.subtype === "error_max_turns" && entry?.usage?.stopReason === "max_tokens";
		const budgetStopped = budgetGuard && ephemeral && result?.subtype === "error_max_budget_usd";
		assert.ok(result?.subtype === "success" || capped || budgetStopped, report.failure ?? `SDK query did not succeed: ${result?.subtype ?? "no result"}`);
		assert.equal(current.requestCount, 1, "expected exactly one API request");
		if (budgetStopped) {
			assert.equal(entry.sdkUsage?.output_tokens, 1, "budget completion lacks single-request usage");
			assert.equal(entry.sdkStopReason, "max_tokens", "budget experiment did not exercise truncation");
		}
		if (live) {
			for (const key of ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]) {
				assert.equal(entry.sdkUsage?.[key] ?? 0, entry.usage?.[key] ?? 0, `SDK/provider usage mismatch: ${key}`);
			}
		}
		assert.equal(toolAttempts, 0, "tool handler invoked");
		report.cliVersion = init?.claude_code_version;
		console.error(`${label}: ${entry?.usage ? `read=${entry.usage.cache_read_input_tokens ?? 0} write=${entry.usage.cache_creation_input_tokens ?? 0} output=${entry.usage.output_tokens}` : "stub"}`);
		return result;
	} catch (error) {
		report.sdkErrors ??= [];
		report.sdkErrors.push({
			label, name: error.name, resultSubtype: result?.subtype ?? null,
			processExitCode: error.message.match(/process exited with code (\d+)/)?.[1] ?? null,
		});
		throw error;
	} finally {
		const entry = entryFor(label);
		if (entry) entry.aborted = controller.signal.aborted;
		clearTimeout(timer);
		runController.signal.removeEventListener("abort", onRunAbort);
		q.close();
		current = undefined;
		writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
	}
}

const entryFor = (label) => report.requests.find((r) => r.label === label);

function assertPrefix(original, replay) {
	assert.deepEqual(replay.tools, original.tools, "tool definitions changed on replay");
	assert.deepEqual(replay.system, original.system, "system prefix changed on replay");
	assert.deepEqual(replay.messages.slice(0, original.messages.length), original.messages, "original message prefix changed on replay");
}

async function seedConversation(url, label, ttl = "5m") {
	const marker = `cache-probe-${randomUUID()}`;
	const seed = await runQuery(url, label, marker, { ttl });
	const sourcePath = openSession({ sessionId: seed.session_id, projectPath: root }).jsonlPath;
	sessionDirs.add(dirname(sourcePath));
	assert.ok(existsSync(sourcePath), "seed transcript missing");
	return { label, marker, sessionId: seed.session_id, sourcePath, before: hash(readFileSync(sourcePath, "utf8")), seededAt: Date.now() };
}

async function refreshConversation(url, source) {
	const label = `${source.label}-refresh`;
	const transcripts = () => readdirSync(dirname(source.sourcePath)).filter((name) => name.endsWith(".jsonl")).sort();
	const beforeFiles = transcripts();
	try {
		const result = await runQuery(url, label, source.marker, { cap: 1, resume: source.sessionId, ephemeral: true });
		assert.equal(typeof result.session_id, "string", "refresh result lacks a session identity");
		assert.notEqual(result.session_id, source.sessionId, "refresh did not fork");
		assertPrefix(entryFor(source.label).prefix, entryFor(label).prefix);
		report.checks.push(`${label}: one-token cap, stable prefix, no tools`);
	} finally {
		assert.equal(hash(readFileSync(source.sourcePath, "utf8")), source.before, "refresh mutated source transcript");
		assert.deepEqual(transcripts(), beforeFiles, "refresh persisted another transcript");
		report.checks.push(`${label}: source transcript unchanged; no new transcript, including on failure`);
	}
}

async function waitUntil(at) {
	await delay(Math.max(0, at - Date.now()), undefined, { signal: runController.signal });
}

async function liveExperiment(url) {
	if (!liveBudget) {
		const defaultSource = await seedConversation(url, "automatic-ttl", null);
		report.automaticTtl = entryFor(defaultSource.label).cacheControls;
		await refreshConversation(url, defaultSource);
	}
	const pairs = [];
	for (let i = 1; i <= 2; i++) {
		pairs.push({ control: await seedConversation(url, `pair-${i}-control`), warmed: await seedConversation(url, `pair-${i}-warmed`) });
	}
	for (const pair of pairs) {
		for (const source of [pair.control, pair.warmed]) {
			assert.ok(entryFor(source.label).usage.cache_creation_input_tokens >= 4096, "seed did not establish a substantial distinct cached prefix");
		}
	}
	console.error("Waiting for the four-minute refresh point (real TTL experiment).");
	for (const { warmed } of pairs) {
		await waitUntil(warmed.seededAt + 240_000);
		assert.ok(Date.now() < warmed.seededAt + 285_000, "refresh deadline missed");
		await refreshConversation(url, warmed);
		const refresh = entryFor(`${warmed.label}-refresh`);
		const seedUsage = entryFor(warmed.label).usage;
		assert.ok(refresh.usage.cache_read_input_tokens >= seedUsage.cache_read_input_tokens + seedUsage.cache_creation_input_tokens - 64, "refresh did not read the seed prefix");
	}
	console.error("Waiting until after original five-minute expiry.");
	await waitUntil(Math.max(...pairs.flatMap((p) => [p.control.seededAt, p.warmed.seededAt])) + 360_000);
	for (const { control, warmed } of pairs) {
		for (const source of [control, warmed]) {
			assert.equal(hash(readFileSync(source.sourcePath, "utf8")), source.before, "source mutated before normal follow-up");
			await runQuery(url, `${source.label}-followup`, source.marker, { resume: source.sessionId });
			assertPrefix(entryFor(source.label).prefix, entryFor(`${source.label}-followup`).prefix);
		}
		const expected = entryFor(warmed.label).usage.cache_read_input_tokens + entryFor(warmed.label).usage.cache_creation_input_tokens;
		const warmRead = entryFor(`${warmed.label}-followup`).usage.cache_read_input_tokens;
		const coldRead = entryFor(`${control.label}-followup`).usage.cache_read_input_tokens;
		const coldWrite = entryFor(`${control.label}-followup`).usage.cache_creation_input_tokens;
		const passed = warmRead >= expected - 64 && warmRead - coldRead >= 4096 && coldWrite >= 4096;
		report.comparisons.push({ expectedSeedPrefix: expected, warmRead, coldRead, coldWrite, passed });
		assert.ok(passed, "expiry comparison inconclusive");
	}
}

try {
	if (live) {
		const overrides = Object.keys(process.env).filter((k) => /^(ANTHROPIC_|CLAUDE_CONFIG_DIR$|CLAUDE_CODE_(OAUTH|USE_|PROMPT_CACHE|SUBAGENT_PROMPT_CACHE|EXTRA_BODY)|ENABLE_PROMPT_CACHING|DISABLE_PROMPT_CACHING)/.test(k));
		assert.equal(overrides.length, 0, "ambient auth/routing/cache override present; refusing live probe");
	}
	const url = await startApi();
	if (live) await liveExperiment(url);
	else {
		const source = await seedConversation(url, "seed");
		await refreshConversation(url, source);
		await assert.rejects(runQuery(url, "cancel", source.marker, { cap: 1, resume: source.sessionId, ephemeral: true }), (error) => {
			report.cancellation = { errorName: error.name, mentionsAbort: /abort/i.test(error.message), signalAborted: entryFor("cancel")?.aborted };
			return report.cancellation.mentionsAbort && report.cancellation.signalAborted;
		});
		assert.equal(hash(readFileSync(source.sourcePath, "utf8")), source.before, "cancelled refresh mutated source transcript");
		report.checks.push("SDK cancellation aborts an in-flight request without source mutation");
	}
	report.status = "passed";
} catch (error) {
	report.status = "blocked";
	report.failure ??= error instanceof assert.AssertionError ? error.message.split("\n")[0] : `SDK probe failed (${error?.name ?? "unknown"})`;
	process.exitCode = 1;
} finally {
	clearTimeout(deadline);
	report.toolAttempts = toolAttempts;
	server?.closeAllConnections();
	server?.close();
	writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
	for (const dir of sessionDirs) { if (live) execFileSync("trash", [dir]); else rmSync(dir, { recursive: true, force: true }); }
	console.log(JSON.stringify({ status: report.status, queries: report.sdkQueries, failure: report.failure, report: reportPath }));
}
