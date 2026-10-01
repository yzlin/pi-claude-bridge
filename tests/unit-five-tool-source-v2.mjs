import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from "node:fs";

import { tmpdir } from "node:os";
import { join } from "node:path";
import { APPROVAL, COHORT, FiveOwner, parseArgs, validateApproval } from "../diag/lib/five-tool-source-v2-owner.mjs";
import * as transport from "../diag/lib/five-tool-source-v2-transport.mjs";
const root = () => mkdtempSync(join(tmpdir(), "five-tool-v2-unit-"));
test("response observation retains truncation and tool-contract facts without raw output", () => {
 const event = value => `data: ${JSON.stringify(value)}\n`;
 const text = event({ type: "message_start", message: { model: COHORT[0], usage: { input_tokens: 2, output_tokens: 1, cache_read_input_tokens: 10, cache_creation_input_tokens: 20 } } })
  + event({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "synthetic-private-id", name: "mcp__custom-tools__sentinel", input: {} } })
  + event({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"secret":"synthetic-private-content"' } })
  + event({ type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: { output_tokens: 128 } });
 const row = transport.responseEvidence(text);
 assert.equal(row.parseable, true); assert.equal(row.stop, "max_tokens"); assert.equal(row.usage.output_tokens, 128);
 assert.equal(row.toolBlocks, 1); assert.equal(row.toolNameAllowed, true); assert.equal(row.toolInputComplete, false); assert.equal(row.toolInputEmpty, false);
 assert.doesNotMatch(JSON.stringify(row), /synthetic-private/);
 assert.deepEqual(transport.responseEvidence("data: not-json\n"), { parseable: false });
 const complete = transport.responseEvidence(text.replace('{\\"secret\\":\\"synthetic-private-content\\"', "{}"));
 assert.equal(complete.toolInputComplete, true); assert.equal(complete.toolInputEmpty, true);
});
test("response metadata never retains unknown provider strings, text or tool arguments", () => {
 const events = [
  { type: "message_start", message: { model: "private-model-label", usage: { input_tokens: -1, output_tokens: 1.5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } },
  { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "private-call-id", name: "private-tool-name", input: { secret: "private-argument" } } },
  { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "private-response-text" } },
  { type: "message_delta", delta: { stop_reason: "private-stop-label" }, usage: {} },
 ];
 const row = transport.responseEvidence(events.map(event => `data: ${JSON.stringify(event)}\n`).join(""));
 assert.equal(row.servedModel, "unexpected"); assert.equal(row.stop, "unexpected"); assert.equal(row.usageValid, false);
 assert.equal(row.toolInputComplete, true); assert.equal(row.toolInputEmpty, false); assert.equal(row.toolNameAllowed, false);
 assert.doesNotMatch(JSON.stringify(row), /private-/);
});
const toolHash = "a".repeat(64);
test("wire gates enforce model, exact sentinel inventory, output cap and stable system/tools", () => {
 const body = { model: COHORT[0], max_tokens: 32, system: [{ type: "text", text: "Synthetic", cache_control: { type: "ephemeral" } }],
  tools: [{ name: "mcp__custom-tools__sentinel", description: "Synthetic", input_schema: { type: "object", properties: {} } }], messages: [] };
 const expected = { model: COHORT[0], refresh: false, stage: "seed" };
 const source = transport.wireEvidence(body, expected);
 for (const value of [{ ...body, max_tokens: 33 }, { ...body, model: "claude-haiku-4-5" }, { ...body, tools: [...body.tools, { name: "mcp__custom-tools__extra" }] }])
  assert.throws(() => transport.wireEvidence(value, expected));
 assert.throws(() => transport.wireEvidence(body, { ...expected, refresh: true }));
 transport.wireEvidence({ ...body, max_tokens: 1 }, { ...expected, refresh: true, stage: "refresh" }, source);
 assert.throws(() => transport.wireEvidence(body, { ...expected, stage: "tool" }, source));
 transport.wireEvidence({ ...body, max_tokens: 128 }, { ...expected, stage: "tool" }, source);
 assert.throws(() => transport.wireEvidence({ ...body, max_tokens: 129 }, { ...expected, stage: "tool" }, source));
 for (const value of [{ ...body, system: [{ type: "text", text: "Changed", cache_control: { type: "ephemeral" } }] },
  { ...body, tools: [{ ...body.tools[0], description: "Changed" }] }]) assert.throws(() => transport.wireEvidence(value, expected, source));
});
test("source init permits exactly the pinned SDK sentinel server and tool", () => {
 const init = { claude_code_version: "2.1.285", apiKeySource: "none", plugins: [], tools: ["mcp__custom-tools__sentinel"],
  mcp_servers: [{ name: "custom-tools", status: "connected", source: "sdk" }] };
 transport.validateSourceInit(init);
 for (const value of [{ ...init, tools: [] }, { ...init, tools: [...init.tools, "mcp__custom-tools__extra"] },
  { ...init, mcp_servers: [...init.mcp_servers, { name: "external", status: "connected" }] }, { ...init, plugins: ["external"] }])
  assert.throws(() => transport.validateSourceInit(value));
});
test("post-account input gate repeats preflight and refuses changed or failed settings", async () => {
 const options = { synthetic: true }; let checks = 0;
 await transport.validateInputPreflight(async value => { assert.equal(value, options); checks++; return "original"; }, options, "original");
 assert.equal(checks, 1);
 await assert.rejects(transport.validateInputPreflight(async () => "changed", options, "original"));
 await assert.rejects(transport.validateInputPreflight(async () => { throw Error("synthetic resolver failure"); }, options, "original"));
});
test("fresh tool-source allowance only: eight starts, ten model requests, ten minutes", () => {
 assert.deepEqual(APPROVAL, { id: "native-five-tool-source-8q-10http-10m-v2", sdkStarts: 8, httpAttempts: 10, elapsedMs: 600_000 });
 assert.equal(parseArgs([]), "readiness"); assert.equal(parseArgs(["--offline"]), "offline"); assert.equal(parseArgs(["--live", APPROVAL.id]), "live");
 for (const id of ["native-five-tool-source-8q-10http-10m-v1", "native-five-verbatim-8q-10m-v1", "native-five-verbatim-8q-10m-v2", "native-five-verbatim-8q-10m-v3", "native-five-account-snapshot-1q-60s-v1"]) assert.throws(() => parseArgs(["--live", id]));
 for (const args of [["--reset"], ["--live"], ["--offline", "extra"]]) assert.throws(() => parseArgs(args));
});
test("only validated tool response, handler and paired result permit second source forwarding", () => {
 const r = root(); let o;
 try {
  o = new FiveOwner(join(r, "ledger"), { offline: true }); assert.throws(() => new FiveOwner(join(r, "ledger")));
  for (const model of COHORT) for (const stage of ["seed", "tool", "refresh", "followup"]) {
   const id = o.reserve(model, stage); o.started(id); o.attempt(id); o.forwarded(id);
   assert.throws(() => o.forwarded(id)); assert.throws(() => o.started(id));
   o.responded(id, { stop: stage === "tool" ? "tool_use" : stage === "refresh" ? "max_tokens" : "end_turn", toolUseHash: stage === "tool" ? toolHash : null });
   if (stage === "tool") {
    o.toolCalled(id, toolHash); assert.throws(() => o.toolCalled(id, toolHash)); o.attempt(id);
    assert.throws(() => o.forwarded(id)); assert.throws(() => o.toolResult(id, "b".repeat(64)));
    o.toolResult(id, toolHash); o.forwarded(id); o.responded(id, { stop: "end_turn", toolUseHash: null });
   }
  }
  assert.equal(o.state.reserved, 8); assert.equal(o.state.sdkStarts, 8); assert.equal(o.state.httpAttempts, 10); assert.equal(o.state.forwarded, 10);
  assert.throws(() => o.reserve(COHORT[0], "seed")); o.finish("complete"); assert.throws(() => new FiveOwner(join(r, "ledger")));
  assert.equal(JSON.parse(readFileSync(join(r, "ledger/events.jsonl"), "utf8").trim().split("\n").at(-1)).status, "complete");
 } finally { o?.close(); rmSync(r, { recursive: true, force: true }); }
});
test("retries and out-of-order stages never get another forwarding permission", () => {
 for (const fault of ["seed-retry", "tool-without-handler", "tool-third", "out-of-order", "bad-response"]) {
  const r = root(); let o;
  try {
   o = new FiveOwner(join(r, "ledger"), { offline: true }); const model = COHORT[0];
   if (fault === "out-of-order") { assert.throws(() => o.reserve(model, "tool")); continue; }
   const seed = o.reserve(model, "seed"); o.started(seed); o.attempt(seed); o.forwarded(seed); o.responded(seed, { stop: "end_turn", toolUseHash: null });
   if (fault === "seed-retry") { assert.throws(() => o.attempt(seed)); assert.throws(() => o.reserve(COHORT[1], "seed")); continue; }
   const id = o.reserve(model, "tool"); o.started(id); o.attempt(id); o.forwarded(id);
   if (fault === "bad-response") { assert.throws(() => o.responded(id, { stop: "end_turn", toolUseHash: null })); continue; }
   o.responded(id, { stop: "tool_use", toolUseHash: toolHash });
   if (fault === "tool-without-handler") { assert.throws(() => o.attempt(id)); assert.throws(() => o.reserve(COHORT[1], "seed")); continue; }
   o.toolCalled(id, toolHash); o.attempt(id); o.toolResult(id, toolHash); o.forwarded(id); o.responded(id, { stop: "end_turn", toolUseHash: null });
   assert.throws(() => o.attempt(id)); assert.equal(o.state.forwarded, 3); assert.throws(() => o.reserve(COHORT[1], "seed"));
  } finally { o?.close(); rmSync(r, { recursive: true, force: true }); }
 }
});
test("deadlines, backwards clocks and disk failure do not grant SDK starts", () => {
 for (const mode of ["wall", "mono", "backwards", "disk"]) {
  const r = root(); let now = 1000, mono = 1000, broken = false, o;
  try {
   o = new FiveOwner(join(r, "ledger"), { offline: true, now: () => now, monotonic: () => mono, persist: () => { if (broken) throw Error(); } });
   if (mode === "wall") now += APPROVAL.elapsedMs; if (mode === "mono") mono += APPROVAL.elapsedMs; if (mode === "backwards") now--; if (mode === "disk") broken = true;
   let invoked = false; assert.throws(() => { o.reserve(COHORT[0], "seed"); invoked = true; }); assert.equal(invoked, false);
   broken = false; assert.throws(() => o.reserve(COHORT[0], "seed"));
  } finally { o?.close(); rmSync(r, { recursive: true, force: true }); }
 }
});
test("immutable marker remains code-bound, expiring and fixed-budget", () => {
 const r = root(), path = join(r, "marker"), code = "c".repeat(64), value = { ...APPROVAL, codeHash: code, approvedAt: 1000, expiresAt: 2000 };
 try {
  writeFileSync(path, JSON.stringify(value), { mode: 0o400 }); validateApproval(path, code, 1500);
  assert.throws(() => validateApproval(path, code, 2000)); assert.throws(() => validateApproval(path, "d".repeat(64), 1500));
  for (const extra of [{ sdkStarts: 9 }, { httpAttempts: 11 }, { id: "native-five-verbatim-8q-10m-v3" }]) {
   chmodSync(path, 0o600); writeFileSync(path, JSON.stringify({ ...value, ...extra })); chmodSync(path, 0o400); assert.throws(() => validateApproval(path, code, 1500));
  }
 } finally { rmSync(r, { recursive: true, force: true }); }
});
