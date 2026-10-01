import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, symlinkSync, rmSync } from "node:fs";

import { tmpdir } from "node:os";
import { join } from "node:path";
import { APPROVAL, AccountOwner, parseArgs, validateApproval } from "../diag/lib/five-account-terminal-owner.mjs";
const temporary = () => mkdtempSync(join(tmpdir(), "five-account-unit-"));
test("fresh terminal id fixes one start/60 seconds and refuses every old account/cache id", () => {
 assert.deepEqual(APPROVAL, { id: "native-five-account-terminal-1q-60s-v1", sdkStarts: 1, elapsedMs: 60_000 });
 assert.equal(parseArgs([]), "readiness"); assert.equal(parseArgs(["--offline"]), "offline"); assert.equal(parseArgs(["--live", APPROVAL.id]), "live");
 for (const id of ["native-five-verbatim-8q-10m-v1", "native-five-verbatim-8q-10m-v2", "native-cache-account-ordinary-1q-60s-v1", "native-cache-account-normal-home-1q-60s-v1", "native-cache-account-1q-60s-v1", "native-cache-40q-40m-v1"]) assert.throws(() => parseArgs(["--live", id]));
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
