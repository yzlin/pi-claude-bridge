// No SDK import, prompt producer, iterator over q, or forwarding implementation.
const laneValues = [
 ["firstParty", "bedrock", "vertex", "foundry"],
 ["Claude Pro", "Claude Max", "Claude Team", "Claude Enterprise", "Claude API"],
 ["none", "oauth", "user", "project", "environment"],
 ["none", "user", "project", "environment"],
];
export function safeAccount(warming, account) {
 const evidence = warming.accountEvidence(account);
 const lane = [account.apiProvider, account.subscriptionType, account.tokenSource, account.apiKeySource]
  .map((value, i) => value === undefined || value === null ? null : laneValues[i].includes(value) ? value : "other");
 return { eligible: evidence.eligible === true, lane: JSON.stringify(lane) };
}
export function validateAccount(value) {
 if (!value || typeof value.eligible !== "boolean" || typeof value.lane !== "string") throw Error("account evidence refused");
 const lane = JSON.parse(value.lane);
 if (!Array.isArray(lane) || lane.length !== 4 || !lane.every((v, i) => v === null || v === "other" || laneValues[i].includes(v))) throw Error("account lane refused");
 if (value.eligible && !(lane[0] === "firstParty" && laneValues[1].slice(0, 4).includes(lane[1]) && lane[2] === null && lane[3] === null)) throw Error("account eligibility refused");
 return { eligible: value.eligible, lane: JSON.stringify(lane) };
}
export async function observeAccount({ sdk, warming, cwd, env, baseUrl, signal, permit, started }) {
 const controller = new AbortController(), ended = Promise.withResolvers();
 const abort = () => { controller.abort(); ended.resolve(); };
 signal.addEventListener("abort", abort, { once: true });
 if (signal.aborted) abort();
 // Every next() returns only done:true at teardown. Never yields even an empty turn.
 const prompt = { [Symbol.asyncIterator]() { return this; }, async next() { await ended.promise; return { done: true }; }, async return() { abort(); return { done: true }; } };
 const check = () => { if (controller.signal.aborted) throw Error("cancelled"); };
 const wait = async promise => { const value = await Promise.race([promise, ended.promise]); check(); return value; };
 const settings = { disableAllHooks: true, autoMemoryEnabled: false, includeGitInstructions: false, claudeMdExcludes: ["/**"] };
 let q, account, status = "failed";
 try {
  check();
  // Default sources mirror the ordinary provider. Fail closed on hooks, helpers,
  // managed policy and unknown controls before reserving query permission.
  const resolved = await wait(sdk.resolveSettings({ cwd }));
  if (!warming.preflightRuntime(warming.warmingRuntime(resolved, settings)).ok) throw Error("policy refused");
  await wait(permit()); check();
  try {
   q = sdk.query({ prompt, options: { cwd, env: { ...env, ANTHROPIC_BASE_URL: baseUrl,
    ENABLE_CLAUDEAI_MCP_SERVERS: "0", DISABLE_AUTO_COMPACT: "1", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    CLAUDE_CODE_DISABLE_TERMINAL_TITLE: "1", CLAUDE_CODE_MAX_RETRIES: "0" },
    settings, tools: [], mcpServers: {}, strictMcpConfig: true, hooks: {}, permissionMode: "dontAsk",
    thinking: { type: "disabled" }, maxTurns: 1, persistSession: false, promptSuggestions: false, abortController: controller } });
  } finally { started(); } // actual invocation observed, including synchronous throws
  account = safeAccount(warming, await wait(q.accountInfo()));
  check(); status = "complete";
 } catch { status = "failed"; account = undefined; }
 finally {
  abort();
  try { q?.close(); } catch { status = "failed"; account = undefined; }
  await prompt.return(); signal.removeEventListener("abort", abort);
 }
 return { status, inputReleased: 0, ...(account ? { account } : {}) };
}
