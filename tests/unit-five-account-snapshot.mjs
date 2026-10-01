import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, symlinkSync, rmSync } from "node:fs";

import { tmpdir } from "node:os";
import { join } from "node:path";
import { APPROVAL, AccountOwner, parseArgs, validateApproval } from "../diag/lib/five-account-snapshot-owner.mjs";
import { observeSnapshots } from "../diag/probe-five-account-snapshot.mjs";
import { accountEvidence } from "../src/cache-warming.ts";
const temporary = () => mkdtempSync(join(tmpdir(), "five-account-unit-"));
test("comparison publishes ordered sanitized snapshots and only one fresh initialize", async () => {
 const root = temporary(); let owner;
 try {
  owner = new AccountOwner(join(root, "ledger"), { offline: true, prior: [], codeHash: "a".repeat(64) });
  const initial = { apiProvider: "firstParty", tokenSource: "none", email: "SECRET-email" };
  const fresh = { apiProvider: "firstParty", subscriptionType: "Claude Team", organization: "SECRET-org" };
  const calls = [];
  assert.throws(() => owner.snapshot("initial", { eligible: false, lane: '["firstParty",null,"none",null]' }));
  owner.reserve(); owner.started();
  const q = { async accountInfo() { calls.push("accountInfo"); return initial; },
   async reinitialize() { calls.push("reinitialize"); return { account: fresh }; } };
  const result = await observeSnapshots(q, { accountEvidence }, (stage, value) => owner.snapshot(stage, value));
  assert.deepEqual(calls, ["accountInfo", "reinitialize", "accountInfo"]);
  assert.deepEqual(result, owner.state.snapshots);
  assert.deepEqual(result.cached, result.initial); assert.equal(result.fresh.eligible, true);
  assert.throws(() => owner.snapshot("fresh", result.fresh));
  assert.throws(() => owner.snapshot(undefined, result.fresh), "no fourth snapshot allowed");
  assert.ok(!JSON.stringify(result).includes("SECRET"));
  owner.finish("complete");
  const terminal = JSON.parse(readFileSync(join(root, "ledger/events.jsonl"), "utf8").trim().split("\n").at(-1));
  assert.deepEqual(terminal.snapshots, result);
 } finally { owner?.close(); rmSync(root, { recursive: true, force: true }); }
});
test("failed or cancelled fresh comparison preserves only completed safe evidence", async () => {
 for (const cancelled of [false, true]) {
  const root = temporary(); let owner, freshCalls = 0, accountCalls = 0;
  try {
   owner = new AccountOwner(join(root, "ledger"), { offline: true, prior: [], codeHash: "a".repeat(64) });
   owner.reserve(); owner.started();
   const q = { async accountInfo() { accountCalls++; return { apiProvider: "firstParty", tokenSource: "none" }; },
    async reinitialize() { freshCalls++; throw Error("SECRET SDK failure"); } };
   await assert.rejects(observeSnapshots(q, { accountEvidence }, (stage, value) => {
    owner.snapshot(stage, value); if (cancelled) throw Error("cancelled");
   }));
   assert.equal(accountCalls, 1); assert.equal(freshCalls, cancelled ? 0 : 1);
   owner.finish("failed");
   const journal = readFileSync(join(root, "ledger/events.jsonl"), "utf8");
   assert.ok(!journal.includes("SECRET"));
   const terminal = JSON.parse(journal.trim().split("\n").at(-1));
   assert.deepEqual(Object.keys(terminal.snapshots), ["initial"]);
   assert.equal(terminal.status, "failed"); assert.equal(terminal.inputReleased, 0);
   assert.equal(terminal.modelHttpAttempts, 0); assert.equal(terminal.forwarded, 0);
  } finally { owner?.close(); rmSync(root, { recursive: true, force: true }); }
 }
});
test("fresh snapshot id fixes one start/60 seconds and refuses every old account/cache id", () => {
 assert.deepEqual(APPROVAL, { id: "native-five-account-snapshot-1q-60s-v1", sdkStarts: 1, elapsedMs: 60_000 });
 assert.equal(parseArgs([]), "readiness"); assert.equal(parseArgs(["--offline"]), "offline"); assert.equal(parseArgs(["--live", APPROVAL.id]), "live");
 for (const id of ["native-five-account-terminal-1q-60s-v1", "native-five-verbatim-8q-10m-v1", "native-five-verbatim-8q-10m-v2", "native-cache-account-ordinary-1q-60s-v1", "native-cache-account-normal-home-1q-60s-v1", "native-cache-account-1q-60s-v1", "native-cache-40q-40m-v1"]) assert.throws(() => parseArgs(["--live", id]));
 for (const args of [["--live"], ["--reset"], ["--offline", "extra"]]) assert.throws(() => parseArgs(args));
});
test("sole startup is durably reserved; zero-input/no-forward counters and failed tombstone persist", () => {
 const root = temporary(), path = join(root, "ledger"); let owner;
 try {
  owner = new AccountOwner(path, { codeHash: "a".repeat(64), prior: [], offline: true });
  assert.throws(() => owner.started()); owner.reserve();
  assert.equal(JSON.parse(readFileSync(join(path, "events.jsonl"), "utf8").trim().split("\n").at(-1)).invocationUncertain, true);
  assert.throws(() => owner.reserve()); owner.started(); assert.throws(() => owner.started());
  assert.equal(owner.state.inputReleased, 0); assert.equal(owner.state.forwarded, 0); assert.equal(owner.state.modelHttpAttempts, 0);
  owner.blocked(true); assert.equal(owner.state.modelHttpAttempts, 1); owner.finish("failed");
  assert.throws(() => owner.reserve()); assert.throws(() => new AccountOwner(path, { codeHash: "a".repeat(64), prior: [] }));
 } finally { owner?.close(); rmSync(root, { recursive: true, force: true }); }
});
test("wall/monotonic deadlines, backwards time and persistence failures cannot grant starts", () => {
 for (const mode of ["wall", "mono", "wall-back", "mono-back", "disk"]) {
  const root = temporary(); let owner, wall = 1000, mono = 10, broken = false;
  try {
   owner = new AccountOwner(join(root, "ledger"), { codeHash: "a".repeat(64), prior: [], now: () => wall, monotonic: () => mono, persist: () => { if (broken) throw Error("disk"); } });
   if (mode === "wall") wall += APPROVAL.elapsedMs; if (mode === "mono") mono += APPROVAL.elapsedMs;
   if (mode === "wall-back") wall--; if (mode === "mono-back") mono--; if (mode === "disk") broken = true;
   assert.throws(() => owner.reserve()); assert.equal(owner.state.sdkStarts, 0); assert.throws(() => owner.reserve());
  } finally { owner?.close(); rmSync(root, { recursive: true, force: true }); }
 }
});
test("read-only code-bound marker rejects expiry, corruption, links, wrong id and budget", () => {
 const root = temporary(), path = join(root, "marker"), codeHash = "a".repeat(64), fields = { ...APPROVAL, codeHash, approvedAt: 1000, expiresAt: 2000 };
 try {
  writeFileSync(path, JSON.stringify(fields), { mode: 0o400 }); validateApproval(path, codeHash, 1500);
  for (const now of [999, 2000]) assert.throws(() => validateApproval(path, codeHash, now));
  assert.throws(() => validateApproval(path, "b".repeat(64), 1500)); symlinkSync(path, join(root, "link")); assert.throws(() => validateApproval(join(root, "link"), codeHash, 1500));
  chmodSync(path, 0o600); assert.throws(() => validateApproval(path, codeHash, 1500));
  for (const value of ["bad", JSON.stringify({ ...fields, sdkStarts: 2 }), JSON.stringify({ ...fields, id: "native-five-verbatim-8q-10m-v2" })]) {
   writeFileSync(path, value); chmodSync(path, 0o400); assert.throws(() => validateApproval(path, codeHash, 1500)); chmodSync(path, 0o600);
  }
 } finally { rmSync(root, { recursive: true, force: true }); }
});
