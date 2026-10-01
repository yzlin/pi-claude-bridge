// Actual SDK; synthetic HOME, fake keys and loopback. Timing/usage are simulated.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ARMS, TIMING } from "../diag/lib/five-expiry-v2-owner.mjs";
const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR };
const load = (ledger, name) => readFileSync(join(ledger, name), "utf8").trim().split("\n").map(JSON.parse);
test("parent event-loop pause seals before refresh SDK or model traffic", { timeout: 60_000 }, () => {
 const child = spawnSync(process.execPath, ["--input-type=module", "-e", 'import { runOfflinePauseFixture } from "./diag/probe-five-expiry-v2.mjs"; await runOfflinePauseFixture();'], { env, encoding: "utf8", timeout: 55_000 });
 const result = JSON.parse((child.stdout || child.stderr).trim().split("\n").at(-1));
 try {
  assert.equal(child.status, 1); const state = load(result.ledger, "events.jsonl").at(-1);
  assert.equal(state.status, "failed"); assert.equal(state.refusal.reason, "clock-gap"); assert.ok(state.refusal.wallGapMs >= 5000);
  assert.equal(state.sdkStarts, 2); assert.equal(state.observedHttpAttempts, 3); assert.equal(state.forwarded, 0);
  assert.equal(state.queries.some(q => q.stage === "refresh"), false);
 } finally { if (result.ledger) rmSync(join(result.ledger, ".."), { recursive: true, force: true }); }
});
test("awake loss refuses before any SDK start", { timeout: 60_000 }, () => {
 const child = spawnSync(process.execPath, ["--input-type=module", "-e", 'import { runOfflineAwakeLossFixture } from "./diag/probe-five-expiry-v2.mjs"; await runOfflineAwakeLossFixture();'], { env, encoding: "utf8", timeout: 55_000 });
 const result = JSON.parse((child.stdout || child.stderr).trim().split("\n").at(-1));
 try { assert.equal(child.status, 1); assert.equal(result.sdkStarts, 0); assert.equal(load(result.ledger, "events.jsonl").at(-1).status, "failed"); }
 finally { if (result.ledger) rmSync(join(result.ledger, ".."), { recursive: true, force: true }); }
});
test("eight-arm expiry simulation validates every stage and exact 28/36 limits without forwarding", { timeout: 180_000 }, () => {
 const child = spawnSync(process.execPath, ["diag/probe-five-expiry-v2.mjs", "--offline"], { env, encoding: "utf8", timeout: 170_000 });
 const result = JSON.parse((child.stdout || child.stderr).trim().split("\n").at(-1));
 try {
  assert.equal(child.status, 0, JSON.stringify(result)); assert.equal(result.mode, "offline-simulation"); assert.equal(result.status, "complete");
  assert.equal(result.sdkStarts, 28); assert.equal(result.httpAttempts, 36); assert.equal(result.arms, 8);
  const state = load(result.ledger, "events.jsonl").at(-1), evidence = load(result.ledger, "evidence.jsonl"), terminal = evidence.at(-1);
  assert.equal(state.status, "complete"); assert.equal(state.observedHttpAttempts, 36); assert.equal(state.forwarded, 0); assert.equal(state.blockedAttempts, 0); assert.equal(terminal.expiryCandidatePass, false);
  assert.equal(evidence.filter(row => row.validatedStage).length, 28);
  assert.equal(evidence.filter(row => row.observation?.stage === "response-observation").length, 36);
  const accounts = evidence.filter(row => row.observation?.stage === "account"); assert.equal(accounts.length, 28);
  assert.ok(accounts.every(row => row.observation.settingsRevalidated));
  assert.ok(accounts.every(row => /^[a-f0-9]{64}$/.test(row.observation.accountFingerprint)));
  assert.equal(new Set(accounts.map(row => row.observation.accountFingerprint)).size, 1, "all control/warm stages must share the same public account snapshot");
  assert.equal(new Set(terminal.rows.map(row => row.rows[0].wire.tools)).size, 8, "control prefixes must be independent");
  for (const arm of ARMS) {
   const queries = state.queries.filter(query => query.arm === arm.id), row = terminal.rows.find(row => row.armId === arm.id);
   assert.equal(row.sourceToolCalls, 1); assert.equal(row.refreshToolCalls, 0); assert.equal(row.productionChanged, false); assert.equal(row.expiryProven, false);
   assert.equal(queries.length, arm.warmed ? 4 : 3); assert.ok(queries.every(query => query.validation));
   const source = queries.find(query => query.stage === "tool"), followup = queries.at(-1), age = followup.requestElapsedMs - source.requestElapsedMs;
   assert.ok(age >= TIMING.offline.followupMinMs && age <= TIMING.offline.followupMaxMs);
   const sourceCached = source.validation.usage.cache_read_input_tokens + source.validation.usage.cache_creation_input_tokens;
   assert.equal(followup.validation.usage.cache_read_input_tokens, arm.warmed ? sourceCached : 0);
   if (arm.warmed) {
    const refresh = queries.find(query => query.stage === "refresh"), refreshAge = refresh.requestElapsedMs - source.requestElapsedMs;
    assert.ok(refreshAge >= TIMING.offline.refreshMinMs && refreshAge <= TIMING.offline.refreshMaxMs);
    assert.equal(refresh.validation.usage.output_tokens, 1); assert.equal(refresh.validation.sourceUnchanged, true); assert.equal(refresh.validation.noPersistedFork, true);
   }
   assert.equal(new Set(row.rows.map(item => item.runtimeHash)).size, 1);
   for (const field of ["system", "tools"]) assert.equal(new Set(row.rows.map(item => item.wire[field])).size, 1);
   for (const item of row.rows) { assert.equal(item.wire.maxTokens, item.stage === "refresh" ? 1 : 128); assert.ok(item.wire.ttl.every(ttl => ttl === "5m")); }
  }
 } finally { if (result.ledger) rmSync(join(result.ledger, ".."), { recursive: true, force: true }); }
});
test("a simulated control cache hit refuses qualification and retains prior validated stages", { timeout: 90_000 }, () => {
 const child = spawnSync(process.execPath, ["--input-type=module", "-e", 'import { runOfflineControlHitFixture } from "./diag/probe-five-expiry-v2.mjs"; await runOfflineControlHitFixture();'], { env, encoding: "utf8", timeout: 80_000 });
 const result = JSON.parse((child.stdout || child.stderr).trim().split("\n").at(-1));
 try {
  assert.equal(child.status, 1); assert.equal(result.status, "refused"); assert.ok(result.sdkStarts <= 28); assert.ok(result.httpAttempts <= 36);
  const state = load(result.ledger, "events.jsonl").at(-1), evidence = load(result.ledger, "evidence.jsonl");
  assert.equal(state.status, "failed"); assert.equal(state.forwarded, 0); assert.ok(evidence.some(row => row.validatedStage?.stage === "tool"));
  const contaminated = evidence.find(row => !ARMS[row.armId]?.warmed && row.observation?.stage === "response-observation" && state.queries[row.query]?.stage === "followup" && row.observation.response.usage.cache_read_input_tokens > 0);
  assert.ok(contaminated); assert.equal(state.queries[contaminated.query].validation, undefined); assert.equal(evidence.at(-1).status, "failed");
 } finally { if (result.ledger) rmSync(join(result.ledger, ".."), { recursive: true, force: true }); }
});
test("same-plan account change between control/warm arms withholds the changed arm input", { timeout: 60_000 }, () => {
 const child = spawnSync(process.execPath, ["--input-type=module", "-e", 'import { runOfflineAccountChangeFixture } from "./diag/probe-five-expiry-v2.mjs"; await runOfflineAccountChangeFixture();'], { env, encoding: "utf8", timeout: 55_000 });
 const result = JSON.parse((child.stdout || child.stderr).trim().split("\n").at(-1));
 try {
  assert.equal(child.status, 1); assert.equal(result.status, "refused");
  const state = load(result.ledger, "events.jsonl").at(-1), evidence = load(result.ledger, "evidence.jsonl");
  assert.equal(state.status, "failed"); assert.equal(state.forwarded, 0);
  const changed = state.queries.find(query => query.arm === 1 && query.stage === "seed");
  assert.ok(changed?.started); assert.equal(changed.attempts, 0); assert.equal(changed.validation, undefined);
  assert.equal(state.queries.some(query => query.arm > 1), false);
  assert.doesNotMatch(JSON.stringify(evidence), /@account\.invalid/);
 } finally { if (result.ledger) rmSync(join(result.ledger, ".."), { recursive: true, force: true }); }
});
