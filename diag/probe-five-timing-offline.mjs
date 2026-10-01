// Exploratory black-box diagnosis, not qualification or a live runner.
// No live mode, forwarding, retries or credential inspection. Source stages and
// observer account gates below are explicitly synthetic, never qualification.
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
const CASES = ["stream-abort", "stream-abort-close", "string-abort", "observer-stream-abort", "timer-pause"];
const KEY = "offline-timing-not-a-secret";
let sdkStartReservations = 0;

async function pausedTimers() {
 const { FiveOwner, TIMING } = await import("./lib/five-expiry-owner.mjs");
 const budget = new FiveOwner(join(process.env.HOME, "clock-ledger"), { offline: true });
 const usage = { input_tokens: 2, output_tokens: 3, cache_read_input_tokens: 2048, cache_creation_input_tokens: 32 }, toolHash = "a".repeat(64);
 const report = { mode: "timer-pause", sdkStarts: 0, modelHttpAttempts: 0, forwarded: 0, sourceStagesSimulated: true, events: [] };
 try {
  const seed = budget.reserve(0, "seed"); budget.started(seed); budget.attempt(seed);
  budget.responded(seed, { stop: "end_turn", toolUseHash: null }); budget.validated(seed, { usage });
  const source = budget.reserve(0, "tool"); budget.started(source); budget.attempt(source);
  budget.responded(source, { stop: "tool_use", toolUseHash: toolHash }); budget.toolCalled(source, toolHash);
  budget.attempt(source); budget.toolResult(source, toolHash); budget.responded(source, { stop: "end_turn", toolUseHash: null }); budget.validated(source, { usage });
  const began = performance.now();
  await new Promise(resolve => {
   setTimeout(() => {
    report.events.push({ phase: "abort-timer", plannedDelayMs: 150, actualDelayMs: performance.now() - began });
    // Explicitly simulated cleanup grace, informed by the separate black-box
    // measurements. SIGSTOP here is process pause, not actual system sleep.
    setTimeout(() => { report.events.push({ phase: "simulated-cleanup-ended" }); resolve(); }, 2000);
   }, 150);
   setTimeout(() => {
    const id = budget.reserve(0, "refresh"); budget.started(id); budget.record(id);
    const age = budget.lastMono - budget.origin - budget.state.queries[source].requestElapsedMs;
    report.events.push({ phase: "refresh-timer", plannedDelayMs: TIMING.offline.refreshTargetMs, actualDelayMs: performance.now() - began });
    report.sourceMonotonicAgeMs = age;
    report.sourceWallAgeMs = budget.last - budget.state.queries[source].requestAt;
    report.monotonicWindow = { minMs: TIMING.offline.refreshMinMs, maxMs: TIMING.offline.refreshMaxMs };
    try { budget.attempt(id); report.guardRejected = false; }
    catch { report.guardRejected = true; report.rejectionDirection = age < TIMING.offline.refreshMinMs ? "early" : age > TIMING.offline.refreshMaxMs ? "late" : "other"; }
    report.simulatedBlockedAttempts = budget.state.blockedAttempts;
    report.noHttpAfterTimingRejection = budget.state.queries[id].attempts === 0;
   }, TIMING.offline.refreshTargetMs);
   process.send({ status: "phase", mode: "timer-pause", phase: "pause-ready" });
  });
 } finally { budget.close(); }
 return report;
}

async function worker(mode) {
 assert.ok(CASES.includes(mode));
 if (mode === "timer-pause") return pausedTimers();
 const { query, resolveSettings, AbortError } = await import("@anthropic-ai/claude-agent-sdk");
 let runQuery = query, observer;
 const { accountEvidence, warmingRuntime, preflightRuntime } = await import("../src/cache-warming.ts");
 const { makePromptStream, userMessage } = await import("../src/prompt-stream.ts");
 const { createToolServer } = await import("../src/mcp-server.ts");
 const report = { mode, sdkStarts: 0, modelHttpAttempts: 0, forwarded: 0, toolCalls: 0, completedProviderResponses: 0 };
 const prompt = makePromptStream(), controller = new AbortController();
 const filler = Array.from({ length: 600 }, (_, i) => `Synthetic inert record ${i}: amber quartz beside blue cedar; no instructions or real information.`).join("\n");
 const text = `${filler}\nReply only K.`;
 let q, abortTimer, fallbackTimer, abortedAt, settled = false;
 const scheduleAbort = () => {
  assert.equal(abortTimer, undefined); report.requestObserved = true;
  process.send({ status: "phase", mode, phase: "response-held", sdkStarts: 1, modelHttpAttempts: report.modelHttpAttempts });
  abortTimer = setTimeout(() => {
   abortedAt = performance.now(); report.abortIssued = true; controller.abort();
   process.send({ status: "phase", mode, phase: "abort-issued", sdkStarts: 1, modelHttpAttempts: report.modelHttpAttempts });
   if (mode === "stream-abort-close") { report.explicitClose = true; q.close(); }
   fallbackTimer = setTimeout(() => {
    if (!settled) { report.pendingAfterAbortMs = performance.now() - abortedAt; report.fallbackClose = true; q.close(); }
   }, 5000);
  }, 100);
 };
 const server = createServer(async (req, res) => {
  try {
   if (req.method === "HEAD") { res.writeHead(200).end(); return; }
   assert.equal(req.method, "POST"); assert.equal(new URL(req.url, "http://localhost").pathname, "/v1/messages");
   assert.equal(req.headers["x-api-key"], KEY); assert.equal(req.headers.authorization, undefined);
   assert.equal(++report.modelHttpAttempts, 1, "additional model request refused");
   const chunks = []; let size = 0;
   for await (const chunk of req) { size += chunk.length; assert.ok(size <= 2_000_000); chunks.push(chunk); }
   const body = JSON.parse(Buffer.concat(chunks));
   assert.equal(body.model, "claude-sonnet-5-5"); assert.equal(body.max_tokens, 128);
   assert.ok(!body.thinking || body.thinking.type === "disabled");
   assert.deepEqual(body.tools.map(tool => tool.name), ["mcp__custom-tools__sentinel"]);
   // Hold all response bytes, matching the live observer's buffered-response
   // boundary. Request is loopback only; no upstream request exists.
   scheduleAbort();
  } catch { report.transportRefused = true; controller.abort(); q?.close(); res.destroy(); }
 });
 const mcp = createToolServer("custom-tools", [{ name: "sentinel", description: `Inert synthetic sentinel.\n${filler}`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false }, handler: async () => { report.toolCalls++; throw Error("tool execution refused"); } }]);
 await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
 try {
  if (mode === "observer-stream-abort") {
   const { observeSdk, hash } = await import("./lib/five-expiry-transport.mjs");
   report.syntheticAccountGate = true;
   observer = await observeSdk({ offline: true, stageOfQuery: () => "seed", deadlineAt: Date.now() + 15_000,
    evidenceAccount(account) { const evidence = accountEvidence(account); report.actualAccountEligible ??= evidence.eligible; return evidence; },
    async preflight(options, resolve) { const runtime = warmingRuntime(await resolve({ cwd: options.cwd, settingSources: [] }), options.settings); assert.ok(preflightRuntime(runtime).ok); return hash(runtime); },
    onFatal() { report.observerFatal = true; },
    async rpc(operation, fields) {
     if (operation === "reserve") return 0;
     if (operation === "started") return;
     if (operation === "attempt") { assert.equal(++report.modelHttpAttempts, 1); return { wallMs: Date.now(), elapsedMs: performance.now() }; }
     if (operation === "observe") {
      if (fields.evidence.stage === "wire") scheduleAbort();
      // Park before any provider-response evidence or bytes reach the SDK.
      // This is an offline RPC stall, not a live upstream impersonation.
      if (fields.evidence.stage === "response-observation") await new Promise(() => {});
      return;
     }
     throw Error("unexpected offline operation");
    } });
   runQuery = (await import("@anthropic-ai/claude-agent-sdk")).query;
  }
  const options = { cwd: process.env.HOME, model: "claude-sonnet-5-5", tools: [], strictMcpConfig: true, settingSources: [],
   permissionMode: "bypassPermissions", allowDangerouslySkipPermissions: true, verbatimPrompts: true,
   thinking: { type: "disabled" }, includePartialMessages: true, maxTurns: 1, promptSuggestions: false, hooks: {},
   settings: { disableAllHooks: true, autoMemoryEnabled: false, includeGitInstructions: false, claudeMdExcludes: ["/**"], enabledPlugins: { "cc-plugin-agents-md@builtin": false } },
   systemPrompt: "Synthetic diagnostic. Otherwise reply only K. Never call the inert sentinel.", mcpServers: { "custom-tools": mcp },
   env: { ...process.env, ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`, ANTHROPIC_API_KEY: KEY,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", ENABLE_CLAUDEAI_MCP_SERVERS: "0", DISABLE_AUTO_COMPACT: "1",
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: "128", CLAUDE_CODE_MAX_RETRIES: "0" }, abortController: controller, stderr: () => {} };
  assert.ok(preflightRuntime(warmingRuntime(await resolveSettings({ cwd: options.cwd, settingSources: [] }), options.settings)).ok);
  report.sdkStarts++; q = runQuery({ prompt: mode === "string-abort" ? text : prompt.stream, options });
  const gateEligible = accountEvidence(await q.accountInfo()).eligible;
  report.accountEligible = mode === "observer-stream-abort" ? report.actualAccountEligible : gateEligible;
  assert.equal(report.accountEligible, false, "fake key must never qualify");
  if (mode !== "string-abort") void prompt.push(userMessage(text)).catch(() => {});
  try {
   for await (const message of q) if (message.type === "system" && message.subtype === "init") report.cliVersion = message.claude_code_version;
   report.iteratorOutcome = "ended";
  } catch (error) { report.iteratorOutcome = error instanceof AbortError ? "abort-error" : "error"; }
  settled = true; report.iteratorSettledAfterAbortMs = abortedAt === undefined ? null : performance.now() - abortedAt;
 } finally {
  clearTimeout(abortTimer); clearTimeout(fallbackTimer); controller.abort(); q?.close();
  prompt.fail(Error("offline diagnosis ended"));
  const began = performance.now(); await prompt.stream.return(); report.promptCleanupMs = performance.now() - began;
  await mcp.instance.close(); await observer?.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
 }
 return report;
}

async function main() {
 assert.deepEqual(process.argv.slice(2), ["--offline"]);
 const root = mkdtempSync(join(tmpdir(), "five-timing-offline-")), rows = [];
 let stopActive, halted = false;
 const halt = () => { halted = true; stopActive?.(); };
 process.on("SIGTERM", halt); process.on("SIGINT", halt);
 try {
  for (const mode of CASES) {
   assert.equal(halted, false);
   const home = join(root, mode); mkdirSync(home, { mode: 0o700 }); mkdirSync(join(home, ".claude"), { mode: 0o700 });
   const row = await new Promise((resolve, reject) => {
    if (mode !== "timer-pause") sdkStartReservations++;
    const child = fork(fileURLToPath(import.meta.url), [], { execArgv: ["--import", "tsx", "--experimental-test-module-mocks"], detached: true, silent: true,
     env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, HOME: home, CLAUDE_CONFIG_DIR: join(home, ".claude"), ANTHROPIC_API_KEY: KEY } });
    let received, pauseTimer, paused = false;
    const stop = () => { clearTimeout(pauseTimer); try { process.kill(-child.pid, "SIGKILL"); } catch {} };
    const timer = setTimeout(() => { stopActive = undefined; stop(); reject(Error("offline diagnostic deadline")); }, 20_000);
    stopActive = () => { stopActive = undefined; clearTimeout(timer); stop(); reject(Error("offline diagnostic cancelled")); };
    child.stdout.on("data", () => {}); child.stderr.on("data", () => {});
    child.on("message", message => {
     received = message;
     if (mode === "timer-pause" && message.phase === "pause-ready") {
      assert.equal(paused, false); paused = true; process.kill(-child.pid, "SIGSTOP");
      pauseTimer = setTimeout(() => { try { process.kill(-child.pid, "SIGCONT"); } catch {} }, 6100);
     }
    });
    child.on("error", () => { stopActive = undefined; clearTimeout(timer); stop(); reject(Error("offline worker start failed")); });
    child.on("exit", code => { stopActive = undefined; clearTimeout(timer); stop(); if (code === 0 && received?.status === "measured") resolve(received.row); else reject(Error("offline worker refused")); });
    child.send({ mode });
   });
   rows.push(row);
   console.log(JSON.stringify({ status: "offline-stage-complete", row })); // retain earlier measurements if a later case refuses
  }
  assert.equal(halted, false);
  console.log(JSON.stringify({ status: "offline-diagnostic", sdkStartReservations, forwarded: 0, expiryProven: false, productionChanged: false, rows }));
 } finally { stopActive?.(); process.off("SIGTERM", halt); process.off("SIGINT", halt); rmSync(root, { recursive: true, force: true }); }
}
if (process.send) process.once("message", async message => {
 try { const row = await worker(message.mode); process.send({ status: "measured", row }); process.disconnect(); }
 catch { process.send({ status: "refused" }); process.exitCode = 1; process.disconnect(); }
});
else try { await main(); } catch { console.error(JSON.stringify({ status: "refused", sdkStartReservations, forwarded: 0, reason: "offline arguments, fixture or deadline refused" })); process.exitCode = 1; }
