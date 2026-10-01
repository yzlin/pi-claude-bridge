#!/usr/bin/env node
// Readiness never imports SDK or reaches auth. No restart/reset/recovery mode.
import { fork, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync, existsSync, mkdtempSync, openSync, writeSync, writeFileSync, closeSync, fsyncSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { APPROVAL, COHORT, FiveOwner, parseArgs, validateApproval } from "./lib/five-tool-source-v2-owner.mjs";
import { guardOrdinaryEnvironment } from "./lib/native-cache-account-probe-owner.mjs";
import { syntheticArm, ordinaryArm, armProjectDirs } from "./qualify-native-cache-warming.mjs";
const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const markerPath = join(repo, "diag/five-tool-source-v2.approved.json"), liveLedger = join(repo, "diag/five-tool-source-v2.live");
export function codeHash() {
 const files = ["diag/probe-five-tool-source-v2.mjs", "diag/lib/five-tool-source-v2-owner.mjs", "diag/lib/five-tool-source-v2-worker.mjs",
  "diag/lib/five-tool-source-v2-transport.mjs", "diag/lib/native-cache-qualification-budget.mjs", "diag/lib/native-cache-account-probe-owner.mjs", "diag/qualify-native-cache-warming.mjs",
  "package.json", "package-lock.json", ...readdirSync(join(repo, "src")).filter(n => n.endsWith(".ts")).map(n => `src/${n}`)];
 const digest = createHash("sha256"); for (const file of files.sort()) digest.update(file).update("\0").update(readFileSync(join(repo, file))).update("\0"); return digest.digest("hex");
}
export async function runOfflineTruncationFixture() { guardOrdinaryEnvironment(process.env); return run(true, "tool-truncation"); }
async function run(offline, offlineFault) {
 if (offlineFault !== undefined && (!offline || offlineFault !== "tool-truncation")) throw Error("offline fault refused");
 if (!offline) { validateApproval(markerPath, codeHash()); if (existsSync(liveLedger)) throw Error("allocation already exists"); }
 const root = mkdtempSync(join(tmpdir(), offline ? "five-cache-offline-run-" : "native-qualification-synthetic-"));
 const ledger = offline ? join(root, "ledger") : liveLedger, owner = new FiveOwner(ledger, { offline });
 const evidenceFd = openSync(join(ledger, "evidence.jsonl"), "wx", 0o600);
 const rows = [], children = new Set(); let stopped = false;
 const evidence = value => {
  try {
   const bytes = Buffer.from(JSON.stringify({ mode: offline ? "offline-simulation" : "live", ...value }) + "\n");
   let offset = 0; while (offset < bytes.length) { const n = writeSync(evidenceFd, bytes, offset); if (!n) throw Error(); offset += n; } fsyncSync(evidenceFd);
  } catch { stop(); throw Error("evidence persistence refused"); }
 };
 function stop() { stopped = true; for (const child of children) child.kill(); }
 function check() { if (stopped) throw Error("supervisor stopped"); owner.check(); }
 const watchdog = setInterval(() => { try { check(); } catch { stop(); } }, 100);
 const timer = setTimeout(stop, APPROVAL.elapsedMs), signal = () => stop();
 process.on("SIGTERM", signal); process.on("SIGINT", signal);
 function arm(model, index) {
  check(); const layout = offline ? syntheticArm(root, index, true) : ordinaryArm(root, index);
  // Exercise the admitted real-settings env profile, using synthetic values only.
  if (offline) writeFileSync(join(layout.env.CLAUDE_CONFIG_DIR, "settings.json"), JSON.stringify({ env: {
   MAX_THINKING_TOKENS: "2048", CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "80", CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
  } }), { mode: 0o600 });
  const child = fork(join(repo, "diag/lib/five-tool-source-v2-worker.mjs"), [], { cwd: repo, env: layout.env,
   execArgv: ["--experimental-test-module-mocks", "--import", "tsx"], stdio: ["ignore", "ignore", "ignore", "ipc"], detached: true });
  const result = Promise.withResolvers(), exited = Promise.withResolvers(), owned = new Set(); let closed = false, received = false, killTimer;
  const api = { exited: exited.promise, kill() {
   if (closed) return; closed = true;
   try { process.kill(-child.pid, "SIGTERM"); } catch {}
   killTimer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 1500);
   result.reject(Error("worker refused"));
  } }; children.add(api);
  child.on("message", message => {
   try {
    check();
    if (message.type === "budget") {
     let value;
     if (message.operation === "reserve") { value = owner.reserve(model, message.stage); owned.add(value); }
     else {
      if (!owned.has(message.id)) throw Error("unowned query");
      if (message.operation === "started") value = owner.started(message.id);
      else if (message.operation === "attempt") value = owner.attempt(message.id);
      else if (message.operation === "forwarded") { if (offline) throw Error("offline forwarding forbidden"); value = owner.forwarded(message.id); }
      else if (message.operation === "tool-called") value = owner.toolCalled(message.id, message.toolUseHash);
      else if (message.operation === "tool-result") value = owner.toolResult(message.id, message.toolUseHash);
      else if (message.operation === "observe") {
       if (!["account", "wire", "response-status", "response-observation", "response"].includes(message.evidence?.stage)) throw Error("unknown observation");
       if (message.evidence.stage === "response") owner.responded(message.id, message.evidence.provider);
       evidence({ model, query: message.id, observation: message.evidence });
      } else throw Error("unknown budget operation");
     }
     child.send({ type: "budget-result", requestId: message.requestId, ok: true, value });
    } else if (message.type === "result") {
     assertResult(message.value, model, offline); evidence({ row: message.value }); received = true; result.resolve(message.value);
    } else {
     if (offline && message.type === "failure") evidence({ offlineFailure: message.reason });
     throw Error("worker refused");
    }
   } catch { api.kill(); stop(); }
  });
  child.on("error", () => { api.kill(); stop(); if (!child.pid) { clearTimeout(killTimer); exited.resolve(1); } });
  child.on("exit", code => {
   if (!received || code !== 0) { api.kill(); stop(); }
   clearTimeout(killTimer); try { process.kill(-child.pid, "SIGKILL"); } catch {} exited.resolve(code);
  });
  child.send({ type: "init", model, offline, offlineFault, cwd: layout.cwd, nonce: randomUUID(), deadlineAt: owner.state.startedAt + APPROVAL.elapsedMs });
  return { ...api, result: result.promise };
 }
 try {
  evidence({ status: "started", approval: APPROVAL, codeHash: codeHash(), productionChanged: false });
  for (const [index, model] of COHORT.entries()) {
   const worker = arm(model, index); const timeout = setTimeout(() => { worker.kill(); stop(); }, 250_000);
   try { const row = await worker.result; if (await worker.exited !== 0) throw Error("worker exit refused"); check(); rows.push(row); } finally { clearTimeout(timeout); }
  }
  evidence({ status: "complete", rows, sdkStarts: owner.state.sdkStarts, httpAttempts: owner.state.httpAttempts, forwarded: owner.state.forwarded,
   expiryProven: false, toolSourceProven: false, productionChanged: false });
  owner.finish("complete"); console.log(JSON.stringify({ mode: offline ? "offline-simulation" : "live", status: "complete", ledger, sdkStarts: owner.state.sdkStarts, httpAttempts: owner.state.httpAttempts, rows: rows.map(r => ({ model: r.model, status: r.status, rows: r.rows.map(({ stage, usage }) => ({ stage, usage })) })), productionChanged: false }));
 } catch {
  try { evidence({ status: "failed", sdkStarts: owner.state.sdkStarts, httpAttempts: owner.state.httpAttempts, forwarded: owner.state.forwarded }); } catch {}
  try { owner.finish("failed"); } catch { owner.close(); }
  console.error(JSON.stringify({ status: "refused", ledger, sdkStarts: owner.state.sdkStarts, httpAttempts: owner.state.httpAttempts })); process.exitCode = 1;
 } finally {
  stop(); clearInterval(watchdog); clearTimeout(timer); await Promise.all([...children].map(c => c.exited));
  process.off("SIGTERM", signal); process.off("SIGINT", signal); closeSync(evidenceFd);
  if (!offline) { for (const path of armProjectDirs(root)) execFileSync("trash", [path]); execFileSync("trash", [root]); }
  // Offline ledger retained for inspection, but transient source prompts/config removed.
  else for (const name of readdirSync(root).filter(n => /^arm-\d+$/.test(n))) rmSync(join(root, name), { recursive: true, force: true });
 }
}
function assertResult(row, model, offline) {
 if (row?.model !== model || row.productionChanged !== false || row.expiryProven !== false || row.toolSourceProven !== false
  || row.sourceUnchanged !== true || row.sourceToolCalls !== 1 || row.refreshToolCalls !== 0 || row.rows?.length !== 5 || ![offline ? "offline-simulation" : "candidate-pass", "cache-miss"].includes(row.status)) throw Error("invalid result");
}
if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))) try {
 const mode = parseArgs(process.argv.slice(2)); guardOrdinaryEnvironment(process.env);
 if (mode === "readiness") console.log(JSON.stringify({ mode, sdkStarts: 0, allocationExists: existsSync(liveLedger), markerRequired: { ...APPROVAL, codeHash: codeHash() }, approvalMarker: markerPath, ledger: liveLedger, cohort: COHORT }));
 else await run(mode === "offline");
} catch { console.error(JSON.stringify({ status: "refused", sdkStarts: 0, reason: "arguments, ambient state, approval or allocation refused" })); process.exitCode = 1; }
