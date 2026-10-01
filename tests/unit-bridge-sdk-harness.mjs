// No SDK queries: setup failure regressions in owned child processes.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import http from "node:http";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
import { bridgeSdkHarness } from "./lib/bridge-sdk-harness.mjs";

const scenario = process.env.BRIDGE_HARNESS_SETUP_SCENARIO;
if (!scenario) {
  for (const name of ["missing-module", "filesystem-failure", "listen-failure", "module-failure"]) {
    test(`harness setup cleanup: ${name}`, { timeout: 15_000 }, async t => {
      const env = { ...process.env, BRIDGE_HARNESS_SETUP_SCENARIO: name };
      delete env.NODE_TEST_CONTEXT;
      const flags = name === "missing-module" ? [] : ["--experimental-test-module-mocks"];
      try {
        const { stdout } = await promisify(execFile)(process.execPath, [...flags,
          "--import", "tsx", "--import", "./tests/lib/setup.mjs", "--test", fileURLToPath(import.meta.url),
        ], { env, timeout: 10_000 });
        assert.match(stdout, /# pass 1|ℹ pass 1/, "child must execute its regression");
      } catch (error) {
        t.diagnostic(error.stdout ?? ""); t.diagnostic(error.stderr ?? "");
        throw error;
      }
    });
  }
} else test(`owned setup failure releases resources: ${scenario}`, async () => {
  const envBefore = { ...process.env }, cwdBefore = process.cwd();
  const roots = [], servers = [];
  const originalTemp = fs.mkdtempSync, originalServer = http.createServer;
  mock.method(fs, "mkdtempSync", (...args) => {
    const root = originalTemp(...args); roots.push(root); return root;
  });
  mock.method(http, "createServer", (...args) => {
    const server = originalServer(...args); servers.push(server);
    if (scenario === "listen-failure") mock.method(server, "listen", function () {
      queueMicrotask(() => this.emit("error", new Error("synthetic listen failure")));
      return this;
    });
    return server;
  });
  syncBuiltinESMExports();
  try {
    let options, expected;
    if (scenario === "missing-module") {
      assert.equal(typeof mock.module, "undefined");
      expected = /--experimental-test-module-mocks/;
    } else if (scenario === "filesystem-failure") {
      const circular = {}; circular.self = circular;
      options = { userSettings: circular }; expected = /circular/i;
    } else if (scenario === "listen-failure") {
      expected = /synthetic listen failure/;
    } else {
      assert.equal(scenario, "module-failure");
      mock.method(mock, "module", () => {
        assert.equal(servers[0].listening, true, "failure injected after server admission");
        throw new Error("synthetic module registration failure");
      });
      expected = /synthetic module registration failure/;
    }
    await assert.rejects(bridgeSdkHarness(options), expected);
    assert.equal(process.cwd(), cwdBefore);
    assert.deepEqual({ ...process.env }, envBefore);
    assert.ok(servers.every(server => !server.listening && server.address() === null));
    assert.ok(roots.every(root => !fs.existsSync(root)), "failed setup must release temporary files");
    if (scenario === "missing-module") assert.equal(roots.length, 0, "missing capability must fail before side effects");
    else assert.equal(roots.length, 1);
  } finally {
    mock.restoreAll(); syncBuiltinESMExports();
    // A RED assertion must not leak the resources whose cleanup it is testing.
    for (const server of servers) {
      server.closeAllConnections();
      if (server.listening) await new Promise(resolve => server.close(resolve));
    }
    process.chdir(cwdBefore);
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, envBefore);
    const remaining = roots.filter(root => fs.existsSync(root));
    for (const root of remaining) fs.rmSync(root, { recursive: true, force: true });
  }
});
