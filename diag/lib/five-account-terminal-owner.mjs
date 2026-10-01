// Diagnostic only: an exclusive directory is an irrevocable tombstone, even on
// partial creation/persistence failure. No resume, reset, or repair operation.
import { constants, mkdirSync, openSync, writeSync, fsyncSync, closeSync, fstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
export const APPROVAL = Object.freeze({ id: "native-five-account-terminal-1q-60s-v1", sdkStarts: 1, elapsedMs: 60_000 });
export { guardOrdinaryEnvironment } from "./native-cache-account-probe-owner.mjs";
export function parseArgs(args) {
 if (!args.length || (args.length === 1 && args[0] === "--readiness")) return "readiness";
 if (args.length === 1 && args[0] === "--offline") return "offline";
 if (args.length === 2 && args[0] === "--live" && args[1] === APPROVAL.id) return "live";
 throw Error("arguments refused");
}
export function validateApproval(path, codeHash, now = Date.now()) {
 const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
 try {
  const stat = fstatSync(fd), value = JSON.parse(readFileSync(fd, "utf8"));
  const expected = { ...APPROVAL, codeHash, approvedAt: value.approvedAt, expiresAt: value.expiresAt };
  if (!stat.isFile() || (stat.mode & 0o777) !== 0o400 || stat.nlink !== 1 || stat.uid !== process.getuid()
   || !/^[a-f0-9]{64}$/.test(codeHash) || JSON.stringify(value) !== JSON.stringify(expected)
   || !Number.isSafeInteger(now) || !Number.isSafeInteger(value.approvedAt) || !Number.isSafeInteger(value.expiresAt)
   || value.approvedAt < 0 || now < value.approvedAt || now >= value.expiresAt) throw Error("approval refused");
 } finally { closeSync(fd); }
}
const syncDir = path => { const fd = openSync(path, "r"); try { fsyncSync(fd); } finally { closeSync(fd); } };
export class AccountOwner {
 constructor(path, { codeHash, prior, offline = false, now = Date.now, monotonic = () => performance.now(), persist = () => {} }) {
  this.now = now; this.monotonic = monotonic; this.persist = persist;
  this.last = now(); this.origin = this.lastMono = monotonic(); this.poisoned = false;
  if (!Number.isSafeInteger(this.last) || this.last < 0 || !Number.isFinite(this.origin)) throw Error("clock refused");
  mkdirSync(path, { mode: 0o700 });
  try {
   syncDir(dirname(path)); this.fd = openSync(join(path, "events.jsonl"), "wx", 0o600); syncDir(path);
   this.state = { mode: offline ? "offline-fixture" : "live", approval: APPROVAL, codeHash, prior,
    startedAt: this.last, status: "running", reserved: 0, sdkStarts: 0, invocationUncertain: false,
    blockedHttpAttempts: 0, modelHttpAttempts: 0, forwarded: 0, inputReleased: 0 };
   this.commit();
  } catch { this.close(); throw Error("allocation persistence refused"); }
 }
 check() {
  const now = this.now(), mono = this.monotonic();
  if (this.poisoned || this.fd === undefined || this.state.status !== "running" || !Number.isSafeInteger(now)
   || !Number.isFinite(mono) || now < this.last || mono < this.lastMono
   || now - this.state.startedAt >= APPROVAL.elapsedMs || mono - this.origin >= APPROVAL.elapsedMs) {
   this.poisoned = true; throw Error("allocation clock or state refused");
  }
  this.last = now; this.lastMono = mono;
 }
 commit() {
  try {
   this.persist();
   const data = Buffer.from(JSON.stringify({ ...this.state, observedAt: this.last }) + "\n");
   let offset = 0;
   while (offset < data.length) { const count = writeSync(this.fd, data, offset); if (!count) throw Error(); offset += count; }
   fsyncSync(this.fd);
  } catch { this.poisoned = true; throw Error("journal persistence refused"); }
 }
 reserve() {
  this.check(); if (this.state.reserved) throw Error("start already reserved");
  this.state.reserved = 1; this.state.invocationUncertain = true; this.commit();
 }
 started() {
  // Observation, NOT permission. Preserve accurate late accounting during stop.
  if (!this.state.reserved || this.state.sdkStarts || this.fd === undefined) throw Error("unowned or duplicate SDK start");
  this.state.sdkStarts = 1; this.state.invocationUncertain = false; this.commit();
 }
 blocked(model) {
  this.state.blockedHttpAttempts++; if (model) this.state.modelHttpAttempts++;
  this.commit();
 }
 finish(status, account) {
  if (!["complete", "failed"].includes(status) || this.state.status !== "running") throw Error("terminal state refused");
  if (status === "complete") this.check();
  this.state.status = status;
  if (account) this.state.account = account;
  try { this.commit(); } finally { this.close(); }
 }
 close() { if (this.fd !== undefined) { closeSync(this.fd); this.fd = undefined; } }
}
