#!/usr/bin/env node
/**
 * Opt-in public-package compatibility probe. No live model calls.
 *   PI_086_COMPAT=1 node --test tests/int-pi-086-compat.mjs
 * Installs only in an OS temp directory, with lifecycle scripts disabled.
 * An import failure is a failing gate, not a passing known-failure assertion.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const piPackages = ["pi-coding-agent", "pi-ai", "pi-tui", "pi-agent-core", "pi-telemetry", "chord"]
	.map((name) => `@earendil-works/${name}`);

test("actual Pi 0.86.1 ordinary-provider compatibility", {
	skip: process.env.PI_086_COMPAT !== "1" ? "set PI_086_COMPAT=1 to download isolated public packages" : false,
	timeout: 300_000,
}, (t) => {
	const fixture = mkdtempSync(join(tmpdir(), "pi-086-compat-"));
	t.after(() => rmSync(fixture, { recursive: true, force: true }));
	const home = join(fixture, "home");
	mkdirSync(home);
	// Deliberately do not inherit credentials, NODE_OPTIONS, proxy settings, or npm config.
	const env = {
		PATH: process.env.PATH,
		HOME: home,
		TMPDIR: fixture,
		XDG_CONFIG_HOME: home,
		XDG_CACHE_HOME: join(fixture, "cache"),
		PI_CODING_AGENT_DIR: join(home, ".pi", "agent"),
		CLAUDE_CONFIG_DIR: join(home, ".claude"),
		NPM_CONFIG_CACHE: join(fixture, "npm-cache"),
		NPM_CONFIG_USERCONFIG: join(fixture, "absent-user-npmrc"),
		NPM_CONFIG_GLOBALCONFIG: join(fixture, "absent-global-npmrc"),
		NPM_CONFIG_REGISTRY: "https://registry.npmjs.org/",
	};
	const run = (command, args, options = {}) => execFileSync(command, args, {
		cwd: fixture, env, encoding: "utf8", timeout: 240_000, maxBuffer: 8 * 1024 * 1024, ...options,
	});
	const bridge = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
	const dependencies = Object.fromEntries(piPackages.map((name) => [name, "0.86.1"]));
	// Exact currently installed non-Pi dependencies isolate the Pi version as the variable.
	for (const name of [...Object.keys(bridge.dependencies), "tsx", "typebox"]) {
		dependencies[name] = JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8")).version;
	}
	writeFileSync(join(fixture, "package.json"), JSON.stringify({
		private: true, type: "module", dependencies,
		overrides: Object.fromEntries(piPackages.map((name) => [name, "0.86.1"])),
	}, null, 2));
	const sanitize = (text) => String(text).split(fixture).join("<fixture>").split(root).join("<repository>/");
	try {
		run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--loglevel=error"]);
	} catch (error) {
		assert.fail(`Isolated public-package install failed; no compatibility conclusion: ${sanitize(error.stderr ?? error.message)}`);
	}
	const versions = Object.fromEntries(Object.keys(dependencies).map((name) => {
		const pkg = JSON.parse(readFileSync(join(fixture, "node_modules", name, "package.json"), "utf8"));
		return [name, { version: pkg.version, engines: pkg.engines }];
	}));
	const lock = JSON.parse(readFileSync(join(fixture, "package-lock.json"), "utf8"));
	for (const [path, pkg] of Object.entries(lock.packages)) {
		if (piPackages.some((name) => path.endsWith(`node_modules/${name}`))) {
			assert.equal(pkg.version, "0.86.1", `mixed-version Pi dependency: ${path}`);
		}
	}
	t.diagnostic(JSON.stringify({ node: process.version, npm: run("npm", ["--version"]).trim(), versions }));
	const probe = join(fixture, "probe.mjs");
	cpSync(join(root, "tests/lib/pi-086-import-probe.mjs"), probe);
	function observe(mode, entry = "") {
		const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", probe, mode, entry], {
			cwd: fixture, env, encoding: "utf8", timeout: 30_000,
		});
		t.diagnostic(JSON.stringify({ mode, status: result.status, stdout: sanitize(result.stdout), stderr: sanitize(result.stderr), error: result.error?.message }));
		assert.equal(result.error, undefined, `${mode}: child failed to run`);
		const lines = result.stdout.trim().split("\n");
		return { status: result.status, ...JSON.parse(lines.at(-1)) };
	}
	const packages = observe("packages");
	assert.equal(packages.ok, true, "Pi 0.86.1 package entrypoint import failed; stop before source probe");

	const working = join(fixture, "working");
	cpSync(join(root, "src"), join(working, "src"), { recursive: true });
	const baseline = join(fixture, "baseline");
	mkdirSync(baseline);
	const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
	// Copy only tracked HEAD source, without checkout/worktree or dependency patches.
	const tracked = execFileSync("git", ["ls-tree", "-r", "--name-only", "HEAD", "src"], { cwd: root, encoding: "utf8" }).trim().split("\n");
	for (const path of tracked) {
		const target = join(baseline, path);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, execFileSync("git", ["show", `HEAD:${path}`], { cwd: root }));
	}
	t.diagnostic(`HEAD comparison: ${head}`);
	const current = observe("working", join(working, "src/index.ts"));
	const before = observe("baseline", join(baseline, "src/index.ts"));
	t.diagnostic(JSON.stringify({ currentImport: current.ok, baselineImport: before.ok, sameError: current.name === before.name && current.message === before.message }));
	assert.equal(current.ok, true,
		`Ordinary-provider prerequisite failed: ${current.name}: ${current.message}. HEAD import ${before.ok ? "passes" : `also fails: ${before.name}: ${before.message}`}. Registration/stream/transcript/summary checks not reached.`);
	const currentRegistration = observe("registration", join(working, "src/index.ts"));
	const beforeRegistration = observe("registration", join(baseline, "src/index.ts"));
	assert.equal(currentRegistration.ok, true, `Pi's extension loader/registration failed: ${currentRegistration.message}; HEAD: ${beforeRegistration.message ?? "passes"}`);
	assert.equal(beforeRegistration.ok, true, "HEAD registration control failed");
	const currentContracts = observe("contracts-working", join(working, "src/index.ts"));
	const beforeContracts = observe("contracts-baseline", join(baseline, "src/index.ts"));
	assert.equal(currentContracts.ok, true, `Working ordinary-provider contracts failed: ${currentContracts.message}; HEAD: ${beforeContracts.message ?? "passes"}`);
	assert.equal(beforeContracts.ok, true, `HEAD common-contract control failed: ${beforeContracts.message}`);
});
