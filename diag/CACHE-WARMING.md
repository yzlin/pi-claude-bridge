---
summary: "Isolated Haiku cache refresh passes two expiry controls when the SDK budget guard stops truncation recovery."
read_when:
  - "Designing cache warming or interpreting a one-token Claude Agent SDK query"
  - "Upgrading the SDK or revisiting the cache-warming blocker"
---

# Cache-warming feasibility

## Current status — historical SDK-only evidence

The results below preserve the earlier Haiku feasibility experiment, which exhausted its **12-query / 20-minute allocation**. Pi-owned retention and native integration have since been implemented. **Exact Haiku, Sonnet 5.5 and Opus 5.5 `[1m]` Team / SDK 0.3.285 / CLI 2.1.285 lanes now have native support**. 5.5 is conservative: short retention only, two consecutive captured successful same-lane SDK source queries and verbatim source/refresh parity. Awake-bound SDK expiry v2 passed two controlled comparisons per 5.5 model, followed by separately approved native integration and actual-SDK loopback tests. Standalone synthetic-history expiry proof is not a live test of the user's complete Pi extension setup; first-turn/one-hour 5.5 warming stays gated. The original native 40-start allocation remains sealed after its first SDK start failed the public account gate, with zero model HTTP attempts. It completed no source, refresh or expiry comparison. See [native qualification closeout](NATIVE-CACHE-QUALIFICATION.md), [offline native evidence](BRIDGE-WARMING-INTEGRATION.md), and [current contract](../CONTEXT.md). Neither allocation authorizes more calls.

## Historical outcome — scoped feasibility demonstrated

Measured 2026-09-26 with Claude Agent SDK **0.3.280**, its bundled Claude Code **2.1.280**, and **claude-haiku-4-5**, with thinking disabled. The separately installed `claude` was 2.1.282; the SDK probe did not use that executable.

Two controlled five-minute expiry comparisons passed using a non-persisting SDK fork and `maxBudgetUsd: 0.000001` as a post-response stop trigger. Both refreshed conversations retained their cached seed prefix after original expiry; both unrefreshed controls missed. The source transcripts stayed unchanged, no tools ran, and each refresh made exactly one one-token request. This establishes the isolated mechanism, **not native Pi integration or general model support**.

### Initial baseline — unguarded truncation fails

An isolated fork can read the source prefix's cache. However, a one-token response ending in `max_tokens` triggers another API request inside the same SDK query, despite `maxTurns: 1` and `CLAUDE_CODE_MAX_RETRIES=0`. The probe rejects additional requests before forwarding them. This is not evidence of unlimited retries or of an increased per-request output cap: the offline reproduction's second request also specified `max_tokens: 1`.

Pi 0.87.1 replays `streamSimple` with a one-token cap and no warming discriminator; a normal SDK query is not necessarily a single model request. No dedicated recovery-disable switch was found in the inspected declarations/environment reference. The public SDK budget guard provided a different, measured way to terminate after the first request, described below.

## Initial live sequence

The run used synthetic history, subscription authentication verified at the local proxy before forwarding, no executable built-in tools, and a non-executing MCP sentinel. Only **two top-level SDK queries** and **two forwarded model requests** ran. A third attempted model request was blocked locally. The 12-query / 20-minute budget was not exhausted; work stopped on the safety gate, not on budget.

| Request | Wire output cap | Cache read | Cache write | Output | Provider stop |
| --- | ---: | ---: | ---: | ---: | --- |
| Synthetic seed, automatic TTL | 32 | 0 | 19,566 | 5 | `end_turn` |
| Non-persisting fork, explicit test-only 5m TTL | 1 | 19,566 | 47 | 1 | `max_tokens` |

- Automatic subscription TTL was **1h**, both in request breakpoints and in the response's `ephemeral_1h_input_tokens: 19566`.
- The fork read the seed's 19,566 cached tokens and wrote 47 new tokens with five-minute TTL. This demonstrates an immediate cache read, **not** renewal beyond original expiry. The seed already had a one-hour cache entry.
- Tool, system, and original-message prefix hashes matched between seed and refresh. Cache-control directives were excluded from content hashes; the billing-header hash was recorded separately and also matched in this run.
- No tool handler ran. The extra request's exact payload was not retained in the original live report; its one-token shape was established separately by the stub reproduction.
- The live refresh aborted before its post-query transcript assertion. Therefore exact live source-transcript immutability is **not established by this run**. The successful and failing stub paths separately check it; the probe now performs this check in `finally` as well.

No five-minute expiry comparisons ran in this initial phase. The later budget-guarded phase completed them. Active-tool warming, other models, adaptive thinking, API-key billing, and integrated Pi behavior remain untested.

The sanitized original live report was emitted as `cc-cache-warming-nXseIj/report.json` under the operating system's temporary directory. It contains usage, request-prefix hashes, and TTL metadata, not raw request bodies or credentials. This document preserves the measured result without depending on that temporary artifact's lifetime.

## Budget-guarded follow-up — two expiry comparisons pass

On the user's continuation, the remaining **10 live SDK queries** tested two independent control/refreshed pairs. Together with the initial two queries, this consumed the agreed **12-query total**, not a new 12-query allocation. The follow-up took roughly six minutes under the probe's 20-minute watchdog. No further live calls ran.

| Pair | Refresh after seed | Follow-up after seed | Refreshed cache read | Control cache read | Control cache write |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 241.432 s | 366.159 s | 19,571 | 0 | 19,613 |
| 2 | 241.591 s | 365.879 s | 19,568 | 0 | 19,610 |

All cache writes in this phase were provider-reported five-minute writes, not merely inferred from omitted request TTL fields. Each refresh read its entire cached seed prefix, wrote 75 new tail tokens, and emitted one token. Each later normal request read that same seed prefix after the original five-minute expiry. The control prefixes were distinct and were not refreshed.

The measured SDK-only path:

- Preserve the source prompt/tool prefix and use `resume`, `forkSession: true`, and `persistSession: false`.
- Keep source and refresh thinking settings identical; this fixture uses disabled thinking.
- Set the refresh output cap through `CLAUDE_CODE_MAX_OUTPUT_TOKENS=1`, with `maxTurns: 1`, retries disabled, and **`maxBudgetUsd: 0.000001`**.
- Enable `includePartialMessages` and collect per-request usage from `message_start` / `message_delta`, not the resumed session's cumulative cost or usage.
- Treat **only this deliberately budget-guarded refresh's** terminal `error_max_budget_usd` result as the expected completion condition after validating the response. Stop consuming at that result and close the query. Draining further produced an SDK `Error` in the local fixture; do not suppress arbitrary SDK errors or treat budget errors on ordinary user turns as successes.

The budget value is a **post-response stop trigger, not a hard monetary ceiling**: the request has already run when the SDK checks it. It triggered after the first response for this fixed model and resumed fixture. Different model pricing, zero-cost overrides, or SDK accounting changes need fresh validation; this is not a universal single-request API guarantee. The diagnostic retains its reject-before-forward extra-request guard.

For both refreshes the terminal result was `error_max_budget_usd`, source JSONL bytes stayed identical, no new transcript appeared, tool attempts were zero, and no extra request was attempted. SDK stream usage exactly matched proxy-observed provider usage for all ten requests. Cancellation remains separately verified against the stub, not a deliberately interrupted live response.

The sanitized follow-up report was emitted as `cc-cache-warming-7yS9I3/report.json` under the operating system's temporary directory. No raw bodies or credentials were retained in that report.

## Local contracts

The default stub preflight proves for this installed SDK:

- The documented `CLAUDE_CODE_MAX_OUTPUT_TOKENS` variable reaches the request as `max_tokens: 1` when thinking is disabled.
- `resume` plus `forkSession: true` and `persistSession: false` preserves the source transcript and does not persist a fork transcript.
- Tool definitions and source prompt prefixes remain stable in the fixture.
- Aborting the SDK controller stops an in-flight stub request without source mutation. This SDK throws a generic `Error` mentioning abort, not an error named `AbortError`.

The `--stub-max-tokens` mode changes only the fake API's stop reason to reproduce the live blocker. It observes another request for the same model and synthetic prefix, still capped at one token, rejects it, then checks source immutability and absence of a new transcript. No subscription/API usage occurs in these stub modes.

```sh
node diag/probe-cache-warming.mjs
node diag/probe-cache-warming.mjs --stub-max-tokens
node diag/probe-cache-warming.mjs --stub-budget
node --test --test-name-pattern='cache-warming SDK replay' tests/int-cc-contracts.mjs
node --test tests/unit-cache-warming-probe.mjs
```

The second command intentionally exits nonzero while unguarded SDK recovery persists. The budget mode passes and verifies terminal completion, exact per-request usage, isolation, and cancellation. Both behaviors are pinned so an SDK change requires review.

`node diag/probe-cache-warming.mjs --live` runs the original candidate, including automatic-TTL inspection, with a 12-query ceiling. `--live-budget` skips that already-measured inspection and runs ten queries for the guarded expiry comparisons. Both consume subscription quota and require explicit authorization; the completed experiment is not standing permission to rerun them. Both enforce request validation, a 20-minute deadline, per-query cancellation, and refusal of ambient auth/routing/cache overrides. Synthetic Claude transcript directories created by the probe are moved to Trash; sanitized reports remain in its temporary workspace.

## Historical next decision — superseded by the implemented contract

The following describes the end of the SDK-only phase, not current implementation status; the invocation convention and ownership decisions are now recorded in [CONTEXT.md](../CONTEXT.md).

The isolated SDK-only mechanism now has positive evidence. Native integration still needs explicit decisions about identifying warming requests, matching Pi's captured request to the correct Claude prefix, subscription economics, and model/lifecycle eligibility. No production code or model metadata was changed. Do not silently add HTTP rewriting/replay, increase the output allowance, or infer a warming invocation from `maxTokens: 1`.

The actual one-hour subscription TTL also matters: Pi 0.87.1 schedules at 90% of TTL, while its idle horizon is only 30 minutes. Its normal first refresh for this cache lifetime would fall outside that idle window. Production TTL defaults were not changed.

## Sources

- `probe-cache-warming.mjs` — reproducible SDK fixture, safety gates, and sanitized report generation.
- `../tests/int-cc-contracts.mjs` — replay, cancellation, and truncation-recovery contracts.
- `../tests/unit-cache-warming-probe.mjs` — refusal before any SDK query when ambient overrides are present.
- Installed `@anthropic-ai/claude-agent-sdk/sdk.d.ts` — `forkSession`, `persistSession`, `abortController`, `maxTurns`, `maxBudgetUsd`, `includePartialMessages`, and `promptCacheTtl`.
- [Claude Code environment variables](https://code.claude.com/docs/en/env-vars) — `CLAUDE_CODE_MAX_OUTPUT_TOKENS` and `CLAUDE_CODE_MAX_RETRIES`.
