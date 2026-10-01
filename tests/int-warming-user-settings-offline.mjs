// OFFLINE ONLY: actual SDK/CLI, loopback replies, synthetic HOME/config and fake auth.
// Pins what the refresh query's flag settings do to hostile user settings: the
// control arm proves the fixture's hooks and thinking env really take effect.
// node --test tests/int-warming-user-settings-offline.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync, rmSync } from "node:fs";

import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { query } from "@anthropic-ai/claude-agent-sdk";

const HOOK_EVENTS = ["SessionStart", "UserPromptSubmit", "Stop", "SessionEnd"];
// Mirrors the refresh query in src/cache-warming.ts (flag settings, hooks, thinking).
const REFRESH_FLAGS = { disableAllHooks: true, autoMemoryEnabled: false, includeGitInstructions: false, claudeMdExcludes: ["/**"] };

function sse(model) {
	const event = (type, fields) => `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`;
	return event("message_start", { message: { id: "msg_offline_settings", type: "message", role: "assistant", content: [], model,
		stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } })
		+ event("content_block_start", { index: 0, content_block: { type: "text", text: "" } })
		+ event("content_block_delta", { index: 0, delta: { type: "text_delta", text: "K" } })
		+ event("content_block_stop", { index: 0 })
		+ event("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } })
		+ event("message_stop", {});
}

async function arm(name, refresh, extra = {}, { nonessential = false } = {}) {
	const root = mkdtempSync(join(tmpdir(), `warming-settings-${name}-`));
	const home = join(root, "home"), config = join(home, ".claude"), cwd = join(root, "project"), markers = join(root, "markers"), bin = join(root, "bin");
	for (const dir of [config, cwd, markers, bin]) mkdirSync(dir, { recursive: true });
	// Every git/gh call (e.g. a marketplace clone) is logged and fails instead of reaching a network.
	for (const tool of ["git", "gh"]) writeFileSync(join(bin, tool), `#!/bin/sh\necho "${tool} $*" >> '${join(root, "calls.log")}'\nexit 1\n`, { mode: 0o755 });
	const touch = file => ({ type: "command", command: `touch '${join(markers, file)}'` });
	writeFileSync(join(config, "settings.json"), JSON.stringify({
		hooks: Object.fromEntries(HOOK_EVENTS.map(event => [event, [{ hooks: [touch(event)] }]])),
		statusLine: { type: "command", command: `touch '${join(markers, "statusLine")}'` },
		...extra,
		env: { MAX_THINKING_TOKENS: "2048", ...extra.env },
	}));
	mkdirSync(join(cwd, ".claude"));
	writeFileSync(join(cwd, ".claude", "settings.json"), JSON.stringify({ hooks: { SessionStart: [{ hooks: [touch("project-SessionStart")] }] } }));
	const requests = [], tunnels = [];
	const server = createServer(async (req, res) => {
		if (req.method === "HEAD") { res.writeHead(200).end(); return; }
		const chunks = [];
		for await (const chunk of req) chunks.push(chunk);
		const body = JSON.parse(Buffer.concat(chunks));
		requests.push(body);
		res.writeHead(200, { "content-type": "text/event-stream" }).end(sse(body.model));
	});
	// HTTPS_PROXY points here: any outbound HTTPS (marketplace fetch, telemetry) is a recorded CONNECT, never forwarded.
	server.on("connect", (req, socket) => { tunnels.push(req.url.replace(/:\d+$/, "")); socket.destroy(); });
	await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
	try {
		const q = query({ prompt: "Synthetic settings fixture.", options: {
			cwd, model: "claude-haiku-4-5", tools: [], strictMcpConfig: true, maxTurns: 1, persistSession: false,
			permissionMode: "bypassPermissions", allowDangerouslySkipPermissions: true,
			...(refresh ? { settings: REFRESH_FLAGS, hooks: {}, thinking: { type: "disabled" } } : {}),
			env: { PATH: `${bin}:${process.env.PATH}`, HOME: home, TMPDIR: root, CLAUDE_CONFIG_DIR: config,
				HTTPS_PROXY: `http://127.0.0.1:${server.address().port}`, NO_PROXY: "127.0.0.1",
				ANTHROPIC_API_KEY: "offline-fake-key-not-a-secret", ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`,
				...(nonessential ? {} : { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" }), CLAUDE_CODE_DISABLE_TERMINAL_TITLE: "1", CLAUDE_CODE_MAX_RETRIES: "0" },
		} });
		let result;
		for await (const message of q) if (message.type === "result") { result = message; break; }
		q.close();
		await delay(nonessential ? 5000 : 1500); // SessionEnd runs at teardown; background fetches need longer
		const models = requests.filter(body => Array.isArray(body.messages));
		// Wire identity: drop per-session metadata; normalize this arm's random root.
		const wire = models.map(({ metadata, ...body }) => JSON.stringify(body).replaceAll(realpathSync(root), "<root>").replaceAll(root, "<root>"));
		const configFiles = readdirSync(config, { recursive: true }).map(String).filter(path => !/^(settings\.json|\.claude\.json(\.backup.*)?|backups(\/.*)?|telemetry(\/.*)?)$/.test(path)).sort();
		const calls = existsSync(join(root, "calls.log")) ? readFileSync(join(root, "calls.log"), "utf8").replaceAll(realpathSync(root), "<root>").replaceAll(root, "<root>").trim().split("\n").sort() : [];
		return { result, models, wire, tunnels, configFiles, calls,
			fired: [...HOOK_EVENTS, "project-SessionStart", "statusLine"].filter(file => existsSync(join(markers, file))) };
	} finally {
		server.closeAllConnections();
		await new Promise(resolve => server.close(resolve));
		rmSync(root, { recursive: true, force: true });
	}
}

const thinkingOn = body => body.thinking !== undefined && body.thinking.type !== "disabled";

test("refresh flag settings suppress user hooks and user MAX_THINKING_TOKENS", { timeout: 120_000 }, async t => {
	const control = await arm("control", false);
	t.diagnostic(`control fired: ${control.fired.join(",")}; control thinking: ${control.models.map(body => body.thinking?.type ?? "absent").join(",")}`);
	assert.equal(control.result?.subtype, "success");
	assert.ok(control.models.length >= 1);
	// Fixture validity: without refresh flags the user hooks run and thinking is on.
	assert.ok(["SessionStart", "UserPromptSubmit", "project-SessionStart"].every(hook => control.fired.includes(hook)), `control hooks fired: ${control.fired}`);
	assert.ok(control.models.some(thinkingOn), "control must enable thinking from user settings env");

	const refresh = await arm("refresh", true);
	assert.equal(refresh.result?.subtype, "success");
	assert.ok(refresh.models.length >= 1);
	assert.deepEqual(refresh.fired, [], "refresh flag settings must suppress every user hook and statusLine");
	assert.equal(refresh.models.filter(thinkingOn).length, 0, "refresh wire must not enable thinking");
});

// Settings keys a user's file may carry. Each is inert for a refresh only if adding
// it changes nothing observable: the model wire, outbound HTTPS, git/gh use, hooks
// and config-dir files all match the baseline refresh.
export const INERT_CANDIDATES = {
	"env MAX_THINKING_TOKENS": { env: { MAX_THINKING_TOKENS: undefined } }, // baseline carries it; this arm removes it
	"env CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": { env: { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "50" } },
	"env CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": { env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" } },
	extraKnownMarketplaces: { extraKnownMarketplaces: {
		hub: { source: { source: "github", repo: "example/never-fetch" } },
		remote: { source: { source: "git", url: "https://example.invalid/never-fetch.git" } },
	} },
};

test("candidate settings keys leave the refresh wire and side effects unchanged", { timeout: 240_000 }, async t => {
	await compareCandidates(t, INERT_CANDIDATES, {});
});

// Ordinary provider queries do not set CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, so a
// marketplace fetch must also be absent with non-essential traffic allowed.
test("marketplaces stay unfetched with non-essential traffic allowed", { timeout: 120_000 }, async t => {
	await compareCandidates(t, { extraKnownMarketplaces: INERT_CANDIDATES.extraKnownMarketplaces }, { nonessential: true });
});

async function compareCandidates(t, candidates, options) {
	const baseline = await arm("baseline", true, {}, options);
	assert.equal(baseline.result?.subtype, "success");
	t.diagnostic(`baseline tunnels=${JSON.stringify(baseline.tunnels)} calls=${JSON.stringify(baseline.calls)} configFiles=${JSON.stringify(baseline.configFiles)} requests=${baseline.wire.length}`);
	for (const [name, extra] of Object.entries(candidates)) {
		const variant = await arm(name.replace(/\W+/g, "-"), true, extra, options);
		const same = { wire: JSON.stringify(variant.wire) === JSON.stringify(baseline.wire),
			tunnels: JSON.stringify(variant.tunnels) === JSON.stringify(baseline.tunnels),
			// Known marketplaces only get their empty cache directories; nothing is cloned or fetched.
			configFiles: JSON.stringify(variant.configFiles.filter(f => !(name === "extraKnownMarketplaces" && ["plugins", "plugins/marketplaces"].includes(f))))
				=== JSON.stringify(baseline.configFiles),
			calls: JSON.stringify(variant.calls) === JSON.stringify(baseline.calls), fired: variant.fired.length === 0 };
		t.diagnostic(`${name}: ${JSON.stringify(same)} tunnels=${JSON.stringify(variant.tunnels)} extraCalls=${JSON.stringify(variant.calls.filter(c => !baseline.calls.includes(c)))} extraFiles=${JSON.stringify(variant.configFiles.filter(f => !baseline.configFiles.includes(f)))}`);
		assert.equal(variant.result?.subtype, "success", name);
		assert.deepEqual(same, { wire: true, tunnels: true, configFiles: true, calls: true, fired: true }, name);
	}
}
