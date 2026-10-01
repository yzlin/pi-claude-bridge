// Diagnostic-only boundary. A directory is an irrevocable allocation tombstone:
// no recovery/reset operation exists, including after partial creation or a crash.
import { mkdirSync, openSync, writeSync, fsyncSync, closeSync, lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
// Sealed: native-cache-40q-40m-v1 (account gate, synthetic HOME),
// native-cache-haiku-12q-20m-v1 (dated served id), native-cache-haiku-12q-20m-v2
// (complete, but measured the old re-sent-prompt refresh). v3: 3 models x 2 matrix
// starts (seed, refresh) + 2 Haiku expiry comparisons x 5 starts (warm seed, control
// seed, refresh, 2 followups) = 16.
export const APPROVAL = Object.freeze({ id: "native-cache-3m-16q-25m-v3", sdkStarts: 16, elapsedMs: 1_500_000 });
export const COHORT = Object.freeze(["claude-haiku-4-5", "claude-sonnet-5-5", "claude-opus-5-5"]);
// The refresh turn is a fixed "." plus CC's small reminders; v2 wrote ~13.3k here
// when it re-sent the source prompt. A pass requires the tail write to stay tiny.
export const REFRESH_WRITE_LIMIT = 1024;
export function refreshTailBounded(usage) {
	return Number.isInteger(usage?.cacheWrite) && usage.cacheWrite >= 0 && usage.cacheWrite <= REFRESH_WRITE_LIMIT;
}
export function parseArgs(args) {
	if (!args.length || (args.length === 1 && args[0] === "--readiness")) return "readiness";
	if (args.length === 1 && args[0] === "--offline") return "offline";
	if (args.length === 2 && args[0] === "--live" && args[1] === APPROVAL.id) return "live";
	throw new Error("invalid arguments");
}
// Deliberately an allowlist, not a list of known dangerous prefixes. Unknown
// inherited controls must be reviewed, not silently scrubbed into qualification.
export function guardEnvironment(env) {
	const plain = new Set(["HOME", "PATH", "TMPDIR", "TMP", "TEMP", "USER", "LOGNAME", "SHELL", "PWD", "OLDPWD", "SHLVL", "_", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "COLORTERM", "TERM_PROGRAM", "TERM_PROGRAM_VERSION", "TERM_SESSION_ID", "XPC_FLAGS", "XPC_SERVICE_NAME", "__CFBundleIdentifier", "__CF_USER_TEXT_ENCODING", "COMMAND_MODE", "NO_COLOR"]);
	const exact = { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", ENABLE_CLAUDEAI_MCP_SERVERS: "0", DISABLE_AUTO_COMPACT: "1", CLAUDE_AGENT_SDK_VERSION: "0.3.285" };
	for (const [key, value] of Object.entries(env)) {
		if (plain.has(key) || (Object.hasOwn(exact, key) && value === exact[key])) continue;
		throw new Error("unsafe ambient environment"); // never echo names/values
	}
}
export function validateApprovalMarker(path, codeHash) {
	if (!/^[a-f0-9]{64}$/.test(codeHash)) throw new Error("invalid code hash");
	const stat = lstatSync(path);
	if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o400) throw new Error("approval marker is not immutable");
	const expected = { ...APPROVAL, codeHash };
	if (JSON.stringify(JSON.parse(readFileSync(path, "utf8"))) !== JSON.stringify(expected)) throw new Error("approval marker mismatch");
}
const syncDir = path => { const fd = openSync(path, "r"); try { fsyncSync(fd); } finally { closeSync(fd); } };
export class BudgetOwner {
	constructor(path, { offline = false, now = Date.now, monotonic = () => performance.now(), persist = () => {} } = {}) {
		this.now = now; this.monotonic = monotonic; this.persist = persist;
		this.origin = monotonic(); this.last = now(); this.poisoned = false;
		if (!Number.isSafeInteger(this.last) || this.last < 0) throw new Error("invalid clock");
		mkdirSync(path, { mode: 0o700 }); // exclusive across parents, children, crashes, repairs
		syncDir(dirname(path));
		this.fd = openSync(join(path, "events.jsonl"), "wx", 0o600);
		syncDir(path);
		this.state = { mode: offline ? "offline-simulation" : "live", approval: APPROVAL.id, startedAt: this.last,
			status: "running", reserved: 0, sdkStarts: 0, httpAttempts: 0, forwarded: 0,
			partitions: { matrix: 0, expiry: 0, followup: 0 }, queries: [] };
		try { this.commit(); } catch (error) { this.close(); throw error; }
	}
	check() {
		if (this.poisoned) throw new Error("ledger poisoned");
		if (this.state.status !== "running" || this.fd === undefined) throw new Error("allocation closed");
		const now = this.now();
		if (!Number.isSafeInteger(now) || now < this.last) throw new Error("clock regressed");
		if (now - this.state.startedAt >= APPROVAL.elapsedMs || this.monotonic() - this.origin >= APPROVAL.elapsedMs) throw new Error("deadline expired");
		this.last = now;
	}
	commit() {
		try {
			this.persist(); // fault injection used only by offline unit tests
			const data = Buffer.from(JSON.stringify({ ...this.state, observedAt: this.last }) + "\n");
			let offset = 0;
			while (offset < data.length) { const count = writeSync(this.fd, data, offset); if (!count) throw new Error("short write"); offset += count; }
			fsyncSync(this.fd);
		} catch { this.poisoned = true; throw new Error("ledger persistence failed"); }
	}
	reserve(partition, model) {
		this.check();
		const limits = { matrix: 6, expiry: 10, followup: 0 };
		if (!COHORT.includes(model) || !Object.hasOwn(limits, partition) || this.state.reserved >= APPROVAL.sdkStarts || this.state.partitions[partition] >= limits[partition]) throw new Error("allocation exhausted or invalid");
		const id = this.state.reserved++;
		this.state.partitions[partition]++;
		this.state.queries.push({ id, partition, model, reservedAt: this.last, started: false, attempts: 0, forwarded: false });
		this.commit(); return id;
	}
	record(id) {
		this.check();
		if (!Number.isSafeInteger(id) || !this.state.queries[id]) throw new Error("unknown query");
		return this.state.queries[id];
	}
	started(id) {
		const q = this.record(id);
		if (q.started) throw new Error("duplicate SDK start");
		q.started = true; q.startedAt = this.last; this.state.sdkStarts++; this.commit();
	}
	attempt(id) {
		const q = this.record(id);
		if (!q.started) throw new Error("HTTP before SDK start");
		q.attempts++; this.state.httpAttempts++; q.requestAt ??= this.last; this.commit();
		if (q.attempts !== 1) throw new Error("additional HTTP attempt blocked");
		return this.last;
	}
	forwarded(id) {
		const q = this.record(id);
		if (q.attempts !== 1 || q.forwarded) throw new Error("forwarding denied");
		q.forwarded = true; this.state.forwarded++; this.commit();
	}
	finish(status) {
		if (!["complete", "failed", "deadline"].includes(status)) throw new Error("invalid terminal status");
		this.state.status = status; this.commit(); this.close();
	}
	close() { if (this.fd !== undefined) { closeSync(this.fd); this.fd = undefined; } }
}
