// No successful live command is ever invoked here. Auth is fake-key loopback.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, fork } from "node:child_process";
import { syntheticArm } from "../diag/qualify-native-cache-warming.mjs";
import { promisify } from "node:util";
import { readFileSync, existsSync, rmSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const runner = join(repo, "diag/qualify-native-cache-warming.mjs");
const env = { PATH: process.env.PATH, HOME: "/nonexistent-offline-qualification-home", TMPDIR: tmpdir() };
const run = args => promisify(execFile)(process.execPath, [runner, ...args], { env, cwd: repo, timeout: 70_000 });
test("default/readiness and malformed arguments cannot create a live allocation", async () => {
	const ledger = join(repo, "diag/native-cache-qualification.live");
	const existed = existsSync(ledger);
	for (const args of [[], ["--readiness"]]) {
		const { stdout } = await run(args), report = JSON.parse(stdout);
		assert.equal(report.liveStarted, false); assert.equal(report.sdkStarts, 0);
	}
	for (const args of [["--unknown"], ["--live"], ["--live", "wrong"], ["--offline", "--model", "arbitrary"]]) {
		await assert.rejects(run(args), error => JSON.parse(error.stderr).sdkStarts === 0);
	}
	assert.equal(existsSync(ledger), existed);
});
test("unsafe inherited environment refuses before SDK startup", async () => {
	for (const key of ["ANTHROPIC_API_KEY", "https_proxy", "CLAUDE_CODE_MAX_RETRIES", "PI_CODING_AGENT_DIR", "CLAUDE_CONFIG_DIR", "CLAUDE_SECURESTORAGE_CONFIG_DIR"]) {
		await assert.rejects(promisify(execFile)(process.execPath, [runner, "--offline"], { env: { ...env, [key]: "do-not-log-this" }, timeout: 5000 }), error => {
			assert.ok(!error.stderr.includes("do-not-log-this")); return JSON.parse(error.stderr).sdkStarts === 0;
		});
	}
});
test("HOME-only public resolver and transcript bookkeeping never launch CLI, auth or network", { timeout: 15_000 }, async () => {
	const root = mkdtempSync(join(tmpdir(), "native-qualification-test-"));
	try {
		const arm = syntheticArm(root, 0, false);
		const report = await new Promise((resolve, reject) => {
			const child = fork(join(repo, "tests/lib/native-cache-home-resolver-check.mjs"), [], {
				cwd: arm.cwd, env: arm.env, execArgv: ["--import", import.meta.resolve("tsx")], stdio: ["ignore", "pipe", "pipe", "ipc"], timeout: 10_000,
			});
			let report, stderr = "";
			child.stderr.on("data", chunk => { stderr += chunk; });
			child.on("message", value => { report = value; });
			child.on("error", reject);
			child.on("exit", code => code === 0 ? resolve(report) : reject(new Error(`resolver-only child refused: ${stderr}`)));
		});
		assert.deepEqual(report, { status: "resolver-only-pass", launches: 0, network: 0, forbiddenReads: 0, transcriptFiles: 3, defaultSettingSources: true });
	} finally { rmSync(root, { recursive: true, force: true }); }
});
test("integrated runner uses real ordinary source, snapshot and native refresh offline", { timeout: 75_000 }, async t => {
	const { stdout } = await run(["--offline"]), report = JSON.parse(stdout);
	t.diagnostic(stdout);
	try {
		assert.equal(report.mode, "offline-simulation"); assert.equal(report.status, "complete");
		assert.equal(report.sdkStarts, 2); assert.equal(report.httpAttempts, 2); assert.equal(report.forwarded, 0);
		assert.equal(report.productionQualifications, 0); assert.equal(report.ttlProof, "not exercised");
		const events = readFileSync(join(report.ledger, "evidence.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
		const final = events.at(-1), refresh = final.rows[0].refresh;
		assert.equal(final.mode, "offline-simulation"); assert.equal(final.rows[0].status, "simulated-pass");
		assert.equal(refresh.kind, "refresh"); assert.equal(refresh.nativeUsage.output, 1);
		assert.ok(refresh.sourceUnchanged && refresh.noFork && refresh.noTools && refresh.prefixExact);
		assert.equal(refresh.records.length, 2);
		for (const record of refresh.records) assert.deepEqual(record.sdkUsage, record.provider.usage);
		const ledger = readFileSync(join(report.ledger, "events.jsonl"), "utf8").trim().split("\n").map(JSON.parse).at(-1);
		assert.equal(ledger.status, "complete"); assert.equal(ledger.reserved, 2); assert.equal(ledger.forwarded, 0);
	} finally { rmSync(dirname(report.ledger), { recursive: true, force: true }); }
});

const fixtureRun = (root, fault) => promisify(execFile)(process.execPath, ["--input-type=module", "-e",
	`import { runOfflineFixture } from ${JSON.stringify(pathToFileURL(runner).href)};
	try { await runOfflineFixture(${JSON.stringify({ root, fault })}); }
	catch { console.error(JSON.stringify({status:"refused-before-start",sdkStarts:0})); process.exitCode=1; }`,
], { env, cwd: repo, timeout: 15_000 });
for (const [fault, starts, attempts] of [["deadline", 0, 0], ["deadline-active", 1, 0], ["clock", 0, 0], ["persistence", 0, 0], ["hooks", 0, 0], ["api-key", 1, 0], ["http-error", 1, 1], ["extra-attempt", 1, 2]]) {
	test(`offline runner ${fault} guard refuses with bounded subprocess cleanup`, { timeout: 20_000 }, async () => {
		const root = mkdtempSync(join(tmpdir(), "native-qualification-test-"));
		try {
			await assert.rejects(fixtureRun(root, fault), error => {
				const report = JSON.parse(error.stderr.trim());
				assert.equal(report.status, "refused");
				assert.equal(report.sdkStarts, starts); assert.equal(report.httpAttempts, attempts);
				return true;
			});
			const events = readFileSync(join(root, "ledger/events.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
			assert.ok(events.every(event => event.mode === "offline-simulation" && event.forwarded === 0));
			// The exact allocation cannot reset, even after a persistence error.
			const before = readFileSync(join(root, "ledger/events.jsonl"), "utf8");
			await assert.rejects(fixtureRun(root), error => JSON.parse(error.stderr).status === "refused-before-start");
			assert.equal(readFileSync(join(root, "ledger/events.jsonl"), "utf8"), before);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
}
for (const state of ["corrupt", "exhausted", "concurrent-owner"]) test(`subprocess refuses ${state} allocation without startup or reset`, async () => {
	const root = mkdtempSync(join(tmpdir(), "native-qualification-test-"));
	try {
		mkdirSync(join(root, "ledger"));
		const prior = state === "corrupt" ? "not-json" : JSON.stringify({ mode: "offline-simulation", status: state === "concurrent-owner" ? "running" : "complete", reserved: 40 });
		writeFileSync(join(root, "ledger/events.jsonl"), prior);
		await assert.rejects(fixtureRun(root), error => JSON.parse(error.stderr).sdkStarts === 0);
		assert.equal(readFileSync(join(root, "ledger/events.jsonl"), "utf8"), prior);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("two five-call comparisons use isolated arms and simulated expiry, never real TTL evidence", { timeout: 30_000 }, async () => {
	const root = mkdtempSync(join(tmpdir(), "native-qualification-test-"));
	try {
		const { stdout } = await fixtureRun(root, "expiry-simulation"), report = JSON.parse(stdout);
		assert.equal(report.sdkStarts, 12); assert.equal(report.httpAttempts, 12); assert.equal(report.forwarded, 0);
		const events = readFileSync(join(root, "ledger/evidence.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
		const result = events.at(-1);
		assert.equal(result.comparisons.length, 2);
		for (const comparison of result.comparisons) {
			assert.equal(comparison.status, "simulated-pass");
			assert.equal(comparison.timing, "simulated-expiry-no-wait");
			assert.notEqual(comparison.warmSeed.records[0].wire.tools, comparison.controlSeed.records[0].wire.tools);
			assert.equal(comparison.refresh.nativeUsage.output, 1);
			assert.equal(comparison.controlFollowup.usage.cache_read_input_tokens, 0);
			assert.ok(comparison.warmFollowup.usage.cache_read_input_tokens >= comparison.warmSeed.cachedTokens);
			assert.ok(comparison.warmFollowup.ordinaryWritesAllowed && comparison.controlFollowup.ordinaryWritesAllowed);
		}
		const state = readFileSync(join(root, "ledger/events.jsonl"), "utf8").trim().split("\n").map(JSON.parse).at(-1);
		assert.deepEqual(state.partitions, { matrix: 2, expiry: 10, followup: 0 });
		assert.equal(result.productionQualifications, 0);
	} finally { rmSync(root, { recursive: true, force: true }); }
});
test("two concurrent offline parents cannot both acquire or reset one allocation", { timeout: 20_000 }, async () => {
	const root = mkdtempSync(join(tmpdir(), "native-qualification-test-"));
	try {
		const results = await Promise.allSettled([fixtureRun(root), fixtureRun(root)]);
		assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
		const refused = results.find(result => result.status === "rejected");
		assert.equal(JSON.parse(refused.reason.stderr).sdkStarts, 0);
		const state = readFileSync(join(root, "ledger/events.jsonl"), "utf8").trim().split("\n").map(JSON.parse).at(-1);
		assert.equal(state.sdkStarts, 2); assert.equal(state.reserved, 2); assert.equal(state.status, "complete");
		await assert.rejects(fixtureRun(root), error => JSON.parse(error.stderr).sdkStarts === 0);
	} finally { rmSync(root, { recursive: true, force: true }); }
});
test("real native gate refusal is recorded, never patched around or retried", { timeout: 20_000 }, async () => {
	const root = mkdtempSync(join(tmpdir(), "native-qualification-test-"));
	try {
		const { stdout } = await fixtureRun(root, "native-rejection"), report = JSON.parse(stdout);
		assert.equal(report.sdkStarts, 1); assert.equal(report.httpAttempts, 1);
		const events = readFileSync(join(root, "ledger/evidence.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
		const result = events.at(-1);
		assert.equal(result.rows[0].status, "native-rejected");
		assert.equal(result.rows[0].refresh.nativeDecision, "stop");
		assert.equal(result.rows[0].refresh.records.length, 1);
		assert.equal(result.comparisons.length, 0); assert.equal(result.productionQualifications, 0);
	} finally { rmSync(root, { recursive: true, force: true }); }
});
