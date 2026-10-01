// Exploratory regression evidence: actual SDK over loopback; process pause is
// injected, not OS sleep. No production behavior change or historical cause proof.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR };
test("stalled loopback response cancels through actual SDK and sealed observer before fallback", { timeout: 120_000 }, () => {
 const child = spawnSync(process.execPath, ["--import", "tsx", "diag/probe-five-timing-offline.mjs", "--offline"], { env, encoding: "utf8", timeout: 110_000 });
 assert.equal(child.error, undefined); assert.equal(child.status, 0, child.stderr);
 const lines = child.stdout.trim().split("\n").map(JSON.parse), result = lines.at(-1);
 assert.equal(result.status, "offline-diagnostic"); assert.equal(result.sdkStartReservations, 4); assert.equal(result.forwarded, 0);
 assert.equal(result.expiryProven, false); assert.equal(result.productionChanged, false);
 assert.equal(lines.filter(row => row.status === "offline-stage-complete").length, 5);
 assert.deepEqual(result.rows.map(row => row.mode), ["stream-abort", "stream-abort-close", "string-abort", "observer-stream-abort", "timer-pause"]);
 for (const row of result.rows.slice(0, 4)) {
  assert.equal(row.sdkStarts, 1); assert.equal(row.modelHttpAttempts, 1); assert.equal(row.forwarded, 0);
  assert.equal(row.cliVersion, "2.1.285"); assert.equal(row.toolCalls, 0); assert.equal(row.completedProviderResponses, 0);
  assert.equal(row.accountEligible, false); assert.equal(row.requestObserved, true); assert.equal(row.abortIssued, true);
  assert.equal(row.transportRefused, undefined); assert.equal(row.fallbackClose, undefined);
  assert.ok(row.iteratorSettledAfterAbortMs >= 0 && row.iteratorSettledAfterAbortMs < 5000);
  assert.ok(row.promptCleanupMs >= 0 && row.promptCleanupMs < 5000);
 }
 const paused = result.rows.at(-1);
 assert.equal(paused.sdkStarts, 0); assert.equal(paused.modelHttpAttempts, 0); assert.equal(paused.forwarded, 0);
 assert.equal(paused.sourceStagesSimulated, true);
 assert.deepEqual(paused.events.map(event => event.phase), ["abort-timer", "refresh-timer", "simulated-cleanup-ended"]);
 assert.ok(paused.events[0].actualDelayMs > paused.events[0].plannedDelayMs);
 assert.ok(paused.sourceMonotonicAgeMs > paused.monotonicWindow.maxMs);
 assert.equal(paused.guardRejected, true); assert.equal(paused.rejectionDirection, "late");
 assert.equal(paused.simulatedBlockedAttempts, 1); assert.equal(paused.noHttpAfterTimingRejection, true);
});
test("timing diagnosis has no live, reset or reused-allocation entry point", () => {
 for (const args of [[], ["--live"], ["--live", "native-five-expiry-28q-36http-20m-v1"], ["--reset"], ["--resume"]]) {
  const child = spawnSync(process.execPath, ["--import", "tsx", "diag/probe-five-timing-offline.mjs", ...args], { env, encoding: "utf8", timeout: 10_000 });
  assert.equal(child.status, 1); const result = JSON.parse(child.stderr.trim());
  assert.equal(result.status, "refused"); assert.equal(result.sdkStartReservations, 0); assert.equal(result.forwarded, 0);
 }
});
