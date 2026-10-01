#!/usr/bin/env node
// No SDK import here. Default/readiness cannot spawn children or reach auth.
import { execFileSync, fork } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, openSync, writeSync, fsyncSync, closeSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { APPROVAL, COHORT, BudgetOwner, parseArgs, guardEnvironment, validateApprovalMarker, refreshTailBounded } from "./lib/native-cache-qualification-budget.mjs";
import { guardOrdinaryEnvironment } from "./lib/native-cache-account-probe-owner.mjs";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const markerPath = join(repo, "diag/native-cache-3m-v3.approved.json");
const liveLedger = join(repo, "diag/native-cache-3m-v3.live");
const workerPath = join(repo, "diag/lib/native-cache-qualification-worker.mjs");
function codeHash() {
	const files = ["diag/qualify-native-cache-warming.mjs", "diag/lib/native-cache-account-probe-owner.mjs", ...readdirSync(join(repo, "diag/lib")).filter(name => /^native-cache-qualification-.*\.mjs$/.test(name)).map(name => `diag/lib/${name}`),
		...readdirSync(join(repo, "src")).filter(name => name.endsWith(".ts")).map(name => `src/${name}`), "package.json"];
	const hash = createHash("sha256");
	for (const file of files.sort()) hash.update(file).update("\0").update(readFileSync(join(repo, file))).update("\0");
	return hash.digest("hex");
}
function checkMarker() { validateApprovalMarker(markerPath, codeHash()); }
// Pure layout assembly: exporting this never authorizes a live run.
export function syntheticArm(root, index, offline) {
	if (typeof offline !== "boolean") throw new Error("explicit boolean mode required");
	const path = join(root, `arm-${index}`), home = join(path, "home"), config = join(home, ".claude"), agent = join(path, "pi-agent"), cwd = join(path, "project");
	for (const dir of [home, config, agent, cwd]) mkdirSync(dir, { recursive: true, mode: 0o700 });
	writeFileSync(join(agent, "claude-bridge.json"), JSON.stringify({ startupNoticeShown: "qualification-synthetic", askClaude: { enabled: false }, provider: { autoMemoryEnabled: false } }), { mode: 0o600 });
	return { cwd, env: { PATH: process.env.PATH, HOME: home, TMPDIR: path, ...(offline ? { CLAUDE_CONFIG_DIR: config } : {}), PI_CODING_AGENT_DIR: agent } };
}
// Live arms keep the user's real HOME (the stored login is only reachable there, see
// diag/NATIVE-CACHE-ACCOUNT-PROBE.md) and the reviewed parent env, like ordinary chat.
// Only the cwd, TMPDIR and Pi agent dir are synthetic.
export function ordinaryArm(root, index, parentEnv = process.env) {
	guardOrdinaryEnvironment(parentEnv);
	if (Object.hasOwn(parentEnv, "CLAUDE_CONFIG_DIR")) throw new Error("config override refused");
	const path = join(root, `arm-${index}`), agent = join(path, "pi-agent"), cwd = join(path, "project");
	for (const dir of [agent, cwd]) mkdirSync(dir, { recursive: true, mode: 0o700 });
	writeFileSync(join(agent, "claude-bridge.json"), JSON.stringify({ startupNoticeShown: "qualification-synthetic", askClaude: { enabled: false }, provider: { autoMemoryEnabled: false } }), { mode: 0o600 });
	return { cwd, env: { ...parentEnv, TMPDIR: path, PI_CODING_AGENT_DIR: agent } };
}
// The SDK writes each live arm's source session under the real ~/.claude/projects,
// in a directory named after the arm cwd. Only directories carrying this run's unique
// root name are removed; nothing else in the user's config is touched.
export function armProjectDirs(root, home = process.env.HOME) {
	const projects = join(home, ".claude", "projects"), unique = root.split("/").at(-1);
	if (!/^native-qualification-synthetic-\w{6}$/.test(unique) || !existsSync(projects)) return [];
	return readdirSync(projects).filter(name => name.includes(unique)).map(name => join(projects, name));
}
// Exported test entry cannot select live mode or the fixed live ledger.
export async function runOfflineFixture(fixture) {
	guardEnvironment(process.env);
	if (!fixture || !/^native-qualification-test-/.test(fixture.root?.split("/").at(-1) ?? "") || dirname(fixture.root) !== tmpdir()) throw new Error("offline temporary root required");
	return run(true, fixture);
}
async function run(offline, fixture) {
	if (!offline) { checkMarker(); if (existsSync(liveLedger)) throw new Error("allocation already exists; restart/reset forbidden"); }
	const root = fixture?.root ?? mkdtempSync(join(tmpdir(), offline ? "native-qualification-offline-" : "native-qualification-synthetic-"));
	const path = offline ? join(root, "ledger") : liveLedger;
	const baseTime = Date.now();
	let persistenceFault = false, activeDeadlineFault = false;
	const owner = new BudgetOwner(path, { offline,
		now: () => activeDeadlineFault ? baseTime + APPROVAL.elapsedMs : fixture?.fault === "deadline" ? baseTime + (Date.now() - baseTime > 10 ? APPROVAL.elapsedMs : 0)
			: fixture?.fault === "clock" ? baseTime - (Date.now() - baseTime > 10 ? 1 : 0) : Date.now(),
		persist: () => { if (persistenceFault) throw new Error("offline disk fault"); },
	});
	if (fixture?.fault === "persistence") persistenceFault = true;
	const evidenceFd = openSync(join(path, "evidence.jsonl"), "wx", 0o600);
	const workers = new Set(), rows = []; let armIndex = 0, stopped = false, evidenceFailed = false;
	const record = event => {
		try {
			const bytes = Buffer.from(JSON.stringify({ mode: offline ? "offline-simulation" : "live", ...event }) + "\n");
			let offset = 0; while (offset < bytes.length) { const size = writeSync(evidenceFd, bytes, offset); if (!size) throw new Error("short write"); offset += size; } fsyncSync(evidenceFd);
		} catch { evidenceFailed = true; stop(); throw new Error("evidence persistence failed"); }
	};
	function stop() {
		stopped = true;
		for (const worker of workers) worker.kill();
	}
	function check() { if (stopped) throw new Error("supervisor stopped"); owner.check(); }
	const watchdog = setInterval(() => { try { check(); } catch { stop(); } }, 100);
	const deadlineTimer = setTimeout(stop, Math.max(0, owner.state.startedAt + APPROVAL.elapsedMs - Date.now()));
	const onSignal = () => stop();
	process.on("SIGTERM", onSignal); process.on("SIGINT", onSignal);
	function arm(model, partition) {
		check();
		const index = armIndex++;
		const synthetic = offline ? syntheticArm(root, index, true) : ordinaryArm(root, index);
		if (fixture?.fault === "hooks") {
			mkdirSync(join(synthetic.cwd, ".claude"), { recursive: true });
			// Hooks alone are inert under the query's disableAllHooks; raw env stays unsafe.
			writeFileSync(join(synthetic.cwd, ".claude/settings.json"), JSON.stringify({ env: { KEEP: "unsafe" }, hooks: { SessionStart: [{ hooks: [{ type: "command", command: "false" }] }] } }));
		}
		const child = fork(workerPath, [], { cwd: repo, env: synthetic.env,
			execArgv: ["--experimental-test-module-mocks", "--import", "tsx"], stdio: ["ignore", "ignore", "ignore", "ipc"], detached: true });
		let id = 0, closed = false, killTimer;
		const commands = new Map(), ready = Promise.withResolvers(), exited = Promise.withResolvers(), owned = new Set();
		function rejectAll() { ready.reject(new Error("worker refused")); for (const request of commands.values()) request.reject(new Error("worker refused")); commands.clear(); }
		const api = {
			exited: exited.promise,
			kill() {
				if (closed) return;
				closed = true;
				try { process.kill(-child.pid, "SIGTERM"); } catch {}
				killTimer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 1500);
				rejectAll();
			},
			async command(command) {
				await ready.promise; check(); if (closed) throw new Error("worker closed");
				const requestId = id++, deferred = Promise.withResolvers(); commands.set(requestId, deferred);
				child.send({ type: "command", id: requestId, command });
				const timer = setTimeout(() => api.kill(), 65_000);
				try { const value = await deferred.promise; check(); record({ model, partition, arm: index, command, value }); return value; }
				finally { clearTimeout(timer); }
			},
			close() { api.kill(); },
		};
		workers.add(api);
		child.on("error", () => { rejectAll(); api.kill(); if (!child.pid) { clearTimeout(killTimer); exited.resolve(); } });
		child.on("exit", () => {
			rejectAll(); api.kill(); clearTimeout(killTimer);
			try { process.kill(-child.pid, "SIGKILL"); } catch {} // remaining SDK descendants
			exited.resolve();
		});
		child.on("message", async message => {
			try {
				if (message.type === "budget") {
					check(); if (closed) throw new Error("closed worker");
					let value;
					if (message.operation === "reserve") { value = owner.reserve(partition, model); owned.add(value); }
					else {
						if (!owned.has(message.id)) throw new Error("cross-arm query attribution refused");
						if (message.operation === "started") {
							value = owner.started(message.id);
							if (fixture?.fault === "deadline-active") setTimeout(() => { activeDeadlineFault = true; }, 200).unref();
						}
						else if (message.operation === "attempt") value = owner.attempt(message.id);
						else if (message.operation === "forwarded") { if (offline) throw new Error("offline forwarding forbidden"); value = owner.forwarded(message.id); }
						else if (message.operation === "observe") {
							if (!["account", "wire", "response-status", "response"].includes(message.evidence?.stage)) throw new Error("invalid observation stage");
							record({ model, partition, query: message.id, observation: message.evidence });
						}
						else throw new Error("unknown budget operation");
					}
					child.send({ type: "budget-result", requestId: message.requestId, ok: true, value });
				} else if (message.type === "ready") ready.resolve();
				else if (message.type === "result") { const request = commands.get(message.id); commands.delete(message.id); if (!request) throw new Error("unowned result"); request.resolve(message.value); }
				else if (message.type === "failure") { record({ model, partition, failure: message.reason, partial: message.records }); rejectAll(); api.kill(); }
				else throw new Error("unexpected worker event");
			} catch { api.kill(); stop(); }
		});
		child.send({ type: "init", offline, model, nonce: randomUUID(), cwd: synthetic.cwd, deadlineAt: owner.state.startedAt + APPROVAL.elapsedMs, ...(fixture ? { offlineFault: fixture.fault } : {}) });
		return api;
	}
	try {
		record({ approval: APPROVAL, codeHash: codeHash(), status: "started", productionQualifications: 0 });
		const passing = [];
		const matrix = async model => {
			const worker = arm(model, "matrix");
			try {
				const seed = await worker.command("seed"), refresh = await worker.command("refresh");
				const pass = refresh.kind === "refresh" && refreshTailBounded(refresh.nativeUsage);
				const row = { model, status: pass ? (offline ? "simulated-pass" : "candidate-pass") : "native-rejected", seed, refresh };
				rows.push(row); record({ row });
				if (pass) passing.push(model);
			} finally { worker.close(); }
		};
		// A worker failure ends the run, so the Haiku proof (matrix + expiry) runs
		// before any other model can fail it.
		await matrix("claude-haiku-4-5");
		const comparisons = [];
		// No automatic followups or retries.
		if ((!offline || fixture?.fault === "expiry-simulation") && passing.includes("claude-haiku-4-5")) for (let comparison = 0; comparison < 2; comparison++) {
			const model = "claude-haiku-4-5";
			const warm = arm(model, "expiry"), control = arm(model, "expiry");
			try {
				const warmSeed = await warm.command("seed"), controlSeed = await control.command("seed");
				const wait = async target => { while (Date.now() < target) { check(); await delay(Math.min(1000, target - Date.now())); } check(); };
				if (warmSeed.records[0].wire.tools === controlSeed.records[0].wire.tools) throw new Error("cross-arm prefix collision");
				if (!offline) await wait(warmSeed.requestAt + 240_000);
				const refresh = await warm.command("refresh");
				if (refresh.kind !== "refresh" || (!offline && refresh.requestAt >= warmSeed.requestAt + 300_000)) throw new Error("expiry refresh missed or refused");
				if (!offline) await wait(Math.max(warmSeed.requestAt, controlSeed.requestAt) + 366_000);
				const warmFollowup = await warm.command("followup"), controlFollowup = await control.command("followup");
				const timingValid = offline || (warmFollowup.requestAt > warmSeed.requestAt + 300_000 && controlFollowup.requestAt > controlSeed.requestAt + 300_000 && warmFollowup.requestAt < refresh.requestAt + 300_000);
				const pass = timingValid && refreshTailBounded(refresh.nativeUsage) && warmFollowup.usage.cache_read_input_tokens >= warmSeed.cachedTokens && controlFollowup.usage.cache_read_input_tokens === 0;
				const evidence = { comparison, model, timing: offline ? "simulated-expiry-no-wait" : "actual-request-starts", status: pass ? (offline ? "simulated-pass" : "candidate-pass") : "inconclusive", warmSeed, controlSeed, refresh, warmFollowup, controlFollowup,
					relativeMs: { refresh: refresh.requestAt - warmSeed.requestAt, warmFollowup: warmFollowup.requestAt - warmSeed.requestAt, controlFollowup: controlFollowup.requestAt - controlSeed.requestAt } };
				comparisons.push(evidence); record({ comparison: evidence });
			} finally { warm.close(); control.close(); }
		}
		if (!offline) for (const model of COHORT.filter(model => model !== "claude-haiku-4-5")) await matrix(model);
		record({ status: "complete", rows, comparisons, unverifiedModels: COHORT.filter(model => !rows.some(row => row.model === model && row.status === "candidate-pass")), productionQualifications: 0, reserved: owner.state.reserved, sdkStarts: owner.state.sdkStarts, httpAttempts: owner.state.httpAttempts, forwarded: owner.state.forwarded });
		check(); owner.finish("complete");
		console.log(JSON.stringify({ mode: offline ? "offline-simulation" : "live", status: "complete", ledger: path, sdkStarts: owner.state.sdkStarts, httpAttempts: owner.state.httpAttempts, forwarded: owner.state.forwarded, candidateRows: rows.length, productionQualifications: 0, ttlProof: offline ? "not exercised" : "requires independent acceptance" }));
	} catch {
		if (!evidenceFailed) { try { record({ status: "failed", reason: "gate, worker, transport, budget or deadline refused", unverifiedModels: COHORT.filter(model => !rows.some(row => row.model === model && row.status === "candidate-pass")), reserved: owner.state.reserved, sdkStarts: owner.state.sdkStarts, httpAttempts: owner.state.httpAttempts, forwarded: owner.state.forwarded }); } catch {} }
		try { owner.finish("failed"); } catch { owner.close(); }
		console.error(JSON.stringify({ status: "refused", mode: offline ? "offline-simulation" : "live", ledger: path, sdkStarts: owner.state.sdkStarts, httpAttempts: owner.state.httpAttempts }));
		process.exitCode = 1;
	} finally {
		stop(); clearInterval(watchdog); clearTimeout(deadlineTimer);
		await Promise.all([...workers].map(worker => worker.exited));
		process.off("SIGTERM", onSignal); process.off("SIGINT", onSignal); closeSync(evidenceFd);
		// Only the sanitized ledger survives. SDK-required transient source
		// transcripts/config/prompt bytes never become retained evidence artifacts.
		if (offline) for (const entry of readdirSync(root)) { if (/^arm-\d+$/.test(entry)) rmSync(join(root, entry), { recursive: true, force: true }); }
		else {
			for (const dir of armProjectDirs(root)) execFileSync("trash", [dir]);
			rmSync(root, { recursive: true, force: true });
		}
	}
}
if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))) try {
	const mode = parseArgs(process.argv.slice(2));
	guardOrdinaryEnvironment(process.env); // BEFORE importing SDK; reviewed metadata only
	if (mode === "readiness") console.log(JSON.stringify({ mode, liveStarted: false, sdkStarts: 0, approvalMarker: markerPath, ledger: liveLedger,
		markerRequired: { ...APPROVAL, codeHash: codeHash() }, allocationExists: existsSync(liveLedger), cohort: COHORT, independentVerificationRequired: true }));
	else await run(mode === "offline");
} catch { console.error(JSON.stringify({ status: "refused", sdkStarts: 0, reason: "arguments, ambient state, approval or allocation refused" })); process.exitCode = 1; }
