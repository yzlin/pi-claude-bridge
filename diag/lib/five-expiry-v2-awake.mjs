// macOS-only live guard; assertions are temporary, owned and deadline-bound.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
export function validateAwake(text, pid, onAC) {
 assert.ok(Number.isSafeInteger(pid) && pid > 0 && onAC);
 const types = ["PreventUserIdleDisplaySleep", "PreventUserIdleSystemSleep", "PreventSystemSleep", "UserIsActive"];
 const rows = text.split("\n").filter(line => new RegExp(`^\\s*pid ${pid}\\(caffeinate\\):`).test(line));
 assert.ok(types.every(type => rows.some(line => new RegExp(`\\b${type}\\b`).test(line))), "owned awake assertions missing");
 return { ownedAssertions: true, onAC: true, types };
}
export async function startAwake(onLost) {
 assert.equal(process.platform, "darwin");
 const child = spawn("/usr/bin/caffeinate", ["-d", "-i", "-s", "-u", "-t", "1200", "-w", String(process.pid)], { stdio: "ignore" });
 let alive = true, closing = false;
 const exited = Promise.withResolvers();
 child.on("exit", () => { alive = false; exited.resolve(); if (!closing) onLost(); });
 child.on("error", () => { alive = false; exited.resolve(); if (!closing) onLost(); });
 const guard = {
  assertAlive() { assert.ok(alive && !closing, "awake utility lost"); },
  assert() {
   this.assertAlive();
   const options = { encoding: "utf8", timeout: 1000 };
   const battery = execFileSync("/usr/bin/pmset", ["-g", "batt"], options);
   const result = validateAwake(execFileSync("/usr/bin/pmset", ["-g", "assertions"], options), child.pid, battery.split("\n")[0].includes("AC Power"));
   this.assertAlive(); return result;
  },
  async close() { closing = true; if (alive) child.kill("SIGTERM"); await exited.promise; },
 };
 try { await delay(250); guard.assert(); return guard; }
 catch { await guard.close(); throw Error("awake startup refused"); }
}
