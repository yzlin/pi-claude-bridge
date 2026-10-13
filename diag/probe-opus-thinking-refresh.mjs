#!/usr/bin/env node
// Mechanism probe: can a 1-token refresh keep an Opus 5.5 thinking-on cache warm?
// Per effort: seed (effort on, persisted) -> refresh A (thinking disabled) ->
// refresh B (same effort). Both refreshes fork without persisting. Run through
// diag/capture-proxy.mjs to keep wire bodies. Spends live subscription quota.
//
//   node diag/capture-proxy.mjs --out /tmp/opus-wire &
//   ANTHROPIC_BASE_URL=http://127.0.0.1:8787 node diag/probe-opus-thinking-refresh.mjs medium [high ...]
import { query } from "@anthropic-ai/claude-agent-sdk";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const efforts = process.argv.slice(2);
if (!efforts.length) throw new Error("usage: probe-opus-thinking-refresh.mjs <effort>...");
const MODEL = process.env.PROBE_MODEL ?? "claude-opus-5-5";
// ~20k tokens of unique filler so the prefix is cacheable and not shared across runs.
const filler = (tag) => Array.from({ length: 1600 }, (_, i) => `${tag} line ${i}: the quick brown fox jumps over the lazy dog.`).join("\n");

async function run(prompt, options) {
	const q = query({ prompt, options: { model: MODEL, tools: [], maxTurns: 1, persistSession: true,
		settingSources: [], settings: { disableAllHooks: true, autoMemoryEnabled: false },
		includePartialMessages: true, ...options } });
	let sessionId, usage, stop, blocks = [], result, thrown;
	try { for await (const m of q) {
		if (m.type === "system" && m.subtype === "init") sessionId = m.session_id;
		else if (m.type === "stream_event" && m.event.type === "message_start") usage = { ...m.event.message.usage };
		else if (m.type === "stream_event" && m.event.type === "message_delta") { stop = m.event.delta.stop_reason; usage.output_tokens = m.event.usage.output_tokens; }
		else if (m.type === "assistant") blocks.push(m.message.content.map(b => b.type).join("+") || "(empty)");
		else if (m.type === "result") result = { subtype: m.subtype, isError: m.is_error, errors: m.errors };
	} } catch (error) { thrown = String(error?.message ?? error).slice(0, 300); }
	return { sessionId, usage: usage && { in: usage.input_tokens, out: usage.output_tokens, read: usage.cache_read_input_tokens, write: usage.cache_creation_input_tokens }, stop, blocks, result, thrown };
}

const refresh = (cwd, sessionId, extra) => run(".", { cwd, resume: sessionId, forkSession: true, persistSession: false,
	maxBudgetUsd: 0.000001, env: { ...process.env, CLAUDE_CODE_MAX_OUTPUT_TOKENS: "1", CLAUDE_CODE_MAX_RETRIES: "0" }, ...extra });

// "default" sends no effort: the bridge's mapping for Pi's minimal level on Opus 5.5.
for (const effort of efforts) {
	const effortOption = effort === "default" ? {} : { effort };
	const cwd = mkdtempSync(join(tmpdir(), `opus-probe-${effort}-`));
	const seed = await run(`${filler(`${effort}-${Date.now()}`)}\n\nThink step by step: how many lines above have an index divisible by both 7 and 11? Then reply with only the number.`, { cwd, ...effortOption });
	console.log(JSON.stringify({ effort, step: "seed", ...seed }));
	const a = await refresh(cwd, seed.sessionId, { thinking: { type: "disabled" } });
	console.log(JSON.stringify({ effort, step: "refresh-thinking-disabled", ...a }));
	const b = await refresh(cwd, seed.sessionId, effortOption);
	console.log(JSON.stringify({ effort, step: "refresh-effort-matched", ...b }));
}
