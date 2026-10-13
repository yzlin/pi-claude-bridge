import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CacheWarmingCoordinator, PRODUCTION_QUALIFIED_WARMING_MODELS, WARMING_SDK_VERSION,
  accountEvidence, warmingControlsFingerprint, warmingQualificationKey, selectModelUsage, runIsolatedRefresh,
} from "../src/cache-warming.ts";

// Synthetic public subscription/accounting metadata. No SDK or network starts.
const account = { apiProvider: "firstParty", subscriptionType: "Claude Team" };
const effective = { disableAllHooks: true, autoMemoryEnabled: false };
const settings = { effective, resolvedEffective: effective, sources: [] };
const root = mkdtempSync(join(tmpdir(), "five-native-unit-"));
const path = join(root, "source.jsonl");
writeFileSync(path, "synthetic-source");
after(() => rmSync(root, { recursive: true, force: true }));
function source(id = "claude-opus-5-5") {
  return {
    owner: "owner", model: { id, provider: "claude-bridge", baseUrl: "claude-bridge" },
    cliModel: id === "claude-opus-5-5" ? `${id}[1m]` : id,
    retention: "short", sessionId: "sdk-session", requestOptions: { sessionId: "pi-session" },
    context: { systemPrompt: "synthetic", messages: [{ role: "user", content: "hello", timestamp: 1 }], tools: [] },
    systemPrompt: { type: "preset", preset: "claude_code", append: "synthetic" }, mcpTools: [],
    settings, env: { ENABLE_CLAUDEAI_MCP_SERVERS: "0" }, extraArgs: { "strict-mcp-config": null },
    processFingerprint: warmingControlsFingerprint(undefined), verbatimPrompts: true, thinkingOptions: { thinking: { type: "disabled" } },
    evidence: { account: accountEvidence(account), sdkVersion: WARMING_SDK_VERSION, servedModel: id,
      init: { claude_code_version: "2.1.293", apiKeySource: "none", tools: [], mcp_servers: [], plugins: [] },
      usage: { provider: "firstParty", canonicalModel: id, costBasis: "list" }, sourceCachedTokens: 7 },
    sourceTranscript: { path, bytesBase64: Buffer.from("synthetic-source").toString("base64") },
  };
}
const decision = s => ({ owner: s.owner, piSessionId: s.requestOptions.sessionId, model: s.model,
  idle: true, retention: s.retention, runtime: s.settings, controlsFingerprint: s.controlsFingerprint });
function publish(c, s) { c.complete(c.begin(s.owner), s); }
// 5.5 is not production-qualified on SDK 0.3.293. These keys stand in for an
// approved 5.5 lane so the extra 5.5 gating stays covered.
const QUALIFIED_5_5 = new Set(["claude-sonnet-5-5", "claude-opus-5-5"].map(id => warmingQualificationKey(source(id))));

for (const id of ["claude-sonnet-5-5", "claude-opus-5-5"]) {
  test(`${id}: first completed SDK source stays gated; next same-lane source qualifies`, () => {
    const s = source(id), c = new CacheWarmingCoordinator({ qualified: QUALIFIED_5_5 });
    publish(c, s);
    assert.equal(c.snapshot().sourceQueryCount, 1);
    assert.equal(c.decide(decision(s)), "stop");
    c.invalidate("new input", true);
    publish(c, s);
    assert.equal(c.snapshot().sourceQueryCount, 2);
    assert.equal(c.decide(decision(s)), "warm");
    c.complete(c.snapshot().generation, s);
    assert.equal(c.snapshot().sourceQueryCount, 2, "same completion cannot increment twice");
  });
}

test("5.5: lifecycle boundaries, changed source lanes and stale completion cannot reuse first-turn credit", () => {
  const original = source();
  for (const mutate of [
    s => ({ ...s, sessionId: "other-sdk" }),
    s => ({ ...s, requestOptions: { sessionId: "other-pi" } }),
    s => ({ ...s, owner: "other-owner" }),
    s => ({ ...s, controlsFingerprint: "changed" }),
    s => ({ ...s, processFingerprint: "changed" }),
    s => ({ ...s, systemPrompt: { ...s.systemPrompt, append: "changed" } }),
    s => ({ ...s, evidence: { ...s.evidence, account: accountEvidence({ ...account, email: "other@example.invalid" }) } }),
  ]) {
    const c = new CacheWarmingCoordinator({ qualified: QUALIFIED_5_5 });
    publish(c, original); publish(c, mutate(original));
    assert.equal(c.snapshot().sourceQueryCount, 1);
    assert.equal(c.decide(decision(mutate(original))), "stop");
  }
  for (const boundary of ["session_start", "model changed", "thinking changed", "compaction", "tree navigation"]) {
    const c = new CacheWarmingCoordinator({ qualified: QUALIFIED_5_5 });
    publish(c, original); c.invalidate(boundary); publish(c, original);
    assert.equal(c.snapshot().sourceQueryCount, 1, boundary);
  }
  const rebuilt = new CacheWarmingCoordinator({ qualified: QUALIFIED_5_5 });
  publish(rebuilt, original);
  rebuilt.complete(rebuilt.begin(original.owner), original, true);
  assert.equal(rebuilt.snapshot().sourceQueryCount, 1, "same-ID imported-history rebuild resets credit");
  const c = new CacheWarmingCoordinator({ qualified: QUALIFIED_5_5 });
  const stale = c.begin(original.owner), current = c.begin(original.owner);
  c.complete(stale, original); c.complete(current, original);
  assert.equal(c.snapshot().sourceQueryCount, 1);
});

test("5.5: an uncaptured or ineligible source breaks consecutive query credit", () => {
  const s = source();
  const thinking = { ...s, reasoning: "high", requestOptions: { ...s.requestOptions, reasoning: "high" }, thinkingOptions: { effort: "high" } };
  for (const interruption of [undefined, { ...s, retention: "none" }, thinking]) {
    const c = new CacheWarmingCoordinator({ qualified: QUALIFIED_5_5 });
    publish(c, s);
    const incomplete = c.begin(s.owner);
    if (interruption) c.complete(incomplete, interruption);
    c.invalidate("new input", true);
    publish(c, s);
    assert.equal(c.snapshot().sourceQueryCount, 1);
    assert.equal(c.decide(decision(s)), "stop");
  }
});

test("5.5: long retention, missing parity and adjacent runtime/accounting/model lanes stay gated", () => {
  const original = source();
  const changes = [
    { retention: "long" }, { verbatimPrompts: undefined }, { verbatimPrompts: false },
    { cliModel: "claude-opus-5-5" },
    { evidence: { ...original.evidence, servedModel: "claude-opus-5-5-20261001" } },
    { evidence: { ...original.evidence, sdkVersion: "0.3.286" } },
    { evidence: { ...original.evidence, init: { ...original.evidence.init, claude_code_version: "2.1.286" } } },
    { evidence: { ...original.evidence, usage: { ...original.evidence.usage, costBasis: "managed" } } },
    { evidence: { ...original.evidence, usage: { ...original.evidence.usage, provider: "bedrock" } } },
    { evidence: { ...original.evidence, account: accountEvidence({ ...account, subscriptionType: "Claude Max" }) } },
  ];
  for (const change of changes) {
    const s = { ...original, ...change }, c = new CacheWarmingCoordinator({ qualified: QUALIFIED_5_5 });
    publish(c, s); publish(c, s);
    assert.equal(c.decide(decision(s)), "stop", JSON.stringify(change));
  }
});

test("Opus [1m] accounting: only requested/bare rows reconcile; ambiguity and other suffixes refuse", () => {
  const requested = "claude-opus-5-5[1m]", bare = "claude-opus-5-5";
  const row = { provider: "firstParty", canonicalModel: bare, costBasis: "list" };
  for (const key of [bare, requested]) for (const canonicalModel of [bare, requested]) {
    assert.deepEqual(selectModelUsage({ [key]: { ...row, canonicalModel } }, bare, requested), row);
  }
  for (const rows of [
    { [bare]: row, [requested]: row },
    { [requested]: row, other: row },
    { [requested]: { ...row, canonicalModel: "other" } },
    { [`${bare}[2m]`]: row },
    { other: row },
  ]) assert.equal(selectModelUsage(rows, bare, requested), undefined);
  assert.equal(selectModelUsage({ [requested]: row }, "other", requested), undefined);
  const other = "claude-sonnet-5-5[1m]";
  assert.equal(selectModelUsage({ [other]: { ...row, canonicalModel: other } }, "claude-sonnet-5-5", other), undefined);
});

test("Haiku lane remains first-source eligible without verbatim prompts", () => {
  const s = source("claude-haiku-4-5"); delete s.verbatimPrompts;
  const c = new CacheWarmingCoordinator({ qualified: PRODUCTION_QUALIFIED_WARMING_MODELS });
  publish(c, s); assert.equal(c.decide(decision(s)), "warm");
});

test("5.5 refresh uses source verbatim prompts and reconciles requested Opus SDK row", async () => {
  const s = source(); let options;
  const messages = [
    { type: "system", subtype: "init", session_id: "fork", ...s.evidence.init },
    { type: "stream_event", event: { type: "message_start", message: { model: s.model.id,
      usage: { input_tokens: 2, output_tokens: 0, cache_read_input_tokens: 7, cache_creation_input_tokens: 0 } } } },
    { type: "stream_event", event: { type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: { output_tokens: 1 } } },
    { type: "assistant", message: { model: s.model.id, content: [{ type: "text", text: "K" }], stop_reason: "max_tokens" } },
    { type: "result", subtype: "error_max_budget_usd", modelUsage: { [s.cliModel]: { ...s.evidence.usage, canonicalModel: s.cliModel } } },
  ];
  const result = await runIsolatedRefresh(s, new AbortController().signal, {
    resolveSettings: async () => ({ effective: settings.effective, sources: [], provenance: {} }),
    query: ({ options: o }) => { options = o; return { accountInfo: async () => account,
      async *[Symbol.asyncIterator]() { yield* messages; }, close() {} }; },
  });
  assert.equal(options.verbatimPrompts, true);
  assert.equal(result.kind, "success");
  assert.equal(PRODUCTION_QUALIFIED_WARMING_MODELS.has(warmingQualificationKey(s)), false, "5.5 is not qualified on SDK 0.3.293");
});
