---
summary: "Exact Haiku and conservative 5.5 Team native lanes; sealed SDK expiry proof and local native integration limits."
read_when:
  - "Designing or implementing bridge cache policy, warming, or request routing"
  - "Changing supported models, SDK versions, or cache-validation scope"
---

# CONTEXT

## Product purpose

`pi-claude-bridge` integrates Claude Code through the Claude Agent SDK as a Pi model provider and an optional delegation tool. Pi owns the provider conversation and tool execution; the bridge synchronizes a separate Claude Code session. See `README.md` and `src/index.ts`.

## Domain model

Prompt-cache warming is a maintenance operation, not another conversation turn. The locked integration leaves scheduling and usage accounting with Pi; the bridge must preserve the Claude-side cache prefix without advancing either conversation or executing tools. Pi also owns retention policy on the provider path; standalone AskClaude agents retain their existing Claude policy.

Pi 0.87.1 replays the captured request through ordinary `streamSimple` with `maxTokens: 1`, `maxRetries: 0`, and a separate abort signal, without an explicit warming discriminator. The bridge intercepts that exact pair before ordinary side effects and exposes 300/3600-second cache metadata with zero prices. Retention is implemented. Production warming now qualifies **Haiku 4.5, bare Sonnet 5.5 and requested Opus 5.5 `[1m]` / Claude Team / SDK 0.3.285 / CLI 2.1.285 / firstParty/list accounting**, following two controlled five-minute SDK expiry comparisons per model and a separate native-enable decision. Sonnet 5.5 and Opus 5.5 text-only candidates passed after a second source turn with `verbatimPrompts`, which the 5.5 provider and refresh paths now preserve. Both tool-bearing forks subsequently hit the full cached source prefix. Sonnet completed; Opus's final ordinary source follow-up reached its 32-token cap and was refused before SDK usage validation, although provider usage showed the same full prefix hit. That earlier tool-source allocation did not prove controlled expiry extension. Tool-source v1/v2 and expiry v1 are sealed. The expiry run stopped with 8 SDK starts, 10 forwarded requests and one local timing rejection before any refresh forwarding or Opus arm; no expiry comparison completed. Offline diagnosis verified a 302-second maintenance-sleep interval during expiry v1. Awake SDK/observer cancellation settles in ~2 seconds; a process-pause fixture reproduces timing rejection before cleanup. The historical monotonic rejection direction and v1's response-validation cause remain unproven. The separately approved awake-bound expiry v2 then completed 28 SDK starts/36 observed and forwarded model requests/zero blocked, all four warm/control comparisons: warm sources read their full ~21.5k prefix after ~366 seconds; controls read zero and rewrote the source. SDK/provider accounting and source/fork assertions passed; prior 54 artifacts unchanged. This is standalone synthetic-history SDK proof, not full native integration. The separately approved native implementation adds actual source/refresh `verbatimPrompts` parity, narrow ambiguous-row-refusing Opus `[1m]` accounting, and two consecutive captured successful same-lane SDK query completions before 5.5 short-retention warming. Tool callbacks do not add credit; lifecycle changes, same-ID history rebuild, changed definitions/controls/account and uncaptured/ineligible work reset it. First-turn and one-hour 5.5 warming stay gated. Four actual-SDK/native fixtures pass using explicitly simulated public account/init metadata and cache usage, with untouched SDK ModelUsage rows and actual fake-key rejection; no live-native/full-user-extension expiry claim. Independent native safety review and the final interrupted-source delta review passed with no concrete findings; eight targeted units verified. Earlier failed allocations remain sealed; none grants permission to retry.

Sources: `src/cache-policy.ts`, `src/cache-warming.ts`, `src/models.ts`, `src/index.ts`; installed Pi's `dist/core/cache-warmer.js` and `dist/core/model-runtime.js`. Recheck contracts when versions change; ordinary-provider compatibility does not establish warming compatibility.

## Domain glossary

- **Prompt-cache warming** — refreshing a provider's cached prompt prefix before expiry without adding a conversation turn. _Avoid_: subprocess prewarming, transport keep-alive.
- **Source conversation** — the Pi conversation and corresponding Claude Code session whose prefix a refresh targets; neither may be advanced by warming. _Avoid_: none known.
- **Isolated refresh** — a bounded, cancellable cache-refresh request that cannot execute tools or mutate the source conversation. _Avoid_: hidden conversation turn.
- **Cache retention** — the requested provider cache lifetime, independent of whether background refreshes are enabled. _Avoid_: warming duration.
- **Maintenance horizon** — the period after a real request during which Pi permits refreshes; warming does not extend this period. _Avoid_: cache TTL.
- **Warming candidate** — a request matching the bridge's reserved one-token/no-retry convention, still subject to snapshot and eligibility checks. _Avoid_: confirmed maintenance intent.
- **Warming snapshot** — an immutable association between a captured Pi request and its successfully completed Claude source session, including effective model, settings, and prompt/tool definitions. _Avoid_: latest mutable session state.

## Product constraints

### Cache-warming feasibility boundary

The original scope was a feasibility investigation, not native integration. The following records that completed probe's boundaries; the subsequent production contract is recorded separately below.

- First validation target: between-turn refresh, Haiku, and Claude subscription authentication. Active-tool refresh and other models/auth paths remain unproven.
- Use synthetic test conversations, not existing user history. Ensure the test really uses subscription routing rather than an ambient API-key override.
- During feasibility, use a five-minute TTL only for isolated test queries and inspect automatic subscription TTL separately. No production defaults were changed for the experiment.
- The initial live-probe budget was at most 12 top-level SDK queries and 20 minutes. All 12 queries were consumed. That allocation is exhausted, not standing authorization for repeated runs; helper calls and retries mean an SDK-query budget is not an exact API-call or dollar cap.
- Keep the candidate within the public SDK. A local capture proxy may observe traffic, but must not rewrite or replay requests. Do not extract credentials or introduce another authentication path.
- Preserve source history and tool definitions needed for cache identity while preventing tool execution. Refresh failure or cancellation must not damage the source conversation.
- Establish enforced output limits rather than relying on instructions to produce a short reply. Record whether the SDK can meet Pi's one-token replay contract separately from whether cache refresh itself works.
- If required SDK capability is missing, stop and report it rather than silently introducing a transport workaround.
- Retain only synthetic or sanitized evidence; never persist credentials or private conversation content.

### Implemented native integration contract — qualification-gated

- **Ownership and invocation:** no Pi core changes or bridge-owned scheduler. Reserve the exact combination `maxTokens: 1` and `maxRetries: 0` for warming on the bridge provider path. This is an accepted heuristic, not proof of intent: an ordinary request using that combination collides with the convention. Classify before shared-session synchronization, tool-result delivery, or ordinary query setup. An ineligible candidate must never fall through to those paths. Replace the heuristic when the supported Pi baseline supplies an explicit maintenance discriminator.
- **Retention authority:** resolve explicit Pi request retention first, then Pi's scoped/process environment semantics, then its `short` default. Map `short` to five minutes, `long` to one hour, and `none` to disabled caching; expose matching model lifetime metadata. Exactly ten owned cache controls are mirrored into child env and public SDK `settings.env` so local settings cannot defeat them; inherited secrets are never copied into flag settings. Shell environment and Claude configuration files are unchanged. This is not an override of unsafe or managed policy; warming rejects those runtimes.
- **Update boundary and scope:** resolve policy for each new SDK query. A running query finishes its tool loop under its original policy; changes do not retroactively alter server cache entries. Provider turns and their isolated refreshes follow Pi; Pi summaries remain uncached. Standalone AskClaude policy is unchanged. Cache disabling is distinct from summary identity: ordinary `none` preserves history/tools; exact bug-prompt recognition and dedicated compaction/branch takeover paths select isolated summaries. Summary thinking remains unchanged.
- **Eligibility:** target all bridge models with subscription authentication, thinking disabled, and only between turns. Explicitly establish thinking-off on both the normal source query and its refresh; omitting effort is not equivalent to the probe's `thinking: { type: "disabled" }`. Require model/runtime/accounting qualification. Unverified, incompatible, or newly discovered models retain ordinary chat but do not warm until qualified; report any coverage gaps rather than claiming universal support.
- **Snapshot authority:** bind the final captured Pi request to the successfully completed Claude source and freeze the effective configuration and prompt/tool definitions used by that query. Do not reconstruct a refresh from whichever mutable session happens to be current. Missing or mismatched snapshots are ineligible. New work, effective configuration changes, navigation, compaction, and session teardown invalidate relevant snapshots and cancel in-flight refreshes; late completions must not replace newer state.
- **Execution and accounting:** use the measured public-SDK non-persisting fork and narrowly handled budget-guarded completion, subject to qualification. Preserve source history and tool definitions; execute no tools or side-effecting hooks. Re-resolve public settings after account verification and before input release, requiring safe preflight and exact source-settings identity without delaying cancellation. Return per-request stream-event usage, not resumed-session cumulative totals, for Pi's native accounting. The tiny SDK budget is a post-response stop mechanism, not a hard spend cap or universal single-request guarantee.
- **Consent and failure policy:** Pi's existing idle-warming opt-in is sufficient; no second bridge switch. Override the unavailable dollar-savings gate only for eligible bridge refreshes and keep model prices honestly zero. After failure, suppress further warming for that snapshot until another real request; ordinary chat remains unaffected. Record sanitized reasons for skips and qualification failures, not private prompt content.
- **Native limits:** retain Pi's modes, maintenance horizons, and cancellation behavior. With `long` retention, the nominal first refresh at minute 54 remains outside the 30-minute idle horizon; natural one-hour caching still applies. Pi 0.87.1 may display unavailable cache economics between refreshes despite an extension override; document that limitation rather than fabricate prices.
- **Compatibility:** ordinary-provider contracts passed against actual Pi 0.86.1 packages in a scripts-disabled isolated install using a fake SDK on Node 24.11.0. Those Pi packages require Node >=22.19.0; this is not Node 20 or live warming proof. Earlier native offline integration used Pi 0.87.1; current 5.5 registered-provider/native fixtures passed with installed Pi 0.99.1. Thinking-enabled, active-tool, API-key, and AskClaude warming remain outside this scope.

Sources: `src/index.ts` (request dispatch, query settings, completion, and lifecycle handlers), `src/models.ts`, `src/prompt-capture.ts`, installed Pi's cache-warmer and provider option contracts, and the SDK's `promptCacheTtl`, `thinking`, and query-budget declarations. `diag/CACHE-WARMING.md` remains the historical mechanism report, not approval for broader runtime support.

### Current qualification and historical allocation boundary

`src/cache-warming.ts` contains exactly the three approved Team lanes above, with separate 5.5 source-query/parity/short-retention guards. Latest model-specific evidence and sealed counters live in `diag/NATIVE-CACHE-QUALIFICATION.md`. No live-native expiry run was added; standalone SDK proof and local native safety coverage remain distinct. Both separate eight-start/ten-model-attempt/ten-minute tool-source allowances are sealed: v1 after two starts/two forwards; v2 after all eight starts/ten forwards, with both refresh prefixes hit but Opus's final ordinary output truncated. Neither proves expiry or promotes production; unused slots authorize nothing. Historical statements below describe the original failed allocation, not today's production set.


Offline contracts passed for retention precedence/routing, thinking-off, immutable completion snapshots including tool continuations, native cancellation/races/failure suppression, source preservation and per-request usage. Actual SDK tests use loopback responses, fake API-key auth, explicit subscription-metadata simulation; old Haiku fixtures use test-local qualifications and current 5.5 fixtures use the production set. They are not subscription or expiry proof. See `diag/BRIDGE-WARMING-INTEGRATION.md` and `diag/PI-086-COMPAT.md`.

The separately approved **40-start / 40-minute** native allocation is sealed after one failed SDK start and zero model HTTP attempts or forwarding. The first `claude-fable-5` seed could not establish an eligible subscription lane through public account metadata in isolated HOME/config. No source, refresh, expiry comparison or per-request usage completed; all 12 models remain unverified and the other 11 were unattempted. This does not prove the user lacks a subscription, identify the auth cause, or show Fable is unsupported. Unused slots are not permission to restart, resume, reset or create a new ledger. Further auth investigation or live work needs separately reviewed scope; no credential-copy or routing workaround is part of this contract.

Only synthetic/sanitized evidence may support future qualification. Targeting a model never qualifies it; exact model/runtime/accounting evidence and independent acceptance are required. The forwarding guard is diagnostic instrumentation, not production transport. One-hour expiry remains untested. See `diag/NATIVE-CACHE-QUALIFICATION.md` for counters, coverage and the retained allocation record.

### Evidence required

A positive mechanism result requires two controlled comparisons: an isolated refresh followed by reuse after the original expiry, versus a distinct, unrefreshed control followed by a request after expiry. Separate the arms' test prefixes so one cannot warm the other's target prefix.

Compare captured request prefixes and provider-reported cache reads/writes. A fast response, shared system-prefix hit, or high aggregate hit ratio alone is insufficient. Confirm the source transcript is unchanged and no tools execute. Report a pass, a specific blocker, or inconclusive evidence; do not treat missed deadlines or ambiguous controls as proof of support or impossibility.

## Measured feasibility outcome

On 2026-09-26, SDK 0.3.280 / bundled Claude Code 2.1.280 showed automatic one-hour caching for the tested Haiku subscription session. The initial two-query trial hit the cache but exposed internal continuation after a one-token `max_tokens` response, despite turn/retry limits. The guard blocked the additional request; this did not prove an increased per-request cap or unlimited retries.

On continuation, the public `maxBudgetUsd: 0.000001` option provided a measured post-response stop trigger. An isolated fork emits terminal `error_max_budget_usd` after one request; stop consuming at that result and close the query. Per-request usage comes from SDK stream events, not cumulative resumed-session totals. This is not a hard monetary ceiling or a universal single-request guarantee: pricing/accounting changes require revalidation.

The remaining ten live queries completed two controlled five-minute expiry comparisons with thinking disabled. Refreshes at about 241 seconds preserved 19,571 / 19,568 cached seed tokens at follow-ups around 366 seconds; unrefreshed controls read zero. Each refresh emitted one token, attempted no extra request, preserved source JSONL bytes, wrote no fork transcript, and executed no tool. SDK usage matched provider usage. Total live SDK queries: 12. Cancellation is separately verified offline.

This historical SDK-only experiment demonstrated scoped feasibility, not native Pi qualification or broader model/lifecycle support; it changed no production defaults at that phase. Subsequent Pi-owned retention and offline native integration are described above. See `diag/CACHE-WARMING.md` for the preserved original evidence; its 12-query allocation is exhausted.

## Open questions and evidence gates

- **5.5 qualification:** SDK expiry v2 completed two warm/control comparisons per model. Conservative native integration was separately approved: short retention after two captured successful same-lane SDK queries, verbatim source/refresh parity and narrow Opus `[1m]` accounting. First-turn/one-hour warming stays gated; full live-native/user-extension expiry and quota savings remain unproven. No history rewriting or auth workaround is authorized.
- **Evidence limits:** Haiku Team five-minute renewal is live-proven; offline fixtures do not qualify adjacent models, account plans or versions. Exact subscription-quota savings remain unknown. Live runs require separate bounded approval and sealed allocations; unused slots grant nothing.
- **Deferred support:** thinking-enabled, active-tool, API-key, and AskClaude warming; older-Pi warming; and one-hour expiry controls need separate scope and evidence. No scheduler or Pi horizon changes are included.

## Context map

See `CONTEXT-MAP.md`.
