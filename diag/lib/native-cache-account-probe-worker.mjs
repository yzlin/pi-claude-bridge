// Private one-shot IPC worker. The parent alone grants query permission.
import { join, basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { guardOrdinaryEnvironment } from "./native-cache-account-probe-owner.mjs";
import { observeAccount } from "./native-cache-account-probe-observe.mjs";
const repo = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
if (!process.send || process.argv.length !== 2) process.exit(1);
const controller = new AbortController(), permission = Promise.withResolvers();
let initialized = false, permitted = false, stopping = false, timer, watchdog;
const origin = performance.now(); let lastWall = Date.now(), lastMono = origin;
function stop() {
 if (stopping) return;
 stopping = true; controller.abort(); permission.reject(Error("parent closed"));
 clearTimeout(timer); clearInterval(watchdog);
 // Independent cleanup when parent disappears, including SDK descendants. The
 // worker is a detached process-group leader; no other session is in this group.
 setTimeout(() => { try { process.kill(-process.pid, "SIGKILL"); } catch { process.exit(1); } }, 500);
}
void permission.promise.catch(() => {});
process.on("disconnect", stop); process.on("SIGTERM", stop); process.on("SIGINT", stop);
function send(value) { if (process.connected) process.send(value, error => { if (error) stop(); }); else stop(); }
process.on("message", message => {
 if (message?.type === "permit" && initialized && !permitted && !stopping) { permitted = true; permission.resolve(); return; }
 if (message?.type !== "init" || initialized || stopping) { stop(); return; }
 initialized = true;
 void execute(message).catch(() => { send({ type: "failure" }); stop(); });
});
async function execute({ offline, cwd, expectedHome, deadlineAt, baseUrl, scenario, fault, root }) {
 if (typeof offline !== "boolean" || typeof expectedHome !== "string" || !Number.isSafeInteger(deadlineAt) || deadlineAt <= Date.now() || deadlineAt - Date.now() > 60000
  || !/^http:\/\/127\.0\.0\.1:\d+$/.test(baseUrl) || (!offline && (scenario !== undefined || fault !== undefined || root !== undefined))) throw Error("worker init refused");
 const arm = process.env.TMPDIR;
 if (offline) {
  if (!arm || basename(arm) !== "arm-0" || process.env.HOME !== expectedHome || expectedHome !== join(arm, "home")
   || cwd !== join(arm, "project") || process.env.PI_CODING_AGENT_DIR !== join(arm, "pi-agent")
   || process.env.CLAUDE_CONFIG_DIR !== join(arm, "home/.claude")) throw Error("worker layout refused");
  for (const key of Object.keys(process.env)) if (!["PATH", "HOME", "TMPDIR", "PI_CODING_AGENT_DIR", "__CF_USER_TEXT_ENCODING", "CLAUDE_CONFIG_DIR"].includes(key)) throw Error("worker environment refused");
 } else {
  if (!isAbsolute(expectedHome) || resolve(expectedHome) !== expectedHome || expectedHome === resolve("/")
   || process.env.HOME !== expectedHome || cwd !== repo || process.cwd() !== repo
   || Object.hasOwn(process.env, "CLAUDE_CONFIG_DIR")) throw Error("worker layout refused");
  guardOrdinaryEnvironment(process.env);
 }
 // Independent graceful shutdown leaves its 500ms kill tail inside the deadline.
 timer = setTimeout(stop, Math.max(0, deadlineAt - Date.now() - 500));
 watchdog = setInterval(() => {
  const wall = Date.now(), mono = performance.now();
  if (wall < lastWall || mono < lastMono || wall >= deadlineAt || mono - origin >= 60000) stop();
  lastWall = wall; lastMono = mono;
 }, 25);
 // Normal public SDK only. No custom executable, storage env, wrapper or login.
 const real = await import("@anthropic-ai/claude-agent-sdk");
 const warming = await import("../../src/cache-warming.ts");
 if (warming.WARMING_SDK_VERSION !== "0.3.285") throw Error("version refused");
 let sdk = real;
 if (offline) {
  if (!root || arm !== join(root, "arm-0")) throw Error("offline root refused");
  sdk = (await import("../../tests/lib/native-cache-account-probe-fixture.mjs")).fixtureSdk(real, scenario, root);
  if (fault === "unsafe") sdk = { ...sdk, resolveSettings: async () => ({ effective: { env: { KEEP: "unsafe" }, hooks: { SessionStart: ["offline"] } }, sources: [] }) };
 }
 const env = { ...process.env, ...(offline ? { ANTHROPIC_API_KEY: "offline-fake-key-not-a-secret" } : {}) };
 const value = await observeAccount({ sdk, warming, cwd, env, baseUrl, signal: controller.signal,
  async permit() { send({ type: "permit" }); await permission.promise; },
  started() { send({ type: "started" }); if (offline && fault === "duplicate") send({ type: "permit" }); },
 });
 if (stopping) return;
 send({ type: "result", value });
 // Parent terminates this group after receiving the already-cleaned result.
}
