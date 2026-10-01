// Diagnostic only. This fixed allowance never reuses a qualification allocation.
import { constants, mkdirSync, openSync, closeSync, fsyncSync, writeSync, readFileSync, fstatSync } from "node:fs";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
export const APPROVAL = Object.freeze({ id: "native-five-expiry-28q-36http-20m-v1", sdkStarts: 28, httpAttempts: 36, elapsedMs: 1_200_000 });
export const OUTPUT_CAPS = Object.freeze({ seed: 128, tool: 128, refresh: 1, followup: 128 });
export const COHORT = Object.freeze(["claude-sonnet-5-5", "claude-opus-5-5[1m]"]);
export const ARMS = Object.freeze(COHORT.flatMap(model => [0, 1].flatMap(comparison => [true, false].map(warmed => Object.freeze({ model, comparison, warmed })))).map((arm, id) => Object.freeze({ ...arm, id })));
export const TIMING = Object.freeze({
 live: Object.freeze({ refreshTargetMs: 241_000, refreshMinMs: 240_000, refreshMaxMs: 280_000, followupTargetMs: 366_000, followupMinMs: 365_000, followupMaxMs: 450_000 }),
 offline: Object.freeze({ refreshTargetMs: 1000, refreshMinMs: 1000, refreshMaxMs: 5000, followupTargetMs: 2000, followupMinMs: 2000, followupMaxMs: 8000 }),
});
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
  this.now = now; this.monotonic = monotonic; this.persist = persist; this.offline = offline;
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
 reserve(armId, stage) {
  this.check(); const arm = Number.isSafeInteger(armId) ? ARMS[armId] : undefined;
  const prior = this.state.queries.filter(q => q.arm === armId), stages = arm?.warmed ? ["seed", "tool", "refresh", "followup"] : ["seed", "tool", "followup"];
  if (!arm || this.state.reserved >= APPROVAL.sdkStarts || stages[prior.length] !== stage || (prior.length && !prior.at(-1).validation)) throw Error("allocation exhausted or invalid stage");
  const id = this.state.reserved++;
  this.state.queries.push({ id, arm: armId, model: arm.model, stage, reservedAt: this.last, started: false, attempts: 0, forwarded: 0, responses: [], toolUseHash: null, toolCalled: false, toolResultVerified: false }); this.commit(); return id;
 }
 record(id) { this.check(); if (!Number.isSafeInteger(id) || !this.state.queries[id]) throw Error("unknown query"); return this.state.queries[id]; }
 started(id) { const q = this.record(id); if (q.started) throw Error("duplicate SDK start"); q.started = true; this.state.sdkStarts++; this.commit(); }
 attempt(id) {
  const q = this.record(id);
  const continuation = q.stage === "tool" && q.attempts === 1 && q.toolCalled && q.responses.length === 1 && q.responses[0].stop === "tool_use";
  if (!q.started || (q.attempts && !continuation) || this.state.httpAttempts >= APPROVAL.httpAttempts) {
   this.state.blockedAttempts++; this.commit(); this.poisoned = true; throw Error("additional HTTP attempt blocked");
  }
  const source = this.state.queries.find(row => row.arm === q.arm && row.stage === "tool");
  const elapsed = this.lastMono - this.origin;
  if (q.stage === "refresh" || q.stage === "followup") {
   const timing = TIMING[this.offline ? "offline" : "live"], age = elapsed - source?.requestElapsedMs;
   const min = q.stage === "refresh" ? timing.refreshMinMs : timing.followupMinMs, max = q.stage === "refresh" ? timing.refreshMaxMs : timing.followupMaxMs;
   if (!source?.validation || !Number.isFinite(age) || age < min || age > max) { this.state.blockedAttempts++; this.commit(); this.poisoned = true; throw Error("source-relative timing refused"); }
  }
  q.attempts++; q.requestAt = this.last; q.requestElapsedMs = elapsed; this.state.httpAttempts++; this.commit(); return { wallMs: this.last, elapsedMs: elapsed };
 }
 forwarded(id) {
  const q = this.record(id);
  if (!q.attempts || q.forwarded !== q.attempts - 1 || q.responses.length !== q.attempts - 1 || (q.attempts === 2 && !q.toolResultVerified)) throw Error("forwarding denied");
  q.forwarded++; this.state.forwarded++; this.commit();
 }
 responded(id, provider) {
  const q = this.record(id), tool = q.stage === "tool" && q.attempts === 1;
  const expected = tool ? "tool_use" : q.stage === "refresh" ? "max_tokens" : "end_turn";
  if (!q.attempts || q.responses.length !== q.attempts - 1 || (!this.offline && q.forwarded !== q.attempts)
   || provider?.stop !== expected || (tool ? !/^[a-f0-9]{64}$/.test(provider.toolUseHash) : provider.toolUseHash !== null)) throw Error("response protocol refused");
  q.responses.push({ stop: provider.stop, toolUseHash: provider.toolUseHash }); if (tool) q.toolUseHash = provider.toolUseHash; this.commit();
 }
 toolCalled(id, toolUseHash) {
  const q = this.record(id);
  if (q.stage !== "tool" || q.attempts !== 1 || q.responses.length !== 1 || q.toolCalled || !q.toolUseHash || toolUseHash !== q.toolUseHash) throw Error("source tool invocation refused");
  q.toolCalled = true; this.commit();
 }
 toolResult(id, toolUseHash) {
  const q = this.record(id);
  if (q.stage !== "tool" || q.attempts !== 2 || q.responses.length !== 1 || !q.toolCalled || q.toolResultVerified || toolUseHash !== q.toolUseHash) throw Error("source tool pairing refused");
  q.toolResultVerified = true; this.commit();
 }
 validated(id, value) {
  const q = this.record(id), arm = ARMS[q.arm], source = this.state.queries.find(row => row.arm === q.arm && row.stage === "tool");
  const usage = value?.usage, cached = source?.validation?.usage.cache_read_input_tokens + source?.validation?.usage.cache_creation_input_tokens;
  const valid = !q.validation && q.responses.length === (q.stage === "tool" ? 2 : 1)
   && (this.offline || q.forwarded === q.attempts) && (q.stage !== "refresh" || value?.sourceUnchanged === true && value?.noPersistedFork === true)
   && ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"].every(key => Number.isSafeInteger(usage?.[key]) && usage[key] >= 0)
   && usage.output_tokens <= OUTPUT_CAPS[q.stage]
   && (q.stage !== "tool" || (q.toolCalled && q.toolResultVerified && Number.isSafeInteger(usage.cache_read_input_tokens + usage.cache_creation_input_tokens) && usage.cache_read_input_tokens + usage.cache_creation_input_tokens > 0))
   && (q.stage !== "refresh" || (usage.output_tokens === 1 && Number.isSafeInteger(cached) && cached > 0 && usage.cache_read_input_tokens >= cached && usage.cache_creation_input_tokens <= 1024))
   && (q.stage !== "followup" || (Number.isSafeInteger(cached) && cached > 0 && (arm.warmed ? usage.cache_read_input_tokens >= cached : usage.cache_read_input_tokens === 0 && usage.cache_creation_input_tokens >= cached)));
  if (!valid) { this.poisoned = true; throw Error("stage validation refused"); }
  q.validation = { usage: { ...usage }, ...(q.stage === "refresh" ? { sourceUnchanged: true, noPersistedFork: true } : {}) }; this.commit();
 }
 finish(status) {
  if (!["complete", "failed"].includes(status) || this.state.status !== "running") throw Error("terminal state refused");
  if (status === "complete") {
   this.check();
   if (this.state.sdkStarts !== 28 || this.state.httpAttempts !== 36 || this.state.blockedAttempts !== 0
    || (!this.offline && this.state.forwarded !== 36) || this.state.queries.some(q => !q.validation)) throw Error("incomplete allocation");
  }
  this.state.status = status;
  try { this.commit(); } finally { this.close(); }
 }
 close() { if (this.fd !== undefined) { closeSync(this.fd); this.fd = undefined; } }
}
