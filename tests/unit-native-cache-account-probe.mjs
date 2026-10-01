import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, chmodSync, symlinkSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { APPROVAL, REVIEWED_METADATA, guardOrdinaryEnvironment, parseArgs, validateApproval, AccountOwner } from "../diag/lib/native-cache-account-probe-owner.mjs";
import { accountArm, priorAllocations } from "../diag/probe-native-cache-account.mjs";
const digest = "a".repeat(64);
const prior = [
 { id: "native-cache-40q-40m-v1", digest, status: "failed", reserved: 1, sdkStarts: 1, modelHttpAttempts: 0, forwarded: 0 },
 { id: "native-cache-account-1q-60s-v1", digest, status: "complete", eligible: false, reserved: 1, sdkStarts: 1, modelHttpAttempts: 0, forwarded: 0 },
 { id: "native-cache-account-normal-home-1q-60s-v1", digest, status: "complete", eligible: false, reserved: 1, sdkStarts: 1, modelHttpAttempts: 0, forwarded: 0 },
];
function temporary(t) { const root = mkdtempSync(join(tmpdir(), "native-account-test-")); t.after(() => rmSync(root, { recursive: true, force: true })); return root; }
function marker(root, fields = {}) { const path = join(root, "approval.json"); writeFileSync(path, JSON.stringify({ ...APPROVAL, codeHash: digest, approvedAt: 1000, expiresAt: 2000, ...fields }), { mode: 0o400 }); return path; }
test("strict ordinary-environment arguments refuse all three sealed allocations", () => {
 assert.equal(APPROVAL.id, "native-cache-account-ordinary-1q-60s-v1");
 assert.equal(parseArgs([]), "readiness"); assert.equal(parseArgs(["--readiness"]), "readiness");
 assert.equal(parseArgs(["--live", APPROVAL.id]), "live");
 for (const args of [["--offline"], ["--live"], ["--live", "native-cache-40q-40m-v1"], ["--live", "native-cache-account-1q-60s-v1"], ["--live", "native-cache-account-normal-home-1q-60s-v1"], ["--readiness", "extra"], ["--reset"]]) assert.throws(() => parseArgs(args));
});
test("ordinary environment admits exactly reviewed metadata without leaking refusals", () => {
 const names = "AI_AGENT BUN_INSTALL CLAUDE_PACKAGE_MANAGER CONDA_CHANGEPS1 DISPLAY EDITOR FZF_DEFAULT_OPTS FZF_DIFF_PREVIEW_CMD FZF_GIT_BLAME_PREVIEW_CMD FZF_GIT_COMMIT_PREVIEW_CMD FZF_GIT_LOG_PREVIEW_CMD FZF_GIT_STATUS_PREVIEW_CMD FZF_PACKAGE_PREVIEW_CMD FZF_PREVIEW_CMD FZF_SEARCH_PREVIEW_CMD GHOSTTY_BIN_DIR GHOSTTY_RESOURCES_DIR GHOSTTY_SHELL_FEATURES GHOSTTY_SURFACE_ID GPG_TTY HERDR_BIN_PATH HERDR_ENV HERDR_PANE_ID HERDR_SOCKET_PATH HERDR_TAB_ID HERDR_WORKSPACE_ID HOMEBREW_CELLAR HOMEBREW_PREFIX HOMEBREW_REPOSITORY INFOPATH LESS LSCOLORS LS_COLORS LaunchInstanceID MANPATH MISE_SHELL NoDefaultCurrentDirectoryInExePath OPENCODE_DISABLE_CLAUDE_CODE OSLogRateLimit PAGER PI_CODING_AGENT PI_INTERCOM_SESSION_ID PKG_CONFIG_PATH PROMPT_EOL_MARK PYENV_VIRTUALENV_DISABLE_PROMPT SECURITYSESSIONID SSH_AUTH_SOCK TERMINFO VIRTUAL_ENV VIRTUAL_ENV_DISABLE_PROMPT VIRTUAL_ENV_PROMPT VISUAL XDG_DATA_DIRS ZEROBREW_BIN ZEROBREW_DIR ZEROBREW_PREFIX ZEROBREW_ROOT ZSH __MISE_DIFF __MISE_ORIG_PATH __MISE_SESSION __MISE_ZSH_CHPWD_RAN __MISE_ZSH_PRECMD_RUN __zsh_cache_dir __zsh_config_dir __zsh_user_data_dir".split(" ");
 assert.equal(names.length, 66); assert.deepEqual([...REVIEWED_METADATA], names);
 assert.doesNotThrow(() => guardOrdinaryEnvironment(Object.fromEntries(names.map(name => [name, `reviewed-${name}`]))));
 assert.doesNotThrow(() => guardOrdinaryEnvironment({ PATH: "/bin", HOME: "/safe", AI_AGENT: "pi" }));
 for (const [name, value] of [["UNKNOWN_ACCOUNT_PROBE_CONTROL", "SECRET-unknown"], ["CLAUDE_CONFIG_DIR", "SECRET-config"], ["CLAUDE_SECURESTORAGE_CONFIG_DIR", "SECRET-storage"], ["ANTHROPIC_API_KEY", "SECRET-key"], ["CLAUDE_CODE_OAUTH_TOKEN", "SECRET-token"]]) {
  assert.throws(() => guardOrdinaryEnvironment({ PATH: "/bin", [name]: value }), error => {
   assert.doesNotMatch(error.message, new RegExp(`${name}|${value}`)); return true;
  });
 }
});
test("account arm passes ordinary live env through at repo cwd and isolates offline cleanup", t => {
 const root = temporary(t), parentHome = join(tmpdir(), "reviewed-normal-home"), parentEnv = { PATH: process.env.PATH, HOME: parentHome, AI_AGENT: "pi" };
 const live = accountArm(root, false, parentEnv, resolve("."));
 assert.strictEqual(live.env, parentEnv); assert.equal(live.expectedHome, parentHome);
 assert.equal(live.cwd, resolve(".")); assert.deepEqual(live.cleanup, []);
 assert.equal(Object.hasOwn(live.env, "CLAUDE_CONFIG_DIR"), false);
 assert.deepEqual(readdirSync(root), []);
 const offline = accountArm(root, true);
 assert.equal(offline.env.HOME, join(root, "arm-0/home")); assert.equal(offline.expectedHome, offline.env.HOME);
 assert.equal(offline.env.CLAUDE_CONFIG_DIR, join(root, "arm-0/home/.claude"));
 assert.equal(Object.hasOwn(offline.env, "ANTHROPIC_API_KEY"), false);
 assert.deepEqual(offline.cleanup, [join(root, "arm-0")]);
 for (const home of [undefined, "relative", "/", root, join(root, "arm-0"), join(root, "arm-0/home")]) assert.throws(() => accountArm(root, false, { PATH: "/bin", ...(home === undefined ? {} : { HOME: home }) }, resolve(".")));
 assert.throws(() => accountArm(root, false, parentEnv, join(resolve("."), "diag")));
});
test("three sealed prior allocations are asserted and digested read-only", () => {
 const rows = priorAllocations();
 assert.deepEqual(rows.map(row => [row.id, row.status, row.sdkStarts, row.modelHttpAttempts, row.forwarded]), [
  ["native-cache-40q-40m-v1", "failed", 1, 0, 0],
  ["native-cache-account-1q-60s-v1", "complete", 1, 0, 0],
  ["native-cache-account-normal-home-1q-60s-v1", "complete", 1, 0, 0],
 ]);
 assert.equal(rows[1].eligible, false); assert.equal(rows[2].eligible, false);
 for (const row of rows) assert.match(row.digest, /^[a-f0-9]{64}$/);
});
test("immutable code-bound expiring approval refuses invalid markers", t => {
 const root = temporary(t); const path = marker(root);
 assert.doesNotThrow(() => validateApproval(path, digest, 1500));
 for (const now of [999, 2000, NaN]) assert.throws(() => validateApproval(path, digest, now));
 assert.throws(() => validateApproval(path, "b".repeat(64), 1500));
 assert.throws(() => validateApproval(join(root, "missing"), digest, 1500));
 symlinkSync(path, join(root, "link")); assert.throws(() => validateApproval(join(root, "link"), digest, 1500));
 chmodSync(path, 0o600); assert.throws(() => validateApproval(path, digest, 1500));
});
for (const fields of [{ sdkStarts: 2 }, { elapsedMs: 60001 }, { id: prior[0].id }, { id: prior[1].id }, { id: prior[2].id }, { extra: true }, { expiresAt: 1000 }]) test(`approval refuses changed fields ${JSON.stringify(fields)}`, t => {
 assert.throws(() => validateApproval(marker(temporary(t), fields), digest, 1500));
});
test("exclusive durable reservation precedes a single observed start; failed tombstone never restarts", t => {
 const path = join(temporary(t), "audit"); const owner = new AccountOwner(path, { codeHash: digest, prior });
 t.after(() => owner.close());
 assert.throws(() => owner.started());
 owner.reserve();
 const rows = readFileSync(join(path, "events.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
 assert.equal(rows.at(-1).reserved, 1); assert.equal(rows.at(-1).sdkStarts, 0);
 assert.equal(rows.at(-1).invocationUncertain, true);
 assert.throws(() => owner.reserve()); owner.started(); assert.throws(() => owner.started());
 owner.blocked(true); assert.equal(owner.state.blockedHttpAttempts, 1); assert.equal(owner.state.modelHttpAttempts, 1);
 owner.finish("failed"); assert.throws(() => owner.reserve());
 assert.throws(() => new AccountOwner(path, { codeHash: digest, prior }));
 const final = JSON.parse(readFileSync(join(path, "events.jsonl"), "utf8").trim().split("\n").at(-1));
 assert.equal(final.inputReleased, 0); assert.equal(final.forwarded, 0); assert.deepEqual(final.prior, prior);
});
for (const fault of ["wall", "monotonic", "regression", "monotonic-regression", "persist"]) test(`fail closed on ${fault}`, t => {
 let now = 1000, mono = 10, fail = false;
 const path = join(temporary(t), "audit");
 const owner = new AccountOwner(path, { codeHash: digest, prior, now: () => now, monotonic: () => mono, persist: () => { if (fail) throw Error("SECRET"); } });
 t.after(() => owner.close());
 if (fault === "wall") now += 60000;
 if (fault === "monotonic") mono += 60000;
 if (fault === "regression") now--;
 if (fault === "monotonic-regression") mono--;
 if (fault === "persist") fail = true;
 assert.throws(() => owner.reserve());
 assert.equal(owner.state.sdkStarts, 0); assert.throws(() => owner.reserve());
 assert.doesNotMatch(readFileSync(join(path, "events.jsonl"), "utf8"), /SECRET/);
});
test("default/readiness/bad flags/unsafe environment cannot import SDK, launch or network", t => {
 const root = temporary(t), path = resolve("diag/probe-native-cache-account.mjs");
 const script = args => `
  import cp from 'node:child_process'; import http from 'node:http'; import https from 'node:https'; import net from 'node:net';
  import {syncBuiltinESMExports,registerHooks} from 'node:module';
  let attempts=0; const deny=()=>{attempts++;throw Error('forbidden');};
  for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']) cp[key]=deny;
  http.request=http.get=https.request=https.get=net.connect=net.createConnection=deny; syncBuiltinESMExports();
  registerHooks({resolve(s,c,next){if(s.includes('claude-agent-sdk')) return deny(); return next(s,c);}});
  process.argv=[process.execPath,${JSON.stringify(path)},...${JSON.stringify(args)}];
  await import(${JSON.stringify(path)}); if(attempts) process.exitCode=99;
 `;
 for (const args of [[], ["--readiness"]]) {
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", script(args)], { env: { PATH: process.env.PATH, HOME: root }, encoding: "utf8" });
  const value = JSON.parse(output); assert.equal(value.sdkStarts, 0); assert.equal(value.liveStarted, false);
  assert.equal(value.markerRequired.id, APPROVAL.id); assert.match(value.markerRequired.codeHash, /^[a-f0-9]{64}$/);
 }
 const reviewedOutput = execFileSync(process.execPath, ["--input-type=module", "-e", script(["--readiness"])], { env: { PATH: process.env.PATH, HOME: root, AI_AGENT: "reviewed" }, encoding: "utf8" });
 assert.equal(JSON.parse(reviewedOutput).sdkStarts, 0);
 for (const [args, env] of [[["--offline"], {}], [["--live", "wrong-id"], {}], [["--live", "native-cache-account-1q-60s-v1"], {}], [["--live", "native-cache-account-normal-home-1q-60s-v1"], {}], [["--reset"], {}], [[], { ANTHROPIC_API_KEY: "SECRET" }], [[], { CLAUDE_CODE_OAUTH_TOKEN: "SECRET" }], [[], { CLAUDE_CONFIG_DIR: root }], [[], { CLAUDE_SECURESTORAGE_CONFIG_DIR: root }], [[], { NODE_OPTIONS: "" }]]) {
  assert.throws(() => execFileSync(process.execPath, ["--input-type=module", "-e", script(args)], { env: { PATH: process.env.PATH, HOME: root, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), error => {
   assert.equal(error.status, 1); assert.doesNotMatch(error.stderr, /SECRET/); return true;
  });
 }
});
test("concurrent owners: one exclusive durable winner", async t => {
 const path = join(temporary(t), "audit"), module = resolve("diag/lib/native-cache-account-probe-owner.mjs");
 const source = `import {AccountOwner} from ${JSON.stringify(module)}; try { const o=new AccountOwner(${JSON.stringify(path)},${JSON.stringify({ codeHash: digest, prior })}); o.reserve(); o.finish('failed'); process.exitCode=0; } catch { process.exitCode=3; }`;
 const run = () => new Promise(resolve => { const child=spawn(process.execPath,["--input-type=module","-e",source],{stdio:"ignore"});child.on("exit",resolve); });
 assert.deepEqual((await Promise.all([run(),run()])).sort(), [0,3]);
 const final=JSON.parse(readFileSync(join(path,"events.jsonl"),"utf8").trim().split("\n").at(-1));
 assert.equal(final.reserved,1); assert.equal(final.sdkStarts,0); assert.equal(final.status,"failed");
});
