# Current status

Production now admits exact Haiku 4.5, bare Sonnet 5.5 and requested Opus 5.5 `[1m]` / Claude Team / SDK 0.3.285 / CLI 2.1.285 / firstParty/list lanes. 5.5 requires two consecutive captured successful ordinary SDK queries, short retention, thinking off and actual source/refresh `verbatimPrompts` parity; first-turn/one-hour and adjacent lanes remain gated. Lifecycle/history rebuild and uncaptured/ineligible source work reset query credit. User explicitly approved native enablement after four controlled SDK expiry comparisons; no automatic promotion occurred. See [latest qualification evidence](NATIVE-CACHE-QUALIFICATION.md). This document preserves historical offline integration phases; their empty-production and failed-allocation statements are not today's status.

Current-session regression validation: **443 units**, typecheck, **four 5.5 + three Haiku actual-native scenarios**, and **22 lifecycle/settings/retention checks** passed. New `tests/int-bridge-five-warming.mjs` goes through the registered provider, real SDK/CLI and installed Pi CacheWarmer without test-local qualification additions: first source blocks before refresh SDK/HTTP, second same-lane query warms, one entire Pi tool cycle counts once, source bytes/file inventory stay unchanged, refresh executes zero tools, and native usage receives the per-request full-prefix read. SDK ModelUsage rows are untouched; public accountInfo/init metadata and loopback cache usage are explicitly synthetic, not new auth/expiry proof. Independent native safety review passed, including the final interrupted-source credit guard and all eight unit regressions; no concrete findings. No full user-extension setup or live-native expiry run was performed. No percentage-coverage script is configured; coverage is the changed admission/accounting truth table and native/lifecycle scenarios.

# Historical closeout — offline safety passed; production warming disabled

Before repair attempt9, main independently accepted the then-current **338 unit / 83 focused / 18 native-retention / 25 runner** checks, typecheck, diff and LSP checks. Main independently inspected the bounded account-metadata repair below and reran **353 unit / 98 focused / 18 native-retention / 25 runner** checks, typecheck and diff checks; LSP diagnostics are clean. Native lifecycle coverage includes **15 scenarios** and post-account settings revalidation. The load-sensitive **24/25** worker runner check and unchanged isolated **25/25** reruns remain disclosed below. These are loopback tests with actual SDK/CLI, fake API-key auth, explicit subscription-metadata simulation and test-local qualification—not live subscription, expiry or quota evidence.

The separate live allocation subsequently closed after **1 reserved / 1 SDK start / 0 model HTTP attempts / 0 forwarded requests**: the first `claude-fable-5` seed failed the public account gate. All **12 models remain unverified** (other 11 unattempted), no source/refresh/expiry comparison completed, and **production qualifications remain empty**. No model warms, even with Pi opt-in. See [NATIVE-CACHE-QUALIFICATION.md](NATIVE-CACHE-QUALIFICATION.md) for the sealed allocation and unresolved isolated-auth boundary. Further live work is stopped.

Everything below is preserved phase-specific history. In particular, “0/40,” “no real approval/ledger,” and pending-review statements describe the offline phases, not current live status. The historical SDK-only **12-query** allocation is separate and exhausted.

---

# Authorized task9 REPAIRATTEMPT9 — stored-subscription metadata, offline GREEN

Seventh additional human-approved repair; one bounded production mutation, confined to `accountEvidence()`. No further production defect was encountered or repaired. Existing dirty work was preserved. **No real auth/model calls; production qualifications remain empty and native warming remains disabled.**

## Static contract and narrow correction

Read the installed SDK **0.3.280** public `sdk.d.ts:23–32`: `subscriptionType`, `tokenSource` and `apiKeySource` are optional; `apiProvider` identifies the backend. Read-only byte excerpts of the installed Darwin-arm64 CLI **2.1.280** embedded JS (not CLI execution for inspection) agree:

- Byte **173041917**, `Gde` / following `ERt`: OAuth environment/token-FD sources populate `tokenSource`; otherwise the stored-subscription branch populates `subscription = JLn()`. `apiKeySource` is populated only when an actual API key is truthy. `ERt` maps these optional fields to public `AccountInfo` and adds `apiProvider`. Undefined object fields are omitted on serialization.
- Byte **173038591**, `JLn`: enterprise/team/max/pro map to **Claude Enterprise / Claude Team / Claude Max / Claude Pro**; default is **Claude API**. These are display labels, not lowercase tier names.

The old gate required both a truthy token source and account `apiKeySource: "none"`; the old `max/oauth/none` simulation hid that contract defect. The new gate recognizes only those four exact display labels, `apiProvider: "firstParty"`, and both optional source values strictly `undefined`. Missing fields alone are not authentication evidence. Unknown/empty/lowercase/API/free/missing plans, foreign/missing backends, token overrides and API-key sources (including literal `none`, empty strings and runtime nulls), and contradictory combined metadata remain rejected. No normalization or old-fixture fallback was added.

Raw account fingerprint/lane construction is unchanged. Tests separate two eligible Max/Pro lanes and same-plan account identities; the delayed changed-account case now switches to valid **Claude Pro**, so rejection still exercises fingerprint mismatch, not an invalid plan. Independent **init** `apiKeySource: "none"` remains required; simulator init overrides and actual fake-key rejection are untouched. Runtime/init/backend/pricing/usage/exact qualification, source/environment preflight, snapshots/settings identity, cancellation and failed-snapshot suppression are unchanged.

Only the three scoped fixture account literals plus the unit positive fixture changed to `{ subscriptionType: "Claude Max", apiProvider: "firstParty" }`, explicitly labeled **OFFLINE source-derived static contract simulation, not runtime qualification**. No real stored-subscription account was observed. Actual loopback SDK raw accounts remain ineligible.

## TDD and sequential validation

Commands below were run sequentially, without concurrent suite load (log redirection omitted):

- **RED:** `node --import tsx --import ./tests/lib/setup.mjs --test --test-name-pattern='stored-subscription account metadata contract' tests/unit-cache-warming.mjs` — **5/15 passed, 10 failed** against the original gate. All eight valid-label/omitted-or-undefined positives failed, as did eligible-lane fingerprint coverage; the legacy simulated shape was incorrectly admitted. No setup/syntax failure.
- **Matched GREEN:** the exact same command — **15/15** after the single minimal gate change and positive fixture correction. Tests were not weakened between RED and GREEN.
- `node --import tsx --import ./tests/lib/setup.mjs --test tests/unit-cache-policy.mjs tests/unit-cache-warming.mjs tests/int-cache-warming-offline.mjs` — **98/98**.
- `node --experimental-test-module-mocks --import tsx --import ./tests/lib/setup.mjs --test tests/int-bridge-warming-lifecycle.mjs tests/int-bridge-warming.mjs tests/int-cache-policy-sdk.mjs` — **18/18**, including all **15 lifecycle scenarios**. Account-release succeeds offline; account-cancel/new-work/settings still withhold input or cancel as required. Actual fake-key lane stays rejected; settings race sends only the source request, no refresh request or usage. Existing retention/source/no-fork/tool/accounting assertions pass.
- `node --test tests/unit-native-cache-qualification.mjs tests/int-native-cache-qualification-offline.mjs` — **25/25**, first run in this repair; no runner timeout or guard changes.
- `npm run test:unit` — **353/353**; `npm run typecheck` and `git diff --check` — passed. Counts overlap, not a combined total.
- `node --check` on `tests/unit-cache-warming.mjs`, `tests/int-cache-warming-offline.mjs`, `tests/lib/bridge-sdk-harness.mjs` and `diag/lib/native-cache-qualification-transport.mjs` — passed. Reviewed diffs against pre-repair copies; scoped whitespace checks include untracked owned files. No changes outside the eight owned source/test/evidence files; `CONTEXT.md` needed no edit.

Coverage is the literal account truth table and existing safety/regression suite, not a percentage claim; no percentage-coverage script is configured. No worker LSP tool or `lspdiagnostics` executable is available; compiler diagnostics are clean. No full `npm test`, live scripts, auth CLI commands, user config/credential reads or edits, dependency/download/lock/.pi changes, commits or publication. Installed loopback SDK execution is offline fixture validation only. Pi 0.86.1 evidence is inherited, not rerun/downloaded.

## Sealed evidence and limits

This static fixture/gate defect is **not an explanation of the observed live failure**: that lane already had **no subscription label** (`["firstParty",null,"none",null]`) and remains rejected after the fix. Documented `CLAUDE_CONFIG_DIR` credential-store isolation is a likely separate explanation for isolated-auth unavailability, **unproven at runtime here**; no storage/auth workaround was investigated or applied.

The allocation remains **sealed failed: 1 SDK start / 0 model HTTP attempts / 0 forwarded**, with 39 unused starts granting no permission for calls. The retained hash **`5c8be6b6243af92d21e488e1aae60286c28deb2fd371c05ab9ee765a18357690` is HISTORICAL failed-run approved code, no longer current** after this source change. Approval marker, ledgers and failed evidence remain untouched; no regeneration, reset, rerun or retrofitted qualification is authorized. This repair proves only offline metadata recognition/control-flow safety, not real authentication, expiry, model/runtime support or quota savings. Main independently accepted the current code and offline tests, confirmed the historical marker and sealed counters remain unchanged, and verified that production qualifications remain empty.

Everything below is preserved phase-specific history.

---

# Authorized task9 repair attempt8 — post-account settings gate, offline GREEN

Only `src/cache-warming.ts` changed in production. After verified public `accountInfo()` and before `prompt.push`, refresh now resolves settings again using the source cwd/settingSources, combines the unchanged source flags through `warmingRuntime`, and requires both safe preflight and exact source-settings identity. The original pre-start check remains. Resolution rejection fails closed; the new await races the existing cancellation promise. Cancellation, controls and source bytes are checked again before input release. Neither source settings nor qualification is replaced or normalized to admit a change.

## TDD and actual native evidence

- First added `account-settings` on the existing actual provider → completed snapshot → installed Pi `CacheWarmer` path. The initial run hit a **fixture error**, not RED: the disposable settings file did not yet exist. Fixed restoration to preserve absence as well as existing bytes.
- **Meaningful RED:** `BRIDGE_LIFECYCLE_SCENARIO=account-settings node --experimental-test-module-mocks --import tsx --import ./tests/lib/setup.mjs --test tests/int-bridge-warming-lifecycle.mjs` failed **0/1**, before production edits: `changed settings must not release model input`, actual **1**, expected **0**. While account metadata was parked, the actual public settings resolver already saw the injected unsafe `UserPromptSubmit` setting and preflight refused it. This proves stale-settings admission, **not hook execution**. The loopback request ceiling permits this one offending request so the assertion, not transport refusal, detects the bug.
- Added unit regressions before production edits. `node --import tsx --import ./tests/lib/setup.mjs --test tests/unit-cache-warming.mjs` was **63/70**: changed/unsafe/failed settings released input; second-resolution cancellation/control/source cases lacked the second lookup; unchanged positive lacked revalidation.
- **Matched GREEN:** both exact commands above passed after the narrow production change: native **1/1**, units **70/70**. The native case starts **2 SDK queries**, but sends only **1 source model request**, **0 refresh HTTP requests**, **0 native usage entries**, **0 Pi tools**, and no hook marker. Complete transcript file map, frozen source snapshot and Pi context remain unchanged; no fork persists. Restoring disposable settings does not bypass failed-snapshot suppression, and an unconsented reserved dispatch also refuses.
- Unit coverage includes safe-but-different settings (preflight still true), unsafe hooks, resolver rejection with sanitized errors, cancellation that settles while the second resolver remains pending, control/source changes during that await, cleanup of query/input pump/abort listeners, no late prompt revival after delayed resolution, no failure usage, unchanged source settings, and exactly one prompt on unchanged-settings success. Resolver inputs retain the source cwd/settingSources.

## Validation commands actually run

- `node --import tsx --import ./tests/lib/setup.mjs --test tests/unit-cache-policy.mjs tests/unit-cache-warming.mjs tests/int-cache-warming-offline.mjs` — **83/83**.
- `node --experimental-test-module-mocks --import tsx --import ./tests/lib/setup.mjs --test tests/int-bridge-warming-lifecycle.mjs tests/int-bridge-warming.mjs tests/int-cache-policy-sdk.mjs` — **18/18**. Lifecycle is now **15 scenarios / 25 SDK queries / 24 loopback model requests / 3 native usage entries**; existing positive native and retention-wire assertions remain passing.
- `node --test tests/unit-native-cache-qualification.mjs tests/int-native-cache-qualification-offline.mjs` — initially **24/25** during concurrent validation: `deadline-active` subprocess reached its 15-second watchdog and the test could not parse empty stderr. An explicit unchanged-command rerun in isolation passed **25/25**. No runner repair or timeout relaxation; this is disclosed validation load sensitivity, not a production RED/GREEN claim.
- `npm run test:unit` — **338/338**. After strengthening the settings identity/preflight/no-usage assertions, repeated the focused **83/83**, full units **338/338**, typecheck and diff checks successfully.
- `npm run typecheck`, `git diff --check`, `node --check tests/unit-cache-warming.mjs`, `node --check tests/int-bridge-warming-lifecycle.mjs`, and scoped whitespace checks including untracked files — passed. No LSP tool or `lspdiagnostics` executable is available in this worker; TypeScript compiler diagnostics are the available substitute. No percentage-coverage runner is configured.

SDK **0.3.280**, CLI **2.1.280**, installed Pi **0.87.1**; subscription metadata remains explicitly **offline simulation** and qualification keys are test-local/source-derived only. Pi 0.86.1 compatibility evidence is inherited, not rerun or downloaded for this gate. Live allocation remains **0/40**, historical **12 exhausted**, and production qualification remains empty. No live/auth queries, valid live invocation, real approval/ledger, credential/config edits, dependencies/lock/.pi edits, commits, or additional production repairs. Only disposable fixture settings were written. Main-session independent review remains required; this is not hook-execution, live-cache, expiry or billing proof.

Everything below is preserved historical evidence; older “current” statements describe earlier phases.

---

# Task15 native lifecycle negatives — offline GREEN

The remaining tests-only native lifecycle gates pass: **14/14 isolated scenarios**, using the registered bridge provider, actual SDK **0.3.280** / CLI **2.1.280**, and installed Pi **0.87.1** `CacheWarmer` decision/event/reserved-dispatch path. One complete matrix run uses **23 SDK queries / 23 loopback model requests**, with **3 native usage entries**. **Zero live calls; production qualifications remain empty.** No production edit, safety relaxation, dependency change, or test seam was needed. Main independent verification remains required before any live phase.

## Actual native scenario results

| Scenario | SDK queries | Model requests | Native usage entries | Proven boundary |
| --- | ---: | ---: | ---: | --- |
| admission-tool-cycle | 1 | 2 | 0 | Active-tool native decision stops; reserved input containing the actual pending tool result cannot deliver it. Real ordinary continuation completes. No-consent and thinking-on decision/dispatch refuse afterwards. |
| thinking-source | 1 | 1 | 0 | Actual reasoning-enabled ordinary source publishes no warming snapshot; native decision and reserved dispatch refuse. |
| api-key | 1 | 1 | 0 | Actual fake-API-key account/init metadata, without subscription substitution, stays ineligible even with a source-derived test qualification key. |
| environment-decision | 1 | 1 | 0 | Synthetic process retention change before native decision stops warming. |
| settings-decision | 1 | 1 | 0 | Synthetic settings change before native decision stops warming. |
| environment-dispatch | 1 | 1 | 0 | Native consent followed by process change refuses before refresh SDK startup. |
| settings-dispatch | 1 | 1 | 0 | Native consent followed by settings change refuses before refresh SDK startup. |
| hook-dispatch | 1 | 1 | 0 | Side-effecting hook setting introduced after source/consent refuses before refresh SDK startup; marker command never runs. |
| lifecycle-dispatch | 1 | 1 | 0 | Registered `model_select` event invalidates consent before reserved dispatch. |
| account-release | 2 | 2 | 1 | Refresh is parked after real public account lookup, before simulated eligible metadata release: zero refresh requests while parked, then normal per-request native accounting. |
| account-cancel | 2 | 1 | 0 | Actual native cancel aborts/settles parked refresh before metadata release. Late release cannot send model input or usage; another native attempt stops. |
| account-new-work | 4 | 3 | 1 | New real ordinary work cancels parked refresh. After new source completes, late old metadata cannot alter its snapshot/bytes, publish old usage, or suppress its successful native refresh. |
| refresh-tool-use | 2 | 3 | 0 | Actual refresh SSE tool-use reaches SDK/public refresh consumption and is rejected/aborted. Zero maintenance Pi tools, no source mutation/fork; subsequent native attempts stop. |
| prefix-miss-recovery | 4 | 4 | 1 | Actual refresh cache-prefix miss fails, preserves source/no fork, and suppresses rescheduled/restarted native attempts. New real ordinary work restores successful warming using the existing exact qualification key. |

All completed-source comparisons check actual frozen request context/options/owner and persisted bytes. Maintenance preserves the complete transcript file map, not only a single file. The two new-work scenarios explicitly allow ordinary transcript writes and freeze the **new** completed source before checking late completion or further maintenance. Refresh queries retain one-token output, at most one model attempt, non-persistence, disabled thinking, no built-in tools and empty hooks. Real source tool cycles execute two synthetic Pi tools across the matrix; refreshes execute **zero**. The same result-consuming sentinel executor is wired to ordinary and reserved paths, and real SDK tool-event observation proves the refresh attempt reached the public consumer. This is native/public pipeline consequence, **not** a claim that the rejecting MCP handler executed in this integration; its direct handler proof remains the existing unit test.

## Fixture boundaries and changes

- Added `tests/int-bridge-warming-lifecycle.mjs`; existing positive/retention test files are unchanged. Each child runs real assertions, reports counts, strips inherited `NODE_TEST_CONTEXT`, has parent/child watchdogs, and cleans up in `finally`.
- Narrow harness additions: actual-account lane, first-refresh account deferred gate, first-refresh tool-use/prefix-miss responses, per-query observations, and explicit total model-query budgets. Query-specific loopback URL paths replace the old mutable global active record so cancelled and new queries cannot be misattributed. Unexpected traffic/extra SDK calls remain failures; nothing forwards requests.
- SDK fixture mocking still precedes warming/index imports. Account parking happens **after** real `accountInfo()` returns; eligible metadata released afterwards is **offline subscription simulation**, not real subscription qualification. The actual fake-key account is independently rejected. Only exact measured-source keys enter a test-local set; new ordinary sources reuse those keys without another promotion.
- Real ordinary completions publish every snapshot. No manual coordinator `complete()`, fabricated source, replaced scheduler, or production seam. Installed native timer callbacks are invoked without waiting for TTL expiry; the full Pi UI/agent application is not launched.
- Hook/config writes affect only disposable synthetic fixture settings. No managed settings or real user configs/credentials were edited. Managed refusal remains unit evidence, not newly claimed integration coverage.

## Commands and sequence

This is tests-only current-state verification, not a production RED/GREEN repair. The initial lifecycle run passed **8/9**; the sole failure was a fixture assumption that JSONL must already exist during the first active tool phase. The SDK had not persisted it yet. Corrected the fixture to preserve whatever file set exists at that active phase while requiring persisted source bytes after real ordinary completion. This was **not TDD RED**. The targeted admission rerun passed, the expanded account matrix passed **12/12**, and both added actual-refresh failure scenarios passed individually.

Final validation commands (log redirection omitted):

- `node --experimental-test-module-mocks --import tsx --import ./tests/lib/setup.mjs --test tests/int-bridge-warming-lifecycle.mjs` — **14/14**; **23 queries / 23 loopback requests**, all scenario counts above asserted.
- `node --experimental-test-module-mocks --import tsx --import ./tests/lib/setup.mjs --test tests/int-bridge-warming.mjs tests/int-cache-policy-sdk.mjs` — **3/3**: unchanged native **2/2** (ordinary 2/2 queries/requests; tool-cycle 2/3), unchanged retention **1/1** (10/11). Exact source system/tools/prefix preservation, retention wire and all three summaries remain passing.
- `node --import tsx --import ./tests/lib/setup.mjs --test tests/unit-cache-policy.mjs tests/unit-cache-warming.mjs tests/int-cache-warming-offline.mjs` — **77/77**, including the separate actual-SDK prerequisite **3/3**. Unit proofs are not relabeled native integration.
- `node --import tsx --import ./tests/lib/setup.mjs --test tests/unit-*.mjs` — **324/324**.
- `./node_modules/.bin/tsc --noEmit`, `node --check tests/int-bridge-warming-lifecycle.mjs`, `node --check tests/lib/bridge-sdk-harness.mjs`, `git diff --check`, and scoped trailing-whitespace checks — passed.

No percentage-coverage runner is configured; meaningful lifecycle/error/race coverage is enumerated above. No worker LSP tool is available. The already-passing isolated Pi 0.86.1 ordinary compatibility evidence is inherited, **not rerun or re-downloaded** here. No live runner was authored, no automatic retries or paid calls occurred, and no commits, dependency/lock artifacts, real user settings, task files, or production source were edited.

## Remaining gates

No pending required task15 negative scenario or proven production blocker remains in this worker result. Main independently verifies these changes. Live model/expiry qualification remains **0/40** in this integration phase; fake loopback cache usage does not establish real cache hits, expiry, subscription economics or billing. Final product documentation and any authorized live runner/matrix remain separate work. No model gains production eligibility from these tests.

Everything below is preserved historical evidence; older “current”/“pending” statements describe earlier phases.

---

# Authorized retention/settings-env repair — offline GREEN

The coordinated “Fix retention and resume” repair is complete (cache-policy repairAttempt2 / native-warming repairAttempt7). SDK **0.3.280**, CLI **2.1.280**, installed Pi **0.87.1**. No second production defect was encountered or repaired. **Zero live calls; production qualifications remain empty.** Independent main verification and the pending native lifecycle negatives remain required before live qualification.

## Changes and evidence

- One exact ten-key cache override map now supplies both SDK child `env` and flag `settings.env`, including uncached provider requests and summaries. Cached modes retain `promptCacheTtl`. Inherited environment/secrets are never copied into flag settings; process environment and synthetic settings files remain unchanged.
- Ordinary query settings preserve explicitly supplied unrelated settings.env entries, with owned cache keys winning. The narrow provider-query merger is unit tested; this does not add a configuration surface (`claudeCodeSettings()` currently projects auto-memory only). AskClaude and summary thinking are unchanged.
- Runtime preflight admits only exact generated **cached** flag env with its matching TTL. Raw resolver/source env remains rejected even when masked by flags, as do nonempty managed settings, unrelated provider env, missing/extra/modified keys (including undefined extra values), mismatched TTL and disabled-cache policy. Fingerprints, snapshot chronology and qualification checks are unchanged.
- Actual retention wire now passes all assertions: initial short has three five-minute breakpoints; the running tool query remains short across a Pi policy change; new queries honor long/none/scoped/process/default policies. Ordinary none retains tools/history. Bug, compaction and branch summaries are uncached, tool-free and isolated; source bytes and transcript files are unchanged. Conflicting local settings still disqualify warming.
- **Fixture correction, not production TDD:** moved the overbroad summary thinking assertion out of `retention()` and applied it only to ordinary requests (including the tool continuation). All summary cache/tools/isolation/history checks remain. No native integration or harness changes.
- Unchanged actual native integration still passes **2/2**: ordinary (2 queries / 2 loopback requests) and tool-cycle (2 queries / 3 loopback requests), each with one native usage entry, exact system/tools/message-prefix checks, final snapshot, unchanged source and no persisted fork. Subscription metadata remains test-local simulation, not live qualification.

## Commands actually run

- **RED first, unchanged:** `node --experimental-test-module-mocks --import tsx --import ./tests/lib/setup.mjs --test tests/int-cache-policy-sdk.mjs` — explicit short failed with **0** actual breakpoints, 1 query/request, no transport failure.
- Added focused regressions; `node --import tsx --import ./tests/lib/setup.mjs --test tests/unit-cache-policy.mjs tests/unit-cache-warming.mjs tests/int-cache-warming-offline.mjs` — initial RED run used generator-dependent admission fixtures; corrected those to independent expected flags before production edits. Meaningful RED: **73/77**, missing settings.env mirror, missing provider merge helper, and both exact generated short/long admission cases rejected.
- Same focused command after repair — **77/77**; rerun after strengthening extra-key/value negatives also **77/77**. This includes the real-SDK prerequisite **3/3**, two loopback requests, source preservation/no tools/no fork and per-request usage.
- Same retention RED command after repair plus the labeled fixture scope correction — **1/1**, all **10 SDK queries / 11 loopback model requests** asserted; no live requests.
- `node --experimental-test-module-mocks --import tsx --import ./tests/lib/setup.mjs --test tests/int-bridge-warming.mjs` — **2/2**, unchanged fixture/harness.
- `npm run test:unit` — **324/324**, repeated after final test changes.
- `npm run typecheck` and `git diff --check` — passed, repeated after final test changes. `node --check` on the three edited test files and a scoped trailing-whitespace check on all seven edited files also passed.

No percentage-coverage script is configured; changed behavior and rejection paths are covered above. No LSP tool is available in this worker; TypeScript diagnostics are clean. No compatibility download/retest, credential/user-config edits, dependency/lock edits, commits, README/changelog/context edits, or nested workflows. Pi 0.86.1 compatibility remains inherited evidence, not newly rerun here. Only the six scoped source/test files and this diagnostic were edited; there were no additional fixture return-shape updates.

## Remaining gates

Main independently verifies this repair. Task15's actual native lifecycle negatives (cancellation/new-work/config-change/stale consent, account-before-input, active-tool/thinking/no-consent refusal, tool/hook attempts, failure immutability/repeat suppression) remain pending and were not expanded here. Offline passing wire/control flow does not establish cache expiry or subscription accounting. Live matrix/expiry qualification remains **0/40** for this integration phase; no models were promoted.

Everything below is preserved historical evidence; its blocked/current statements describe earlier phases.

---

# Task15 resume — stopped at actual retention-wire failure

## Current result (offline only)

The unchanged positive was run first and passed. The expanded actual bridge/native suite now passes **2/2** on SDK **0.3.280**, bundled CLI **2.1.280**, Node **24.11.0**, installed Pi **0.87.1**:

- Ordinary source: two SDK queries / two loopback model requests / one native usage entry.
- Real MCP tool cycle: two SDK queries / three loopback model requests (two source requests, one refresh) / one native usage entry. The real provider emits the tool call; a synthetic Pi executor supplies its result through the final provider callback and the same SDK query completes normally. Only that completion publishes the snapshot; no direct `complete()` or fabricated source is used.
- Final raw input context/options equal the frozen snapshot, including the tool result. Native consent dispatches the reserved pair through the registered provider. Per-request usage is asserted against the synthetic refresh response, not cumulative SDK modelUsage.
- The **entire actual system array** matches exactly (no stripping). Tools and the entire final-source message prefix match after removing only cache-control annotations, as in the original test. Source bytes and transcript file list remain unchanged; no persisted fork; no additional Pi tool execution.
- Each scenario runs in its own subprocess. The parent requires a real test-pass count, and clears inherited Node test IPC state. The harness limits SDK queries and model attempts separately, permitting exactly two source model requests only for the tool cycle.
- Actual API-key metadata is still independently rejected. Subscription metadata and exact qualification keys remain test-local simulation. Production qualifications stay empty. This is not live cache/billing evidence.

## Blocking regression: local settings defeat child-only retention controls

`tests/int-cache-policy-sdk.mjs` exercises the registered normal provider against synthetic user/project `settings.json` plus process cache overrides. It fails at its first real wire assertion, **explicit short must contain five-minute cache breakpoints**:

```text
requestedRetention: short
SDK: 0.3.280; CLI: 2.1.280
original bridge child TTL: 5m
original bridge settings.promptCacheTtl: 5m
original bridge global/model disable flags: 0
actual wire cache_control count: 0
SDK queries: 1; loopback model requests: 1; unexpected transport: 0
normal result: toolUse (the real MCP/tool route was reached)
synthetic settings and parent cache environment: unchanged
AssertionError: cached wire must contain breakpoints
```

All TTL/force5m/enable1h/global/model-disable child option checks pass before the wire assertion. The harness adds only fake auth, loopback routing, retries/traffic controls **after** recording original bridge options; it does not rewrite cache controls or request bodies. The same harness produces cached, matching source/refresh prefixes in both positive scenarios without conflicting settings.

Read-only inspection of the **installed** `@anthropic-ai/claude-agent-sdk-darwin-arm64/claude` binary finds settings initialization applying `Object.assign(process.env, ...settingsEnv...)` and the cache-enable predicate rejecting truthy `process.env.DISABLE_PROMPT_CACHING` (plus model-specific switches). The installed SDK declarations document settings `env` and TTL environment precedence. This supports a settings-environment precedence defect, not a transport/fixture failure: provider controls currently set SDK `options.env`, but the supplied flag settings do not neutralize settings `env` overrides. No managed-policy override is assumed or proposed. No claim isolates which of the several conflicting disable switches alone is sufficient.

**Stopped without production repair or gate relaxation.** The exhausted repair allocation was not reset. Main-session authorization is required before any production change; no observation seam was needed. The meaningful failing test remains runnable, not skipped or inverted to pass.

## Independent main verification and settings-layer experiment

Main reran both ordinary/tool-cycle native scenarios: **2/2 passed**, including exact system equality, final tool-result snapshot, native usage, source bytes and no fork persistence. The unchanged retention test independently reproduced zero breakpoints for explicit short.

A separate **fixture-input experiment, not a production fix or GREEN**, mirrored only the ten named cache-control variables from SDK child options into public SDK `settings.env`. No files or production code were changed; fake auth/loopback isolation stayed intact. It produced three five-minute breakpoints for the initial short request and passed the running-tool-loop policy-boundary, explicit long, ordinary none/history/tools, scoped/process fallback and short-default assertions. Local settings and parent cache environment remained unchanged. This supports a settings-layer correction rather than changing user files or request bodies.

The experiment then reached an overbroad test assertion: `retention()` also demands thinking-off for isolated summaries. `CONTEXT.md` explicitly requires thinking-off for normal warming sources and refreshes; its summary requirement is uncached isolation. `runIsolatedSummary()` currently preserves its existing SDK thinking defaults. Summary thinking must not be changed incidentally to make this cache-policy test pass; scope the thinking assertion to normal source requests unless the user authorizes broader behavior. The experiment is not evidence that production retention passes; the original test remains RED. Later summary assertions remain unverified.

Any production correction must also preserve warming admission: blindly adding generated `settings.env` would trip the existing unsupported-runtime-control gate. Recognize only the exact bridge-generated cache policy in effective flag settings, while continuing to reject raw/source environment settings, unknown keys and managed controls. Never mirror the whole inherited environment (which can contain secrets) into CLI flag settings, and preserve unrelated explicitly supplied provider settings. No such production changes have been made. Live model usage remains **0/40**.

## Commands and sequence

- First unchanged positive: `node --experimental-test-module-mocks --import tsx --import ./tests/lib/setup.mjs --test tests/int-bridge-warming.mjs` — 1/1 passed.
- Added exact system comparison; same command — 1/1 passed.
- Expanded subprocess/tool scenario initially exposed two fixture defects: inherited `NODE_TEST_CONTEXT` caused empty child runs, and reused synthetic assistant message IDs merged distinct source responses on resume. Fixed test IPC isolation and unique message IDs. These were **not TDD RED** or production defects. Focused `BRIDGE_OFFLINE_SCENARIO=tool-cycle node --experimental-test-module-mocks --import tsx --import ./tests/lib/setup.mjs --test tests/int-bridge-warming.mjs` then passed.
- Final positive regression command above — **2/2 passed**, counts shown above.
- `node --experimental-test-module-mocks --import tsx --import ./tests/lib/setup.mjs --test tests/int-cache-policy-sdk.mjs` — failed twice at zero breakpoints for explicit short. Second run added observation/assertions only to distinguish neutralized options and successful fixture transport from actual wire failure. This is meaningful existing-production failing evidence; **no GREEN attempted**.
- `node --import tsx --import ./tests/lib/setup.mjs --test tests/unit-*.mjs` — **315/315 passed** (full output `/tmp/bridge-task15-units.log`).
- `./node_modules/.bin/tsc --noEmit` — passed.
- `node --check tests/int-bridge-warming.mjs`, `node --check tests/int-cache-policy-sdk.mjs`, `node --check tests/lib/bridge-sdk-harness.mjs` — passed.
- `git diff --check` and owned-file trailing-whitespace inspection — passed.

No coverage-percentage runner is configured in package scripts; meaningful added coverage is the real tool-continuation snapshot/prefix/native accounting path and the failing actual retention-wire conflict. No worker LSP tool was available. Existing standalone SDK prerequisite and isolated Pi 0.86.1 compatibility reports are inherited prerequisites, not newly rerun evidence; no install was repeated.

## Explicit remaining acceptance gaps

- The retention test's subsequent long/none, scoped/process fallback/default, next-new-query versus running tool-loop boundary, and bug/compaction/branch-summary wire assertions are written but **unreached and unverified** because its first short assertion fails. They must not be counted as passing coverage. The normal-none history/tool assertions, summary isolation and conflicting-policy rejection likewise remain unverified here. Thinking-off original source options pass; summary wire thinking checks remain unreached.
- Native cancellation/new-work/config-change/stale-consent coverage, account-verification-before-input, active-tool/thinking/no-consent refusal, actual refresh tool-attempt rejection, side-effecting hook refusal, failure immutability and repeat suppression still need actual bridge/native scenarios. The tool-cycle test establishes no snapshot during its active tool phase, not full negative lifecycle coverage. Prior unit/standalone SDK proofs are not relabeled full integration.
- The harness now accepts narrow synthetic settings/environment and tool-cycle parameters. Unused exploratory lifecycle controls were removed rather than leaving a generalized framework.
- Independent main verification remains required. No live runner, live calls, qualifications, production edits, commits, dependency/lock changes, user configuration/credential edits, README/changelog/context edits, worktrees, nested agents or task management occurred in this resume.

The historical report below is preserved. Its prior “current result” headings describe earlier phases.

---

# Offline bridge/native warming integration — positive offline boundary passed

## Current result: authorized terminal-validation repair (repairAttempt6)

The unchanged native acceptance test now passes with SDK 0.3.280 / CLI 2.1.280: two SDK queries and two synthetic loopback model requests, native decision `warm`, exactly one native usage entry, unchanged source bytes, and zero production qualifications. The test's remaining per-request usage, context, transcript-file and wire-prefix assertions all pass. Actual API-key metadata remains rejected; eligible subscription metadata is still simulated only in the native fixture. This is not live cache/billing qualification. No second production defect was repaired.

The sole production change retains early assistant count/model/text checks, permits null/absent unfinished assistant stop reasons, rejects explicit contradictory reasons, and requires the authoritative stream `max_tokens` reason at the validated `error_max_budget_usd` result. Existing request/count/output/accounting/cache-prefix/auth/policy/cancellation/isolation gates remain intact. Consumption stops at that validated result.

TDD and validation (commands actually executed; log redirection omitted):

- `node --import tsx --import ./tests/lib/setup.mjs --test tests/unit-cache-warming.mjs`: RED 56/57, new realistic-order success failed with `unqualified refresh stop reason`; identical GREEN 57/57.
- `node --experimental-test-module-mocks --import tsx --import ./tests/lib/setup.mjs --test tests/int-bridge-warming.mjs`: RED failed line 116, zero usage entries after two requests; identical GREEN 1/1, one usage entry after two requests. Integration and harness files unchanged.
- `node --import tsx --import ./tests/lib/setup.mjs --test tests/int-cache-warming-offline.mjs`: 3/3 passed, two loopback requests. Added an actual-SDK assertion for early `assistant(null)` → `message_delta(max_tokens)` → `result(error_max_budget_usd)` without changing metadata, gates or event delivery. Zero tools, source unchanged, no persisted fork.
- `npm run test:unit`: 315/315 passed.
- `npm run typecheck`: passed.
- `git diff --check` and scoped trailing-whitespace check: passed.

Adapter regressions include null/absent assistant reasons, no draining past budget, missing/wrong delta (even with output already one), contradictory assistant reason, wrong output count, non-budget/missing result, duplicate assistant and unsafe assistant model/content. Existing extra-request, tool, accounting, isolation and cancellation tests still pass. No coverage percentage claimed; no LSP tool available in this worker.

Six synthetic loopback model requests total in this repair phase; **zero live calls**. No downloads, commits, config/credential edits, qualification promotion or final README/changelog/context changes. Remaining task15 tool-continuation/retention/race coverage and independent main verification are still required before the main session decides whether to proceed. Everything below is preserved historical evidence; its blocked/current/pending statements describe the earlier phases, not this result.

## Historical result before terminal-validation repair

The first positive boundary test remains blocked, now at native usage publication: after the authorized SDK metadata fingerprint correction, the registered native decision returns `warm` and dispatches a refresh, but Pi records zero warming usage entries (expected one). **Do not proceed to live qualification on this evidence.** Production qualification remains empty. Earlier `stop` failures below are preserved as historical evidence.

The subsequently authorized narrow repair now permits exactly `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` in `isolatedSource()` without removing it from source or refresh environments. **The unchanged real integration still fails at the same native decision assertion after this repair.** Main-session observational tracing subsequently established a second cause: the installed SDK sets `process.env.CLAUDE_AGENT_SDK_VERSION` after the bridge captures its environment fingerprint, making the first completed source appear stale. This second mismatch is now narrowly repaired (see latest validation below); the unchanged integration advances to a later failure. Retention-conflict, tool-continuation, cancellation/config-change, and successful native-refresh coverage remain pending. `tests/int-cache-policy-sdk.mjs` has not been created.

## Historical main-session diagnosis of the refresh rejection

The metadata correction independently passes 55 unit tests, three real-SDK prerequisite tests, typecheck, LSP and whitespace checks. Production qualification remains empty; no live model calls were made.

Observing the existing coordinator instance **after** fixture SDK mocking preserves the real integration's import order and reports `unqualified refresh stop reason`. An earlier diagnostic imported the warming module too early, bypassed the fixture's refresh SDK wrapper and produced an account mismatch; that diagnostic is discarded as invalid integration evidence.

Observing SDK messages without altering them establishes this order in the real native refresh: `message_start` → text block events → `assistant` with `message.stop_reason: null`. Production rejects immediately at that assistant event. A separate unchanged offline prerequisite, which continues consuming the actual SDK, establishes the remainder: `content_block_stop` → `message_delta` with `stop_reason: "max_tokens"` and output `1` → `result/error_max_budget_usd`.

`runIsolatedRefresh()` incorrectly requires both assistant and stream terminal reasons to equal `max_tokens` when the early assistant arrives. Existing unit fixtures place an already-final assistant after the delta, hiding this mismatch. The proposed correction is to validate the authoritative stream stop reason at the budget result, retain all one-request/one-assistant/one-output-token/accounting/isolation checks, and reject conflicting explicit assistant terminal reasons. No production correction has been made; separate authorization is required. Native usage/prefix assertions still do not pass.

## Historical authorized SDK metadata correction (offline only)

Only `warmingControlsFingerprint()` changed in production: it copies the environment and omits the exact `CLAUDE_AGENT_SDK_VERSION` key only when its value equals already-computed `WARMING_SDK_VERSION`. Absence and the installed version hash identically; empty/unexpected versions, neighboring/lowercase keys, other environment values and bridge controls remain inputs. No input/process environment mutation, metadata preseeding, snapshot recapture, qualification changes, or additional production repairs were made. The integration test and SDK harness are unchanged.

Commands executed (log redirection omitted):

- Integration RED: `node --experimental-test-module-mocks --import tsx --import ./tests/lib/setup.mjs --test tests/int-bridge-warming.mjs` failed at line 110 (`stop` versus `warm`), one SDK query/model request, zero native usage entries.
- Unit RED: `node --import tsx --import ./tests/lib/setup.mjs --test tests/unit-cache-warming.mjs` passed 54/55; only absent-versus-installed metadata fingerprint equality failed.
- After the minimal production fix, the identical unit command initially exposed a test-only prototype comparison error (`process.env` versus a plain copy). Corrected only that assertion to compare copied serialized contents with a boolean diagnostic, avoiding environment dumps. No further production change. The identical unit command then passed 55/55.
- Integration rerun with the exact RED command failed later, at line 116: `entries.length` was `0`, expected `1`. Diagnostics: SDK 0.3.280, CLI 2.1.280, two SDK queries, two synthetic loopback model requests, decision `warm`, zero native usage entries, unchanged source bytes, bridge suppression flag present, actual API-key account rejected, zero production qualifications. Stopped production work at this newly exposed failure; its cause is not diagnosed or repaired.
- Newly executed passing integration assertions: native `warm` decision; exactly one reserved-pair replay (`maxTokens: 1`, `maxRetries: 0`); exactly two SDK/model requests; refresh wire `max_tokens: 1`; no unexpected transport requests. Later usage, context equality, transcript-file equality and wire-prefix equality assertions still did not execute. Source-byte preservation was separately reported by the diagnostic before the failing assertion.
- `node --import tsx --import ./tests/lib/setup.mjs --test tests/int-cache-warming-offline.mjs`: 3/3 passed, two synthetic loopback model requests, zero tool calls, unchanged source, no persisted fork. This remains prerequisite evidence, not successful native usage publication.
- `node --import tsx --import ./tests/lib/setup.mjs --test tests/unit-*.mjs`: 313/313 passed.
- `./node_modules/.bin/tsc --noEmit`: passed. `git diff --check`: passed. Scoped trailing-whitespace check of the three owned files: passed.

Changed-behavior coverage includes exact metadata normalization, unexpected/empty versions, exact-key boundaries, real environment/cache/auth/config changes, bridge-control changes, and frozen-input/process-environment preservation. No coverage-percentage tooling is configured in package scripts; no percentage claimed. Existing snapshot tests remain unchanged and passing. No LSP tool was available in this worker.

This correction phase made five synthetic loopback model requests (one RED, two post-fix integration, two prerequisite), **zero live calls**. Fake account boundaries described below remain unchanged. Native usage publication is a concrete remaining blocker requiring separate authorization before any further production repair. No task15 coverage expansion or final README/changelog/context edits were attempted.

## Historical reproduction (before SDK metadata correction)

```sh
node --experimental-test-module-mocks --import tsx --import ./tests/lib/setup.mjs --test tests/int-bridge-warming.mjs
```

Observed with Node 24.11.0, SDK 0.3.280, bundled CLI 2.1.280, installed Pi 0.87.1:

```text
AssertionError: completed isolated bridge source must authorize native idle warming
actual:   [{ action: 'stop' }]
expected: [{ action: 'warm' }]
modelRequests: 1
sdkQueries: 1
nativeUsageEntries: 0
sourceUnchanged: true
bridgeNonessentialTrafficFlagPresent: true
actualApiKeyAccountRejected: true
productionQualifications: 0
```

The test emits a synthetic source SHA-256, not its prompt, transcript, environment, or auth headers. Temporary synthetic files are sent to `trash` on teardown; no real user configuration is accessed by fixture setup.

## Original production blocker (narrow exemption now repaired)

`src/index.ts` activation unconditionally sets:

```ts
process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
```

The normal provider uses `providerCacheControls({ ...process.env, ...CC_CHILD_ENV }, ...)`, then publishes that original query environment in its immutable warming source. The test confirms the activation-owned flag is present in the actual published source.

Before the authorized repair, `src/cache-warming.ts` `isolatedSource()` rejected every nonempty environment key matching `CLAUDE_CODE_*` except `CLAUDE_CODE_PROMPT_CACHE_TTL`. Consequently the bridge's own nonessential-traffic flag rejected its source. That rejection occurred with an exact test-local qualification key and simulated eligible account metadata. The test leaves the flag intact; it does not sanitize it away, call `complete()` directly, fabricate a source, or weaken the gate.

The exact key/value exemption has now been implemented and independently verified (56 focused unit/real-SDK tests, typecheck, LSP, whitespace). The remaining native `stop` is diagnosed below; another explicitly authorized repair is required before this integration can pass. No further production repair was attempted.

## Historical main-session diagnosis after the flag repair

Two additional loopback-only reproductions wrapped `CacheWarmingCoordinator.begin()` / `decide()` for observation, forwarding their inputs and results unchanged. No files, decisions, source snapshots, qualification keys, or environment controls were changed by the diagnostic wrappers.

- Source exists; owner, Pi session, model, retention, qualification, account eligibility, SDK version, served/canonical model, backend/pricing, cached tokens, resolved runtime and preflight checks all satisfy their expected conditions.
- Candidate versus source `controlsFingerprint` differs. Current versus source `processFingerprint` also differs; the environment recorded at `begin()` reproduces the source fingerprint.
- The only environment change between `begin()` and native decision is the addition of `CLAUDE_AGENT_SDK_VERSION` (only changed key names were logged, not environment values).
- Installed SDK `sdk.mjs` contains the query-time assignment `process.env.CLAUDE_AGENT_SDK_VERSION="0.3.280"`, consistent with the observed change. This is installed implementation plus actual runtime evidence, not a claim inferred from old CLI source or stored transcripts.

At that point, `warmingControlsFingerprint()` hashed every environment key. The SDK's own first-query metadata initialization therefore triggers the stale-controls gate. This proved the then-current first-source failure; it does not establish that subsequent requests fail identically, nor that fixing this mismatch will satisfy all later integration assertions. SDK version already has a separate exact qualification check, but any fingerprint correction must preserve detection of real environment/config changes. No such correction was made. Both diagnostic runs made one synthetic loopback model request each and no refresh or live requests.

## Completed coverage before the failing assertion

- Activated the real extension against a minimal Pi extension-registration fixture; verified registered provider and global owner equal the real `streamClaudeAgentSdk` function.
- Invoked the registered `before_agent_start` hook and verified prompt capture.
- Called the real provider stream with one synthetic user message and a sentinel tool. Used the real bridge MCP construction and SDK prompt stream, without tool-schema changes or `alwaysLoad`.
- Actual SDK/CLI generated the HTTP request body and persisted the source session. Normal provider completion returned `stop`, with exactly one SDK query and one loopback model request.
- Verified explicit source `thinking: { type: "disabled" }` in original SDK options and the sentinel's presence in actual wire tools.
- Observed publication through ordinary source completion, without direct coordinator `complete()` calls. Verified real owner, original request context/options, frozen context, transcript bytes, and successful runtime preflight.
- Separately asserted that actual SDK account metadata from the fake-API-key child is rejected by production `accountEvidence()`.
- Inserted only `warmingQualificationKey(actualPublishedSnapshot)` into a test-local set; production set stayed empty.
- Ran installed Pi `CacheWarmer.start()` and `onAgentSettled()`, then explicitly invoked its native timer callback (`refresh(run)`) after cancelling the real timeout. Its zero-price economics decision was `stop`; the registered bridge event handler also returned `stop`.
- Source JSONL remained unchanged at the failing decision; zero refresh SDK calls and zero native warming usage entries were observed.

Assertions after the failure describe the intended reserved-pair replay, per-request accounting, source immutability, wire-prefix/tool equality, and absent fork persistence, but **have not executed successfully**. They are not evidence of those behaviors. No final tool-result continuation, refresh cancellation, config-race, malicious-tool/hook attempt, summary routing, retention conflict, cache expiry, or live subscription qualification was established by this test.

## Real versus simulated boundaries

`tests/lib/bridge-sdk-harness.mjs` uses Node's experimental module mocking to wrap (not replace) the real SDK query. `resolveSettings`, model usage, stream events, result subtypes, transcript I/O, MCP, normal source completion, snapshot publication, coordinator decisions, and native CacheWarmer code are real.

The harness:

1. Replaces the test process environment with a minimal synthetic HOME/config/cwd and PATH. The extension subsequently adds its own environment normally. Writes only fixture configuration.
2. Captures bridge SDK options **before** transport instrumentation, then injects explicit fake API auth, a loopback base URL, no-retry and nonessential-traffic controls into a separate SDK child option copy. Those fake transport controls are not inserted into the production source snapshot. There is no HTTP forwarding or live mode.
3. Answers actual SDK HTTP requests with synthetic SSE text and usage. This proves request construction/control flow, not real cache hits or subscription billing. Unexpected extra requests are rejected.
4. Records actual `accountInfo()`/init metadata, then **simulates only subscription account metadata and init `apiKeySource: "none"`** for the positive fixture. The real API-key account is independently asserted ineligible. This is explicitly not live subscription evidence and must never be reused to simulate live metadata.
5. Uses a real coordinator with a test-local qualification set, not the production set. Uses a minimal Pi registration/session-manager/model-runtime adapter around the real provider and installed native CacheWarmer; it does not run the entire Pi application or wait five minutes.

## Original commands and TDD sequence

1. Ran the reproduction command above. It initially failed on a fixture-only wrong MCP name (`mcp__pi__sentinel`). This is **not TDD RED** or a production defect. Corrected the fixture to import the repository's `MCP_TOOL_PREFIX`.
2. Reran the exact same command. One test failed at the native decision assertion shown above; all preceding source/snapshot assertions passed. This is preserved meaningful failing production evidence. No production GREEN was attempted because repairs were explicitly unauthorized.
3. Ran `node --check tests/lib/bridge-sdk-harness.mjs && node --check tests/int-bridge-warming.mjs`; both syntax checks passed.

Those original two executions each sent one synthetic loopback model request. **Zero live model calls.** No TypeScript changed in that original phase, so typecheck was not rerun then. Broad suites and existing SDK prerequisite tests were intentionally not duplicated then.

## Authorized narrow repair validation

- RED: reran the reproduction command unchanged before editing production. Failed at `stop` versus `warm`; one SDK query, one loopback model request, zero native usage entries, unchanged source, bridge flag present, actual API-key account rejected, zero production qualifications.
- Added an otherwise-eligible regression for exact `1`, rejection of `0`, `false`, `true`, `2`, arbitrary/whitespace values, neighboring unknown flags and a lowercase key. Extended the successful refresh adapter assertion to check the flag survives in both source and refresh environments.
- Unit RED: `node --import tsx --import ./tests/lib/setup.mjs --test tests/unit-cache-warming.mjs` failed 2 of 53 tests (positive native eligibility and refresh success).
- Changed only the exact key/value exemption in production `isolatedSource()`; all other isolation predicates and the empty production qualification set remain unchanged.
- Integration rerun: the identical reproduction command **still failed** at line 110 (`stop` versus `warm`), with the same request/usage counts and source-preservation assertions as RED. No newly passing integration assertions beyond the original boundary were accumulated. Integration test and harness were not edited. Stopped production repair here as instructed; remaining cause is unverified.
- Unit GREEN: identical focused unit command passed 53/53.
- Existing SDK prerequisite: `node --import tsx --import ./tests/lib/setup.mjs --test tests/int-cache-warming-offline.mjs` passed 3/3, with two synthetic loopback model requests, zero tool calls, per-request usage, unchanged source and no persisted fork. This is separate prerequisite evidence, not a successful native bridge refresh.
- `npm run typecheck` passed.
- `node --import tsx --import ./tests/lib/setup.mjs --test tests/unit-*.mjs` passed 311/311.
- `git diff --check` and scoped trailing-whitespace inspection passed.

This repair phase made four synthetic loopback model requests total (two failing integration runs plus the two-request prerequisite). **Zero live API calls.** No compatibility package download was repeated. Meaningful changed-behavior coverage is the focused eligibility rejection matrix and refresh-environment preservation assertions; no coverage percentage is claimed. Remaining tool-continuation, retention, race and successful native-refresh integration gates are pending. This integration remains blocked; do not proceed to live qualification.
