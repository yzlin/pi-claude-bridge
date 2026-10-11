// OFFLINE ONLY. Run with:
// node --import tsx --import ./tests/lib/setup.mjs --test tests/int-cache-warming-offline.mjs
// No inherited auth/config, forwarding, subscription metadata, or live mode.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";

import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { makePromptStream, userMessage } from "../src/prompt-stream.ts";
import { createToolServer } from "../src/mcp-server.ts";
import { accountEvidence, selectModelUsage, CacheWarmingCoordinator, warmingQualificationKey, WARMING_SDK_VERSION } from "../src/cache-warming.ts";
import { MCP_SERVER_NAME } from "../src/skills.ts";

const MODEL = "claude-haiku-4-5";
const USAGE = { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 2048, cache_creation_input_tokens: 32 };
const PROMPT = "Synthetic offline cache contract. Reply OK without calling tools.";

function response(body, truncated) {
	const event = (type, fields) => `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`;
	return event("message_start", { message: { id: "msg_offline", type: "message", role: "assistant", content: [], model: body.model,
		stop_reason: null, stop_sequence: null, usage: USAGE } })
		+ event("content_block_start", { index: 0, content_block: { type: "text", text: "" } })
		+ event("content_block_delta", { index: 0, delta: { type: "text_delta", text: "K" } })
		+ event("content_block_stop", { index: 0 })
		+ event("message_delta", { delta: { stop_reason: truncated ? "max_tokens" : "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } })
		+ event("message_stop", {});
}

const withoutCacheControls = (value) => JSON.parse(JSON.stringify(value, (key, item) => key === "cache_control" ? undefined : item));
const hash = value => createHash("sha256").update(Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
function jsonlFiles(root) {
	return readdirSync(root, { recursive: true }).filter(path => path.endsWith(".jsonl")).sort();
}

test("offline warming prerequisite: withheld prompt, real SDK metadata and budget fork", { timeout: 60_000 }, async (t) => {
	const root = mkdtempSync(join(tmpdir(), "bridge-warming-contract-"));
	const home = join(root, "home"), config = join(home, ".claude"), cwd = join(root, "project");
	for (const dir of [home, config, cwd]) mkdirSync(dir, { recursive: true });
	const requests = [], unexpected = [], nonModelRequests = [];
	let active, toolCalls = 0;
	const server = createServer(async (req, res) => {
		try {
			if (req.method === "HEAD") {
				nonModelRequests.push({ method: req.method, path: new URL(req.url, "http://localhost").pathname });
				res.writeHead(200).end();
				return;
			}
			assert.equal(req.method, "POST");
			assert.equal(new URL(req.url, "http://localhost").pathname, "/v1/messages");
			assert.equal(req.headers["x-api-key"], "offline-fake-key-not-a-secret");
			assert.equal(req.headers.authorization, undefined);
			assert.ok(active?.released, "model request before input release");
			assert.equal(active.attempts++, 0, "unexpected model continuation");
			const chunks = [];
			for await (const chunk of req) chunks.push(chunk);
			const body = JSON.parse(Buffer.concat(chunks));
			assert.equal(body.model, MODEL);
			assert.equal(body.max_tokens, active.cap);
			assert.ok(!body.thinking || body.thinking.type === "disabled");
			requests.push(body);
			res.writeHead(200, { "content-type": "text/event-stream" }).end(response(body, active.cap === 1));
		} catch (error) {
			unexpected.push(error.message);
			res.writeHead(400).end("offline fixture rejected unexpected request");
			active?.controller.abort();
		}
	});
	await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
	// Explicit env replaces (does not merge) the SDK child's environment. Never
	// spread process.env: fake key, loopback routing and synthetic home only.
	const env = {
		PATH: process.env.PATH, HOME: home, TMPDIR: root, CLAUDE_CONFIG_DIR: config,
		ANTHROPIC_API_KEY: "offline-fake-key-not-a-secret", ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`,
		ENABLE_CLAUDEAI_MCP_SERVERS: "0", DISABLE_AUTO_COMPACT: "1",
		CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", CLAUDE_CODE_DISABLE_TERMINAL_TITLE: "1",
		CLAUDE_CODE_MAX_RETRIES: "0",
	};
	async function run(resume) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 20_000);
		const prompt = makePromptStream();
		active = { released: false, attempts: 0, cap: resume ? 1 : 32, controller };
		const mcp = createToolServer(MCP_SERVER_NAME, [{ name: "sentinel", description: "Inert synthetic sentinel. Never call.",
			inputSchema: { type: "object", properties: {} }, handler: async () => {
				toolCalls++; controller.abort(); throw new Error("offline warming may not execute tools");
			} }]);
		const q = query({ prompt: prompt.stream, options: {
			cwd, model: MODEL, tools: [], strictMcpConfig: true, permissionMode: "dontAsk", settingSources: [],
			// Like providerQuerySettings: the CLI loads these built-ins by default.
			settings: { disableAllHooks: true, autoMemoryEnabled: false, includeGitInstructions: false, claudeMdExcludes: ["/**"], promptCacheTtl: "5m",
				enabledPlugins: { "cc-plugin-agents-md@builtin": false, "cc-plugin-plugin-authoring@builtin": false } },
			hooks: {}, systemPrompt: "Inert synthetic system for an offline SDK contract.",
			env: { ...env, CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(active.cap) },
			thinking: { type: "disabled" }, maxTurns: 1, includePartialMessages: true, promptSuggestions: false,
			mcpServers: { [MCP_SERVER_NAME]: mcp }, abortController: controller,
			...(resume ? { resume, forkSession: true, persistSession: false, maxBudgetUsd: 0.000001 } : {}),
		} });
		let init, result, stopReason, servedModel;
		const usage = {};
		let starts = 0, assistants = 0;
		const terminalOrder = [];
		try {
			const before = requests.length;
			const account = await q.accountInfo();
			assert.equal(requests.length, before, "accountInfo() sent a model request");
			await delay(200); // Input remains parked even after initialization settles.
			assert.equal(requests.length, before, "SDK eagerly sent a withheld prompt");
			assert.equal(active.attempts, 0);
			active.released = true;
			const ack = prompt.push(userMessage(PROMPT)); // Exactly one user input.
			void ack.catch(() => {});
			for await (const message of q) {
				if (message.type === "system" && message.subtype === "init") init = message;
				if (message.type === "stream_event") {
					const event = message.event;
					if (event.type === "message_start") { starts++; servedModel = event.message.model; Object.assign(usage, event.message.usage); }
					if (event.type === "message_delta") { terminalOrder.push(["message_delta", event.delta.stop_reason]); Object.assign(usage, event.usage); stopReason = event.delta.stop_reason; }
					if (event.type === "content_block_start") assert.equal(event.content_block.type, "text");
				}
				if (message.type === "assistant") { assistants++; terminalOrder.push(["assistant", message.message.stop_reason]); }
				if (message.type === "result") { terminalOrder.push(["result", message.subtype]); result = message; break; } // Do NOT drain after budget terminal.
			}
			await ack;
			if (resume) assert.deepEqual(terminalOrder, [["assistant", null], ["message_delta", "max_tokens"], ["result", "error_max_budget_usd"]]);
			assert.equal(result?.subtype, resume ? "error_max_budget_usd" : "success");
			assert.equal(stopReason, resume ? "max_tokens" : "end_turn");
			assert.equal(starts, 1); assert.equal(assistants, 1); assert.equal(active.attempts, 1);
			assert.equal(servedModel, MODEL);
			for (const [key, value] of Object.entries(USAGE)) assert.equal(usage[key], value, key);
			return { account, init, result, servedModel, usage };
		} finally {
			prompt.fail(new Error("offline query ended"));
			controller.abort(); q.close();
			await prompt.stream.return();
			await mcp.instance.close();
			clearTimeout(timer);
		}
	}
	try {
		const source = await run();
		const filesBefore = jsonlFiles(config);
		const sourcePath = filesBefore.find(path => path.endsWith(`${source.result.session_id}.jsonl`));
		assert.ok(sourcePath, "SDK did not persist the synthetic source");
		const sourceBytes = readFileSync(join(config, sourcePath));
		const refresh = await run(source.result.session_id);
		await delay(200); // Observe shutdown without draining the streaming input.
		assert.deepEqual(unexpected, []);
		assert.equal(requests.length, 2);
		assert.equal(toolCalls, 0);
		assert.notEqual(refresh.init.session_id, source.init.session_id);
		assert.deepEqual(readFileSync(join(config, sourcePath)), sourceBytes);
		assert.deepEqual(jsonlFiles(config), filesBefore, "non-persisting fork wrote a transcript");
		assert.deepEqual(withoutCacheControls(requests[1].tools), withoutCacheControls(requests[0].tools));
		const system = body => withoutCacheControls(body.system).filter(block => !block.text?.startsWith("x-anthropic-billing-header:"));
		assert.deepEqual(system(requests[1]), system(requests[0]));
		assert.deepEqual(withoutCacheControls(requests[1].messages.slice(0, requests[0].messages.length)), withoutCacheControls(requests[0].messages));
		assert.equal(accountEvidence(source.account).eligible, false, "actual API-key metadata was accepted as subscription");
		assert.deepEqual(refresh.account, source.account);
		const observed = {
			sdk: WARMING_SDK_VERSION, cli: source.init.claude_code_version,
			account: source.account, init: { apiKeySource: source.init.apiKeySource, tools: source.init.tools, mcp_servers: source.init.mcp_servers, plugins: source.init.plugins },
			sourceModelUsage: source.result.modelUsage, refreshModelUsage: refresh.result.modelUsage,
			requests: requests.length, nonModelRequests, toolCalls, terminal: refresh.result.subtype,
			perRequestUsage: refresh.usage,
			isolation: { sourceBytes: sourceBytes.length, sourceSha256: hash(sourceBytes), transcriptsBefore: filesBefore.length,
				transcriptsAfter: jsonlFiles(config).length, sourceUnchanged: true, noPersistedFork: true },
			prefix: { toolsSha256: hash(withoutCacheControls(requests[0].tools)), systemSha256: hash(system(requests[0])),
				messagesSha256: hash(withoutCacheControls(requests[0].messages)), sourcePrefixPreserved: true },
			outputCaps: requests.map(body => body.max_tokens),
		};
		t.diagnostic(JSON.stringify(observed)); // Synthetic metadata only; never raw bodies or auth headers.
		await t.test("measured SDK MCP provenance is accepted by the production isolation gate", () => {
			assert.deepEqual(source.init.mcp_servers, [{ name: MCP_SERVER_NAME, status: "connected", source: "sdk" }]);
			assert.deepEqual(refresh.init.mcp_servers, source.init.mcp_servers);
			// This is a gate-only fixture, NOT bridge/native integration or live
			// subscription proof. OFFLINE source-derived static contract simulation,
			// not runtime qualification. Simulate only subscription metadata and test-local
			// qualification so the measured init/tools/accounting reach isolation.
			// The production qualification set stays untouched and empty.
			const model = { id: MODEL, provider: "claude-bridge", baseUrl: "claude-bridge" };
			const runtime = { effective: { autoMemoryEnabled: false, disableAllHooks: true }, sources: [] };
			const snapshot = {
				owner: "offline-gate", model, cliModel: MODEL, retention: "short", sessionId: source.init.session_id,
				requestOptions: { sessionId: "synthetic-pi-session" },
				context: { messages: [{ role: "user", content: PROMPT, timestamp: 1 }], tools: [] },
				prompt: PROMPT, systemPrompt: "Inert synthetic system for an offline SDK contract.",
				mcpTools: [{ name: "sentinel", description: "Inert synthetic sentinel. Never call.", parameters: { type: "object", properties: {} } }],
				settings: runtime, extraArgs: { "strict-mcp-config": null }, env: { ENABLE_CLAUDEAI_MCP_SERVERS: "0" },
				evidence: { sdkVersion: WARMING_SDK_VERSION, servedModel: source.servedModel,
					account: accountEvidence({ subscriptionType: "Claude Max", apiProvider: "firstParty" }),
					init: { ...source.init, apiKeySource: "none" },
					usage: selectModelUsage(source.result.modelUsage, source.servedModel), sourceCachedTokens: USAGE.cache_read_input_tokens + USAGE.cache_creation_input_tokens,
				},
			};
			const coordinator = new CacheWarmingCoordinator({ qualified: new Set([warmingQualificationKey(snapshot)]),
				refresh: async () => { throw new Error("gate fixture never dispatches a refresh"); } });
			const candidate = { owner: snapshot.owner, piSessionId: snapshot.requestOptions.sessionId,
				model, idle: true, retention: "short", runtime };
			// Measured SDK shape is the positive control. The historical mock with
			// missing provenance is unproven and must now be rejected.
			coordinator.complete(coordinator.begin(snapshot.owner), snapshot);
			assert.equal(coordinator.decide(candidate), "warm",
				"clean SDK-created init with source:sdk is rejected by production isolatedSource");
			coordinator.complete(coordinator.begin(snapshot.owner), { ...snapshot, evidence: { ...snapshot.evidence,
				init: { ...snapshot.evidence.init, mcp_servers: [{ name: MCP_SERVER_NAME, status: "connected" }] } } });
			assert.equal(coordinator.decide(candidate), "stop", "missing MCP provenance must not be accepted");
		});
		await t.test("measured accounting backend satisfies the production firstParty gate", () => {
			assert.equal(selectModelUsage(source.result.modelUsage, source.servedModel)?.provider, "firstParty");
			assert.equal(selectModelUsage(refresh.result.modelUsage, refresh.servedModel)?.provider, "firstParty");
		});
	} catch (error) {
		assert.deepEqual(unexpected, [], "loopback request guard rejected SDK traffic");
		throw error;
	} finally {
		server.closeAllConnections();
		await new Promise(resolve => server.close(resolve));
		rmSync(root, { recursive: true, force: true }); // Synthetic conversations only; no real project history.
	}
});
