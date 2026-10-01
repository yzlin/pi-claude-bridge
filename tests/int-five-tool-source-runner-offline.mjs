// OFFLINE ONLY: actual SDK children, fake keys, synthetic HOME and loopback SSE.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { APPROVAL, COHORT } from "../diag/lib/five-tool-source-owner.mjs";

test("prepared tool-source runner revalidates settings and seals eight starts/ten loopback attempts", { timeout: 120_000 }, () => {
 const child = spawnSync(process.execPath, ["diag/probe-five-tool-source.mjs", "--offline"], {
  env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR }, encoding: "utf8", timeout: 115_000,
 });
 const result = JSON.parse((child.stdout || child.stderr).trim().split("\n").at(-1));
 try {
  assert.equal(child.status, 0, JSON.stringify(result)); assert.equal(result.mode, "offline-simulation"); assert.equal(result.status, "complete");
  assert.equal(result.sdkStarts, APPROVAL.sdkStarts); assert.equal(result.httpAttempts, APPROVAL.httpAttempts);
  const load = name => readFileSync(join(result.ledger, name), "utf8").trim().split("\n").map(JSON.parse);
  const state = load("events.jsonl").at(-1), evidence = load("evidence.jsonl"), terminal = evidence.at(-1);
  assert.equal(state.status, "complete"); assert.equal(state.forwarded, 0); assert.equal(state.blockedAttempts, 0);
  assert.equal(state.queries.length, 8);
  for (const query of state.queries) {
   assert.equal(query.attempts, query.stage === "tool" ? 2 : 1); assert.equal(query.responses.length, query.attempts);
   assert.equal(query.toolCalled, query.stage === "tool"); assert.equal(query.toolResultVerified, query.stage === "tool");
  }
  const accounts = evidence.filter(row => row.observation?.stage === "account");
  assert.equal(accounts.length, 8); assert.ok(accounts.every(row => row.observation.settingsRevalidated === true));
  assert.deepEqual(terminal.rows.map(row => row.model), COHORT);
  for (const row of terminal.rows) {
   assert.equal(row.status, "offline-simulation"); assert.equal(row.sourceUnchanged, true); assert.equal(row.sourceToolCalls, 1);
   assert.equal(row.refreshToolCalls, 0); assert.equal(row.productionChanged, false); assert.equal(row.expiryProven, false);
   assert.deepEqual(row.rows.map(item => item.stage), ["seed", "tool-call", "tool-continuation", "refresh", "followup"]);
   for (const field of ["runtimeHash"]) assert.equal(new Set(row.rows.map(item => item[field])).size, 1);
   for (const field of ["system", "tools"]) assert.equal(new Set(row.rows.map(item => item.wire[field])).size, 1);
   for (const item of row.rows) {
    assert.equal(item.wire.maxTokens, item.stage === "refresh" ? 1 : 32); assert.ok(item.wire.ttl.length);
    assert.ok(item.wire.ttl.every(ttl => ttl === "5m"));
   }
   assert.equal(row.rows[3].usage.output_tokens, 1);
  }
 } finally { if (result.ledger) rmSync(join(result.ledger, ".."), { recursive: true, force: true }); }
});
