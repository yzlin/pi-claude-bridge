// OFFLINE ONLY: real SDK, synthetic HOME/config, fake key, never a prompt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { APPROVAL } from "../diag/lib/five-account-terminal-owner.mjs";
const env = () => ({ PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR });
test("readiness and rejected sealed ids cannot start SDK or allocate", () => {
 const output = execFileSync(process.execPath, ["diag/probe-five-account-terminal.mjs", "--readiness"], { env: env(), encoding: "utf8" });
 const ready = JSON.parse(output); assert.equal(ready.sdkStarts, 0); assert.equal(ready.markerRequired.id, APPROVAL.id);
 for (const id of ["native-five-verbatim-8q-10m-v1", "native-five-verbatim-8q-10m-v2", "native-cache-account-ordinary-1q-60s-v1"]) {
  const child = spawnSync(process.execPath, ["diag/probe-five-account-terminal.mjs", "--live", id], { env: env(), encoding: "utf8" });
  assert.equal(child.status, 1); assert.equal(JSON.parse(child.stderr).sdkStarts, 0);
 }
});
test("public account metadata completes one real SDK startup with zero input/model HTTP", { timeout: 75_000 }, () => {
 const child = spawnSync(process.execPath, ["diag/probe-five-account-terminal.mjs", "--offline"], { env: env(), encoding: "utf8", timeout: 70_000 });
 const value = JSON.parse((child.stdout || child.stderr).trim().split("\n").at(-1));
 try {
  assert.equal(value.mode, "offline"); assert.equal(value.status, "complete"); assert.equal(value.sdkStarts, 1);
  assert.equal(value.inputReleased, 0); assert.equal(value.modelHttpAttempts, 0); assert.equal(value.blockedHttpAttempts, 0); assert.equal(value.forwarded, 0);
  assert.equal(value.account.eligible, false, "fake key must not look like a subscription"); assert.equal(value.productionChanged, false);
  const terminal = JSON.parse(readFileSync(join(value.ledger, "events.jsonl"), "utf8").trim().split("\n").at(-1));
  assert.equal(terminal.invocationUncertain, false); assert.equal(terminal.reserved, 1); assert.equal(terminal.status, "complete");
 } finally { if (value.ledger) rmSync(join(value.ledger, ".."), { recursive: true, force: true }); }
});
