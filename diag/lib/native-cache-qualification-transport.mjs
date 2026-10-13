// Public SDK observation only. Offline substitution is selected by the parent
// worker mode, never by account failure; live failures cannot fall back to it.
import assert from "node:assert/strict";
import { mock } from "node:test";
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { createHash } from "node:crypto";
import * as sdk from "@anthropic-ai/claude-agent-sdk";

export const hash = value => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
export const stripCache = value => JSON.parse(JSON.stringify(value, (key, item) => key === "cache_control" ? undefined : item));
const usageKeys = ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"];
const selectUsage = value => Object.fromEntries(usageKeys.filter(key => typeof value?.[key] === "number").map(key => [key, value[key]]));
// OFFLINE source-derived static contract simulation, not runtime qualification.
const subscription = { subscriptionType: "Claude Max", apiProvider: "firstParty" };
function simulatedResponse(body, refresh, id, followup, warmed, servedModel = `${body.model}-20251001`) {
	const usage = { input_tokens: 7, output_tokens: 1, cache_read_input_tokens: followup ? (warmed ? 2080 : 0) : refresh ? 2080 : 2048,
		cache_creation_input_tokens: followup ? (warmed ? 0 : 2080) : refresh ? 0 : 32 };
	const event = (type, value) => `event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`;
	// Like the live API (native-cache-haiku.live): alias requests are served under a dated snapshot id.
	return event("message_start", { message: { id: `msg_offline_qualification_${id}`, type: "message", role: "assistant", content: [], model: servedModel, stop_reason: null, stop_sequence: null, usage } })
		+ event("content_block_start", { index: 0, content_block: { type: "text", text: "" } })
		+ event("content_block_delta", { index: 0, delta: { type: "text_delta", text: "K" } })
		+ event("content_block_stop", { index: 0 })
		+ event("message_delta", { delta: { stop_reason: refresh ? "max_tokens" : "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } })
		+ event("message_stop", {});
}
function readUsage(text) {
	const events = text.split("\n").filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6)));
	const start = events.find(event => event.type === "message_start"), delta = events.findLast(event => event.type === "message_delta");
	assert.ok(start && delta, "provider usage missing");
	return { usage: { ...selectUsage(start.message.usage), ...selectUsage(delta.usage) }, stop: delta.delta.stop_reason, servedModel: start.message.model };
}
const thinkingOff = body => assert.ok(!body.thinking || body.thinking.type === "disabled", "wire thinking enabled");
export function wireEvidence(body, wireThinking = thinkingOff) {
	const ttl = [];
	JSON.stringify(body, (key, value) => { if (key === "cache_control") ttl.push(value.ttl ?? "5m"); return value; });
	assert.ok(ttl.length && ttl.every(value => value === "5m"), "five-minute wire TTL missing");
	wireThinking(body);
	assert.ok(body.tools?.some(tool => tool.name.endsWith("__sentinel")), "sentinel missing");
	return { model: body.model, maxTokens: body.max_tokens, ttl, thinkingOff: wireThinking === thinkingOff,
		thinking: body.thinking ?? null, effort: body.output_config?.effort ?? null,
		system: hash(body.system), tools: hash(stripCache(body.tools)), messages: body.messages.map(message => hash(stripCache(message))), bodyHash: hash(body) };
}
const hopHeaders = headers => {
	const blocked = new Set(["host", "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);
	for (const name of String(headers.connection ?? "").split(",")) blocked.add(name.trim().toLowerCase());
	return Object.fromEntries(Object.entries(headers).filter(([key]) => !blocked.has(key.toLowerCase())));
};
// node:https does not decompress, redirect, retry or reconstruct the JSON. Both
// directions preserve end-to-end headers and raw bytes (including compression).
function forward(req, raw, signal) {
	return new Promise((resolve, reject) => {
		const upstream = httpsRequest("https://api.anthropic.com/v1/messages" + new URL(req.url, "http://localhost").search,
			{ method: "POST", headers: hopHeaders(req.headers), signal }, response => {
			const chunks = []; let length = 0;
			response.on("data", chunk => { length += chunk.length; if (length > 2_000_000) upstream.destroy(new Error("response too large")); else chunks.push(chunk); });
			response.on("error", reject);
			response.on("end", () => {
				const bytes = Buffer.concat(chunks);
				resolve({ status: response.statusCode, headers: hopHeaders(response.headers), encoding: response.headers["content-encoding"], bytes });
			});
		});
		upstream.on("error", reject); upstream.end(raw);
	});
}
export async function observeSdk({ offline, rpc, preflight, evidenceAccount, onFatal, offlineFault, deadlineAt, wireThinking, simulatedServedModel }) {
	assert.equal(typeof offline, "boolean");
	assert.ok(offline || offlineFault === undefined);
	const records = [], controller = new AbortController();
	let failed = false;
	const fail = () => { failed = true; controller.abort(); for (const record of records) { try { record.query?.close(); } catch {} } onFatal(); };
	const server = createServer(async (req, res) => {
		try {
			// Connectivity probes carry no prompt, and must never be forwarded.
			if (req.method === "HEAD") { res.writeHead(200).end(); return; }
			const match = /^\/q\/(\d+)\/v1\/messages$/.exec(new URL(req.url, "http://localhost").pathname);
			assert.ok(!failed && req.method === "POST" && match, "unexpected transport");
			const record = records.find(row => row.id === Number(match[1]));
			assert.ok(record?.accountVerified, "request before account verification");
			record.phase = "model-request";
			record.requestAt = await rpc("attempt", { id: record.id });
			const chunks = []; let size = 0;
			for await (const chunk of req) { size += chunk.length; assert.ok(size <= 2_000_000, "oversized synthetic request"); chunks.push(chunk); }
			const raw = Buffer.concat(chunks), body = JSON.parse(raw);
			record.wire = wireEvidence(body, wireThinking);
			assert.equal(body.model, record.cliModel.replace(/\[1m\]$/, ""), "unexpected request model");
			if (record.refresh) assert.equal(body.max_tokens, 1);
			await rpc("observe", { id: record.id, evidence: { stage: "wire", wire: record.wire } });
			if (offline) {
				assert.equal(req.headers["x-api-key"], "offline-qualification-not-a-secret");
				assert.equal(req.headers.authorization, undefined);
				if (offlineFault === "http-error") {
					await rpc("observe", { id: record.id, evidence: { stage: "response-status", status: 503 } });
					record.phase = "responded-error";
					res.writeHead(503, { "content-type": "application/json" }).end(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "offline simulated upstream failure" } }));
					return;
				}
				const text = simulatedResponse(body, record.refresh, record.id, !record.refresh && records.filter(row => !row.refresh).length > 1, records.some(row => row.refresh), simulatedServedModel);
				record.provider = readUsage(text);
				await rpc("observe", { id: record.id, evidence: { stage: "response", status: 200, provider: record.provider } });
				record.phase = "responded";
				res.writeHead(200, { "content-type": "text/event-stream" }).end(text);
			} else {
				// No credential parsing/extraction; the SDK owns authentication. Public
				// accountInfo established the lane before any prompt was released.
				assert.equal(req.headers["x-api-key"], undefined, "API-key transport refused");
				assert.ok(req.headers.authorization, "subscription transport missing");
				await rpc("forwarded", { id: record.id }); // conservative count before I/O
				record.phase = "forwarding";
				const response = await forward(req, raw, controller.signal);
				await rpc("observe", { id: record.id, evidence: { stage: "response-status", status: response.status } });
				assert.equal(response.status, 200, "upstream failed; no retry");
				// Decode only an observation copy; forwarded response stays byte-exact.
				const zlib = await import("node:zlib");
				const decoders = { gzip: zlib.gunzipSync, br: zlib.brotliDecompressSync, deflate: zlib.inflateSync };
				assert.ok(!response.encoding || Object.hasOwn(decoders, response.encoding), "unknown response encoding");
				const bytes = response.encoding ? decoders[response.encoding](response.bytes) : response.bytes;
				record.provider = readUsage(bytes.toString("utf8"));
				await rpc("observe", { id: record.id, evidence: { stage: "response", status: response.status, provider: record.provider } });
				record.phase = "responded";
				res.writeHead(response.status, response.headers).end(response.bytes);
			}
		} catch { if (!res.headersSent) res.writeHead(400).end("qualification observer refused"); else res.destroy(); fail(); }
	});
	await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
	const sdkMock = mock.module("@anthropic-ai/claude-agent-sdk", { namedExports: { ...sdk,
		query(params) {
			const record = { phase: "preflight", options: params.options, refresh: params.options?.forkSession === true, sdkUsage: {}, cliModel: params.options?.model ?? params.options?.extraArgs?.model,
				optionsShape: { thinking: params.options?.thinking, settingSources: params.options?.settingSources ?? "default", persistSession: params.options?.persistSession ?? true,
					forkSession: params.options?.forkSession ?? false, maxTurns: params.options?.maxTurns ?? null, maxBudgetUsd: params.options?.maxBudgetUsd ?? null,
					settingsHash: hash(params.options?.settings ?? {}), retries: 0, observerRouting: true } };
			records.push(record);
			let closed = false;
			const ready = (async () => {
				assert.ok(!failed && !closed);
				record.runtimeHash = await preflight(params.options, sdk.resolveSettings); // BEFORE any SDK spawn
				if (closed || failed) throw new Error("query cancelled");
				record.phase = "reservation";
				record.id = await rpc("reserve", {});
				if (closed || failed) throw new Error("query cancelled");
				// Startup count is a conservative attempted SDK invocation. A process
				// creation failure still burns it; it is not a model-request count.
				await rpc("started", { id: record.id });
				if (closed || failed || Date.now() >= deadlineAt) throw new Error("query cancelled or expired");
				const gate = Promise.withResolvers();
				let verified;
				const prompt = { async *[Symbol.asyncIterator]() {
					await gate.promise;
					if (closed || failed) throw new Error("query cancelled");
					assert.ok(typeof params.prompt !== "string", "source must use public streaming input");
					yield* params.prompt;
				} };
				// Declared observer transport plumbing only. Retry disable is part of
				// the forwarding guard; source model/settings/output controls untouched.
				const q = sdk.query({ ...params, prompt, options: { ...params.options, env: { ...params.options.env,
					ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}/q/${record.id}`, CLAUDE_CODE_MAX_RETRIES: "0",
					...(offline ? { ANTHROPIC_API_KEY: "offline-qualification-not-a-secret" } : {}),
				} } });
				record.query = q; record.phase = "account";
				verified = q.accountInfo().then(async account => {
					if (offline && offlineFault === "deadline-active") {
						await new Promise(resolve => { if (controller.signal.aborted) resolve(); else controller.signal.addEventListener("abort", resolve, { once: true }); });
						throw new Error("offline watchdog gate cancelled");
					}
					const actual = evidenceAccount(account);
					if (offline) {
						assert.equal(actual.eligible, false, "offline fake key unexpectedly eligible");
						if (offlineFault !== "api-key") account = { ...subscription };
					}
					const evidence = evidenceAccount(account);
					record.accountLane = evidence.lane;
					await rpc("observe", { id: record.id, evidence: { stage: "account", eligible: evidence.eligible, accountLane: evidence.lane } });
					assert.ok(evidence.eligible, "subscription account required");
					record.accountVerified = true; record.phase = "input-released";
					gate.resolve();
					return account;
				}).catch(error => { gate.resolve(); closed = true; q.close(); throw error; });
				record.account = verified;
				await verified;
				return q;
			})();
			ready.catch(() => { fail(); });
			return {
				async accountInfo() { await ready; return record.account; },
				async interrupt() { closed = true; record.query?.close(); },
				close() { closed = true; record.query?.close(); },
				async *[Symbol.asyncIterator]() {
					const q = await ready;
					for await (const message of q) {
						if (message.type === "stream_event") {
							const event = message.event;
							if (event.type === "message_start") Object.assign(record.sdkUsage, selectUsage(event.message.usage));
							if (event.type === "message_delta") Object.assign(record.sdkUsage, selectUsage(event.usage));
							assert.ok(!(event.type === "content_block_start" && event.content_block.type === "tool_use"), "tool attempt forbidden");
						}
						if (message.type === "assistant") assert.ok(!message.message.content.some(block => block.type === "tool_use"), "tool attempt forbidden");
						if (message.type === "system" && message.subtype === "init" && offline) yield { ...message, apiKeySource: "none" };
						else yield message;
					}
				},
			};
		},
	} });
	return { records,
		// Explicit offline guard attack, not a model request/replay: empty JSON
		// must be refused on the second attempt before parsing or forwarding.
		...(offline ? { async extraAttempt(id) {
			await fetch(`http://127.0.0.1:${server.address().port}/q/${id}/v1/messages`, { method: "POST", body: "{}" });
		} } : {}),
		async close() { controller.abort(); for (const row of records) row.query?.close(); sdkMock.restore(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
