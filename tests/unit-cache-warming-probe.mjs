import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";

const probe = resolve("diag/probe-cache-warming.mjs");

for (const [flag, name] of ["--live", "--live-budget"].flatMap((flag) =>
	["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "CLAUDE_CODE_EXTRA_BODY", "CLAUDE_CODE_PROMPT_CACHE_TTL"].map((name) => [flag, name]))) {
	test(`cache probe ${flag} refuses ${name} before any SDK query`, () => {
		const child = spawnSync(process.execPath, [probe, flag], {
			env: { ...process.env, [name]: "synthetic-test-value" }, encoding: "utf8", timeout: 10_000,
		});
		assert.equal(child.error, undefined);
		assert.equal(child.status, 1);
		const summary = JSON.parse(child.stdout.trim());
		try {
			const report = JSON.parse(readFileSync(summary.report, "utf8"));
			assert.equal(report.status, "blocked");
			assert.equal(report.sdkQueries, 0);
			assert.deepEqual(report.requests, []);
			assert.equal(report.failure, "ambient auth/routing/cache override present; refusing live probe");
			assert.ok(!JSON.stringify(report).includes("synthetic-test-value"), "environment value leaked into report");
		} finally {
			rmSync(dirname(summary.report), { recursive: true, force: true });
		}
	});
}
