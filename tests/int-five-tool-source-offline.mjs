// OFFLINE ONLY: real SDK/CLI; synthetic HOME, fake auth and canned loopback SSE.
// Synthetic usage never establishes cache hits or subscription qualification.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { syntheticArm } from "../diag/qualify-native-cache-warming.mjs";

const childPath = fileURLToPath(new URL("./lib/five-tool-source-offline.mjs", import.meta.url));
const stripCache = value => JSON.parse(JSON.stringify(value, (key, item) => key === "cache_control" ? undefined : item));
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const messageBreakpoints = body => body.messages.flatMap((message, index) => {
 let points = 0; JSON.stringify(message, (key, value) => { if (key === "cache_control") points++; return value; });
 return points ? [index] : [];
});
function reply(body, toolCall, refresh, index) {
 const event = (type, fields) => `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`;
 return event("message_start", { message: { id: `msg_offline_tool_source_${index}`, type: "message", role: "assistant", content: [], model: body.model,
  stop_reason: null, stop_sequence: null, usage: { input_tokens: 8, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } })
  + event("content_block_start", { index: 0, content_block: toolCall
   ? { type: "tool_use", id: "toolu_offline_sentinel", name: "mcp__custom-tools__sentinel", input: {} } : { type: "text", text: "" } })
  + event("content_block_delta", { index: 0, delta: toolCall ? { type: "input_json_delta", partial_json: "{}" } : { type: "text_delta", text: "K" } })
  + event("content_block_stop", { index: 0 })
  + event("message_delta", { delta: { stop_reason: toolCall ? "tool_use" : refresh ? "max_tokens" : "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } })
  + event("message_stop", {});
}

for (const model of ["claude-sonnet-5-5", "claude-opus-5-5[1m]"]) {
 test(`${model}: tool-result source retains pairing but fork changes reminder representation`, { timeout: 75_000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), "five-tool-source-offline-")), arm = syntheticArm(root, 0, true);
  const requests = [], unexpected = [], expectedStages = ["seed", "tool", "tool", "refresh", "followup"];
  let child, killTimer;
  const server = createServer(async (req, res) => {
   try {
    if (req.method === "HEAD") { res.writeHead(200).end(); return; }
    assert.equal(req.method, "POST");
    const stage = /^\/(seed|tool|refresh|followup)\/v1\/messages$/.exec(new URL(req.url, "http://localhost").pathname)?.[1];
    assert.equal(stage, expectedStages[requests.length], "unexpected additional model request");
    assert.equal(req.headers["x-api-key"], "offline-tool-source-not-a-secret"); assert.equal(req.headers.authorization, undefined);
    const chunks = []; let length = 0;
    for await (const chunk of req) { length += chunk.length; assert.ok(length <= 1_000_000); chunks.push(chunk); }
    const body = JSON.parse(Buffer.concat(chunks));
    assert.equal(body.model, model.replace(/\[1m\]$/, "")); assert.equal(body.max_tokens, stage === "refresh" ? 1 : 32);
    assert.ok(!body.thinking || body.thinking.type === "disabled");
    assert.deepEqual(body.tools.map(tool => tool.name), ["mcp__custom-tools__sentinel"]);
    const ttl = []; JSON.stringify(body, (key, value) => { if (key === "cache_control") ttl.push(value.ttl ?? "5m"); return value; });
    assert.ok(ttl.length && ttl.every(value => value === "5m"));
    requests.push({ stage, body });
    res.writeHead(200, { "content-type": "text/event-stream" }).end(reply(body, requests.length === 2, stage === "refresh", requests.length));
   } catch (error) { unexpected.push(error.message); if (!res.headersSent) res.writeHead(400).end("offline capture refused"); else res.destroy(); child?.kill(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const kill = () => {
   if (!child?.pid) return;
   try { process.kill(-child.pid, "SIGTERM"); } catch {}
   killTimer ??= setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 1500);
  };
  const abort = () => kill(); t.signal.addEventListener("abort", abort, { once: true });
  const exited = Promise.withResolvers(); let result;
  try {
   child = fork(childPath, [], { cwd: arm.cwd, env: { ...arm.env,
    ANTHROPIC_API_KEY: "offline-tool-source-not-a-secret", ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}` },
    execArgv: ["--import", fileURLToPath(import.meta.resolve("tsx"))], stdio: ["ignore", "ignore", "ignore", "ipc"], detached: true });
   child.on("message", message => {
    if (message.type === "ready") child.send({ type: "init", model });
    else result = message;
   });
   child.on("error", error => exited.reject(error));
   child.on("exit", code => { try { process.kill(-child.pid, "SIGKILL"); } catch {} clearTimeout(killTimer); exited.resolve(code); });
   assert.equal(await exited.promise, 0, JSON.stringify({ result, unexpected, stages: requests.map(row => row.stage) }));
   assert.equal(result?.type, "result"); assert.deepEqual(unexpected, []);
   assert.deepEqual(requests.map(row => row.stage), expectedStages);
   assert.equal(result.value.sourceUnchanged, true); assert.equal(result.value.toolCalls, 1);
   assert.equal(result.value.subscriptionQualified, false); assert.equal(result.value.cacheUsage, "synthetic-not-evidence");
   assert.deepEqual(result.value.rows.map(row => row.starts), [1, 2, 1, 1]);
   assert.deepEqual(result.value.rows.map(row => row.calls), [0, 1, 0, 0]);
   const source = stripCache(requests[2].body), refresh = stripCache(requests[3].body), followup = stripCache(requests[4].body);
   assert.deepEqual(refresh.system, source.system); assert.deepEqual(refresh.tools, source.tools);
   const changed = source.messages.findIndex((value, index) => hash(value) !== hash(refresh.messages[index]));
   assert.ok(changed >= 0, "review qualification if the tool-source prefix no longer diverges");
   const before = source.messages[changed], after = refresh.messages[changed];
   assert.equal(before.role, "system"); assert.equal(after.role, "system");
   assert.ok(Array.isArray(before.content)); assert.equal(typeof after.content, "string");
   assert.match(JSON.stringify(before.content), /<total_tokens>/); assert.match(after.content, /<total_tokens>/);
   assert.ok(source.messages[changed - 1].content.some(block => block.type === "tool_result"), "first divergence must follow the tool result");
   assert.deepEqual(refresh.messages.slice(0, changed), source.messages.slice(0, changed));
   assert.deepEqual(followup.messages.slice(0, changed), source.messages.slice(0, changed));
   assert.deepEqual(followup.messages[changed], after, "ordinary resume changes the same reminder, not only fork");
   assert.deepEqual(messageBreakpoints(requests[2].body), [changed], "source divergence must be at the source cache breakpoint");
   assert.ok(messageBreakpoints(requests[3].body).every(index => index > changed));
   for (const messages of [source.messages, refresh.messages, followup.messages]) {
    const uses = messages.flatMap(m => Array.isArray(m.content) ? m.content.filter(b => b.type === "tool_use") : []);
    const results = messages.flatMap(m => Array.isArray(m.content) ? m.content.filter(b => b.type === "tool_result") : []);
    assert.equal(uses.length, 1); assert.equal(results.length, 1);
    assert.equal(uses[0].id, "toolu_offline_sentinel"); assert.equal(results[0].tool_use_id, uses[0].id);
    assert.match(JSON.stringify(results[0].content), /SYNTHETIC_TOOL_RESULT/);
   }
   t.diagnostic(JSON.stringify({ model, sdkStarts: result.value.rows.length, loopbackRequests: requests.length, liveRequests: 0,
    toolCalls: result.value.toolCalls, sourceUnchanged: true, systemAndToolsStable: true, firstChangedPriorMessage: changed,
    sourceRole: before.role, sourceContent: "array", forkAndOrdinaryResumeContent: "string", semanticTextEqual: before.content.map(b => b.text).join("\n\n") === after.content,
    sourceMessageBreakpoints: messageBreakpoints(requests[2].body), forkMessageBreakpoints: messageBreakpoints(requests[3].body),
    subscriptionQualified: false, cacheUsage: "synthetic-not-evidence" }));
  } finally {
   t.signal.removeEventListener("abort", abort); kill();
   if (child?.exitCode === null) await exited.promise.catch(() => {});
   clearTimeout(killTimer); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
   rmSync(root, { recursive: true, force: true });
  }
 });
}
