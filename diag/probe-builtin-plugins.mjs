#!/usr/bin/env node
// Which built-in plugins does the installed CLI load for the stored login, and
// does a flag-settings enabledPlugins:false switch them off? No user message is
// ever sent, so no model request: the plugin list comes from the reloadPlugins
// control request (held, so nothing is applied) and the account from accountInfo.
// Uses the real HOME login; the cwd is a disposable temp dir, sessions are not persisted.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";

const BASE_OFF = ["cc-plugin-agents-md@builtin", "cc-plugin-plugin-authoring@builtin"];
const ARMS = [
	{ name: "bridge-builtins-off", off: BASE_OFF },
	{ name: "plus-sec-default-off", off: [...BASE_OFF, "cc-plugin-sec-default@builtin", "sec-default@builtin"] },
];

async function probe(arm) {
	const cwd = mkdtempSync(join(tmpdir(), "probe-builtin-plugins-"));
	let release;
	const never = new Promise(resolve => { release = resolve; });
	async function* prompt() { await never; } // never yields a user message
	const q = query({ prompt: prompt(), options: {
		cwd, model: "claude-haiku-4-5", tools: [], strictMcpConfig: true, persistSession: false,
		settings: { disableAllHooks: true, autoMemoryEnabled: false, includeGitInstructions: false,
			enabledPlugins: Object.fromEntries(arm.off.map(id => [id, false])) },
		env: { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", ENABLE_CLAUDEAI_MCP_SERVERS: "0" },
	} });
	try {
		const account = await q.accountInfo();
		const reload = await q.reloadPlugins({ holdOnCacheImpact: true });
		return { arm: arm.name, off: arm.off, subscriptionType: account?.subscriptionType ?? null,
			held: reload.held ?? null, plugins: reload.plugins.map(p => p.source ?? `${p.name}@${p.path}`).sort() };
	} finally {
		release(); q.close();
		rmSync(cwd, { recursive: true, force: true });
	}
}

for (const arm of ARMS) console.log(JSON.stringify(await probe(arm)));
