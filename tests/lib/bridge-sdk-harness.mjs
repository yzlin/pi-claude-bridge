// OFFLINE ONLY: actual SDK/CLI, loopback replies, synthetic config and fake auth.
// Requires --experimental-test-module-mocks. There is deliberately no forwarding.
import assert from "node:assert/strict";
import { mock } from "node:test";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";

import { tmpdir } from "node:os";
import { join } from "node:path";
import * as realSdk from "@anthropic-ai/claude-agent-sdk";
import { MCP_TOOL_PREFIX } from "../../src/skills.ts";

export const MODEL = "claude-haiku-4-5";
export const SOURCE_USAGE = { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 2048, cache_creation_input_tokens: 32 };
export const REFRESH_USAGE = { input_tokens: 7, output_tokens: 1, cache_read_input_tokens: 2080, cache_creation_input_tokens: 0 };
// OFFLINE public account/init substitution, not real subscription qualification.

function response(body, refresh, toolCall = false, requestNumber = 1, prefixMiss = false, servedSuffix = "") {
	const usage = refresh ? { ...REFRESH_USAGE, ...(prefixMiss ? { cache_read_input_tokens: 0 } : {}) } : SOURCE_USAGE;
	const event = (type, fields) => `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`;
	return event("message_start", { message: { id: `msg_offline_bridge_${requestNumber}`, type: "message", role: "assistant", content: [], model: body.model + servedSuffix,
		stop_reason: null, stop_sequence: null, usage } })
		+ event("content_block_start", { index: 0, content_block: toolCall
			? { type: "tool_use", id: "toolu_offline_sentinel", name: `${MCP_TOOL_PREFIX}sentinel`, input: {} }
			: { type: "text", text: "" } })
		+ event("content_block_delta", { index: 0, delta: toolCall
			? { type: "input_json_delta", partial_json: '{"value":"synthetic"}' }
			: { type: "text_delta", text: "K" } })
		+ event("content_block_stop", { index: 0 })
		+ event("message_delta", { delta: { stop_reason: toolCall ? "tool_use" : refresh ? "max_tokens" : "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } })
		+ event("message_stop", {});
}

export async function bridgeSdkHarness({ modelId = MODEL, subscriptionType = "Claude Max",
	sourceToolCycle = false, maxQueries = 2, maxModelRequests = maxQueries + (sourceToolCycle ? 1 : 0),
	userSettings, projectSettings, environment = {}, simulateSubscription = true, parkFirstRefreshAccount = false,
	firstRefreshResponse = "normal", servedSuffix = "" } = {}) {
	assert.equal(typeof mock.module, "function", "bridgeSdkHarness requires --experimental-test-module-mocks");
	assert.ok(["normal", "tool-use", "prefix-miss"].includes(firstRefreshResponse));
	const fakeSubscription = { subscriptionType, apiProvider: "firstParty" };
	// The CLI strips the requested context suffix on the Messages API wire.
	const wireModel = modelId.replace(/\[1m\]$/, "");
	const previousEnv = { ...process.env }, previousCwd = process.cwd();
	const requests = [], queries = [], actualAccounts = [], actualInits = [], unexpected = [];
	// Park only AFTER the real public account lookup; eligible metadata is test-local.
	const accountReached = Promise.withResolvers(), accountRelease = Promise.withResolvers(), accountReturned = Promise.withResolvers();
	const root = mkdtempSync(join(tmpdir(), "bridge-native-offline-"));
	const home = join(root, "home"), config = join(home, ".claude"), cwd = join(root, "project");
	let accountParked = false, server, sdkMock;
	async function close() {
		accountRelease.resolve();
		for (const record of queries) { try { record.query.close(); } catch {} }
		try {
			sdkMock?.restore();
		} finally {
			try {
				server?.closeAllConnections();
				if (server?.listening) await new Promise(resolve => server.close(resolve));
			} finally {
				try { process.chdir(previousCwd); } finally {
					for (const key of Object.keys(process.env)) delete process.env[key];
					Object.assign(process.env, previousEnv);
					rmSync(root, { recursive: true, force: true });
				}
			}
		}
	}
	try {
		for (const dir of [home, config, cwd, join(home, ".pi", "agent")]) mkdirSync(dir, { recursive: true });
		writeFileSync(join(home, ".pi", "agent", "claude-bridge.json"), JSON.stringify({
			startupNoticeShown: "offline", askClaude: { enabled: false }, provider: { autoMemoryEnabled: false },
		}));
		if (userSettings) writeFileSync(join(config, "settings.json"), JSON.stringify(userSettings));
		if (projectSettings) {
			mkdirSync(join(cwd, ".claude"), { recursive: true });
			writeFileSync(join(cwd, ".claude", "settings.json"), JSON.stringify(projectSettings));
		}
		// No ambient auth/proxies/config. Bridge-owned env stays intact after activation.
		for (const key of Object.keys(process.env)) delete process.env[key];
		Object.assign(process.env, { PATH: previousEnv.PATH, HOME: home, TMPDIR: root, CLAUDE_CONFIG_DIR: config, ...environment });
		process.chdir(cwd);
		server = createServer(async (req, res) => {
			let record;
			try {
				if (req.method === "HEAD") { res.writeHead(200).end(); return; }
				assert.equal(req.method, "POST");
				const route = /^\/query\/(\d+)\/v1\/messages$/.exec(new URL(req.url, "http://localhost").pathname);
				assert.ok(route, "unexpected model route");
				record = queries[Number(route[1])];
				assert.equal(req.headers["x-api-key"], "offline-fake-key-not-a-secret");
				assert.equal(req.headers.authorization, undefined);
				assert.ok(record, "request without an observed SDK query");
				assert.ok(record.attempts++ < (sourceToolCycle && queries.indexOf(record) === 0 ? 2 : 1), "unexpected additional model request");
				assert.ok(requests.length < maxModelRequests, "scenario model request budget exceeded");
				const chunks = [];
				for await (const chunk of req) chunks.push(chunk);
				const body = JSON.parse(Buffer.concat(chunks));
				assert.equal(body.model, wireModel);
				requests.push(body); record.requests.push(body);
				record.sentToolCall = record.refreshResponse === "tool-use" || (sourceToolCycle && queries.indexOf(record) === 0 && record.attempts === 1);
				res.writeHead(200, { "content-type": "text/event-stream" }).end(response(body, record.refresh, record.sentToolCall,
					requests.length, record.refreshResponse === "prefix-miss", servedSuffix));
			} catch (error) {
				unexpected.push(error.message);
				res.writeHead(400).end("offline fixture rejected unexpected traffic");
				record?.query?.close();
			}
		});
		await new Promise((resolve, reject) => {
			server.once("error", reject);
			server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
		});
		// Capture ORIGINAL bridge options first. Inject transport ONLY into a child copy;
		// never contaminate the source snapshot with fake API routing/auth controls.
		// Account/init substitutions are simulation, NOT subscription qualification.
		sdkMock = mock.module("@anthropic-ai/claude-agent-sdk", { namedExports: { ...realSdk,
			query(params) {
				const record = { options: params.options, refresh: params.options?.forkSession === true, attempts: 0, requests: [], toolEvents: 0 };
				record.refreshResponse = record.refresh && !queries.some(q => q.refresh) ? firstRefreshResponse : "normal";
				if (queries.length >= maxQueries) unexpected.push("unexpected additional SDK query");
				assert.ok(queries.length < maxQueries, "unexpected additional SDK query");
				const queryIndex = queries.length;
				queries.push(record);
				const q = realSdk.query({ ...params, options: { ...params.options, env: {
					...params.options?.env, HOME: home, CLAUDE_CONFIG_DIR: config, TMPDIR: root,
					ANTHROPIC_API_KEY: "offline-fake-key-not-a-secret", ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}/query/${queryIndex}`,
					CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", CLAUDE_CODE_DISABLE_TERMINAL_TITLE: "1", CLAUDE_CODE_MAX_RETRIES: "0",
				} } });
				record.query = q;
				return new Proxy(q, { get(target, property) {
					if (property === "accountInfo") return async () => {
						const account = await target.accountInfo(); actualAccounts.push(account);
						if (parkFirstRefreshAccount && record.refresh && !accountParked) {
							accountParked = true; accountReached.resolve(record);
							await accountRelease.promise;
							accountReturned.resolve();
						}
						return simulateSubscription ? { ...fakeSubscription } : account;
					};
					if (property === Symbol.asyncIterator) return async function* () {
						for await (const message of target) {
							// Observe the public completion verbatim, especially ModelUsage.
							// Only accountInfo/init apiKeySource are simulated below.
							if (message.type === "result") record.result = message;
							if ((message.type === "stream_event" && message.event.type === "content_block_start" && message.event.content_block.type === "tool_use")
								|| (message.type === "assistant" && message.message.content.some(block => block.type === "tool_use"))) record.toolEvents++;
							if (message.type === "system" && message.subtype === "init") {
								actualInits.push(message);
								yield simulateSubscription ? { ...message, apiKeySource: "none" } : message;
							} else yield message;
						}
					};
					const value = Reflect.get(target, property, target);
					return typeof value === "function" ? value.bind(target) : value;
				} });
			},
		} });
		return { root, home, config, cwd, requests, queries, actualAccounts, actualInits, unexpected,
			refreshAccountGate: { reached: accountReached.promise, release: () => accountRelease.resolve(), returned: accountReturned.promise },
			close,
		};
	} catch (error) {
		await close();
		throw error;
	}
}

export const withoutCacheControls = value => JSON.parse(JSON.stringify(value, (key, item) => key === "cache_control" ? undefined : item));
