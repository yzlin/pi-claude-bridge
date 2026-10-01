import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from "node:fs";

import { tmpdir } from "node:os";
import { join } from "node:path";
import * as owner from "../diag/lib/five-expiry-owner.mjs";
const toolHash = "a".repeat(64);
const temporary = () => mkdtempSync(join(tmpdir(), "five-expiry-unit-"));
test("expiry allowance fixes eight independent arms, 28 starts, 36 requests and 20 minutes", () => {
 assert.deepEqual(owner.APPROVAL, { id: "native-five-expiry-28q-36http-20m-v1", sdkStarts: 28, httpAttempts: 36, elapsedMs: 1_200_000 });
 assert.equal(owner.ARMS.length, 8); assert.equal(owner.ARMS.filter(arm => arm.warmed).length, 4);
 assert.deepEqual(owner.OUTPUT_CAPS, { seed: 128, tool: 128, refresh: 1, followup: 128 });
 assert.equal(owner.parseArgs(["--live", owner.APPROVAL.id]), "live");
 for (const id of ["native-five-tool-source-8q-10http-10m-v1", "native-five-tool-source-8q-10http-10m-v2"]) assert.throws(() => owner.parseArgs(["--live", id]));
});
function setup() {
 const root = temporary(); let clock = 1000, mono = 1000;
 const budget = new owner.FiveOwner(join(root, "ledger"), { now: () => clock, monotonic: () => mono, offline: true });
 const advance = ms => { clock += ms; mono += ms; };
 const validated = (arm, stage, usageOverride) => {
  const id = budget.reserve(arm, stage); budget.started(id); budget.attempt(id); budget.forwarded(id);
  const first = { stop: stage === "tool" ? "tool_use" : stage === "refresh" ? "max_tokens" : "end_turn", toolUseHash: stage === "tool" ? toolHash : null };
  budget.responded(id, first);
  if (stage === "tool") { budget.toolCalled(id, toolHash); budget.attempt(id); budget.toolResult(id, toolHash); budget.forwarded(id); budget.responded(id, { stop: "end_turn", toolUseHash: null }); }
  const usage = stage === "followup" && !owner.ARMS[arm].warmed ? { input_tokens: 2, output_tokens: 3, cache_read_input_tokens: 0, cache_creation_input_tokens: 2080 }
   : { input_tokens: 2, output_tokens: stage === "refresh" ? 1 : 3, cache_read_input_tokens: stage === "refresh" || stage === "followup" ? 2080 : 2048, cache_creation_input_tokens: stage === "refresh" || stage === "followup" ? 32 : 32 };
  budget.validated(id, { usage: { ...usage, ...usageOverride }, sourceUnchanged: true, noPersistedFork: true }); return id;
 };
 return { root, budget, advance, validated, wallOnly(ms) { clock += ms; }, close() { budget.close(); rmSync(root, { recursive: true, force: true }); } };
}
test("full matrix admits only validated tool continuation, timed refresh and expired follow-up", () => {
 const f = setup();
 try {
  for (const arm of owner.ARMS) { f.validated(arm.id, "seed"); f.validated(arm.id, "tool"); }
  f.advance(owner.TIMING.offline.refreshTargetMs);
  for (const arm of owner.ARMS.filter(arm => arm.warmed)) f.validated(arm.id, "refresh");
  f.advance(owner.TIMING.offline.followupTargetMs - owner.TIMING.offline.refreshTargetMs);
  for (const arm of owner.ARMS) f.validated(arm.id, "followup");
  f.budget.finish("complete");
  const state = JSON.parse(readFileSync(join(f.root, "ledger/events.jsonl"), "utf8").trim().split("\n").at(-1));
  assert.equal(state.sdkStarts, 28); assert.equal(state.httpAttempts, 36); assert.equal(state.forwarded, 36); assert.equal(state.status, "complete");
  assert.equal(state.queries.filter(query => query.validation).length, 28);
  assert.throws(() => new owner.FiveOwner(join(f.root, "ledger")));
 } finally { f.close(); }
});
test("unvalidated source, control refresh, early or late time and repeat requests never forward", () => {
 for (const fault of ["unvalidated", "control-refresh", "early-refresh", "early-followup", "late-refresh", "retry", "wall-only"]) {
  const f = setup();
  try {
   if (fault === "unvalidated") {
    const id = f.budget.reserve(0, "seed"); f.budget.started(id); f.budget.attempt(id); f.budget.responded(id, { stop: "end_turn", toolUseHash: null });
    assert.throws(() => f.budget.reserve(0, "tool")); continue;
   }
   f.validated(0, "seed"); const source = f.validated(0, "tool");
   if (fault === "retry") { assert.throws(() => f.budget.attempt(source)); continue; }
   if (fault === "control-refresh") { f.validated(1, "seed"); f.validated(1, "tool"); assert.throws(() => f.budget.reserve(1, "refresh")); continue; }
   if (fault === "late-refresh") f.advance(owner.TIMING.offline.refreshMaxMs + 1);
   if (fault === "wall-only") f.wallOnly(owner.TIMING.offline.refreshTargetMs);
   const stage = fault === "early-followup" ? "followup" : "refresh";
   if (stage === "followup") { f.validated(1, "seed"); f.validated(1, "tool"); }
   const id = f.budget.reserve(stage === "followup" ? 1 : 0, stage); f.budget.started(id);
   const before = f.budget.state.forwarded; assert.throws(() => f.budget.attempt(id)); assert.equal(f.budget.state.forwarded, before);
  } finally { f.close(); }
 }
});
test("zero or overflowing cached source cannot become expiry-ready", () => {
 for (const usage of [{ cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, { cache_read_input_tokens: Number.MAX_SAFE_INTEGER, cache_creation_input_tokens: 32 }]) {
  const f = setup();
  try { f.validated(0, "seed"); assert.throws(() => f.validated(0, "tool", usage)); assert.throws(() => f.budget.reserve(0, "refresh")); }
  finally { f.close(); }
 }
});
test("clock and disk failure cannot grant expiry starts; fresh marker is code-bound", () => {
 for (const fault of ["wall", "mono", "backwards", "disk"]) {
  const root = temporary(); let clock = 1000, mono = 1000, broken = false, budget;
  try {
   budget = new owner.FiveOwner(join(root, "ledger"), { offline: true, now: () => clock, monotonic: () => mono, persist: () => { if (broken) throw Error(); } });
   if (fault === "wall") clock += owner.APPROVAL.elapsedMs; if (fault === "mono") mono += owner.APPROVAL.elapsedMs;
   if (fault === "backwards") clock--; if (fault === "disk") broken = true;
   assert.throws(() => budget.reserve(0, "seed")); assert.equal(budget.state.sdkStarts, 0);
   broken = false; assert.throws(() => budget.reserve(0, "seed"));
  } finally { budget?.close(); rmSync(root, { recursive: true, force: true }); }
 }
 const root = temporary(), path = join(root, "marker"), hash = "f".repeat(64), value = { ...owner.APPROVAL, codeHash: hash, approvedAt: 1000, expiresAt: 2000 };
 try {
  writeFileSync(path, JSON.stringify(value), { mode: 0o400 }); owner.validateApproval(path, hash, 1500);
  assert.throws(() => owner.validateApproval(path, hash, 2000)); assert.throws(() => owner.validateApproval(path, "a".repeat(64), 1500));
  for (const changes of [{ sdkStarts: 29 }, { httpAttempts: 37 }, { id: "native-five-tool-source-8q-10http-10m-v2" }]) {
   chmodSync(path, 0o600); writeFileSync(path, JSON.stringify({ ...value, ...changes })); chmodSync(path, 0o400); assert.throws(() => owner.validateApproval(path, hash, 1500));
  }
 } finally { rmSync(root, { recursive: true, force: true }); }
});
test("warm misses and control hits cannot become validated expiry evidence", () => {
 for (const warmed of [true, false]) {
  const f = setup(), arm = warmed ? 0 : 1;
  try {
   f.validated(arm, "seed"); f.validated(arm, "tool");
   f.advance(owner.TIMING.offline.refreshTargetMs); if (warmed) f.validated(arm, "refresh");
   f.advance(owner.TIMING.offline.followupTargetMs - owner.TIMING.offline.refreshTargetMs);
   const id = f.budget.reserve(arm, "followup"); f.budget.started(id); f.budget.attempt(id); f.budget.responded(id, { stop: "end_turn", toolUseHash: null });
   assert.throws(() => f.budget.validated(id, { usage: { input_tokens: 2, output_tokens: 3, cache_read_input_tokens: warmed ? 0 : 2080, cache_creation_input_tokens: 2080 }, sourceUnchanged: true, noPersistedFork: true }));
   assert.equal(f.budget.state.queries[id].validation, undefined);
  } finally { f.close(); }
 }
});
