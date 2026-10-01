import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

test("native warming fixture teardown needs no system trash executable", { timeout: 20_000 }, () => {
  const env = { ...process.env, PATH: (process.env.PATH ?? "").split(delimiter).filter(dir =>
    !["trash", "trash.cmd", "trash.exe", "trash.bat"].some(name => existsSync(join(dir, name))),
  ).join(delimiter) };
  delete env.NODE_TEST_CONTEXT; // isolate the nested runner from parent IPC
  const unavailable = spawnSync("trash", ["--help"], { env });
  assert.equal(unavailable.error?.code, "ENOENT", "the regression must actually exclude system trash");
  const child = spawnSync(process.execPath, ["--import", "tsx", "--import", "./tests/lib/setup.mjs",
    "--test", "tests/unit-five-native-warming.mjs"], { env, encoding: "utf8", timeout: 15_000 });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
  assert.match(child.stdout, /# pass 8|ℹ pass 8/);
});
