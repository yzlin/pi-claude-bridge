// Forked only by the offline regression suite. No query/CLI/auth entry point.
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dgram from "node:dgram";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import http2 from "node:http2";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.TMPDIR, home = process.env.HOME, cwd = process.cwd();
const repo = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
assert.ok(process.send && /\/arm-\d+$/.test(root));
assert.equal(home, join(root, "home"));
assert.equal(cwd, fs.realpathSync(join(root, "project")));
const roots = [root, fs.realpathSync(root)];
let launches = 0, network = 0, forbiddenReads = 0;
const blockLaunch = () => { launches++; throw new Error("child launch forbidden in resolver-only check"); };
childProcess.ChildProcess.prototype.spawn = blockLaunch;
for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork", "ChildProcess"]) childProcess[name] = blockLaunch;
const blockNetwork = () => { network++; throw new Error("network forbidden in resolver-only check"); };
for (const module of [http, https]) for (const name of ["request", "get"]) module[name] = blockNetwork;
net.connect = net.createConnection = net.Socket.prototype.connect = tls.connect = dgram.createSocket = http2.connect = globalThis.fetch = globalThis.WebSocket = blockNetwork;
for (const module of [dns, dnsPromises]) for (const name of Object.keys(module)) if (/^(?:lookup|resolve|reverse)/.test(name)) module[name] = blockNetwork;
// Reads remain real, not fabricated resolver outputs. Refuse credentials and
// non-fixture user files before opening them. Leave system policy discovery real:
// any attempted policy-helper/plutil launch fails the check, never runs.
function allowRead(value) {
	if (typeof value === "number") return; // already-open descriptors
	const path = resolve(value instanceof URL ? fileURLToPath(value) : String(value));
	const synthetic = roots.some(base => path === base || path.startsWith(base + sep));
	const moduleFile = path.startsWith(join(repo, "node_modules") + sep)
		|| (path.startsWith(repo + sep) && /\.(?:mjs|ts)$/.test(path)) || path === join(repo, "package.json");
	const managed = ["/Library/Managed Preferences/", "/Library/Application Support/ClaudeCode/", "/etc/claude-code/"].some(base => path.startsWith(base));
	if (/(?:\.credentials\.json|\.claude\.json|\/Keychains(?:\/|$))/.test(path) || !(synthetic || moduleFile || managed)) {
		forbiddenReads++; throw new Error("non-fixture file read forbidden");
	}
}
for (const [module, names] of [[fs, ["readFileSync", "readFile", "openSync", "open", "readdirSync", "readdir", "createReadStream"]], [fsPromises, ["readFile", "open", "readdir"]]]) {
	for (const name of names) {
		const original = module[name];
		module[name] = function(path, ...args) { allowRead(path); return original.call(this, path, ...args); };
	}
}
syncBuiltinESMExports();

// Only now may SDK-containing modules load. The worker's IPC entry is idle:
// no init or command is sent, and no observeSdk/query is called.
const { transcripts, workerConfigRoot } = await import("../../diag/lib/native-cache-qualification-worker.mjs");
const config = join(home, ".claude");
// Live keeps the real HOME and never scans it whole: no root until the seed's own
// project directory exists. Offline still pins the synthetic HOME.
assert.equal(workerConfigRoot(join(root, "project"), false), undefined);
assert.equal(workerConfigRoot(join(root, "project"), true, { ...process.env, CLAUDE_CONFIG_DIR: config }), config);
assert.throws(() => workerConfigRoot(join(root, "project"), true, { ...process.env, HOME: dirname(home), CLAUDE_CONFIG_DIR: config }));
for (const badEnv of [
	{ ...process.env, HOME: "relative/home" },
	{ ...process.env, TMPDIR: dirname(root) },
	{ ...process.env, PI_CODING_AGENT_DIR: join(root, "other") },
	{ ...process.env, CLAUDE_CONFIG_DIR: config },
]) assert.throws(() => workerConfigRoot(join(root, "project"), false, badEnv));
assert.throws(() => workerConfigRoot(join(root, "other"), false));
assert.throws(() => workerConfigRoot(join(root, "project"), undefined));
assert.throws(() => workerConfigRoot(join(root, "project"), true));
assert.throws(() => workerConfigRoot(join(root, "project"), true, { ...process.env, CLAUDE_CONFIG_DIR: join(root, "other") }));
fs.mkdirSync(join(config, "projects/nested"), { recursive: true });
fs.writeFileSync(join(config, "projects/source.jsonl"), "synthetic source\n");
fs.writeFileSync(join(config, "projects/nested/other.jsonl"), "synthetic other\n");
const before = transcripts();
assert.deepEqual(before, transcripts(config), "default and explicit synthetic roots must cover the same file map");
assert.deepEqual(Object.keys(before).sort(), ["/projects/nested/other.jsonl", "/projects/source.jsonl"]);
fs.writeFileSync(join(config, "projects/nested/other.jsonl"), "changed other\n");
assert.notDeepEqual(transcripts(), before, "other source bytes must not be hidden");
fs.writeFileSync(join(config, "projects/new.jsonl"), "new fork\n");
assert.equal(Object.keys(transcripts()).length, 3, "new transcript must not be hidden");

const { resolveSettings } = await import("@anthropic-ai/claude-agent-sdk");
const { warmingRuntime, preflightRuntime } = await import("../../src/cache-warming.ts");
const options = { cwd, settingSources: undefined };
const blank = await resolveSettings(options);
assert.deepEqual(blank.effective, {}, "blank synthetic HOME must not load normal user configuration or managed controls");
assert.ok(preflightRuntime(warmingRuntime(blank, { autoMemoryEnabled: false })).ok);
fs.writeFileSync(join(config, "settings.json"), JSON.stringify({ autoMemoryEnabled: false }));
fs.mkdirSync(join(cwd, ".claude"));
fs.writeFileSync(join(cwd, ".claude/settings.json"), JSON.stringify({ includeGitInstructions: false }));
const settings = await resolveSettings(options);
assert.equal(settings.effective.autoMemoryEnabled, false);
assert.equal(settings.effective.includeGitInstructions, false);
for (const [source, path] of [["user", join(config, "settings.json")], ["project", join(cwd, ".claude/settings.json")]]) {
	assert.equal(fs.realpathSync(settings.sources.find(row => row.source === source).path), fs.realpathSync(path));
}
assert.ok(preflightRuntime(warmingRuntime(settings)).ok);
const hookMarker = join(root, "hook-must-not-execute");
fs.writeFileSync(join(cwd, ".claude/settings.json"), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: `touch ${hookMarker}` }] }] } }));
const unsafe = await resolveSettings(options);
assert.ok(unsafe.effective.hooks.SessionStart.length);
assert.equal(preflightRuntime(warmingRuntime(unsafe)).ok, false);
assert.equal(fs.existsSync(hookMarker), false);
assert.equal(options.settingSources, undefined);
assert.equal(launches, 0); assert.equal(network, 0); assert.equal(forbiddenReads, 0);
process.send({ status: "resolver-only-pass", launches, network, forbiddenReads, transcriptFiles: 3, defaultSettingSources: true }, () => process.exit(0));
