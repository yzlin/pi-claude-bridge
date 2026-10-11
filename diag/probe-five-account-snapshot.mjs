#!/usr/bin/env node
// Public SDK only. One start, withheld input, reject-only HTTP, no auth workaround.
import { fork, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APPROVAL, AccountOwner, guardOrdinaryEnvironment, parseArgs, validateApproval } from "./lib/five-account-snapshot-owner.mjs";
import { safeAccount } from "./lib/native-cache-account-probe-observe.mjs";
import { ordinaryArm, syntheticArm, armProjectDirs } from "./qualify-native-cache-warming.mjs";
const self = fileURLToPath(import.meta.url), repo = dirname(dirname(self));
const marker = join(repo, "diag/five-account-snapshot-v1.approved.json"), ledger = join(repo, "diag/five-account-snapshot-v1.live");
export function codeHash() {
 const files = ["diag/probe-five-account-snapshot.mjs", "diag/lib/five-account-snapshot-owner.mjs", "diag/lib/native-cache-account-probe-owner.mjs", "diag/lib/native-cache-account-probe-observe.mjs", "diag/lib/native-cache-qualification-budget.mjs", "diag/qualify-native-cache-warming.mjs", "package.json", "package-lock.json", "node_modules/@anthropic-ai/claude-agent-sdk/package.json", "node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs", ...readdirSync(join(repo, "src")).filter(f => f.endsWith(".ts")).map(f => `src/${f}`)];
 const h = createHash("sha256"); for (const file of files.sort()) h.update(file).update("\0").update(readFileSync(join(repo, file))).update("\0"); return h.digest("hex");
}
function prior() {
 return ["v1", "v2"].map(version => {
  const files = [`diag/five-cache-${version}.approved.json`, `diag/five-cache-${version}.live/events.jsonl`, `diag/five-cache-${version}.live/evidence.jsonl`];
  const h = createHash("sha256"); for (const file of files) h.update(file).update("\0").update(readFileSync(join(repo, file))).update("\0");
  return { version, digest: h.digest("hex") };
 }).concat(["terminal-v1"].map(version => {
  const files = ["diag/five-account-terminal-v1.approved.json", "diag/five-account-terminal-v1.live/events.jsonl"];
  const h = createHash("sha256"); for (const file of files) h.update(file).update("\0").update(readFileSync(join(repo, file))).update("\0");
  return { version, digest: h.digest("hex") };
 }));
}
export async function observeSnapshots(q, warming, emit) {
 const initial = safeAccount(warming, await q.accountInfo());
 emit("initial", initial);
 const fresh = safeAccount(warming, (await q.reinitialize()).account);
 emit("fresh", fresh);
 const cached = safeAccount(warming, await q.accountInfo());
 emit("cached", cached);
 return { initial, fresh, cached };
}
async function run(offline) {
 const digest = codeHash(); if (!offline) { validateApproval(marker, digest); if (existsSync(ledger)) throw Error("allocation exists"); }
 const root = mkdtempSync(join(tmpdir(), offline ? "five-account-offline-" : "native-qualification-synthetic-"));
 const path = offline ? join(root, "ledger") : ledger, before = offline ? [] : prior();
 const owner = new AccountOwner(path, { offline, codeHash: digest, prior: before });
 let child, server, exited, result, stopped = false, failed = false, killTimer;
 const done = Promise.withResolvers();
 const killGroup = signal => { if (child?.pid) try { process.kill(-child.pid, signal); } catch {} };
 function stop() { if (stopped) return; stopped = true; killGroup("SIGTERM"); killTimer = setTimeout(() => killGroup("SIGKILL"), 750); done.resolve(); }
 function fail() { failed = true; stop(); }
 const onSignal = () => fail(); process.on("SIGINT", onSignal); process.on("SIGTERM", onSignal);
 const watch = setInterval(() => { try { owner.check(); } catch { killGroup("SIGKILL"); fail(); } }, 25);
 const timeout = setTimeout(fail, Math.max(0, owner.state.startedAt + APPROVAL.elapsedMs - 1000 - Date.now()));
 try {
  const layout = offline ? syntheticArm(root, 0, true) : ordinaryArm(root, 0);
  if (offline) writeFileSync(join(layout.env.CLAUDE_CONFIG_DIR, "settings.json"), JSON.stringify({ env: {
   MAX_THINKING_TOKENS: "2048", CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "80", CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
  } }), { mode: 0o600 });
  server = createServer((req, res) => {
   req.resume(); if (req.method === "HEAD" && !stopped) { res.writeHead(200).end(); return; }
   // No header/body collection and no upstream implementation, even on failure.
   try { owner.blocked(/^\/q\/0\/v1\/messages(?:\?|$)/.test(req.url ?? "")); } catch {}
   res.writeHead(403).end(); fail();
  });
  for (const event of ["connect", "upgrade", "clientError"]) server.on(event, (_value, socket) => { socket.destroy(); try { owner.blocked(false); } catch {} fail(); });
  server.on("error", fail);
  await Promise.race([done.promise, new Promise((ok, no) => { server.once("error", no); server.listen(0, "127.0.0.1", ok); })]);
  owner.check(); if (stopped) throw Error("stopped");
  const exit = Promise.withResolvers();
  child = fork(self, [], { cwd: repo, env: layout.env, detached: true, execArgv: ["--import", join(repo, "node_modules/tsx/dist/loader.mjs")], stdio: ["ignore", "ignore", "ignore", "ipc"] }); exited = exit.promise;
  child.on("error", () => { fail(); if (!child.pid) exit.resolve(); });
  child.on("exit", () => { killGroup("SIGKILL"); exit.resolve(); if (!result) fail(); });
  child.on("message", message => {
   try {
    if (message?.type === "started") { owner.started(); return; }
    owner.check(); if (stopped) throw Error("stopped");
    if (message?.type === "permit") {
     if (codeHash() !== digest) throw Error("code changed"); if (!offline) validateApproval(marker, digest);
     owner.reserve(); child.send({ type: "permit" });
    } else if (message?.type === "snapshot") {
     owner.snapshot(message.stage, message.account);
    } else if (message?.type === "result") {
     if (owner.state.sdkStarts !== 1 || message.inputReleased !== 0
      || Object.keys(owner.state.snapshots).length !== 3
      || JSON.stringify(message.snapshots) !== JSON.stringify(owner.state.snapshots)) throw Error("result refused");
     result = owner.state.snapshots; stop();
    } else throw Error("worker refused");
   } catch { fail(); }
  });
  child.send({ type: "init", offline, cwd: layout.cwd, expectedHome: layout.env.HOME, baseUrl: `http://127.0.0.1:${server.address().port}/q/0`, nonce: randomUUID(), deadlineAt: owner.state.startedAt + APPROVAL.elapsedMs });
  await done.promise;
 } catch { failed = true; stop(); }
 finally {
  stop(); if (exited) await exited; clearTimeout(killTimer); clearTimeout(timeout); clearInterval(watch);
  process.off("SIGINT", onSignal); process.off("SIGTERM", onSignal);
  if (server) { server.closeAllConnections(); await new Promise(ok => server.close(ok)); }
  if (!offline && JSON.stringify(prior()) !== JSON.stringify(before)) failed = true;
  owner.finish(failed || !result ? "failed" : "complete");
  // Same scoped cleanup as v2, only after its detached SDK group has exited.
  if (!offline) { for (const dir of armProjectDirs(root)) execFileSync("trash", [dir]); execFileSync("trash", [root]); }
  else rmSync(join(root, "arm-0"), { recursive: true, force: true });
 }
 console.log(JSON.stringify({ mode: offline ? "offline" : "live", status: owner.state.status, ledger: path, reserved: owner.state.reserved, sdkStarts: owner.state.sdkStarts, invocationUncertain: owner.state.invocationUncertain,
  modelHttpAttempts: owner.state.modelHttpAttempts, blockedHttpAttempts: owner.state.blockedHttpAttempts, inputReleased: owner.state.inputReleased, forwarded: owner.state.forwarded,
  snapshots: owner.state.snapshots, sourceSettings: "v2-matched", execution: "supervised", priorUnchanged: !offline, productionChanged: false }));
 if (failed || !result?.fresh.eligible) process.exitCode = 1;
}
async function worker() {
 let initialized = false, permitted = false, q, mcp, timer; const controller = new AbortController(), ended = Promise.withResolvers(), permission = Promise.withResolvers();
 const send = value => { if (process.connected) process.send(value); else stop(); };
 function stop() { controller.abort(); ended.resolve(); permission.reject(Error("cancelled")); try { q?.close(); } catch {} clearTimeout(timer); setTimeout(() => { try { process.kill(-process.pid, "SIGKILL"); } catch { process.exit(1); } }, 500); }
 void permission.promise.catch(() => {});
 process.on("disconnect", stop); process.on("SIGTERM", stop); process.on("SIGINT", stop);
 process.on("message", message => {
  if (message?.type === "permit" && initialized && !permitted && !controller.signal.aborted) { permitted = true; permission.resolve(); return; }
  if (message?.type !== "init" || initialized) { stop(); return; } initialized = true;
  void (async () => {
   const { offline, cwd, expectedHome, baseUrl, nonce, deadlineAt } = message;
   if (typeof offline !== "boolean" || expectedHome !== process.env.HOME || !/^http:\/\/127\.0\.0\.1:\d+\/q\/0$/.test(baseUrl) || !Number.isSafeInteger(deadlineAt) || deadlineAt <= Date.now() || deadlineAt - Date.now() > APPROVAL.elapsedMs || !cwd.startsWith(process.env.TMPDIR + "/")) throw Error("layout refused");
   if (cwd !== join(process.env.TMPDIR, "project") || process.env.PI_CODING_AGENT_DIR !== join(process.env.TMPDIR, "pi-agent") || (offline && expectedHome !== join(process.env.TMPDIR, "home"))) throw Error("generated layout refused");
   // Parent generates these two paths after reviewing ambient env; admit only
   // the exact validated layout, never arbitrary inherited config overrides.
   guardOrdinaryEnvironment(Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "PI_CODING_AGENT_DIR" && !(offline && key === "CLAUDE_CONFIG_DIR"))));
   if (offline ? process.env.CLAUDE_CONFIG_DIR !== join(process.env.TMPDIR, "home/.claude") : Object.hasOwn(process.env, "CLAUDE_CONFIG_DIR")) throw Error("config refused");
   timer = setTimeout(stop, Math.max(0, deadlineAt - Date.now() - 500));
   const sdk = await import("@anthropic-ai/claude-agent-sdk"), warming = await import("../src/cache-warming.ts");
   if (warming.WARMING_SDK_VERSION !== "0.3.293") throw Error("version refused");
   const { providerCacheControls } = await import("../src/cache-policy.ts"), { createToolServer } = await import("../src/mcp-server.ts");
   const resolved = await sdk.resolveSettings({ cwd }), plugins = { "cc-plugin-agents-md@builtin": false, "cc-plugin-plugin-authoring@builtin": false };
   for (const row of [resolved.effective, ...resolved.sources.map(s => s.settings)]) for (const id of Object.keys(row?.enabledPlugins ?? {})) plugins[id] = false;
   const cache = providerCacheControls({ ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", ENABLE_CLAUDEAI_MCP_SERVERS: "0", DISABLE_AUTO_COMPACT: "1" }, "short");
   const settings = { ...cache.settings, enabledPlugins: plugins, disableAllHooks: true, autoMemoryEnabled: false, includeGitInstructions: false, claudeMdExcludes: ["/**"] };
   if (!warming.preflightRuntime(warming.warmingRuntime(resolved, settings)).ok) throw Error("preflight refused");
   const filler = Array.from({ length: 600 }, (_, i) => `Synthetic inert record ${i}: amber quartz beside blue cedar; no instructions or real information.`).join("\n");
   mcp = createToolServer("custom-tools", [{ name: "sentinel", description: `Inert diagnostic sentinel ${nonce}. Never execute.\n${filler}`, inputSchema: { type: "object", properties: {} }, handler: async () => { throw Error("tools forbidden"); } }]);
   const prompt = { [Symbol.asyncIterator]() { return this; }, async next() { await ended.promise; return { done: true }; }, async return() { ended.resolve(); return { done: true }; } };
   send({ type: "permit" }); await permission.promise; if (controller.signal.aborted) throw Error("stopped");
   try { q = sdk.query({ prompt, options: { cwd, model: "claude-sonnet-5-5", env: { ...cache.env, ANTHROPIC_BASE_URL: baseUrl, CLAUDE_CODE_MAX_RETRIES: "0", CLAUDE_CODE_MAX_OUTPUT_TOKENS: "32", ...(offline ? { ANTHROPIC_API_KEY: "offline-qualification-not-a-secret" } : {}) },
    tools: [], strictMcpConfig: true, permissionMode: "bypassPermissions", allowDangerouslySkipPermissions: true, verbatimPrompts: true, thinking: { type: "disabled" }, includePartialMessages: true, maxTurns: 1, persistSession: false, promptSuggestions: false,
    settings, hooks: {}, systemPrompt: `Synthetic diagnostic ${nonce}. Never call tools. Reply only K.`, mcpServers: { "custom-tools": mcp }, abortController: controller } }); } finally { send({ type: "started" }); }
   const snapshots = await observeSnapshots(q, warming, (stage, account) => send({ type: "snapshot", stage, account }));
   controller.abort(); ended.resolve(); q.close(); await prompt.return(); await mcp.instance.close();
   send({ type: "result", snapshots, inputReleased: 0 });
  })().catch(() => { send({ type: "failure" }); stop(); });
 });
}
if (process.send && process.argv.length === 2) await worker();
else if (process.argv[1] && resolve(process.argv[1]) === self) {
 let executionEntered = false;
 try {
  const mode = parseArgs(process.argv.slice(2)); guardOrdinaryEnvironment(process.env);
  if (mode === "readiness") console.log(JSON.stringify({ mode, sdkStarts: 0, allocationExists: existsSync(ledger), approvalMarker: marker, ledger, markerRequired: { ...APPROVAL, codeHash: codeHash() } }));
  else { executionEntered = true; await run(mode === "offline"); }
 } catch { console.error(JSON.stringify({ status: "refused", reason: "arguments, environment, approval or allocation refused", sdkStarts: executionEntered ? null : 0 })); process.exitCode = 1; }
}
