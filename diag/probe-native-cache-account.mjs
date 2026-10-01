#!/usr/bin/env node
// Default/readiness never imports SDK or spawns. No live simulations/fallbacks.
import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { guardEnvironment } from "./lib/native-cache-qualification-budget.mjs";
import { syntheticArm } from "./qualify-native-cache-warming.mjs";
import { APPROVAL, guardOrdinaryEnvironment, parseArgs, validateApproval, AccountOwner } from "./lib/native-cache-account-probe-owner.mjs";
import { validateAccount } from "./lib/native-cache-account-probe-observe.mjs";
const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const markerPath = join(repo, "diag/native-cache-account-ordinary.approved.json");
const auditPath = join(repo, "diag/native-cache-account-ordinary.live");
const workerPath = join(repo, "diag/lib/native-cache-account-probe-worker.mjs");
export function codeHash() {
 const files = ["diag/probe-native-cache-account.mjs", "diag/qualify-native-cache-warming.mjs", "diag/lib/native-cache-qualification-budget.mjs",
  ...readdirSync(join(repo, "diag/lib")).filter(f => /^native-cache-account-probe-.*\.mjs$/.test(f)).map(f => `diag/lib/${f}`),
  ...readdirSync(join(repo, "src")).filter(f => f.endsWith(".ts")).map(f => `src/${f}`), "package.json", "package-lock.json",
  "node_modules/@anthropic-ai/claude-agent-sdk/package.json", "node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts"];
 const hash = createHash("sha256");
 for (const file of files.sort()) hash.update(file).update("\0").update(readFileSync(join(repo, file))).update("\0");
 return hash.digest("hex");
}
function sealedDigest(files) {
 const hash = createHash("sha256");
 for (const file of files) hash.update(file).update("\0").update(readFileSync(join(repo, file))).update("\0");
 return hash.digest("hex");
}
export function priorAllocations() {
 const nativeFiles = ["diag/native-cache-qualification.approved.json", "diag/native-cache-qualification.live/events.jsonl", "diag/native-cache-qualification.live/evidence.jsonl"];
 const nativeMarker = JSON.parse(readFileSync(join(repo, nativeFiles[0]), "utf8"));
 const native = JSON.parse(readFileSync(join(repo, nativeFiles[1]), "utf8").trim().split("\n").at(-1));
 const nativeEvidence = JSON.parse(readFileSync(join(repo, nativeFiles[2]), "utf8").trim().split("\n").at(-1));
 if (nativeMarker.id !== "native-cache-40q-40m-v1" || native.approval !== nativeMarker.id || native.status !== "failed"
  || native.reserved !== 1 || native.sdkStarts !== 1 || native.httpAttempts !== 0 || native.forwarded !== 0
  || nativeEvidence.status !== "failed" || nativeEvidence.reserved !== 1 || nativeEvidence.sdkStarts !== 1
  || nativeEvidence.httpAttempts !== 0 || nativeEvidence.forwarded !== 0) throw Error("prior native allocation refused");
 const accountFiles = ["diag/native-cache-account.approved.json", "diag/native-cache-account.live/events.jsonl"];
 const accountMarker = JSON.parse(readFileSync(join(repo, accountFiles[0]), "utf8"));
 const account = JSON.parse(readFileSync(join(repo, accountFiles[1]), "utf8").trim().split("\n").at(-1));
 if (accountMarker.id !== "native-cache-account-1q-60s-v1" || account.approval?.id !== accountMarker.id || account.status !== "complete"
  || account.account?.eligible !== false || account.reserved !== 1 || account.sdkStarts !== 1 || account.invocationUncertain !== false
  || account.blockedHttpAttempts !== 0 || account.modelHttpAttempts !== 0 || account.forwarded !== 0 || account.inputReleased !== 0) throw Error("prior account allocation refused");
 const normalFiles = ["diag/native-cache-account-normal-home.approved.json", "diag/native-cache-account-normal-home.live/events.jsonl"];
 const normalMarker = JSON.parse(readFileSync(join(repo, normalFiles[0]), "utf8"));
 const normal = JSON.parse(readFileSync(join(repo, normalFiles[1]), "utf8").trim().split("\n").at(-1));
 if (normalMarker.id !== "native-cache-account-normal-home-1q-60s-v1" || normal.approval?.id !== normalMarker.id || normal.status !== "complete"
  || normal.account?.eligible !== false || normal.account?.lane !== '["firstParty",null,"none",null]'
  || normal.reserved !== 1 || normal.sdkStarts !== 1 || normal.invocationUncertain !== false
  || normal.blockedHttpAttempts !== 0 || normal.modelHttpAttempts !== 0 || normal.forwarded !== 0 || normal.inputReleased !== 0) throw Error("prior normal-home allocation refused");
 return [
  { id: nativeMarker.id, digest: sealedDigest(nativeFiles), status: "failed", reserved: 1, sdkStarts: 1, modelHttpAttempts: 0, forwarded: 0 },
  { id: accountMarker.id, digest: sealedDigest(accountFiles), status: "complete", eligible: false, reserved: 1, sdkStarts: 1, modelHttpAttempts: 0, forwarded: 0 },
  { id: normalMarker.id, digest: sealedDigest(normalFiles), status: "complete", eligible: false, reserved: 1, sdkStarts: 1, modelHttpAttempts: 0, forwarded: 0 },
 ];
}
function validateNormalHome(parentHome, root) {
 if (typeof parentHome !== "string" || !isAbsolute(parentHome) || resolve(parentHome) !== parentHome || parentHome === resolve("/")
  || (root && (parentHome === root || parentHome.startsWith(root + sep)))) throw Error("normal HOME refused");
 return parentHome;
}
export function accountArm(root, offline, parentEnv = process.env, liveCwd = process.cwd()) {
 if (offline) {
  const arm = syntheticArm(root, 0, true);
  return { ...arm, expectedHome: arm.env.HOME, cleanup: [join(root, "arm-0")] };
 }
 guardOrdinaryEnvironment(parentEnv);
 validateNormalHome(parentEnv.HOME, root);
 if (resolve(liveCwd) !== repo || liveCwd !== repo) throw Error("live cwd refused");
 return { cwd: repo, env: parentEnv, expectedHome: parentEnv.HOME, cleanup: [] };
}
// Explicit test API only: disposable root, marker and tombstone. CLI cannot select it.
export async function runOfflineFixture(fixture) {
 guardEnvironment(process.env);
 if (!fixture || dirname(fixture.root ?? "") !== tmpdir() || !/^native-account-test-/.test(basename(fixture.root))
  || realpathSync(fixture.root) !== realpathSync(tmpdir()) + "/" + basename(fixture.root)
  || !["eligible", "ineligible", "error", "delayed", "http", "sdk", "sdk-hook", "hang", "descendant"].includes(fixture.scenario)
  || ![undefined, "deadline", "worker-deadline", "persistence", "duplicate", "disconnect", "signal", "unsafe"].includes(fixture.fault)) throw Error("offline fixture refused");
 return run(fixture);
}
async function run(fixture) {
 const offline = fixture !== undefined, digest = offline ? fixture.codeHash : codeHash();
 const marker = offline ? join(fixture.root, "approval.json") : markerPath;
 const audit = offline ? join(fixture.root, "audit") : auditPath;
 validateApproval(marker, digest);
 let arm;
 if (!offline) arm = accountArm(undefined, false, process.env, process.cwd());
 let clockExpired = false, persistenceFault = false;
 const owner = new AccountOwner(audit, { codeHash: digest, offline,
  prior: offline ? [
   { id: "native-cache-40q-40m-v1", digest: "0".repeat(64), status: "failed", reserved: 1, sdkStarts: 1, modelHttpAttempts: 0, forwarded: 0 },
   { id: "native-cache-account-1q-60s-v1", digest: "1".repeat(64), status: "complete", eligible: false, reserved: 1, sdkStarts: 1, modelHttpAttempts: 0, forwarded: 0 },
   { id: "native-cache-account-normal-home-1q-60s-v1", digest: "2".repeat(64), status: "complete", eligible: false, reserved: 1, sdkStarts: 1, modelHttpAttempts: 0, forwarded: 0 },
  ] : priorAllocations(),
  now: () => Date.now() + (clockExpired ? APPROVAL.elapsedMs : 0),
  persist: () => { if (persistenceFault) throw Error("offline persistence fault"); } });
 let root, child, exited, server, watchdog, deadline, killTimer, stopped = false, result, failed = false;
 const done = Promise.withResolvers();
 function killGroup(signal) { if (child?.pid) try { process.kill(-child.pid, signal); } catch {} }
 function stop() {
  if (stopped) return;
  stopped = true; killGroup("SIGTERM");
  killTimer = setTimeout(() => killGroup("SIGKILL"), 1000);
  done.resolve();
 }
 const fail = () => { failed = true; stop(); };
 const check = () => { if (stopped) throw Error("stopped"); owner.check(); };
 const onSignal = () => fail();
 process.on("SIGTERM", onSignal); process.on("SIGINT", onSignal);
 try {
  watchdog = setInterval(() => { try { owner.check(); } catch { killGroup("SIGKILL"); fail(); } }, 25);
  // Leave the final second INSIDE the 60s allocation for forced group cleanup.
  deadline = setTimeout(fail, Math.max(0, owner.state.startedAt + APPROVAL.elapsedMs - 1000 - Date.now()));
  root = offline ? fixture.root : undefined;
  if (offline) arm = accountArm(root, true);
  const block = model => { try { owner.blocked(model); } catch {} fail(); };
  server = createServer((req, res) => {
   // Never collect/log headers, bodies, query strings, or URLs. No HTTPS client.
   if (req.method === "HEAD" && !stopped) { req.resume(); res.writeHead(200).end(); return; }
   const model = /^\/v1\/messages(?:\?|$)/.test(req.url ?? "");
   req.resume(); res.writeHead(403).end(); block(model);
  });
  server.on("clientError", (_error, socket) => { socket.destroy(); block(false); });
  server.on("connect", (_req, socket) => { socket.destroy(); block(false); });
  server.on("upgrade", (_req, socket) => { socket.destroy(); block(false); });
  server.on("error", fail);
  await Promise.race([done.promise, new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); })]);
  check();
  const exit = Promise.withResolvers();
  child = fork(workerPath, [], { cwd: arm.cwd, env: arm.env, detached: true,
   execArgv: ["--import", join(repo, "node_modules/tsx/dist/loader.mjs")], stdio: ["ignore", "ignore", "ignore", "ipc"] });
  exited = exit.promise;
  child.on("error", () => { fail(); if (!child.pid) exit.resolve(); });
  child.on("exit", () => { killGroup("SIGKILL"); exit.resolve(); if (!result) fail(); });
  child.on("message", message => {
   try {
    if (message?.type === "started") {
     owner.started();
     if (fixture?.fault === "deadline") clockExpired = true;
     if (fixture?.fault === "signal") process.kill(process.pid, "SIGTERM");
     if (fixture?.fault === "disconnect") child.disconnect();
     return;
    }
    check();
    if (message?.type === "permit") {
     if (!offline && codeHash() !== digest) throw Error("code changed");
     validateApproval(marker, digest);
     if (fixture?.fault === "persistence") persistenceFault = true;
     owner.state.versions = { sdkPackage: "0.3.285", node: process.versions.node, cliRuntime: null };
     owner.state.controls = { settingSources: "default", homeMode: offline ? "synthetic-explicit-config" : "ordinary-parent",
      cwdMode: offline ? "synthetic" : "repo", envMode: offline ? "synthetic" : "ordinary-reviewed",
      preflight: "passed", tools: 0, mcpServers: 0, hooksDisabled: true, autoMemory: false };
     owner.reserve(); // durable fsync BEFORE granting the sole query invocation
     child.send({ type: "permit" });
    } else if (message?.type === "result") {
     if (!owner.state.sdkStarts || message.value?.inputReleased !== 0 || !["complete", "failed"].includes(message.value?.status)) throw Error("result refused");
     result = { status: message.value.status, ...(message.value.account ? { account: validateAccount(message.value.account) } : {}) };
     if (result.status !== "complete" || !result.account) failed = true;
     stop();
    } else throw Error("worker refused");
   } catch { fail(); }
  });
  child.send({ type: "init", offline, cwd: arm.cwd, expectedHome: arm.expectedHome, deadlineAt: fixture?.fault === "worker-deadline" ? Date.now() + 2000 : owner.state.startedAt + APPROVAL.elapsedMs,
   baseUrl: `http://127.0.0.1:${server.address().port}`, ...(offline ? { scenario: fixture.scenario, fault: fixture.fault, root } : {}) });
  await done.promise;
 } catch { fail(); }
 finally {
  stop();
  if (exited) await exited;
  killGroup("SIGKILL"); clearTimeout(killTimer);
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  try {
   for (const path of arm?.cleanup ?? []) rmSync(path, { recursive: true, force: true });
  } catch { failed = true; }
  // No final account success until worker/SDK group, server and synthetic state are closed.
  clearInterval(watchdog); clearTimeout(deadline);
  process.off("SIGTERM", onSignal); process.off("SIGINT", onSignal);
 }
 try {
  owner.check();
 } catch { failed = true; }
 const status = !failed && result?.status === "complete" && owner.state.blockedHttpAttempts === 0 ? "complete" : "failed";
 try { owner.finish(status, status === "complete" ? result.account : undefined); }
 catch { owner.close(); return { ...owner.state, status: "failed", persistenceFailed: true }; }
 return owner.state;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 try {
  const mode = parseArgs(process.argv.slice(2));
  guardOrdinaryEnvironment(process.env); // BEFORE SDK import, allocation or spawn; readiness admits reviewed metadata too
  if (mode === "readiness") console.log(JSON.stringify({ mode, sdkStarts: 0, inputReleased: 0, liveStarted: false,
   approvalMarker: markerPath, audit: auditPath, allocationExists: existsSync(auditPath),
   markerRequired: { ...APPROVAL, codeHash: codeHash(), approvedAt: "integer epoch ms", expiresAt: "integer epoch ms" }, independentAcceptanceRequired: true }));
  else {
   const result = await run(); console.log(JSON.stringify(result));
   if (result.status !== "complete" || !result.account?.eligible) process.exitCode = 1;
  }
 } catch { console.error(JSON.stringify({ status: "refused", sdkStarts: 0, reason: "arguments, ambient state, approval or allocation refused" })); process.exitCode = 1; }
}
