// OFFLINE ONLY: real SDK, in-memory fake CLI; no auth, network or user input.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { accountEvidence } from "../src/cache-warming.ts";

// Mirrors the two observed public shapes, not the cause of their difference.
const initialAccount = { apiProvider: "firstParty", tokenSource: "none" };
const laterAccount = { apiProvider: "firstParty", subscriptionType: "Claude Team" };

test("accountInfo retains first initialization while reinitialize returns a fresh account", { timeout: 5_000 }, async () => {
 const requests = [];
 let spawns = 0, initializes = 0, pending = "";
 const child = new EventEmitter();
 child.stdout = new PassThrough();
 child.killed = false;
 child.exitCode = null;
 child.stdin = new Writable({ write(chunk, _encoding, done) {
  try {
   pending += chunk.toString();
   let newline;
   while ((newline = pending.indexOf("\n")) !== -1) {
    const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
    if (!line) continue;
    const request = JSON.parse(line); requests.push(request);
    assert.equal(request.type, "control_request", "no user input may reach fake CLI");
    assert.equal(request.request.subtype, "initialize", "no extra control operation expected");
    assert.ok(initializes < 2, "unexpected extra initialization");
    const account = initializes++ === 0 ? initialAccount : laterAccount;
    child.stdout.write(JSON.stringify({ type: "control_response", response: {
     subtype: "success", request_id: request.request_id, response: { account, commands: [], models: [] },
    } }) + "\n");
   }
   done();
  } catch (error) { done(error); }
 } });
 child.kill = () => {
  if (child.killed) return false;
  child.killed = true; child.exitCode = 0;
  child.stdout.end(); child.emit("exit", 0, null); return true;
 };
 // EOF ends the fake process immediately; no SDK shutdown grace or timers linger.
 child.stdin.on("finish", () => child.kill());
 const inputEnded = Promise.withResolvers();
 const q = query({ prompt: { async *[Symbol.asyncIterator]() { await inputEnded.promise; } }, options: {
  tools: [], hooks: {}, persistSession: false,
  spawnClaudeCodeProcess() { assert.equal(++spawns, 1); return child; },
 } });
 try {
  assert.deepEqual(await q.accountInfo(), initialAccount);
  assert.equal(accountEvidence(await q.accountInfo()).eligible, false);
  assert.equal(requests.length, 1, "accountInfo must not send a refresh request");
  const fresh = await q.reinitialize();
  assert.deepEqual(fresh.account, laterAccount);
  assert.equal(accountEvidence(fresh.account).eligible, true);
  assert.equal(requests.length, 2, "reinitialize must send a fresh initialize request");
  assert.deepEqual((await q.initializationResult()).account, initialAccount);
  assert.deepEqual(await q.accountInfo(), initialAccount, "fresh response must not replace cached accountInfo");
  assert.equal(accountEvidence(await q.accountInfo()).eligible, false);
  assert.equal(requests.length, 2);
  assert.equal(spawns, 1, "only fake transport is spawned; native CLI never runs");
 } finally { inputEnded.resolve(); q.close(); child.kill(); }
});
