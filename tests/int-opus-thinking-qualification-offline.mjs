// No live command is ever invoked here. Auth is fake-key loopback.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const runner = join(repo, "diag/qualify-opus-thinking-warming.mjs");
const env = { PATH: process.env.PATH, HOME: "/nonexistent-offline-qualification-home", TMPDIR: tmpdir() };
const run = (args, timeout = 10_000) => promisify(execFile)(process.execPath, [runner, ...args], { env, cwd: repo, timeout });

test("readiness and malformed arguments cannot create a live allocation", async () => {
	const ledger = join(repo, "diag/native-cache-opus-thinking-v1.live");
	const existed = existsSync(ledger);
	const report = JSON.parse((await run(["--readiness"])).stdout);
	assert.equal(report.liveStarted, false); assert.equal(report.sdkStarts, 0);
	for (const args of [["--live"], ["--live", "wrong"], ["--offline", "--lane", "max"]]) {
		await assert.rejects(run(args), error => JSON.parse(error.stderr).sdkStarts === 0);
	}
	assert.equal(existsSync(ledger), existed);
});

test("every Opus 5.5 thinking lane publishes, warms natively and replays its source thinking", { timeout: 240_000 }, async () => {
	const { stdout } = await run(["--offline"], 230_000);
	const report = JSON.parse(stdout.trim().split("\n").at(-1));
	assert.equal(report.status, "complete"); assert.equal(report.sdkStarts, 49); assert.equal(report.forwarded, 0);
	assert.deepEqual([...report.passedLanes].sort(), ["high", "low", "max", "medium", "minimal", "off", "xhigh"]);
	const rows = readFileSync(join(report.ledger, "evidence.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
	for (const { comparison } of rows.filter(row => row.comparison)) {
		const { lane, warmSeed, refresh } = comparison;
		assert.equal(refresh.nativeDecision, "warm", lane);
		assert.equal(warmSeed.wireThinking?.type ?? null, lane === "off" ? null : "adaptive", lane);
		if (!["off", "minimal"].includes(lane)) assert.equal(warmSeed.wireEffort, lane);
	}
});
