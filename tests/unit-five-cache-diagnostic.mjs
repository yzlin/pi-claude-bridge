import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, symlinkSync, rmSync } from "node:fs";

import { tmpdir } from "node:os";
import { join } from "node:path";
import { APPROVAL, COHORT, FiveOwner, parseArgs, validateApproval, diagnosticModelUsage, candidateCachePass } from "../diag/lib/five-cache-diagnostic-owner.mjs";
const fixture = () => mkdtempSync(join(tmpdir(), "five-cache-unit-"));
test("only the fresh diagnostic id authorizes live, fixed eight starts and ten minutes", () => {
 assert.equal(parseArgs([]), "readiness"); assert.equal(parseArgs(["--offline"]), "offline"); assert.equal(parseArgs(["--live", APPROVAL.id]), "live");
 assert.deepEqual(APPROVAL, { id: "native-five-verbatim-8q-10m-v3", sdkStarts: 8, httpAttempts: 8, elapsedMs: 600_000 });
 for (const id of ["native-five-verbatim-8q-10m-v2", "native-five-verbatim-8q-10m-v1", "native-cache-40q-40m-v1", "native-cache-haiku-12q-20m-v1", "native-cache-haiku-12q-20m-v2", "native-cache-3m-16q-25m-v3"]) assert.throws(() => parseArgs(["--live", id]));
 for (const args of [["--live"], ["--model", "x"], ["--offline", "--live"], ["--live", APPROVAL.id, "--limit", "80"]]) assert.throws(() => parseArgs(args));
});
test("diagnostic usage matches only cohort alias, dated id, and requested [1m] metadata", () => {
 for (const model of COHORT) {
  const base = model.replace(/\[1m\]$/, ""), served = `${base}-20251001`;
  const row = { canonicalModel: model, provider: "firstParty", costBasis: "list" };
  for (const key of [model, base, served]) assert.equal(diagnosticModelUsage({ [key]: row }, served, model), row);
  assert.equal(diagnosticModelUsage({ [model]: row, [served]: row }, served, model), undefined);
  for (const bad of [`${base}-evil`, `${base}-2025100`, `${base}-20251001-x`, `prefix-${base}`]) assert.equal(diagnosticModelUsage({ [model]: row }, bad, model), undefined);
  for (const canonicalModel of [undefined, 7, "claude-haiku-4-5"]) assert.equal(diagnosticModelUsage({ [model]: { ...row, canonicalModel } }, served, model), undefined);
 }
 assert.equal(diagnosticModelUsage({}, "claude-haiku-4-5", "claude-haiku-4-5"), undefined);
});
test("candidate requires actual cached tokens, valid integer counters and bounded refresh tail", () => {
 const usage = (read, write) => ({ cache_read_input_tokens: read, cache_creation_input_tokens: write });
 assert.equal(candidateCachePass(usage(0, 0), usage(0, 0), usage(0, 0)), false);
 assert.equal(candidateCachePass(usage(100, 20), usage(120, 1024), usage(120, 0)), true);
 assert.equal(candidateCachePass(usage(100, 20), usage(119, 0), usage(120, 0)), false);
 assert.equal(candidateCachePass(usage(100, 20), usage(120, 1025), usage(120, 0)), false);
 assert.equal(candidateCachePass(usage(100, 20), usage(120, 0), usage(119, 0)), false);
 for (const invalid of [-1, 0.5, NaN, Infinity, "120", undefined, Number.MAX_SAFE_INTEGER + 1]) {
  for (const index of [0, 1, 2]) for (const key of ["cache_read_input_tokens", "cache_creation_input_tokens"]) {
   const rows = [usage(100, 20), usage(120, 0), usage(120, 0)]; rows[index][key] = invalid;
   assert.equal(candidateCachePass(...rows), false);
  }
 }
 assert.equal(candidateCachePass(usage(Number.MAX_SAFE_INTEGER, 1), usage(Number.MAX_SAFE_INTEGER, 0), usage(Number.MAX_SAFE_INTEGER, 0)), false);
});
test("allocation is irrevocable, four starts per model, eight total, single attempt", () => {
 const root = fixture(), path = join(root, "ledger"); let owner;
 try {
  owner = new FiveOwner(path, { offline: true }); assert.throws(() => new FiveOwner(path));
  for (const model of COHORT) {
   for (let n = 0; n < 4; n++) { const id = owner.reserve(model); owner.started(id); assert.throws(() => owner.started(id)); owner.attempt(id); owner.forwarded(id); assert.throws(() => owner.forwarded(id)); }
   assert.throws(() => owner.reserve(model));
  }
  assert.equal(owner.state.sdkStarts, 8); assert.equal(owner.state.httpAttempts, 8); assert.equal(owner.state.forwarded, 8);
  assert.throws(() => owner.reserve("claude-haiku-4-5")); owner.finish("complete"); assert.throws(() => owner.reserve(COHORT[0])); assert.throws(() => new FiveOwner(path));
  const final = JSON.parse(readFileSync(join(path, "events.jsonl"), "utf8").trim().split("\n").at(-1)); assert.equal(final.status, "complete");
 } finally { owner?.close(); rmSync(root, { recursive: true, force: true }); }
});
test("second HTTP attempt poisons allocation before another forwarding", () => {
 const root = fixture(); let owner;
 try {
  owner = new FiveOwner(join(root, "ledger"), { offline: true }); const id = owner.reserve(COHORT[0]);
  owner.started(id); owner.attempt(id); owner.forwarded(id);
  assert.throws(() => owner.attempt(id)); assert.throws(() => owner.reserve(COHORT[1]));
  assert.equal(owner.state.httpAttempts, 1); assert.equal(owner.state.blockedAttempts, 1); assert.equal(owner.state.forwarded, 1); owner.finish("failed");
 } finally { owner?.close(); rmSync(root, { recursive: true, force: true }); }
});
test("wall/monotonic deadlines, backwards clocks and disk failure never grant starts", () => {
 for (const mode of ["wall", "mono", "wall-backwards", "mono-backwards", "disk"]) {
  const root = fixture(); let now = 1000, mono = 1000, fail = false, owner;
  try {
   owner = new FiveOwner(join(root, "ledger"), { offline: true, now: () => now, monotonic: () => mono, persist: () => { if (fail) throw Error("disk"); } });
   if (mode === "wall") now += APPROVAL.elapsedMs;
   if (mode === "mono") mono += APPROVAL.elapsedMs;
   if (mode === "wall-backwards") now--;
   if (mode === "mono-backwards") mono--;
   if (mode === "disk") fail = true;
   let invoked = false; assert.throws(() => { owner.reserve(COHORT[0]); invoked = true; }); assert.equal(invoked, false);
   fail = false; assert.throws(() => owner.reserve(COHORT[0])); owner.finish("failed");
  } finally { owner?.close(); rmSync(root, { recursive: true, force: true }); }
 }
});
test("marker binds current code and expiry; writable, symlink, corruption and old id refuse", () => {
 const root = fixture(), path = join(root, "marker"), hash = "a".repeat(64), value = { ...APPROVAL, codeHash: hash, approvedAt: 1000, expiresAt: 2000 };
 try {
  writeFileSync(path, JSON.stringify(value), { mode: 0o600 }); assert.throws(() => validateApproval(path, hash, 1500));
  chmodSync(path, 0o400); validateApproval(path, hash, 1500);
  for (const now of [999, 2000]) assert.throws(() => validateApproval(path, hash, now));
  assert.throws(() => validateApproval(path, "b".repeat(64), 1500));
  symlinkSync(path, join(root, "link")); assert.throws(() => validateApproval(join(root, "link"), hash, 1500));
  for (const v of ["bad-json", JSON.stringify({ ...value, id: "native-cache-3m-16q-25m-v3" }), JSON.stringify({ ...value, sdkStarts: 9 })]) {
   chmodSync(path, 0o600); writeFileSync(path, v); chmodSync(path, 0o400); assert.throws(() => validateApproval(path, hash, 1500));
  }
 } finally { rmSync(root, { recursive: true, force: true }); }
});
