// Importable ONLY by the diagnostic's explicit disposable offline worker.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { request } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { accountEvidence } from "../../src/cache-warming.ts";
export function fixtureSdk(real, scenario, root) {
 assert.ok(process.env.CLAUDE_CONFIG_DIR?.startsWith(root + "/"));
 const guardedFiles = [join(process.env.HOME, ".claude.json"), join(process.env.CLAUDE_CONFIG_DIR, "settings.json"),
  join(process.env.TMPDIR, "project/.claude/settings.json"), join(process.env.TMPDIR, "project/.claude/settings.local.json")];
 const guardedBytes = scenario === "sdk" ? guardedFiles.map(path => readFileSync(path)) : [];
 let calls = 0;
 return { async resolveSettings(options) {
  assert.deepEqual(options, { cwd: join(process.env.TMPDIR, "project") });
  const resolved = await real.resolveSettings(options);
  if (scenario === "sdk") {
   const user = resolved.sources.find(source => source.source === "user");
   const project = resolved.sources.find(source => source.source === "project");
   assert.equal(user?.settings?.promptCacheTtl, "5m");
   assert.equal(project?.settings?.includeGitInstructions, false);
   writeFileSync(join(root, "filesystem-settings-loaded"), "yes");
  }
  if (scenario === "sdk-hook") {
   const user = resolved.sources.find(source => source.source === "user");
   assert.ok(user?.settings?.hooks?.SessionStart);
  }
  return resolved;
 }, query({ prompt, options }) {
  assert.equal(++calls, 1); assert.equal(options.settingSources, undefined);
  if (scenario === "sdk-hook") { writeFileSync(join(root, "query.started"), "unsafe"); throw Error("hook preflight bypassed"); }
  assert.equal(options.env.CLAUDE_CONFIG_DIR, process.env.CLAUDE_CONFIG_DIR);
  assert.equal(options.model, undefined);
  assert.equal(options.env.ANTHROPIC_API_KEY, "offline-fake-key-not-a-secret");
  if (scenario === "sdk") {
   const q = real.query({ prompt, options });
   return { async accountInfo() {
    const raw = await q.accountInfo();
    assert.equal(accountEvidence(raw).eligible, false, "raw actual API-key metadata must be ineligible");
    writeFileSync(join(root, "raw-key-account-rejected"), "yes");
    return raw;
   }, close() {
    q.close();
    for (const [index, path] of guardedFiles.entries()) assert.deepEqual(readFileSync(path), guardedBytes[index]);
    writeFileSync(join(root, "synthetic-global-config-unchanged"), "yes");
   } };
  }
  void (async () => { for await (const _ of prompt) { writeFileSync(join(root, "INPUT-RELEASED"), "unsafe"); throw Error("input released"); } })();
  if (["hang", "descendant"].includes(scenario)) {
   const child = spawn(process.execPath, ["-e", 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'], { stdio: "ignore", env: { PATH: process.env.PATH } });
   writeFileSync(join(root, "descendant.pid"), String(child.pid));
  }
  return { async accountInfo() {
   if (scenario === "error") throw Error("SECRET-auth-error");
   if (["hang", "descendant"].includes(scenario)) await new Promise(() => {});
   if (scenario === "delayed") await delay(150);
   if (scenario === "http") await new Promise(resolve => {
    const req = request(options.env.ANTHROPIC_BASE_URL + "/v1/messages?SECRET", { method: "POST", headers: { authorization: "SECRET-header" } }, res => { res.resume(); res.on("end", resolve); });
    req.on("error", resolve); req.end("SECRET-body");
   });
   return scenario === "ineligible" ? { apiProvider: "firstParty", apiKeySource: "SECRET-api-key" }
    : { apiProvider: "firstParty", subscriptionType: "Claude Pro", email: "SECRET-email", organization: "SECRET-org" };
  }, close() { assert.equal(options.abortController.signal.aborted, true); writeFileSync(join(root, "query.closed"), "yes"); } };
 } };
}
