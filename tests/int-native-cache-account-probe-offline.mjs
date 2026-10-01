// OFFLINE ONLY: guarded mocks and explicit synthetic CLAUDE_CONFIG_DIR + fake key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { APPROVAL } from "../diag/lib/native-cache-account-probe-owner.mjs";
import { observeAccount } from "../diag/lib/native-cache-account-probe-observe.mjs";
import * as warming from "../src/cache-warming.ts";
const exec = promisify(execFile);
const probe = resolve("diag/probe-native-cache-account.mjs");
async function runFixture(t, scenario, fault) {
 const root = mkdtempSync(join(tmpdir(), "native-account-test-"));
 t.after(() => rmSync(root, { recursive: true, force: true }));
 // Only disposable approvals; never writes either real marker/allocation.
 const codeHash = "a".repeat(64);
 writeFileSync(join(root, "approval.json"), JSON.stringify({ ...APPROVAL, codeHash, approvedAt: Date.now() - 1000, expiresAt: Date.now() + 120000 }), { mode: 0o400 });
 if (["sdk", "sdk-hook"].includes(scenario)) {
  const home = join(root, "arm-0/home"), project = join(root, "arm-0/project");
  mkdirSync(join(home, ".claude"), { recursive: true }); mkdirSync(join(project, ".claude"), { recursive: true });
  const userSettings = scenario === "sdk-hook"
   // Hooks alone are inert under disableAllHooks; raw env keeps the settings unsafe.
   ? { env: { KEEP: "unsafe" }, hooks: { SessionStart: [{ hooks: [{ type: "command", command: `touch ${join(root, "HOOK-EXECUTED")}` }] }] } }
   : { promptCacheTtl: "5m" };
  writeFileSync(join(home, ".claude/settings.json"), JSON.stringify(userSettings));
  writeFileSync(join(project, ".claude/settings.json"), JSON.stringify({ includeGitInstructions: false }));
  writeFileSync(join(project, ".claude/settings.local.json"), JSON.stringify({}));
  writeFileSync(join(home, ".claude.json"), JSON.stringify({ hasCompletedOnboarding: true, numStartups: 7 }));
 }
 const source = `import http from 'node:http';import https from 'node:https';import{syncBuiltinESMExports}from'node:module';let forwards=0;const deny=()=>{forwards++;throw Error('parent external forwarding forbidden');};http.request=http.get=https.request=https.get=deny;globalThis.fetch=deny;syncBuiltinESMExports();const{runOfflineFixture}=await import(${JSON.stringify(probe)});const result=await runOfflineFixture(${JSON.stringify({ root, scenario, fault, codeHash })});if(forwards)throw Error('forwarding attempted');console.log(JSON.stringify(result));`;
 const { stdout, stderr } = await exec(process.execPath, ["--import", "tsx", "--input-type=module", "-e", source], { env: { PATH: process.env.PATH, HOME: root, TMPDIR: tmpdir() }, timeout: 15000 });
 assert.doesNotMatch(stdout + stderr, /SECRET|email|organization|stack/);
 return { root, result: JSON.parse(stdout.trim()) };
}
const eligible = { apiProvider: "firstParty", subscriptionType: "Claude Max", email: "SECRET-email", organization: "SECRET-org" };
for (const kind of ["eligible", "ineligible", "error", "query-error", "cancel", "late", "unsafe", "managed"]) test(`withheld account ${kind}, sanitized and closed before result`, async () => {
 const controller = new AbortController(); let calls = 0, reserved = 0, starts = 0, closed = 0, input = 0, options;
 const sdk = {
  async resolveSettings(opts) { assert.deepEqual(opts, { cwd: "/synthetic" }); return kind === "unsafe" ? { effective: { env: { KEEP: "SECRET" }, hooks: { SessionStart: ["SECRET"] } }, sources: [{ source: "user", settings: { env: { KEEP: "SECRET" }, hooks: { SessionStart: ["SECRET"] } } }] }
   : kind === "managed" ? { effective: {}, sources: [{ source: "managed", settings: { env: { SECRET: "SECRET" } } }] } : { effective: {}, sources: [] }; },
  query(args) {
   calls++; options = args.options;
   if (kind === "query-error") throw Error("SECRET-synchronous-query");
   assert.equal(reserved, 1); assert.equal(options.settingSources, undefined); assert.equal(options.model, undefined);
   assert.equal(options.pathToClaudeCodeExecutable, undefined); assert.equal(options.spawnClaudeCodeProcess, undefined);
   assert.equal(options.env.ANTHROPIC_BASE_URL, "http://127.0.0.1:1234");
   void (async () => { for await (const _ of args.prompt) input++; })();
   return { async accountInfo() {
    if (kind === "error") throw Error("SECRET-token-private-stack");
    if (["cancel", "late"].includes(kind)) { setTimeout(() => controller.abort(), 10); await delay(60); }
    return kind === "ineligible" ? { apiProvider: "SECRET-provider", subscriptionType: "SECRET-plan", apiKeySource: "SECRET-key" } : eligible;
   }, close() { closed++; assert.equal(options.abortController.signal.aborted, true); } };
  },
 };
 const result = await observeAccount({ sdk, warming, cwd: "/synthetic", env: { HOME: "/synthetic", CLAUDE_CONFIG_DIR: "/synthetic/.claude" }, baseUrl: "http://127.0.0.1:1234", signal: controller.signal,
  permit: async () => { reserved++; }, started: () => { starts++; } });
 await delay(80);
 const preflight = ["unsafe", "managed"].includes(kind);
 assert.equal(calls, preflight ? 0 : 1); assert.equal(reserved, preflight ? 0 : 1); assert.equal(starts, calls); assert.equal(closed, kind === "query-error" ? 0 : calls); assert.equal(input, 0);
 assert.equal(result.status, ["eligible", "ineligible"].includes(kind) ? "complete" : "failed");
 if (kind === "eligible") assert.equal(result.account.eligible, true);
 if (kind === "ineligible") assert.equal(result.account.eligible, false);
 assert.doesNotMatch(JSON.stringify(result), /SECRET|email|organization|stack/);
 assert.equal(result.inputReleased, 0);
});
for (const scenario of ["eligible", "ineligible", "error", "delayed", "http", "sdk"]) test(`supervised disposable ${scenario} account-only observation`, { timeout: 20000 }, async t => {
 const { root, result } = await runFixture(t, scenario);
 assert.equal(result.sdkStarts, 1); assert.equal(result.reserved, 1);
 assert.equal(result.controls.settingSources, "default"); assert.equal(result.controls.homeMode, "synthetic-explicit-config");
 assert.equal(result.controls.cwdMode, "synthetic"); assert.equal(result.controls.envMode, "synthetic");
 assert.deepEqual(result.prior.map(row => [row.id, row.status, row.sdkStarts, row.modelHttpAttempts, row.forwarded]), [
  ["native-cache-40q-40m-v1", "failed", 1, 0, 0], ["native-cache-account-1q-60s-v1", "complete", 1, 0, 0],
  ["native-cache-account-normal-home-1q-60s-v1", "complete", 1, 0, 0],
 ]);
 assert.equal(result.prior[1].eligible, false); assert.equal(result.prior[2].eligible, false);
 assert.equal(result.inputReleased, 0); assert.equal(result.forwarded, 0);
 assert.equal(result.status, ["error", "http"].includes(scenario) ? "failed" : "complete");
 assert.equal(result.blockedHttpAttempts, scenario === "http" ? 1 : 0);
 assert.equal(result.modelHttpAttempts, scenario === "http" ? 1 : 0);
 if (["eligible", "delayed"].includes(scenario)) assert.equal(result.account.eligible, true);
 if (["ineligible", "sdk"].includes(scenario)) assert.equal(result.account.eligible, false);
 assert.ok(!readdirSync(root).some(name => name.startsWith("arm-")));
 assert.equal(existsSync(join(root, "INPUT-RELEASED")), false);
 const journal = readFileSync(join(root, "audit/events.jsonl"), "utf8");
 assert.doesNotMatch(journal, /SECRET|email|organization|stack/);
 assert.equal(JSON.parse(journal.trim().split("\n").at(-1)).status, result.status);
 if (scenario !== "sdk") assert.equal(readFileSync(join(root, "query.closed"), "utf8"), "yes");
 if (scenario === "sdk") {
  assert.equal(readFileSync(join(root, "raw-key-account-rejected"), "utf8"), "yes");
  assert.equal(readFileSync(join(root, "filesystem-settings-loaded"), "utf8"), "yes");
  assert.equal(readFileSync(join(root, "synthetic-global-config-unchanged"), "utf8"), "yes");
 }
});
test("actual SDK default sources expose user hook and refuse before permit without executing it", { timeout: 20000 }, async t => {
 const { root, result } = await runFixture(t, "sdk-hook");
 assert.equal(result.status, "failed"); assert.equal(result.reserved, 0); assert.equal(result.sdkStarts, 0);
 assert.equal(result.inputReleased, 0); assert.equal(result.forwarded, 0); assert.equal(result.blockedHttpAttempts, 0);
 assert.equal(existsSync(join(root, "HOOK-EXECUTED")), false);
 assert.equal(existsSync(join(root, "query.started")), false);
 assert.ok(!readdirSync(root).some(name => name.startsWith("arm-")));
});
for (const fault of ["deadline", "worker-deadline", "signal", "disconnect", "duplicate", "persistence", "unsafe"]) test(`supervisor ${fault}: bounded cleanup and no retry`, { timeout: 20000 }, async t => {
 const { root, result } = await runFixture(t, ["persistence", "unsafe", "duplicate"].includes(fault) ? "delayed" : "descendant", fault);
 assert.equal(result.status, "failed"); assert.equal(result.sdkStarts, ["persistence", "unsafe"].includes(fault) ? 0 : 1);
 assert.equal(result.inputReleased, 0); assert.equal(result.forwarded, 0); assert.equal(result.blockedHttpAttempts, 0);
 assert.ok(!readdirSync(root).some(name => name.startsWith("arm-")));
 if (existsSync(join(root, "descendant.pid"))) {
  const pid = Number(readFileSync(join(root, "descendant.pid"), "utf8"));
  // Reparented zombies may remain briefly; never consider a running process cleaned.
  let gone = false;
  for (let i = 0; i < 50; i++) { try { process.kill(pid, 0); } catch { gone = true; break; } await delay(20); }
  assert.equal(gone, true, "SDK-like descendant survived process-group cleanup");
 }
});
test("temporary missing approval and preexisting tombstone refuse before any worker start", async t => {
 const root = mkdtempSync(join(tmpdir(), "native-account-test-")); t.after(() => rmSync(root, { recursive: true, force: true }));
 const module = resolve("diag/probe-native-cache-account.mjs");
 const source = `import cp from 'node:child_process';import{syncBuiltinESMExports}from'node:module';let starts=0;cp.fork=()=>{starts++;throw Error('worker forbidden');};syncBuiltinESMExports();const{runOfflineFixture}=await import(${JSON.stringify(module)});try{await runOfflineFixture(${JSON.stringify({ root, scenario: "eligible", codeHash: "a".repeat(64) })});process.exitCode=3;}catch{console.log(JSON.stringify({starts}));}`;
 const env = { PATH: process.env.PATH, HOME: root, TMPDIR: tmpdir() };
 assert.equal(JSON.parse((await exec(process.execPath,["--input-type=module","-e",source],{env})).stdout).starts,0);
 assert.equal(existsSync(join(root,"audit")),false);
 writeFileSync(join(root,"approval.json"),JSON.stringify({...APPROVAL,codeHash:"a".repeat(64),approvedAt:Date.now()-1000,expiresAt:Date.now()+10000}),{mode:0o400});
 mkdirSync(join(root,"audit"));
 assert.equal(JSON.parse((await exec(process.execPath,["--input-type=module","-e",source],{env})).stdout).starts,0);
 assert.deepEqual(readdirSync(join(root,"audit")),[]);
});
