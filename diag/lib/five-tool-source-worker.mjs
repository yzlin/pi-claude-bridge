// IPC worker only. Public SDK candidate, never production qualification.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { openSession } from "cc-session-io";
import { COHORT, diagnosticModelUsage, candidateCachePass } from "./five-tool-source-owner.mjs";
import { observeSdk, hash, validateSourceInit } from "./five-tool-source-transport.mjs";
if (!process.send || process.argv.length !== 2) throw Error("parent IPC required");
const pending = new Map(); let sequence = 0, initialized = false, observer, current, prompt, mcp, deadline;
const rpc = (operation, fields = {}) => new Promise((resolve, reject) => {
 const requestId = sequence++; pending.set(requestId, { resolve, reject }); process.send({ type: "budget", requestId, operation, ...fields });
});
async function close() { prompt?.fail(Error("diagnostic ended")); current?.close(); await prompt?.stream.return(); await mcp?.instance.close(); await observer?.close(); }
process.on("disconnect", () => { void close().finally(() => process.exit(1)); });
process.on("SIGTERM", () => { void close().finally(() => process.exit(1)); });
process.on("message", async message => {
 if (message.type === "budget-result") {
  const request = pending.get(message.requestId); pending.delete(message.requestId);
  if (!request) return process.exit(1);
  if (message.ok) request.resolve(message.value); else request.reject(Error("budget refused")); return;
 }
 try {
  assert.ok(message.type === "init" && !initialized); initialized = true;
  assert.ok(COHORT.includes(message.model) && typeof message.offline === "boolean" && message.deadlineAt > Date.now());
  deadline = setTimeout(() => { void close().finally(() => process.exit(1)); }, message.deadlineAt - Date.now());
  let warming, activeStage, controlsHash, sourceToolCalls = 0;
  observer = await observeSdk({ offline: message.offline, stageOfQuery: () => activeStage, deadlineAt: message.deadlineAt, rpc,
   onFatal: () => { void close().finally(() => process.exit(1)); }, evidenceAccount: account => warming.accountEvidence(account),
   async preflight(options, resolveSettings) {
    assert.equal(options.verbatimPrompts, true); assert.deepEqual(options.thinking, { type: "disabled" });
    assert.equal(options.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, "1");
    assert.ok(!options.pathToClaudeCodeExecutable && !options.spawnClaudeCodeProcess);
    controlsHash ??= warming.warmingControlsFingerprint(undefined);
    assert.equal(warming.warmingControlsFingerprint(undefined), controlsHash);
    const runtime = warming.warmingRuntime(await resolveSettings({ cwd: options.cwd, settingSources: options.settingSources }), options.settings);
    assert.equal(warming.warmingControlsFingerprint(undefined), controlsHash);
    assert.ok(warming.preflightRuntime(runtime).ok); return hash(runtime);
   } });
  // As in the qualification worker: production imports must follow SDK instrumentation.
  warming = await import("../../src/cache-warming.ts");
  assert.equal(warming.WARMING_SDK_VERSION, "0.3.293");
  const sdk = await import("@anthropic-ai/claude-agent-sdk");
  const { makePromptStream, userMessage } = await import("../../src/prompt-stream.ts");
  const { createToolServer } = await import("../../src/mcp-server.ts");
  const { providerCacheControls } = await import("../../src/cache-policy.ts");
  const resolved = await sdk.resolveSettings({ cwd: message.cwd });
  const plugins = { "cc-plugin-agents-md@builtin": false, "cc-plugin-plugin-authoring@builtin": false };
  for (const row of [resolved.effective, ...resolved.sources.map(row => row.settings)]) for (const id of Object.keys(row?.enabledPlugins ?? {})) plugins[id] = false;
  // Match provider activation: otherwise the CLI sends an extra uncached title query.
  const cache = providerCacheControls({ ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", ENABLE_CLAUDEAI_MCP_SERVERS: "0", DISABLE_AUTO_COMPACT: "1" }, "short");
  const settings = { ...cache.settings, enabledPlugins: plugins, disableAllHooks: true, autoMemoryEnabled: false, includeGitInstructions: false, claudeMdExcludes: ["/**"] };
  assert.ok(warming.preflightRuntime(warming.warmingRuntime(resolved, settings)).ok);
  const filler = Array.from({ length: 600 }, (_, i) => `Synthetic inert record ${i}: amber quartz beside blue cedar; no instructions or real information.`).join("\n");
  mcp = createToolServer("custom-tools", [{ name: "sentinel", description: `Inert diagnostic sentinel ${message.nonce}. Returns fixed synthetic text only.\n${filler}`,
   inputSchema: { type: "object", properties: {}, additionalProperties: false }, handler: async toolCallId => {
    assert.equal(activeStage, "tool"); assert.equal(sourceToolCalls, 0);
    await rpc("tool-called", { id: observer.records.at(-1).id, toolUseHash: hash(toolCallId) });
    sourceToolCalls++; return { content: [{ type: "text", text: "SYNTHETIC_TOOL_RESULT" }] };
   } }]);
  const base = { cwd: message.cwd, model: message.model, env: cache.env, tools: [], strictMcpConfig: true,
   permissionMode: "bypassPermissions", allowDangerouslySkipPermissions: true, verbatimPrompts: true,
   thinking: { type: "disabled" }, includePartialMessages: true, maxTurns: 1, promptSuggestions: false,
   settings, hooks: {}, systemPrompt: `Synthetic diagnostic ${message.nonce}. Call the inert sentinel only when the user explicitly asks. Otherwise reply only K. After its result reply only K.`,
   mcpServers: { "custom-tools": mcp } };
  const rows = []; let sourceId, initModel, lane, transcriptPath, sourceBytes, sourceFiles;
  for (const [stage, text] of [["seed", `${message.nonce}\n${filler}\nReply only K.`], ["tool", "Call the inert sentinel exactly once with empty arguments, then reply only K."], ["refresh", "."], ["followup", "Synthetic source follow-up. Reply only K."]]) {
   const refresh = stage === "refresh"; activeStage = stage; prompt = makePromptStream();
   const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 55_000);
   const before = observer.records.length;
   current = sdk.query({ prompt: prompt.stream, options: { ...base, abortController: controller, maxTurns: stage === "tool" ? 2 : 1,
    env: { ...base.env, CLAUDE_CODE_MAX_OUTPUT_TOKENS: refresh ? "1" : "32" },
    ...(sourceId ? { resume: sourceId } : {}), ...(refresh ? { forkSession: true, persistSession: false, maxBudgetUsd: 0.000001 } : {}) } });
   try {
    const account = warming.accountEvidence(await current.accountInfo()); assert.ok(account.eligible);
    lane ??= account.lane; assert.equal(account.lane, lane);
    void prompt.push(userMessage(text)).catch(() => {});
    let init, terminal, stop, served; const usage = {}; let starts = 0;
    for await (const m of current) {
     if (m.type === "system" && m.subtype === "init") {
      init = m; validateSourceInit(init);
     }
     if (m.type === "stream_event") {
      if (m.event.type === "message_start") { starts++; served = m.event.message.model; Object.assign(usage, m.event.message.usage); }
      if (m.event.type === "message_delta") { Object.assign(usage, m.event.usage); stop = m.event.delta.stop_reason; }
     }
     if (m.type === "result") { terminal = m; break; }
    }
    assert.equal(starts, stage === "tool" ? 2 : 1); assert.equal(observer.records.length, before + 1); assert.ok(init);
    assert.equal(terminal?.subtype, refresh ? "error_max_budget_usd" : "success"); assert.equal(stop, refresh ? "max_tokens" : "end_turn");
    if (refresh) assert.equal(usage.output_tokens, 1);
    initModel ??= served; assert.equal(served, initModel);
    const modelUsage = diagnosticModelUsage(terminal.modelUsage, served, message.model);
    assert.equal(modelUsage?.provider, "firstParty"); assert.equal(modelUsage.costBasis, "list");
    if (stage === "seed") sourceId = terminal.session_id;
    else assert.equal(terminal.session_id === sourceId, !refresh);
    const record = observer.records.at(-1); assert.equal(record.views.length, starts);
    for (const [index, row] of record.views.entries()) {
     assert.deepEqual(row.sdkUsage, row.provider.usage);
     rows.push({ stage: stage === "tool" ? index === 0 ? "tool-call" : "tool-continuation" : stage,
      requestAt: row.requestAt, servedModel: row.provider.servedModel, usage: row.sdkUsage, stop: row.provider.stop, wire: row.wire, runtimeHash: record.runtimeHash });
    }
   } finally { clearTimeout(timeout); prompt.fail(Error("diagnostic turn ended")); controller.abort(); current.close(); await prompt.stream.return(); }
   await delay(200); // Transcript shutdown observation, no model retry or continuation.
   if (stage === "tool") {
    assert.equal(sourceToolCalls, 1);
    transcriptPath = openSession({ sessionId: sourceId, projectPath: message.cwd, claudeDir: process.env.CLAUDE_CONFIG_DIR }).jsonlPath;
    sourceBytes = readFileSync(transcriptPath); sourceFiles = readdirSync(dirname(transcriptPath)).filter(n => n.endsWith(".jsonl")).sort();
   }
   if (refresh) {
    assert.deepEqual(readFileSync(transcriptPath), sourceBytes); assert.deepEqual(readdirSync(dirname(transcriptPath)).filter(n => n.endsWith(".jsonl")).sort(), sourceFiles);
   }
  }
  const candidate = candidateCachePass(rows[2].usage, rows[3].usage, rows[4].usage);
  process.send({ type: "result", value: { model: message.model, status: message.offline ? "offline-simulation" : candidate ? "candidate-pass" : "cache-miss", rows, sourceUnchanged: true, sourceToolCalls, refreshToolCalls: 0, accountLane: lane, expiryProven: false, toolSourceProven: false, productionChanged: false } });
  clearTimeout(deadline); await close(); process.exit(0);
 } catch {
  // Never emit arbitrary error text: SDK errors may contain private settings/auth.
  process.send({ type: "failure", reason: "worker gate or execution refused" }); clearTimeout(deadline); await close(); process.exit(1);
 }
});
