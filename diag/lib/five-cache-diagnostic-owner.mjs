// Diagnostic only. This fixed allowance never reuses a qualification allocation.
import { constants, mkdirSync, openSync, closeSync, fsyncSync, writeSync, readFileSync, fstatSync } from "node:fs";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
export const APPROVAL = Object.freeze({ id: "native-five-verbatim-8q-10m-v3", sdkStarts: 8, httpAttempts: 8, elapsedMs: 600_000 });
export const COHORT = Object.freeze(["claude-sonnet-5-5", "claude-opus-5-5[1m]"]);
// SDK modelUsage keeps the requested [1m] option; wire/served IDs omit it.
// Diagnostic-only matching: never changes production qualification or rewrites metadata.
export function diagnosticModelUsage(rows, served, model) {
 if (!COHORT.includes(model) || typeof served !== "string") return undefined;
 const base = model.replace(/\[1m\]$/, "");
 if (served !== base && !(served.startsWith(`${base}-`) && /^\d{8}$/.test(served.slice(base.length + 1)))) return undefined;
 const matches = Object.entries(rows ?? {}).filter(([id]) => id === model || id === base || id === served);
 if (matches.length !== 1) return undefined;
 const row = matches[0][1];
 if (typeof row?.canonicalModel !== "string") return undefined;
 const canonical = row.canonicalModel.replace(/\[1m\]$/, "");
 if (canonical !== base && canonical !== served) return undefined;
 return row;
}
export function candidateCachePass(source, refresh, followup) {
 for (const row of [source, refresh, followup]) for (const key of ["cache_read_input_tokens", "cache_creation_input_tokens"]) {
  if (!Number.isSafeInteger(row?.[key]) || row[key] < 0) return false;
 }
 const cached = source.cache_read_input_tokens + source.cache_creation_input_tokens;
 if (!Number.isSafeInteger(cached) || cached <= 0) return false;
 return refresh.cache_read_input_tokens >= cached && refresh.cache_creation_input_tokens <= 1024 && followup.cache_read_input_tokens >= cached;
}
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
export class FiveOwner {
 constructor(path, { offline = false, now = Date.now, monotonic = () => performance.now(), persist = () => {} } = {}) {
  this.now = now; this.monotonic = monotonic; this.persist = persist;
  this.last = now(); this.origin = this.lastMono = monotonic(); this.poisoned = false;
  if (!Number.isSafeInteger(this.last) || this.last < 0 || !Number.isFinite(this.origin)) throw Error("clock refused");
  mkdirSync(path, { mode: 0o700 }); // Exclusive tombstone, including crash/partial creation.
  try {
   syncDir(dirname(path)); this.fd = openSync(join(path, "events.jsonl"), "wx", 0o600); syncDir(path);
   this.state = { mode: offline ? "offline-simulation" : "live", approval: APPROVAL, startedAt: this.last,
    status: "running", reserved: 0, sdkStarts: 0, httpAttempts: 0, blockedAttempts: 0, forwarded: 0, queries: [] };
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
   this.persist(); const bytes = Buffer.from(JSON.stringify({ ...this.state, observedAt: this.last }) + "\n");
   let offset = 0; while (offset < bytes.length) { const count = writeSync(this.fd, bytes, offset); if (!count) throw Error(); offset += count; }
   fsyncSync(this.fd);
  } catch { this.poisoned = true; throw Error("journal persistence refused"); }
 }
 reserve(model) {
  this.check();
  if (!COHORT.includes(model) || this.state.reserved >= APPROVAL.sdkStarts || this.state.queries.filter(q => q.model === model).length >= 4) throw Error("allocation exhausted or invalid");
  const id = this.state.reserved++;
  this.state.queries.push({ id, model, reservedAt: this.last, started: false, attempts: 0, forwarded: false }); this.commit(); return id;
 }
 record(id) { this.check(); if (!Number.isSafeInteger(id) || !this.state.queries[id]) throw Error("unknown query"); return this.state.queries[id]; }
 started(id) { const q = this.record(id); if (q.started) throw Error("duplicate SDK start"); q.started = true; this.state.sdkStarts++; this.commit(); }
 attempt(id) {
  const q = this.record(id);
  if (!q.started || q.attempts || this.state.httpAttempts >= APPROVAL.httpAttempts) {
   this.state.blockedAttempts++; this.commit(); this.poisoned = true; throw Error("additional HTTP attempt blocked");
  }
  q.attempts = 1; q.requestAt = this.last; this.state.httpAttempts++; this.commit(); return this.last;
 }
 forwarded(id) { const q = this.record(id); if (q.attempts !== 1 || q.forwarded) throw Error("forwarding denied"); q.forwarded = true; this.state.forwarded++; this.commit(); }
 finish(status) {
  if (!["complete", "failed"].includes(status) || this.state.status !== "running") throw Error("terminal state refused");
  if (status === "complete") this.check(); this.state.status = status;
  try { this.commit(); } finally { this.close(); }
 }
 close() { if (this.fd !== undefined) { closeSync(this.fd); this.fd = undefined; } }
}
