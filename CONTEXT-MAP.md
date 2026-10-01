---
summary: "Code, evidence, and ownership boundaries for Claude bridge cache integration."
read_when:
  - "Locating implementation or validation boundaries for cache-policy and warming changes"
---

# CONTEXT-MAP

## Read first

- `CONTEXT.md` — read before changing cache policy or warming; distinguishes implemented retention, exact Haiku and conservative 5.5 Team lanes, historical SDK-only feasibility, and sealed live allocations.
- `AGENTS.md` — read before making Claude Code behavior claims, adding live probes, or changing the bridge.
- `README.md` — read for current provider behavior, configuration, and integration-test requirements.

## Integration boundaries

- `src/models.ts` — read before changing model prices, catalog-driven model selection, or cache-lifetime metadata. Metadata is not proof of refresh qualification; ordinary chat and warming eligibility are separate contracts.
- `src/cache-policy.ts` — read before changing Pi retention resolution, the exact child-env/settings.env cache controls, or explicit provider thinking-off. Retention is resolved at each new SDK query, not mid-tool-loop; summary thinking and AskClaude are unchanged.
- `src/cache-warming.ts` — read before changing reserved-pair classification, immutable snapshot matching, native consent, runtime/account/model qualification, cancellation, failure suppression, isolated SDK forks or per-request usage. Post-account settings revalidation precedes input release; production admits exact Haiku and conservative 5.5 Team lanes. 5.5 requires two consecutive captured successful source SDK queries, short retention, verbatim parity and narrow Opus `[1m]` accounting; lifecycle/history rebuild and uncaptured/ineligible work reset credit.
- `src/index.ts` — read before changing provider dispatch, query construction, session synchronization, tool delivery, completion publication or lifecycle invalidation. Warming intercepts before ordinary side effects; ordinary `none`, isolated Pi summaries and standalone AskClaude are distinct paths.
- `src/query-state.ts` — read before changing per-query ownership or tool continuations; carries the final captured Pi request through result callbacks for successful completion snapshot publication.
- `src/prompt-capture.ts` — read before using prompt provenance to distinguish ordinary requests from isolated summaries or to bind a warming snapshot. Do not bypass prompt-accountability checks merely because caching is disabled.
- `node_modules/@earendil-works/pi-coding-agent/dist/core/cache-warmer.js` and `dist/core/model-runtime.js` in the same package — inspect the installed Pi version before relying on warming invocation, scheduling, or economic decisions. Dependency artifacts are evidence, not files to patch as the bridge implementation.
- `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` — inspect documented session, output-limit, cancellation, and TTL capabilities before assuming Claude behavior or introducing workarounds.

## Verification evidence

- `diag/CACHE-WARMING.md` — read when interpreting historical SDK-only Haiku feasibility: truncation recovery, post-response budget guard, two expiry controls, observed subscription TTL, and the exhausted separate 12-query allocation. It does not establish native or all-model support.
- `diag/BRIDGE-WARMING-INTEGRATION.md` — read before relying on native safety coverage; actual SDK/installed Pi integration with loopback responses, explicit subscription simulation; existing Haiku fixtures use test-local qualification, while new 5.5 fixtures exercise the actual three-row production set. Includes lifecycle/race evidence and labeled historical phases.
- `tests/unit-cache-policy.mjs`, `tests/unit-cache-warming.mjs`, `tests/unit-five-native-warming.mjs`, `tests/int-cache-warming-offline.mjs` — read when changing policy, coordinator or public-SDK isolation contracts.
- `tests/int-bridge-warming.mjs`, `tests/int-bridge-five-warming.mjs`, `tests/int-cache-policy-sdk.mjs`, `tests/int-bridge-warming-lifecycle.mjs`, `tests/lib/bridge-sdk-harness.mjs` — read before changing actual provider-to-native integration, retention wire assertions or lifecycle scenarios; simulated cache usage is not expiry proof.
- `diag/NATIVE-CACHE-QUALIFICATION.md` — read before interpreting qualification or proposing further live investigation; records exact native lane restrictions, four completed standalone SDK 5.5 expiry comparisons, separately approved native enablement and remaining first-turn/full-user-setup limitations, plus sealed historical failures.
- `diag/qualify-native-cache-warming.mjs` and `diag/lib/native-cache-qualification-{budget,transport,worker}.mjs` — read before changing qualification instrumentation. Boundaries are entry/approval guards, durable allocation, request observation, and actual provider/native worker execution; no automatic promotion or restart. `tests/unit-native-cache-qualification.mjs` and `tests/int-native-cache-qualification-offline.mjs` cover these boundaries offline.
- `diag/probe-five-tool-source.mjs` and `diag/lib/five-tool-source-{owner,worker,transport}.mjs` — read before the separately approved tool-source comparison: eight SDK starts, ten model HTTP attempts, ten minutes, zero retries, inert source tool only, no automatic qualification. `tests/unit-five-tool-source.mjs`, `tests/int-five-tool-source-offline.mjs` and `tests/int-five-tool-source-runner-offline.mjs` cover forwarding guards, actual SDK construction and prepared-runner accounting; their usage is synthetic.
- `diag/probe-five-expiry.mjs` and `diag/lib/five-expiry-{owner,worker,transport}.mjs` — read before the separately approved 28-start/36-model-request/20-minute, zero-retry expiry comparison. Eight distinct arms share a verified public-account snapshot; parent-monotonic ages enforce refresh and post-expiry timing. `tests/unit-five-expiry.mjs` and `tests/int-five-expiry-offline.mjs` cover allocation, timing, validated-stage retention, contaminated controls and account changes; offline timing/usage is simulated, not qualification.
- `diag/probe-five-timing-offline.mjs` and `tests/int-five-timing-offline.mjs` — read before attributing expiry-v1's refusal to the SDK or planning a new expiry run. Four isolated loopback SDK cases measure stalled-response cancellation; a no-SDK process-pause case records monotonic/wall age and phase order. No live/reset/resume entry point. The documented historical host maintenance sleep invalidated timing; its exact rejected monotonic age was not retained.
- `diag/probe-five-expiry-v2.mjs` and `diag/lib/five-expiry-v2-{owner,worker,transport,awake}.mjs` — fresh user-approved 28-SDK/36-model-HTTP/20-minute zero-retry expiry allocation, not a restart of v1. Enforces owned awake assertions on AC, heartbeat/skew and dual source ages, observed request accounting and safe phase/refusal evidence. `tests/unit-five-expiry-v2.mjs` and `tests/int-five-expiry-v2-offline.mjs` include zero-SDK awake loss and source-only parent-pause refusal. Independent safety review passed; the sealed v2 ledger completed all four SDK expiry comparisons (28 starts/36 observed+forwarded/zero blocked). No automatic native production promotion.
- `diag/PI-086-COMPAT.md`, `tests/int-pi-086-compat.mjs`, `tests/lib/pi-086-import-probe.mjs` — read before claiming ordinary-provider support at the peer floor. Actual Pi 0.86.1, fake SDK, scripts-disabled isolated install; not live warming or Node 20 proof.
- `diag/probe-cache-warming.mjs` — isolated diagnostic, not a provider implementation. Default, `--stub-max-tokens`, and `--stub-budget` modes use a local stub; `--live` and `--live-budget` consume quota and require explicit authorization.
- `tests/unit-cache-warming-probe.mjs` — offline refusal guards for live-probe auth/routing/cache overrides.
- `tests/int-cc-contracts.mjs` — read when adding a reproducible contract for installed SDK/Claude Code behavior.
- `tests/int-cache.sh` — existing ordinary-turn cache and session-reuse coverage; does not establish idle-refresh safety or effectiveness.
- `diag/capture-proxy.mjs` and `diag/diff-captures.mjs` — read when comparing actual provider request prefixes. Capture output is sensitive; use synthetic inputs and sanitized retained evidence.

## Architecture decisions

No ADR qualifies for this plan: retention authority, heuristic dispatch, and qualification gates have real tradeoffs but introduce no hard-to-reverse architecture or persisted format. Their product contracts are recorded in `CONTEXT.md`; reassess if implementation exposes such a boundary.

## Maintenance rules

- Keep observed SDK behavior separate from documented capabilities and untested hypotheses.
- Recheck dependency contracts when versions change.
- Update unresolved questions with the evidence that resolves them; distinguish implementation, offline simulation and live qualification. Neither historical SDK feasibility nor passing native fixtures enables production warming.
- Keep maintenance intent, cache retention, and summary identity distinct. The reserved warming signature is an acknowledged convention, not a new Pi API guarantee.
