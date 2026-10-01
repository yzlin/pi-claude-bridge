#!/usr/bin/env node
// Readiness imports no SDK. A sealed allocation can never restart.
import { fork, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync, existsSync, mkdtempSync, openSync, writeSync, writeFileSync, closeSync, fsyncSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { APPROVAL, ARMS, FiveOwner, parseArgs, validateApproval } from "./lib/five-expiry-v2-owner.mjs";
import { startAwake } from "./lib/five-expiry-v2-awake.mjs";
import { guardOrdinaryEnvironment } from "./lib/native-cache-account-probe-owner.mjs";
import { syntheticArm, ordinaryArm, armProjectDirs } from "./qualify-native-cache-warming.mjs";
const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const markerPath = join(repo, "diag/five-expiry-v2.approved.json"), liveLedger = join(repo, "diag/five-expiry-v2.live");
export function codeHash() {
 const files = ["diag/probe-five-expiry-v2.mjs", "diag/lib/five-expiry-v2-owner.mjs", "diag/lib/five-expiry-v2-worker.mjs", "diag/lib/five-expiry-v2-transport.mjs", "diag/lib/five-expiry-v2-awake.mjs",
  "diag/lib/native-cache-qualification-budget.mjs", "diag/lib/native-cache-account-probe-owner.mjs", "diag/qualify-native-cache-warming.mjs",
  "package.json", "package-lock.json", ...readdirSync(join(repo, "src")).filter(name => name.endsWith(".ts")).map(name => `src/${name}`)];
 const hash = createHash("sha256"); for (const file of files.sort()) hash.update(file).update("\0").update(readFileSync(join(repo, file))).update("\0"); return hash.digest("hex");
}
export async function runOfflineControlHitFixture() { guardOrdinaryEnvironment(process.env); return run(true, "control-hit"); }
export async function runOfflineAccountChangeFixture() { guardOrdinaryEnvironment(process.env); return run(true, "account-change"); }
export async function runOfflineAwakeLossFixture() { guardOrdinaryEnvironment(process.env); return run(true, "awake-loss"); }
export async function runOfflinePauseFixture() { guardOrdinaryEnvironment(process.env); return run(true, "pause"); }
async function run(offline, offlineFault) {
 if (offlineFault !== undefined && (!offline || !["control-hit", "account-change", "awake-loss", "pause"].includes(offlineFault))) throw Error("offline fault refused");
 if (!offline) { validateApproval(markerPath, codeHash()); if (existsSync(liveLedger)) throw Error("allocation exists"); }
 const root = mkdtempSync(join(tmpdir(), offline ? "five-expiry-offline-" : "native-qualification-synthetic-"));
 const ledger = offline ? join(root, "ledger") : liveLedger, owner = new FiveOwner(ledger, { offline });
 const evidenceFd = openSync(join(ledger, "evidence.jsonl"), "wx", 0o600), children = new Set(), timers = new Set(), rows = [];
 let stopped = false, accountFingerprint, accountLane;
 let awake = offline ? { assertAlive() { if (offlineFault === "awake-loss") throw Error("offline awake loss"); }, assert() { this.assertAlive(); return { simulated: true }; }, async close() {} } : undefined;
 function stop() { stopped = true; for (const child of children) child.kill(); }
 function check() {
  if (stopped) throw Error("supervisor stopped"); owner.check();
  try { awake?.assertAlive(); } catch { owner.deny("awake-loss"); }
 }
 function inspectAwake() {
  try { awake.assert(); owner.check(); } catch { owner.deny("awake-assertion"); }
 }
 function evidence(value) {
  try {
   const bytes = Buffer.from(JSON.stringify({ mode: offline ? "offline-simulation" : "live", ...value }) + "\n");
   let offset = 0; while (offset < bytes.length) { const count = writeSync(evidenceFd, bytes, offset); if (!count) throw Error(); offset += count; } fsyncSync(evidenceFd);
  } catch { stop(); throw Error("evidence persistence refused"); }
 }
 const watchdog = setInterval(() => { try { check(); } catch { stop(); } }, 100), deadline = setTimeout(stop, APPROVAL.elapsedMs);
 process.on("SIGTERM", stop); process.on("SIGINT", stop);
 function launch(arm) {
  check(); inspectAwake(); const layout = offline ? syntheticArm(root, arm.id, true) : ordinaryArm(root, arm.id);
  if (offline) writeFileSync(join(layout.env.CLAUDE_CONFIG_DIR, "settings.json"), JSON.stringify({ env: {
   MAX_THINKING_TOKENS: "2048", CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "80", CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
  } }), { mode: 0o600 });
  const child = fork(join(repo, "diag/lib/five-expiry-v2-worker.mjs"), [], { cwd: repo, env: layout.env,
   execArgv: ["--experimental-test-module-mocks", "--import", "tsx"], stdio: ["ignore", "ignore", "ignore", "ipc"], detached: true });
  const result = Promise.withResolvers(), ready = Promise.withResolvers(), exited = Promise.withResolvers(), owned = new Set();
  result.promise.catch(() => {}); ready.promise.catch(() => {});
  let closed = false, received = false, sourceReady = false, killTimer;
  const reject = () => { result.reject(Error("worker refused")); ready.reject(Error("worker refused")); };
  const api = { exited: exited.promise, result: result.promise, ready: ready.promise, kill() {
   if (closed) return; closed = true; reject();
   try { process.kill(-child.pid, "SIGTERM"); } catch {}
   killTimer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 1500);
  } }; children.add(api);
  child.on("message", message => {
   try {
    if (message.type !== "budget" || message.operation !== "attempt") check();
    if (closed || stopped) throw Error("worker closed");
    if (message.type === "budget") {
     let value;
     if (message.operation === "reserve") { inspectAwake(); value = owner.reserve(arm.id, message.stage); owned.add(value); }
     else {
      if (!owned.has(message.id)) throw Error("unowned query");
      if (message.operation === "started") { inspectAwake(); value = owner.started(message.id); }
      else if (message.operation === "attempt") { value = owner.attempt(message.id); inspectAwake(); }
      else if (message.operation === "forwarded") { inspectAwake(); if (offline) throw Error("offline forwarding refused"); value = owner.forwarded(message.id); }
      else if (message.operation === "tool-called") value = owner.toolCalled(message.id, message.toolUseHash);
      else if (message.operation === "tool-result") value = owner.toolResult(message.id, message.toolUseHash);
      else if (message.operation === "clock") { owner.record(message.id); value = { elapsedMs: owner.lastMono - owner.origin }; }
      else if (message.operation === "validated") {
       value = owner.validated(message.id, message.validation);
       evidence({ model: arm.model, armId: arm.id, query: message.id, validatedStage: { stage: owner.state.queries[message.id].stage, validation: message.validation, rows: message.rows } });
      } else if (message.operation === "observe") {
       if (!["phase", "account", "wire", "response-status", "response-observation", "response"].includes(message.evidence?.stage)) throw Error("unknown observation");
       if (message.evidence.stage === "phase" && !["query-start", "timeout", "query-cleanup"].includes(message.evidence.phase)) throw Error("phase refused");
       if (message.evidence.stage === "account") {
        inspectAwake();
        const snapshot = message.evidence;
        if (!snapshot.eligible || !snapshot.settingsRevalidated || !/^[a-f0-9]{64}$/.test(snapshot.accountFingerprint)) throw Error("account evidence refused");
        accountFingerprint ??= snapshot.accountFingerprint; accountLane ??= snapshot.accountLane;
        if (snapshot.accountFingerprint !== accountFingerprint || snapshot.accountLane !== accountLane) throw Error("comparison account changed");
       }
       if (message.evidence.stage === "response") owner.responded(message.id, message.evidence.provider);
       evidence({ model: arm.model, armId: arm.id, query: message.id, observation: message.evidence });
      } else throw Error("unknown operation");
     }
     child.send({ type: "budget-result", requestId: message.requestId, ok: true, value });
    } else if (message.type === "source-ready") {
     if (sourceReady || message.armId !== arm.id || !owner.state.queries.find(query => query.arm === arm.id && query.stage === "tool")?.validation) throw Error("source readiness refused");
     sourceReady = true; ready.resolve();
     if (offline && offlineFault === "pause" && arm.id === 0) {
      evidence({ injectedProcessPause: true });
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5200);
      check();
     }
    } else if (message.type === "result") {
     const row = message.value;
     if (received || !sourceReady || row?.model !== arm.model || row.armId !== arm.id || row.comparison !== arm.comparison || row.warmed !== arm.warmed
      || row.status !== (offline ? "offline-simulation" : "candidate-pass") || row.productionChanged !== false || row.expiryProven !== false
      || row.sourceToolCalls !== 1 || row.refreshToolCalls !== 0 || row.rows?.length !== (arm.warmed ? 5 : 4)
      || (arm.warmed && (row.sourceUnchanged !== true || row.noPersistedFork !== true))) throw Error("result refused");
     evidence({ row }); received = true; result.resolve(row);
    } else {
     if (message.type === "failure") evidence({ armId: arm.id, workerFailure: "worker gate or execution refused" });
     throw Error("worker refused");
    }
   } catch { api.kill(); stop(); }
  });
  child.on("error", () => { api.kill(); stop(); if (!child.pid) { clearTimeout(killTimer); exited.resolve(1); } });
  child.on("exit", code => {
   closed = true; clearTimeout(killTimer); try { process.kill(-child.pid, "SIGKILL"); } catch {}
   exited.resolve(code); if (!received || code !== 0) { reject(); stop(); }
  });
  child.send({ type: "init", model: arm.model, armId: arm.id, offline, offlineFault, cwd: layout.cwd, nonce: randomUUID(), deadlineAt: owner.state.startedAt + APPROVAL.elapsedMs });
  const timer = setTimeout(() => { api.kill(); stop(); }, 720_000); timers.add(timer);
  void api.exited.then(() => { clearTimeout(timer); timers.delete(timer); });
  return api;
 }
 try {
  if (!offline) awake = await startAwake(() => { try { owner.deny("awake-loss"); } catch {} stop(); });
  check(); inspectAwake();
  evidence({ status: "started", approval: APPROVAL, codeHash: codeHash(), awake: awake.assert(), productionChanged: false });
  const launched = [];
  // Prepare sources sequentially. Source-relative timers keep other arms idle.
  for (const arm of ARMS) { const worker = launch(arm); launched.push(worker); await worker.ready; check(); }
  for (const worker of launched) { const row = await worker.result; if (await worker.exited !== 0) throw Error("worker exit refused"); check(); rows.push(row); }
  evidence({ status: "complete", rows, sdkStarts: owner.state.sdkStarts, httpAttempts: owner.state.httpAttempts, forwarded: owner.state.forwarded, expiryCandidatePass: !offline, productionChanged: false });
  owner.finish("complete");
  console.log(JSON.stringify({ mode: offline ? "offline-simulation" : "live", status: "complete", ledger, sdkStarts: owner.state.sdkStarts, httpAttempts: owner.state.httpAttempts, observedHttpAttempts: owner.state.observedHttpAttempts, arms: rows.length, productionChanged: false }));
 } catch {
  try { evidence({ status: "failed", sdkStarts: owner.state.sdkStarts, httpAttempts: owner.state.httpAttempts, observedHttpAttempts: owner.state.observedHttpAttempts, forwarded: owner.state.forwarded, refusal: owner.state.refusal ?? null }); } catch {}
  try { owner.finish("failed"); } catch { owner.close(); }
  console.error(JSON.stringify({ status: "refused", ledger, sdkStarts: owner.state.sdkStarts, httpAttempts: owner.state.httpAttempts, observedHttpAttempts: owner.state.observedHttpAttempts })); process.exitCode = 1;
 } finally {
  stop(); clearInterval(watchdog); clearTimeout(deadline); for (const timer of timers) clearTimeout(timer);
  await Promise.all([...children].map(child => child.exited)); await awake?.close(); process.off("SIGTERM", stop); process.off("SIGINT", stop); closeSync(evidenceFd);
  if (!offline) { for (const path of armProjectDirs(root)) execFileSync("trash", [path]); execFileSync("trash", [root]); }
  else for (const name of readdirSync(root).filter(name => /^arm-\d+$/.test(name))) rmSync(join(root, name), { recursive: true, force: true });
 }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))) try {
 const mode = parseArgs(process.argv.slice(2)); guardOrdinaryEnvironment(process.env);
 if (mode === "readiness") console.log(JSON.stringify({ mode, sdkStarts: 0, allocationExists: existsSync(liveLedger), markerRequired: { ...APPROVAL, codeHash: codeHash() }, approvalMarker: markerPath, ledger: liveLedger, arms: ARMS }));
 else await run(mode === "offline");
} catch { console.error(JSON.stringify({ status: "refused", sdkStarts: 0, reason: "arguments, ambient state, approval or allocation refused" })); process.exitCode = 1; }
