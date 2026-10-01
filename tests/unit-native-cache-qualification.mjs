import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, chmodSync, symlinkSync, statSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, guardEnvironment, BudgetOwner, APPROVAL, COHORT, validateApprovalMarker, refreshTailBounded, REFRESH_WRITE_LIMIT } from "../diag/lib/native-cache-qualification-budget.mjs";

import { syntheticArm, ordinaryArm, armProjectDirs } from "../diag/qualify-native-cache-warming.mjs";

const fixture = () => mkdtempSync(join(tmpdir(), "native-qualification-unit-"));
test("live arm keeps real HOME and reviewed env; only cwd, TMPDIR and Pi dir are synthetic", () => {
	const root = fixture();
	try {
		const parent = Object.freeze({ HOME: "/Users/someone", PATH: "/usr/bin", EDITOR: "vi" });
		const arm = ordinaryArm(root, 3, parent), path = join(root, "arm-3");
		assert.deepEqual(arm.env, { ...parent, TMPDIR: path, PI_CODING_AGENT_DIR: join(path, "pi-agent") });
		assert.equal(arm.cwd, join(path, "project"));
		assert.deepEqual(readdirSync(path).sort(), ["pi-agent", "project"], "no synthetic HOME is created");
		for (const extra of [{ CLAUDE_CONFIG_DIR: "/x" }, { ANTHROPIC_API_KEY: "secret-not-to-log" }, { SOME_UNKNOWN_CONTROL: "1" }]) {
			assert.throws(() => ordinaryArm(root, 4, { ...parent, ...extra }), error => !error.message.includes("secret-not-to-log"));
		}
	} finally { rmSync(root, { recursive: true, force: true }); }
});
test("a pass requires the refresh tail write to stay tiny (v2 re-sent prompt wrote ~13.3k)", () => {
	for (const cacheWrite of [0, 90, REFRESH_WRITE_LIMIT]) assert.equal(refreshTailBounded({ cacheWrite }), true, String(cacheWrite));
	for (const usage of [{ cacheWrite: 13_298 }, { cacheWrite: REFRESH_WRITE_LIMIT + 1 }, { cacheWrite: -1 }, { cacheWrite: 1.5 }, {}, undefined]) {
		assert.equal(refreshTailBounded(usage), false, JSON.stringify(usage));
	}
});

test("live cleanup selects only this run's arm project directories", () => {
	const home = fixture(), projects = join(home, ".claude", "projects");
	try {
		for (const name of ["-private-var-T-native-qualification-synthetic-Ab12Cd-arm-0-project", "-private-var-T-native-qualification-synthetic-Ab12Cd-arm-1-project",
			"-private-var-T-native-qualification-synthetic-Zz99Zz-arm-0-project", "-Users-someone-dev-app"]) mkdirSync(join(projects, name), { recursive: true });
		assert.deepEqual(armProjectDirs("/var/T/native-qualification-synthetic-Ab12Cd", home).map(dir => dir.split("/").at(-1)).sort(),
			["-private-var-T-native-qualification-synthetic-Ab12Cd-arm-0-project", "-private-var-T-native-qualification-synthetic-Ab12Cd-arm-1-project"]);
		for (const root of ["/var/T/other-root", "/var/T/native-qualification-synthetic-", "/"]) assert.deepEqual(armProjectDirs(root, home), [], root);
	} finally { rmSync(home, { recursive: true, force: true }); }
});
test("synthetic layout keeps live HOME defaults and explicit offline credential isolation", () => {
	const root = fixture(), before = { ...process.env };
	try {
		for (const [index, offline] of [false, true].entries()) {
			const arm = syntheticArm(root, index, offline), path = join(root, `arm-${index}`);
			assert.equal(arm.cwd, join(path, "project"));
			assert.equal(arm.env.HOME, join(path, "home"));
			assert.equal(arm.env.PI_CODING_AGENT_DIR, join(path, "pi-agent"));
			assert.equal(arm.env.TMPDIR, path);
			assert.equal(Object.hasOwn(arm.env, "CLAUDE_CONFIG_DIR"), offline);
			if (offline) assert.equal(arm.env.CLAUDE_CONFIG_DIR, join(arm.env.HOME, ".claude"));
			assert.deepEqual(Object.keys(arm.env).sort(), ["PATH", "HOME", "TMPDIR", "PI_CODING_AGENT_DIR", ...(offline ? ["CLAUDE_CONFIG_DIR"] : [])].sort());
			for (const dir of [arm.env.HOME, join(arm.env.HOME, ".claude"), arm.cwd, arm.env.PI_CODING_AGENT_DIR]) assert.ok(statSync(dir).isDirectory());
			assert.deepEqual(readdirSync(join(arm.env.HOME, ".claude")), []);
			assert.deepEqual(readdirSync(arm.cwd), []);
			assert.deepEqual(readdirSync(arm.env.PI_CODING_AGENT_DIR), ["claude-bridge.json"]);
		}
		assert.deepEqual({ ...process.env }, before);
	} finally { rmSync(root, { recursive: true, force: true }); }
});
test("synthetic layout refuses missing or non-boolean mode before creating files", () => {
	const root = fixture();
	try {
		for (const mode of [undefined, null, "offline", "live", 0, 1]) assert.throws(() => syntheticArm(root, 0, mode), /mode/);
		assert.deepEqual(readdirSync(root), []);
	} finally { rmSync(root, { recursive: true, force: true }); }
});
test("default/readiness never authorize live; strict fixed cohort and approval", () => {
	assert.equal(parseArgs([]), "readiness");
	assert.equal(parseArgs(["--readiness"]), "readiness");
	assert.equal(parseArgs(["--offline"]), "offline");
	assert.equal(parseArgs(["--live", APPROVAL.id]), "live");
	for (const args of [["--live"], ["--model", "x"], ["--offline", "--live"], ["--live", APPROVAL.id, "--limit", "80"]]) assert.throws(() => parseArgs(args));
	assert.deepEqual(COHORT, ["claude-haiku-4-5", "claude-sonnet-5-5", "claude-opus-5-5"]); assert.equal(APPROVAL.sdkStarts, 16); assert.equal(APPROVAL.elapsedMs, 1_500_000);
	assert.notEqual(APPROVAL.id, "native-cache-40q-40m-v1", "the sealed allocation id is never reused");
	for (const sealed of ["native-cache-40q-40m-v1", "native-cache-haiku-12q-20m-v1", "native-cache-haiku-12q-20m-v2"]) {
		assert.notEqual(APPROVAL.id, sealed); assert.throws(() => parseArgs(["--live", sealed]));
	}
});
test("ambient controls are rejected before environment isolation", () => {
	guardEnvironment({ HOME: "/synthetic", PATH: "/usr/bin", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" });
	for (const key of ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "HTTPS_PROXY", "https_proxy", "NODE_OPTIONS", "CLAUDE_CODE_MAX_RETRIES", "CLAUDE_BRIDGE_DEBUG", "PI_CODING_AGENT_DIR", "CLAUDE_CONFIG_DIR", "CLAUDE_SECURESTORAGE_CONFIG_DIR", "DISABLE_PROMPT_CACHING", "SOME_UNKNOWN_CONTROL"]) {
		assert.throws(() => guardEnvironment({ [key]: "secret-not-to-log" }), error => !error.message.includes("secret-not-to-log"));
	}
	assert.throws(() => guardEnvironment({ CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "0" }));
});
test("durable owner burns reservations, separately records SDK and HTTP, and cannot restart", () => {
	const root = fixture(); let now = 1000;
	try {
		const owner = new BudgetOwner(join(root, "ledger"), { offline: true, now: () => now });
		assert.throws(() => new BudgetOwner(join(root, "ledger"), { offline: true, now: () => now }));
		const id = owner.reserve("matrix", COHORT[0]);
		assert.equal(owner.state.reserved, 1); assert.equal(owner.state.sdkStarts, 0);
		owner.started(id); owner.attempt(id); owner.forwarded(id);
		assert.throws(() => owner.attempt(id));
		assert.equal(owner.state.httpAttempts, 2); assert.equal(owner.state.forwarded, 1);
		owner.finish("failed");
		assert.throws(() => new BudgetOwner(join(root, "ledger"), { offline: true, now: () => now }));
		assert.match(readFileSync(join(root, "ledger", "events.jsonl"), "utf8"), /"httpAttempts":2/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});
test("fixed partitions, deadline and clock regression fail closed", () => {
	for (const mode of ["partition", "deadline", "clock"]) {
		const root = fixture(); let now = 1000;
		try {
			const owner = new BudgetOwner(join(root, "ledger"), { offline: true, now: () => now });
			if (mode === "partition") {
				assert.throws(() => owner.reserve("matrix", "claude-sonnet-5"), "models outside the cohort are refused");
				for (const model of COHORT) for (let i = 0; i < 2; i++) owner.reserve("matrix", model);
				assert.throws(() => owner.reserve("matrix", COHORT[0]));
				for (let i = 0; i < 10; i++) owner.reserve("expiry", COHORT[0]);
				assert.throws(() => owner.reserve("expiry", COHORT[0]));
				assert.equal(owner.state.reserved, 16);
			} else now = mode === "deadline" ? 2_401_000 : 999;
			assert.throws(() => owner.reserve("followup", COHORT[0]));
			owner.close();
		} finally { rmSync(root, { recursive: true, force: true }); }
	}
});
test("persistence failure never grants a startup reservation", () => {
	const root = fixture(); let fail = false;
	try {
		const owner = new BudgetOwner(join(root, "ledger"), { offline: true, persist: () => { if (fail) throw new Error("disk failure"); } });
		fail = true; let starts = 0;
		assert.throws(() => { owner.reserve("matrix", COHORT[0]); starts++; });
		assert.equal(starts, 0);
		fail = false;
		assert.throws(() => owner.reserve("matrix", COHORT[0]), /poisoned/);
		owner.close();
	} finally { rmSync(root, { recursive: true, force: true }); }
});
test("corrupt or preexisting allocation is refused without resetting counters", () => {
	const root = fixture();
	try {
		writeFileSync(join(root, "ledger"), "corrupt");
		assert.throws(() => new BudgetOwner(join(root, "ledger"), { offline: true }));
		assert.equal(readFileSync(join(root, "ledger"), "utf8"), "corrupt");
	} finally { rmSync(root, { recursive: true, force: true }); }
});
test("immutable approval binds fixed budget to code, rejects malformed/writable/symlinked state", () => {
	const root = fixture(), path = join(root, "marker"), digest = "a".repeat(64);
	try {
		assert.throws(() => validateApprovalMarker(path, digest));
		writeFileSync(path, JSON.stringify({ ...APPROVAL, codeHash: digest }), { mode: 0o600 });
		assert.throws(() => validateApprovalMarker(path, digest));
		chmodSync(path, 0o400); validateApprovalMarker(path, digest);
		assert.throws(() => validateApprovalMarker(path, "b".repeat(64)));
		symlinkSync(path, join(root, "link")); assert.throws(() => validateApprovalMarker(join(root, "link"), digest));
		for (const content of ["bad-json", JSON.stringify({ ...APPROVAL, sdkStarts: 41, codeHash: digest }), JSON.stringify({ ...APPROVAL, codeHash: digest, reset: true })]) {
			chmodSync(path, 0o600); writeFileSync(path, content); chmodSync(path, 0o400);
			assert.throws(() => validateApprovalMarker(path, digest));
		}
	} finally { rmSync(root, { recursive: true, force: true }); }
});
test("monotonic deadline independently stops even if the wall clock stalls", () => {
	const root = fixture(); let elapsed = 0;
	try {
		const owner = new BudgetOwner(join(root, "ledger"), { offline: true, now: () => 1000, monotonic: () => elapsed });
		elapsed = APPROVAL.elapsedMs;
		assert.throws(() => owner.reserve("matrix", COHORT[0]), /deadline/);
		assert.equal(owner.state.reserved, 0); owner.close();
	} finally { rmSync(root, { recursive: true, force: true }); }
});
