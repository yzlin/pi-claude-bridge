// IPC-only actual-SDK construction probe. No live mode or account substitution.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { openSession } from "cc-session-io";

assert.ok(process.send && process.argv.length === 2);
assert.equal(process.env.HOME, join(process.env.TMPDIR, "home"));
assert.equal(process.env.CLAUDE_CONFIG_DIR, join(process.env.HOME, ".claude"));
assert.equal(realpathSync(process.cwd()), realpathSync(join(process.env.TMPDIR, "project")));
assert.equal(process.env.ANTHROPIC_API_KEY, "offline-tool-source-not-a-secret");
assert.match(process.env.ANTHROPIC_BASE_URL, /^http:\/\/127\.0\.0\.1:\d+$/);
for (const name of ["ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"]) assert.equal(process.env[name], undefined);

const { query, resolveSettings } = await import("@anthropic-ai/claude-agent-sdk");
const { makePromptStream, userMessage } = await import("../../src/prompt-stream.ts");
const { createToolServer } = await import("../../src/mcp-server.ts");
const { providerCacheControls } = await import("../../src/cache-policy.ts");
const { accountEvidence } = await import("../../src/cache-warming.ts");
let current, prompt, tool, initialized = false;
async function close() {
 prompt?.fail(Error("offline capture ended")); current?.close();
 await prompt?.stream.return(); await tool?.instance.close();
}
process.on("disconnect", () => { void close().finally(() => process.exit(1)); });
process.on("SIGTERM", () => { void close().finally(() => process.exit(1)); });
process.on("message", async message => {
 try {
  assert.ok(!initialized && message.type === "init"); initialized = true;
  assert.ok(["claude-sonnet-5-5", "claude-opus-5-5[1m]"].includes(message.model));
  let toolCalls = 0, activeStage;
  tool = createToolServer("custom-tools", [{ name: "sentinel", description: "Synthetic inert sentinel. Returns a fixed value; no side effects.",
   inputSchema: { type: "object", properties: {} }, handler: async () => { assert.equal(activeStage, "tool", "sentinel cannot execute outside the source tool turn"); toolCalls++; return { content: [{ type: "text", text: "SYNTHETIC_TOOL_RESULT" }] }; } }]);
  const resolved = await resolveSettings({ cwd: process.cwd() });
  const plugins = { "cc-plugin-agents-md@builtin": false };
  for (const row of [resolved.effective, ...resolved.sources.map(row => row.settings)]) for (const id of Object.keys(row?.enabledPlugins ?? {})) plugins[id] = false;
  const cache = providerCacheControls({ ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", ENABLE_CLAUDEAI_MCP_SERVERS: "0", DISABLE_AUTO_COMPACT: "1" }, "short");
  const base = { cwd: process.cwd(), model: message.model, env: cache.env, tools: [], strictMcpConfig: true,
   permissionMode: "bypassPermissions", allowDangerouslySkipPermissions: true, verbatimPrompts: true,
   thinking: { type: "disabled" }, includePartialMessages: true, promptSuggestions: false,
   settings: { ...cache.settings, enabledPlugins: plugins, disableAllHooks: true, autoMemoryEnabled: false, includeGitInstructions: false, claudeMdExcludes: ["/**"] },
   hooks: {}, systemPrompt: "Synthetic tool-prefix construction test. Use only the inert sentinel when asked.", mcpServers: { "custom-tools": tool } };
  const rows = []; let sourceId, transcript, sourceBytes, sourceFiles;
  for (const [stage, text] of [["seed", "Synthetic seed. Reply K."], ["tool", "Call the inert sentinel once, then reply K."], ["refresh", "."], ["followup", "Synthetic source follow-up. Reply K."]]) {
   const refresh = stage === "refresh", controller = new AbortController();
   activeStage = stage;
   prompt = makePromptStream();
   current = query({ prompt: prompt.stream, options: { ...base, abortController: controller, maxTurns: stage === "tool" ? 2 : 1,
    env: { ...base.env, ANTHROPIC_BASE_URL: `${process.env.ANTHROPIC_BASE_URL}/${stage}`, CLAUDE_CODE_MAX_OUTPUT_TOKENS: refresh ? "1" : "32", CLAUDE_CODE_MAX_RETRIES: "0" },
    ...(sourceId ? { resume: sourceId } : {}), ...(refresh ? { forkSession: true, persistSession: false, maxBudgetUsd: 0.000001 } : {}) } });
   const timeout = setTimeout(() => controller.abort(), 20_000);
   try {
    assert.equal(accountEvidence(await current.accountInfo()).eligible, false, "fake API auth must not qualify a subscription");
    void prompt.push(userMessage(text)).catch(() => {});
    let init, terminal, starts = 0, calls = 0;
    for await (const m of current) {
     if (m.type === "system" && m.subtype === "init") {
      init = m; assert.equal(m.claude_code_version, "2.1.285"); assert.deepEqual(m.plugins, []);
      assert.ok(m.tools.every(name => String(name).startsWith("mcp__custom-tools__")));
     }
     if (m.type === "stream_event" && m.event.type === "message_start") starts++;
     if (m.type === "stream_event" && m.event.type === "content_block_start" && m.event.content_block.type === "tool_use") calls++;
     if (m.type === "result") { terminal = m; break; }
    }
    assert.ok(init && terminal);
    assert.equal(terminal.subtype, refresh ? "error_max_budget_usd" : "success");
    assert.equal(starts, stage === "tool" ? 2 : 1); assert.equal(calls, stage === "tool" ? 1 : 0);
    if (stage === "seed") sourceId = terminal.session_id;
    else assert.equal(terminal.session_id === sourceId, !refresh);
    rows.push({ stage, starts, calls, toolCalls, terminal: terminal.subtype });
   } finally { clearTimeout(timeout); controller.abort(); current.close(); prompt.fail(Error("offline turn ended")); await prompt.stream.return(); }
   await delay(200);
   if (stage === "tool") {
    assert.equal(toolCalls, 1);
    transcript = openSession({ sessionId: sourceId, projectPath: process.cwd(), claudeDir: process.env.CLAUDE_CONFIG_DIR }).jsonlPath;
    sourceBytes = readFileSync(transcript); sourceFiles = readdirSync(dirname(transcript)).filter(n => n.endsWith(".jsonl")).sort();
   }
   if (refresh) {
    assert.deepEqual(readFileSync(transcript), sourceBytes);
    assert.deepEqual(readdirSync(dirname(transcript)).filter(n => n.endsWith(".jsonl")).sort(), sourceFiles);
    assert.equal(toolCalls, 1, "refresh must not execute a tool");
   }
  }
  await close(); process.send({ type: "result", value: { rows, sourceUnchanged: true, toolCalls, subscriptionQualified: false, cacheUsage: "synthetic-not-evidence" } }, () => process.exit(0));
 } catch {
  await close(); process.send({ type: "failure", reason: "offline construction assertion failed" }, () => process.exit(1));
 }
});
process.send({ type: "ready" });
