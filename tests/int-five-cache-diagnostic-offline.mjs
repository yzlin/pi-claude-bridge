// OFFLINE ONLY. SDK children receive synthetic HOME/config, fake key and loopback.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { APPROVAL, COHORT } from "../diag/lib/five-cache-diagnostic-owner.mjs";

test("both 5.5 candidates suppress auxiliary requests and complete eight isolated loopback turns", { timeout: 120_000 }, () => {
 const child = spawnSync(process.execPath, ["diag/probe-five-cache.mjs", "--offline"], {
  env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR }, encoding: "utf8", timeout: 115_000,
 });
 const result = JSON.parse((child.stdout || child.stderr).trim().split("\n").at(-1));
 try {
  assert.equal(child.status, 0, JSON.stringify(result));
  assert.equal(result.mode, "offline-simulation"); assert.equal(result.status, "complete");
  assert.equal(result.sdkStarts, APPROVAL.sdkStarts); assert.equal(result.httpAttempts, APPROVAL.httpAttempts);
  const evidence = readFileSync(join(result.ledger, "evidence.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  const terminal = evidence.at(-1); assert.equal(terminal.forwarded, 0);
  assert.deepEqual(terminal.rows.map(row => row.model), COHORT);
  for (const model of terminal.rows) {
   assert.equal(model.sourceUnchanged, true); assert.equal(model.productionChanged, false);
   assert.equal(model.expiryProven, false); assert.equal(model.toolSourceProven, false);
   assert.deepEqual(model.rows.map(row => row.stage), ["seed", "second", "refresh", "followup"]);
   for (const row of model.rows) { assert.ok(row.wire.ttl.length); assert.ok(row.wire.ttl.every(ttl => ttl === "5m")); }
   assert.equal(model.rows[2].wire.maxTokens, 1); assert.equal(model.rows[2].usage.output_tokens, 1);
  }
 } finally { if (result.ledger) rmSync(join(result.ledger, ".."), { recursive: true, force: true }); }
});
