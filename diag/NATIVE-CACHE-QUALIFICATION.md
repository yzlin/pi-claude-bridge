---
summary: "Haiku Team native lane on SDK 0.3.293; earlier 5.5 Team lanes and sealed SDK expiry comparisons on 0.3.285, and offline native integration evidence."
read_when:
  - "Changing model eligibility or cache-warming SDK options"
  - "Interpreting native cache hits, tool-source wire divergence, or sealed diagnostic allowances"
---

# Native cache qualification — exact Haiku and conservative 5.5 Team lanes

## Current: Haiku requalified on SDK 0.3.293; 5.5 not requalified

Upstream moved the SDK to `^0.3.293` (CLI 2.1.293). Every lane was pinned to 0.3.285,
so warming stopped. The user approved requalifying Haiku only.
`PRODUCTION_QUALIFIED_WARMING_MODELS` now holds one lane: Haiku 4.5 / Claude Team /
SDK 0.3.293 / CLI 2.1.293 / firstParty/list. The 5.5 lanes were removed because
`^0.3.293` cannot install 0.3.285. The 5.5 admission rules in `decide()` stay.

CLI 2.1.293 changes two things that refuse every source:

- **`cc-plugin-plugin-authoring@builtin`** loads by default. `enabledPlugins: false` on
  its exact id switches it off, so the bridge now adds it to `BUILTIN_PLUGIN_IDS`.
  Found offline: the decision was `stop` because `init.plugins` was not empty.
- **`cc-plugin-sec-default@builtin`** is seated for Team and Enterprise organizations.
  Flag `enabledPlugins` cannot switch it off under either id. The proof is a zero-turn
  probe on the real Team login (`probe-builtin-plugins.mjs`, `reloadPlugins` held,
  no user message). It adds hooks (inert under `disableAllHooks`) and a
  `security-review` command, but no tools, MCP servers or agents. With user approval,
  `isolatedSource()` now accepts `init.plugins` that is empty or exactly this one
  built-in. The tool and MCP checks stay exact.

Three allocations of the Haiku-only harness (`native-cache-haiku-12q-25m-v*`, at most
12 SDK starts and 25 minutes each) ran once each:

| Allocation | Result | SDK starts / HTTP |
|---|---|---|
| v4 | Sealed failed at the account gate. `env -i` dropped `USER`, so the stored login was not found. | 1 / 0 |
| v5 | Sealed after the seed. The account was eligible, but the Team-seated sec-default plugin failed source isolation. | 1 / 1 |
| v6 | **Complete. Matrix and both expiry comparisons passed.** | 12 / 12 |

v6 evidence (`diag/native-cache-haiku-v6.live/`, code hash `0f4b9422…`). Every source
reported `initPlugins: ["cc-plugin-sec-default@builtin"]` and the lane
`["firstParty","Claude Team",null,null]`, served `claude-haiku-4-5-20251001`.

| Check | Comparison 0 | Comparison 1 |
|---|---|---|
| Refresh read / write / output (at 240.2 s) | 17 803 / 66 / 1 | 17 807 / 66 / 1 |
| Warm follow-up read (at 367.3 s) | 17 803 | 17 807 |
| Control follow-up read / write | 0 / 17 853 | 0 / 17 957 |

The matrix refresh read 17 801 and wrote 66. This matches the v3 profile on 0.3.285.
With user approval, the sealed 5.5 diagnostic harnesses (`probe-five-*`, the account
probe) are repinned to SDK 0.3.293 / CLI 2.1.293. They also switch off the
plugin-authoring built-in, so their offline tests run again. Their code hashes change,
so the original hashes identify only the historical versions. All allocations stay
sealed (their ledgers exist), and no live run is authorized.

## Earlier: separately approved conservative 5.5 enablement (SDK 0.3.285)

After independent inspection accepted SDK expiry v2, the user explicitly chose
**implement and enable exact lanes**. `PRODUCTION_QUALIFIED_WARMING_MODELS` now contains
Haiku 4.5, bare Sonnet 5.5 and Opus 5.5 requested as `[1m]`, only on Claude Team /
SDK 0.3.285 / CLI 2.1.285 / firstParty/list accounting. Haiku behavior is unchanged.
5.5 additionally requires short retention, thinking off, bare served-model identity,
actual source/refresh `verbatimPrompts` parity, and **two consecutive captured successful
ordinary SDK queries** in the same SDK/Pi session and unchanged lane. A complete Pi
tool cycle counts once, not once per HTTP request. New input cancels current authority
while preserving successful-query credit; model/session/thinking/compaction/tree changes,
in-place history re-import, changed controls/definitions/account and uncaptured or
ineligible source work reset it. First-turn and one-hour 5.5 warming stay disabled.
Opus suffix reconciliation is exact and refuses ambiguous rows; it is not generic alias
normalization. AskClaude, ordinary cache retention, SDK refresh caps and Pi scheduling
are unchanged. No production awake assertion was added.

Validation: 443 units, typecheck, four new actual-SDK/registered-provider/installed-native
5.5 scenarios and three existing Haiku scenarios, plus 22 existing lifecycle/settings/
retention checks passed. The 5.5 fixtures retain actual SDK ModelUsage rows but explicitly
simulate accountInfo/init subscription metadata with isolated fake-key loopback usage.
Actual fake-key accounts remain rejected. Independent native safety review found no concrete blocker, including a final delta
review that verified all eight interrupted-source/admission unit regressions.
This proves local integration, **not additional live-native expiry, real account or quota
savings**, and does not exercise all of the user's other extensions. Restart Pi for a
fresh coordinator. No additional live diagnostic allocation was approved.

All prior diagnostics/markers/ledgers stay sealed. The original v2 approved hash is a
historical runtime identity: these production changes intentionally invalidate reuse of
its code-bound approval. It was recomputed against approval/start evidence before the
native changes; no marker was regenerated or allowance reset.

## Latest: awake-bound expiry v2 completed all four controlled SDK comparisons

The separately approved `native-five-expiry-28q-36http-20m-v2` ran once and sealed
**complete**. Code hash `3270a3f921b15a74cbdc1f77bd11828ba9e6ef1f3e3336cda775e69ba466503a`;
marker `diag/five-expiry-v2.approved.json`; artifacts `diag/five-expiry-v2.live/`.
Independent pre-live static safety review found no concrete blocker. Main inspection
of the actual artifacts confirms **28 SDK starts / 36 observed model HTTP attempts /
36 accepted / 36 forwarded / zero blocked attempts**, zero retries, **443 839 ms wall /
443 834.745 ms monotonic** duration. All **54 prior sealed artifacts unchanged**.

| Model / pair | Warm source cached tokens | Warm follow-up read/write | Unrefreshed control read/write |
| --- | ---: | ---: | ---: |
| Sonnet 5.5 / 0 | 21 545 | 21 545 / 11 | 0 / 21 564 |
| Sonnet 5.5 / 1 | 21 550 | 21 550 / 11 | 0 / 21 552 |
| Opus 5.5 `[1m]` / 0 | 21 552 | 21 552 / 11 | 0 / 21 557 |
| Opus 5.5 `[1m]` / 1 | 21 547 | 21 547 / 11 | 0 / 21 552 |

Every refresh began **241.7–242.1 seconds** after its own tool-continuation request,
read at least the complete source cached prefix, wrote at most 1,024 tokens and output
exactly one token. Every ordinary source follow-up began **366.45–366.76 seconds**
after its own source request, within both monotonic and wall windows. All eight
follow-ups ended normally; Opus output counts were **18/14/3/18**, below the explicit
128 cap. Controls read zero and wrote at least their complete source cached total.
Thus **two independent warm-versus-unrefreshed expiry comparisons per model passed**
under this synthetic-history SDK method—not just immediate prefix-hit evidence.

Artifacts retain **28 validated stages / 36 provider response observations / 28 same
eligible Claude Team public-account snapshots**. All arms had distinct tool-definition
hashes; each arm preserved its system/tool/runtime hashes. Eight inert source
handlers/results, zero refresh handlers. Refreshes asserted source-byte/file-list
preservation and no persisted fork. SDK/provider usage equality and firstParty/list
accounting passed the bound worker's assertions; raw terminal modelUsage rows were
not retained, so do not present them as independently inspected rows. Owned four-type
awake assertions on AC passed startup/admission checks and were released in cleanup.

Independent read-only artifact inspection found no contradiction and confirmed the
four comparisons, counters and bound guards. Before native changes, main additionally recomputed the then-current
code hash against the approval/start identity and rechecked all 54 prior artifact
digests. Preservation is a bound worker assertion; original source bytes/file inventories
were cleaned and cannot be independently replayed from these ledgers. **No automatic production promotion**
was authorized by this diagnostic. The later, separate native-enable decision and local
integration are recorded above. Standalone synthetic SDK qualification does not exercise
the user's complete Pi extension setup. Public snapshot equality is not independent
cryptographic credential-identity proof. Old failed allocations remain sealed.

## Preparation: fresh awake-bound expiry v2

User explicitly approved `native-five-expiry-28q-36http-20m-v2`: **≤28 SDK starts /
≤36 model HTTP attempts / ≤20 minutes**, zero retries, two warm/control pairs per
model, eight inert source calls, ordinary/tool output cap **128**, refresh cap **1**.
No production promotion authorized. Separate `diag/probe-five-expiry-v2.mjs` and
`diag/lib/five-expiry-v2-{owner,worker,transport,awake}.mjs`; separate v2 marker/ledger.

Live v2 supervises `/usr/bin/caffeinate -d -i -s -u -t 1200 -w <supervisor pid>`.
It verifies all four owned assertion types and AC power before SDK reservation/start,
account ACK/input release and model attempt/forward. Utility exit invalidates the run;
cleanup releases it. Apple's local `caffeinate(8)` documents `-s` as AC-only, `-u` as
user-active/display wake, and PID/timeout lifetimes. Assertions do not guarantee that
forced/clamshell sleep cannot occur, so a 100-ms parent watchdog rejects **>5-second
wall or monotonic heartbeat gaps** and **>2-second cumulative clock skew**. Both source
wall and monotonic ages must fit refresh/follow-up windows. Explicit rejection clocks,
ages, window, direction and phase/timeout evidence are persisted; observed HTTP counts
include locally blocked attempts and remain distinct from accepted/forwarded requests.
Worker timeout remains 55 seconds with abort plus close.

RED→matched GREEN proved missing heartbeat/rejection accounting and missing supervisor
awake-loss enforcement. Nine v2 units and five actual-SDK offline scenarios pass:
full 28-start/36-loopback matrix, contaminated control, account switch, awake loss
before any SDK start, and 5.2-second parent event-loop pause sealing after only the
first source's **2 SDK starts / 3 loopback attempts**, before a refresh SDK/request.
A zero-SDK smoke verified the actual four PID-owned assertions on AC and released them.
Full **435-unit suite**, typecheck, diff and changed-file LSP pass. All **54 previously
sealed artifacts** remain byte-identical. Independent v2 static safety review then passed, and the fresh marker authorized the
single execution recorded above. The successful ledger now exists; it cannot restart.
These guards and simulation are not cache-expiry or credential-identity proof.

## Earlier: expiry v1 sealed at timing guard; no expiry proof

User-approved `native-five-expiry-28q-36http-20m-v1` ran once and is sealed failed.
Marker `diag/five-expiry-v1.approved.json`, ledger `diag/five-expiry-v1.live/`, code hash
`064a05e1cc7b65144f84ccedee9ec5ecf76dc1ba9822e831d03fcaf7b3c04749`.
Main verified **8 reservations / 8 SDK starts / 10 accepted model HTTP attempts /
10 forwarded / 1 additional locally blocked attempt**, a **324 918 ms** journal
interval, and **45 prior artifact digests unchanged**. Counting the rejected local
POST gives **11 observed model HTTP attempts**, not ten; all remain below the approved
36 ceiling. Unused slots authorize no restart/reset/resume.

Three Sonnet arms completed seed and tool-continuation validation: six retained
stages, three inert source handlers/results, positive source cache usage. The fourth
Sonnet arm forwarded its seed but retained no completed provider response. An arm-2
refresh then reserved/started its SDK query and passed public account/settings gates,
but its model request was blocked by the owner's **source-relative timing window**
before body observation or forwarding. The fresh started query had zero earlier
attempts and the allocation was below quota; its completed source existed, narrowing
the rejection to the timing branch. The computed monotonic age was not retained, so
this evidence does not independently distinguish early from late monotonic arrival.
Wall-clock refresh reservation occurred about 306.5 seconds after that source's
request; wall age is not the monotonic proof used by the guard.

**No refresh model request was forwarded, no source follow-up SDK query ran, no Opus
arm started, and no warm-versus-control expiry comparison completed.** All retained
account observations shared the same eligible Claude Team snapshot digest/lane.
The subsequent **offline-only diagnosis proved host maintenance sleep during this
interval**: locally filtered `pmset -g log` events show DarkWake at
**2026-10-01 10:37:31 +0800**, Maintenance Sleep at **10:38:16**, and DarkWake again at
**10:43:18**—about **302 seconds asleep**, overlapping the missing-response period
and ending immediately before refresh reservation at 10:43:18.638. Wake-request
notices were excluded; only timestamps/event types/known reason booleans were read
into the diagnosis output. No raw power logs or private session/auth data retained.
This establishes a host execution interruption, not the original computed monotonic
age or whether the service itself completed the outstanding seed while asleep.
This is not cache-miss or unsupported-model evidence.

`node --import tsx diag/probe-five-timing-offline.mjs --offline` now isolates four
actual SDK/CLI cancellation boundaries: streaming input plus abort, streaming plus
abort/close, string plus abort, and the unchanged expiry observer with an offline
response-observation RPC deliberately parked. Each admitted one loopback model
request, executed zero tools, forwarded zero requests and received zero completed
provider responses. SDK **0.3.285 / CLI 2.1.285** iterations settled around **2.0 seconds**
after abort, before the five-second fallback; prompt cleanup took <0.05 ms in the
observed runs. Immediate `close()` did not improve the measured ~2-second shutdown.
The observer's synthetic account substitution is explicitly labeled; actual fake-key
account eligibility remains false. These results do not reproduce a hundreds-of-
seconds SDK/prompt-cleanup hang while the process runs.

A separate owned-child SIGSTOP/SIGCONT experiment pauses its event loop for 6.1
seconds. A 150-ms abort timer and 1,000-ms refresh timer both run after ~6.1 seconds;
the unchanged offline owner's 1,000–5,000-ms window rejects the refresh at ~6,137-ms
monotonic age before simulated two-second cleanup ends. Rejection age, both clocks,
window, direction and phase order are emitted. This reproduces a timer/cleanup race
under **process pause**, not macOS sleep's exact clock behavior or the historical
rejection direction. Source stages and cleanup grace are explicitly simulated; no
SDK or model request occurs in this clock case. Earlier measurements emit stage rows
before later cases. The probe has no live/reset/resume entry point and uses isolated
fake-key HOME/Claude configuration plus owned process-group shutdown.

Both `tests/int-five-timing-offline.mjs` scenarios pass, as do typecheck, diff and
changed-file LSP. All **54 sealed code/test/marker/ledger artifacts** remain byte-
identical. This was exploratory black-box diagnosis, not a production behavior fix;
no TDD RED or cache-expiry proof is claimed.

Three materially different current live attempts have now stopped: v1 tool-response
observation was incomplete, v2 isolated prefixes hit but Opus's final ordinary reply
truncated, and expiry v1 hit a timing guard. Stop live work. Next work must diagnose
the timer/cancellation boundary offline before any separately reviewed new allowance.
That diagnosis now demonstrates bounded awake cancellation and delayed-timer rejection.
A future qualification still needs a **fully awake host throughout**, persisted
monotonic/wall rejection ages and phase/clock-continuity evidence, and a fresh bounded
approval—not this sealed allocation. Do not infer that an idle-sleep assertion alone
prevents maintenance/clamshell/forced sleep. Preserve all three sealed runner code
sets, markers and ledgers.
Production still qualifies only the existing Haiku Team lane; neither 5.5 model is
qualified. All **426 unit tests**, the three expiry SDK-loopback scenarios, typecheck,
diff and changed-file LSP passed before the live run; simulation did not expose this
runtime timing boundary.

## Earlier: both tool-source refreshes hit; Opus final follow-up refused

Separately approved `native-five-tool-source-8q-10http-10m-v2` ran once and is sealed
failed. Ledger `diag/five-tool-source-v2.live/`, marker
`diag/five-tool-source-v2.approved.json`, code hash
`8f64c4b781f30ce0adb3baf9bd5d909096fe3f93c4721197d1fb4947eb621b13`.
Main verified **8 reservations / 8 SDK starts / 10 HTTP attempts / 10 forwarded**,
zero blocked attempts, a **30 502 ms** journal interval, all eight eligible Claude
Team/post-account settings gates, and **38 prior artifact digests unchanged**, including
v1 runner/modules and every earlier sealed marker/ledger. No retry is authorized.

| Model | Tool-continuation cached prefix | Fork read / write / output | Ordinary source follow-up |
|---|---:|---:|---|
| `claude-sonnet-5-5` | 21 546 | **21 546 / 32 / 1** | **21 546 read**, `end_turn`, 3 output; final candidate row accepted |
| `claude-opus-5-5[1m]` (served bare id) | 21 549 | **21 549 / 32 / 1** | **21 549 read**, `max_tokens`, 32 output; refused before SDK follow-up validation |

Each model executed exactly one inert source handler and paired result; neither
refresh executed a tool. Both forks returned provider `max_tokens` with one output
token and reused the entire tool-continuation's cache-read-plus-write prefix. All
five request system/tool hashes per model matched; wire TTL was five minutes and
thinking off. Full Sonnet completion retained SDK/provider usage equality and source
bytes/file-list preservation. Opus progressed to its final source follow-up only after
the worker's refresh accounting/source checks, but **no final Opus worker row was
retained**; that progression is execution evidence, not an independent persisted
source assertion. The final Opus provider response was observed before the owner's
`end_turn` gate rejected it, so SDK/provider equality for that follow-up is unproven.

This establishes positive immediate tool-bearing refresh evidence for both models,
not a complete Opus candidate pass or expiry extension. It also shows that the earlier
offline array-to-string notice divergence does **not necessarily prevent full provider
cache reuse**. Do not infer v1's exact failure cause: v2's complete source calls used
37 output tokens, above v1's 32 cap, which supports but does not prove truncation there.

No production options or qualification changed. The user separately approved the
next expiry allocation: **28 SDK starts / 36 model HTTP attempts / 20 minutes**,
zero retries, two independent warm/unrefreshed pairs per model, eight inert source
calls total, **128-token ordinary/tool turns and one-token refreshes**. The prepared
`diag/probe-five-expiry.mjs` has separate code-bound marker/ledger targets and keeps
both tool-source runners unchanged. Sources are prepared sequentially; each arm uses
owner-monotonic age from its tool-continuation request to schedule refresh near
241 seconds and source follow-up near 366 seconds. Owner gates require refresh age
240–280 seconds and follow-up age 365–450 seconds; wall-clock advancement alone cannot
establish expiry. Every comparison and stage must share the same public-account
fingerprint/lane; only its digest is retained.

Six expiry owner units and three actual-SDK offline scenarios pass: full eight-arm
28-start/36-loopback matrix, contaminated-control refusal with earlier stages retained,
and same-plan account change refused before the changed arm's model input. Offline
usage and 1–2-second timing are explicitly simulated, never expiry proof. Per-stage
SDK/provider usage and refresh source/file-list preservation are persisted before
subsequent work. The full **426-unit suite**, typecheck, diff and changed-file LSP pass.
All **45 prior artifacts**, including both tool-source runner code sets and every
sealed marker/ledger, remain byte-identical. Final independent static delta review found no concrete blocker, while noting that
public snapshot equality is not independent credential-identity proof and complete
message-prefix byte identity is not asserted. A fresh matching marker then authorized
the single execution recorded above. The preparation is not live expiry proof.

## Earlier: tool-source v1 stopped before refresh; sealed

The user-approved `native-five-tool-source-8q-10http-10m-v1` ran once and is sealed
failed. Marker `diag/five-tool-source-v1.approved.json`, ledger
`diag/five-tool-source-v1.live/`, code hash
`18b2ab96aa60546a931ec480ab5fc8a39e1b27abdba52dd0fa2663d330c3a604`.
Main verified **2 reservations / 2 SDK starts / 2 HTTP attempts / 2 forwarded**,
zero blocked attempts, a 6 203 ms journal interval and all **31 prior sealed artifact
digests unchanged**. Unused slots authorize no retry/reset/resume.

Both Sonnet account gates reported eligible Claude Team and completed post-account
settings revalidation. Seed request: five-minute TTL, thinking off, 32-token cap,
HTTP 200, `end_turn`, **21 444 cache-write / 0 cache-read / 3 output tokens**.
The tool-stage request kept the system/tool hashes and the same capped wire settings.
It returned HTTP 200, then failed before sanitized provider-response evidence was
persisted. The retained evidence narrows failure to response parsing/validation or
its owner protocol gate; it does **not** distinguish truncation, a missing/wrong
sentinel call, malformed SSE or another response-contract failure. A too-small
32-token tool-stage cap is a hypothesis, not an observed cause.

No source tool handler was admitted by the journal; no tool continuation, refresh,
source follow-up or Opus SDK query ran. No source/fork immutability assertion completed
for a refresh. This is not tool-source cache-miss evidence and does not refute the
prior text-only candidates. Neither 5.5 model is production-qualified; expiry remains
unproven. Synthetic arm transcripts were cleaned by the runner's existing scoped
Trash path; no raw response or credentials were retained.

Before this live run, the prepared runner gained exact pre-forward model/tool/output
caps and stable system/tool hashes, exact SDK-init inventories, repeated settings and
process-control checks before input release, and successful-child-exit acceptance.
RED: three new guard tests failed; matched GREEN: eight passed. The full prepared-runner
and both-model construction regressions passed; **410 unit tests**, **24 selected
native/SDK integration checks**, typecheck, diff and changed-file LSP passed. Independent
static security delta review found no concrete blocker; auxiliary SDK egress and
escaping descendants remain unproven. None of those offline checks predicts a valid
live tool response.

A fresh v2 allowance is now explicitly approved: at most eight SDK starts, ten model
HTTP attempts, ten minutes, zero retries; tool-stage output capped at **128**, seed
and follow-up at **32**, refresh at **1**. `diag/probe-five-tool-source-v2.mjs` and its
separate `five-tool-source-v2-*` modules preserve the sealed v1 code/marker/ledger.
The new observer persists only known stop/model categories, safe usage counters and
tool-name/input-completeness verdicts plus call-id hashes **before** response rejection.
No raw response text or tool arguments are retained. Offline normal and deliberately
truncated tool-response paths pass: eight starts/ten loopback attempts for normal;
two starts/two loopback attempts for truncation, whose stop/output/incomplete-input
facts survive refusal without a handler or forwarding. Independent static safety review found no concrete blocker; the matching marker then
authorized the single v2 execution recorded above. Preparation alone was not cache or
qualification proof. Ten v2 guard/redaction units, both actual-SDK v2 integration
paths, the full **420-unit suite**, typecheck, diff and changed-file LSP passed.

## Latest: Sonnet 5.5 and Opus 5.5 verbatim candidates passed

The separately approved `native-five-verbatim-8q-10m-v3` executed **once**, completed
and is sealed. Ledger `diag/five-cache-v3.live/`, marker
`diag/five-cache-v3.approved.json`, code hash
`c233105df3032a82731a0325cbe9d5cb440c3670005f6075373e47338dd6b6de`.
Final counters: **8 reservations / 8 SDK starts / 8 HTTP attempts / 8 forwarded**,
each query single-attempt; zero blocked attempts. The journal interval was 24 245 ms,
not cleanup-inclusive. Main independently asserted all eight query counters, both
candidate verdicts, provider usage/TTL records and ten prior sealed artifact digests.

Each model used four synthetic turns: seed, second ordinary turn, non-persisting
one-token fork refresh (`.`), then an ordinary source follow-up. The documented
`verbatimPrompts: true` option was applied consistently. Every public account gate
reported `Claude Team`, eligible; SDK 0.3.285 / CLI 2.1.285, first-party/list usage,
thinking disabled and five-minute wire TTL. Model traffic was observed through the
existing byte-preserving public-SDK diagnostic proxy; there was no request rewriting.

| Model | Seed cache write | Second turn read / write | Refresh read / write | Source follow-up read |
|---|---:|---:|---:|---:|
| `claude-sonnet-5-5` | 21 388 | 1 102 / 20 305 | **21 407 / 32** | **21 407** |
| `claude-opus-5-5[1m]` (served bare id) | 21 402 | 1 108 / 20 313 | **21 421 / 32** | **21 421** |

Both refreshes read exactly the second source turn's reported cached-token total,
used **one output token**, stopped at `max_tokens`, and returned the narrowly accepted
budget-guard result. SDK stream usage matched observed provider response usage. The
worker verified unchanged source JSONL bytes and file lists across each isolated fork;
no source or refresh tool executed. Prompt and inert sentinel definitions were synthetic.
Top-level system and tool hashes stayed stable within each model's four requests.

**Limits:** the seed-to-second transition still missed most of the prefix, with the
first changed prior-message hash at index 1 (the initial environment message in the
earlier offline captures). That correlation is not a root-cause proof. The pass is
for a prefix prepared by a second ordinary turn, **not every first-turn source**.
The latest-user message hash also changed on second-to-refresh; observed cache reads
are positive evidence, not a claim of byte-identical complete message arrays.
The follow-ups occurred only 1.846 / 2.984 seconds after refresh request start, so
this does **not** establish expiry extension. Actual tool-result source coverage and
controlled warm-versus-unrefreshed expiry comparisons remain required.

The worker and production query options were unchanged for v3; only diagnostic id,
marker/ledger targets and refusal tests advanced. Production still enables exactly
the proven Haiku Team lane below: neither 5.5 model is qualified, and no production
`verbatimPrompts` setting or reinitialization workaround was added. The eight-request
allowance is exhausted, with no retry/reset/resume authorization.

Offline gates: seven diagnostic guard/usage units and the actual-SDK eight-turn
both-model loopback regression passed; typecheck, diff check and changed-file LSP
passed. Earlier one-start account comparison also completed with zero model traffic;
its initial/fresh/cached metadata already agreed on eligible Team before this run.

## Tool-bearing source: offline construction boundary reproduced

`tests/int-five-tool-source-offline.mjs` and its IPC-only child
`tests/lib/five-tool-source-offline.mjs` now retain an actual-SDK/CLI contract for
both 5.5 models. Run with:

```sh
node --import tsx --test tests/int-five-tool-source-offline.mjs
```

Sequence per model: ordinary seed → resumed source turn containing one inert MCP
sentinel call and its result/continuation → non-persisting one-token fork → ordinary
source follow-up. Four SDK starts / five loopback requests per model. The source
handler returns only fixed synthetic text and is forbidden outside that source turn.
Built-in tools, hooks, plugins, memory and external MCP are disabled. HOME/config/cwd
are synthetic; the key is fake, all model routes use loopback, and the fixture has
**no forwarding path or live mode**. Real public account metadata stays ineligible;
there is no eligible-account substitution. Canned SSE usage is explicitly synthetic,
not native cache or subscription evidence.

On SDK **0.3.285** / CLI **2.1.285**, both source tool-continuation requests first
diverged from the fork at **message index 6** (zero-based). This system message follows
the preserved `tool_result` and contains the CLI's `<total_tokens>` notice:

```text
source tool continuation: system.content = [{ type: "text", text: notice }]
fork / ordinary resume:   system.content = notice
```

The joined text is equal, but the content representation differs **at the source's
message cache breakpoint**. Fork message breakpoints moved to index 9. Top-level
system/tools and all earlier messages matched after excluding only cache directives.
The same conversion occurred in ordinary resume, so this is **not fork-specific**.
Tool call/result ids, ordering and fixed result text survived all three requests.
The fork preserved source JSONL bytes and the transcript file list; only the one
inert source handler ran. Both current-state regressions pass. Initial harness errors
(macOS cwd alias and SDK beta query-string routing) were corrected; these were setup
failures, not cache evidence. An initial `system-reminder` tag expectation was refined
to the actually observed `<total_tokens>` notice, not presented as a product fix.

This reproduces a construction boundary, **not a provider miss**. The API-key/fake
usage lane and short synthetic prefix cannot establish Team-lane tokenization or
cache reuse. `verbatimPrompts` documentation explicitly leaves between-tool attachments
unaffected (`sdk.d.ts:1864–1886`), so suppressing useful notices or rewriting prior
history is not a justified remedy. No production options, gates, sealed runner code,
markers or ledgers changed; v3 readiness still reports its original approved code hash.
Read-only declaration exploration found no documented control that freezes this
between-tool representation. `systemPrompt.snapshot` is already default-on and promises
only system-prompt reuse, with account-rollout caveats (`sdk.d.ts:2346–2374`); the observed
top-level system already matched. `resumeSessionAt` preserves a selected chain tail,
not its rendering (`sdk.d.ts:2081–2136`). Dynamic-section exclusion moves context rather
than preserving this notice. These are not verified remedies.

Static security review found no concrete new defect. It did **not** prove absence of
SDK auxiliary network traffic or descendant termination: loopback model routing is not
an OS-level egress sandbox. The tested model responses were local and never forwarded;
account/cache evidence remains synthetic/ineligible. Current-stage guarding rejects any
sentinel handler invocation outside the source tool turn.

Validation: the two new construction contracts plus the existing both-model text-only
loopback regression passed; 110 related warming/quota units, typecheck, diff check and
changed-file LSP passed. A separately approved, guarded live tool-source comparison is
needed to determine cache impact before paying for expiry qualification. That separately approved v1 allowance has now run and is sealed at the response
validation boundary above; no unused allowance or further retry permission remains.

## Earlier qualification and investigations

**Haiku-only run — executed once, failed at the seed, sealed.** The ledger
`diag/native-cache-haiku.live/` shows 1 reservation, 1 SDK start, 1 forwarded HTTP
attempt and a 4.9 s interval. The live account gate passed (`Claude Team`, eligible).
The OAuth request through the local proxy authenticated (HTTP 200). Haiku answered
(17 695 cache-creation tokens), and the seed then failed inside the worker. The API served
`claude-haiku-4-5-20251001`, while SDK `modelUsage` is keyed by the requested alias,
so `selectModelUsage` found no row and no warming snapshot was published. An offline
actual-SDK scenario that serves the dated id reproduced the missing snapshot
(`tests/int-bridge-warming.mjs` `dated-snapshot`). The bridge now treats the exact
alias plus an 8-digit date as the same served model, and nothing looser. The worker
hides error text, so the failing assertion is inferred from this reproduction, not
read from the ledger. No refresh or expiry comparison ran. The 11 unused starts grant
nothing.

**v2 executed once — complete, candidate pass, awaiting acceptance.** The ledger
`diag/native-cache-haiku-v2.live/` shows 12 reservations, 12 SDK starts and 12 forwarded HTTP
attempts, all single-attempt, in 12.6 minutes. Every arm served
`claude-haiku-4-5-20251001` with the `["firstParty","Claude Team",null,null]` lane,
`apiKeySource: none`, `firstParty`/`list` usage and SDK 0.3.280 / CLI 2.1.280.

| Check | Mechanism | Comparison 0 | Comparison 1 |
|---|---|---|---|
| Refresh read / output / stop | 17 699 / 1 / `max_tokens` | 17 706 at 241.0 s | 17 708 at 240.8 s |
| Warm follow-up cache read (after expiry) | — | 17 706 at 369.6 s | 17 708 at 368.2 s |
| Control follow-up cache read / write | — | 0 / 17 760 at 368.5 s | 0 / 17 743 at 368.1 s |

The refresh prefix was exact and the source was unchanged. Each refresh also wrote about
13.3k cache tokens that no follow-up read. The refresh re-sends the source's final user
prompt as a new turn after the forked history, so it writes a cache entry the size of
that prompt. This is a cost, not a correctness failure. Only one account lane (Claude
Team) and 5-minute retention were measured.

**v3 executed once — Haiku passed; Sonnet 5.5 refused; Opus 5.5 not reached; sealed.**
The ledger `diag/native-cache-3m-v3.live/` shows 14 reservations, 14 SDK starts and 14 forwarded single
attempts in 12.7 minutes. Every request used the Claude Team lane with `apiKeySource: none`.

| Check | Haiku 4.5 | Sonnet 5.5 |
|---|---|---|
| Seed cache write | 17 707 | 22 558 |
| Refresh read / write | 17 707 / **66** | **2 248 / 20 364** |
| Expiry comparisons (warm read vs control read) | 17 701 vs 0; 17 704 vs 0 (refresh writes 66, 238) | not run |

Haiku meets every criterion, including the ≤1024-token refresh tail. The fixed `.` turn
removed the ~13.3k write that v2 showed. Sonnet's refresh missed most of the prefix and
the worker refused, so the run ended as failed and Opus never started.

Observed divergence (offline proof of the request shape; **not an isolated root cause**
for the live Sonnet cache miss): for `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-sonnet-5` and
`claude-opus-5`, Claude Code sends its `# Environment` block as a `role: "system"` message
after the first user turn, as a text-block array carrying `cache_control`. The transcript
stores it as an `environment` attachment with a pre-rendered string. On any `resume`, forked
or plain, Claude Code replays it as a **string** with the same text and `output_config`.
The first request and the resumed request diverge at that message. CLI 2.1.280 does the
same, so the SDK bump did not introduce it. Haiku 4.5 keeps the environment inside the
first user message and is unaffected. Ordinary bridge follow-ups also resume, so
multi-turn chats on these models may miss the cache as well.

**Measured in ordinary chat (live, one 3-turn `claude-sonnet-5-5:off` print session, same
process, `reuse` path):**

| Request | Prompt | Read | Write |
|---|---|---|---|
| 1 | 10 021 | 1 660 | 8 359 |
| 2 | 10 066 | 4 706 | 5 358 |
| 3 | 10 111 | 4 706 | 5 403 |

In this three-turn sample, both follow-ups re-wrote approximately everything after the
first user message. An offline 3-turn resume probe identifies a candidate divergence:
on these 5.x models every request ends with a trailing `system` reminder that carries
the breakpoint as a block array, and the next request replays it as a string with the
same text. This correlation does not establish the cause. Haiku's reminders are user blocks and replay unchanged.
Static CLI reading: attachments store the message's original `content`, a string for
these system messages, and only the last message is converted to blocks for
`cache_control`. That string and block forms cache differently is inferred from the live
misses, not isolated.

Two offline probes narrow it further. Rewriting the transcript attachments' `rendered`
content from string to a text block does not change the replayed request, so the
request builder itself flattens text-only system messages. A single streaming query
with in-memory history, the interactive Claude Code path, produces the same
blocks-then-string flip. The shapes are therefore not resume- or bridge-specific.
Either every 5.x Claude Code conversation misses this way, or the misses have another
cause. Only a live in-memory comparison can tell.

**Live in-memory comparison (no bridge, no resume):** one SDK query with 3 user turns,
`claude-sonnet-5-5`, real Team login (`apiKeySource: none`), CLI 2.1.285. Turns had
prompts of 12 041 / 12 086 / 12 131 tokens, reads of 0 / 1 887 / 1 887 and writes of
12 039 / 10 197 / 10 242. Cache misses can therefore occur without the bridge. That run
left the user's 9 settings plugins enabled; it is not a matched control for the
plugin-free bridge run, and the reason for the different cache boundary (1 887 vs
4 706) is unisolated. Neither this comparison nor the block/string divergence proves
root cause. Three main response usage entries were observed, not a transport-observed
HTTP total. Later offline probes showed that omitting the bridge's nonessential-traffic
flag permits an additional session-title request; that earlier live run did not audit
auxiliary HTTP requests. No upstream report has been filed.

## Sonnet 5.5 / Opus 5.5 priority — clean offline investigation

No new live requests, dependency updates, production query changes or qualifications
were made in this investigation. Opus 5.5 still has no live cache evidence.

Actual SDK 0.3.285 / CLI 2.1.285 captures ran against loopback with fake-key auth,
synthetic HOME and explicit synthetic CLAUDE_CONFIG_DIR, no plugins, no native tools
and no MCP servers. Both `claude-sonnet-5-5` and `claude-opus-5-5[1m]` were exercised
for three turns in separate resume and in-memory cases. Between adjacent requests:

- Top-level system text (excluding the CLI billing header), tools, other body fields,
  beta headers and API version stayed unchanged.
- Former last `system` messages changed from cached text-block arrays to plain strings.
- Normalizing a string to a single text block, and omitting cache controls, made the
  entire previous message prefix identical. Normalization is an analysis operation,
  not permission to change production transport or proof of API cache equivalence.
- Opus kept `context-1m-2025-08-07`; both models kept the mid-conversation-system and
  per-turn-control beta headers. Request captures establish construction, not hits.

A documented public candidate is `Options.verbatimPrompts` (`sdk.d.ts:1864–1886`):
"On current CLIs a turn delivered this way also skips the CLI's turn-start attachment
pass as a whole"; the between-tool pass is explicitly unaffected. Additional actual
SDK captures for both models, resume and in-memory, showed later top-level user turns
no longer gaining trailing system reminders. The initial environment system message
remained. A separate inert MCP sentinel tool-continuation capture (one actual handler
execution per model) still ended in a system reminder after the tool result. Thus this
option is **not a complete fix** and changes context-loading/mention semantics. It
has not been added to ordinary provider or refresh options.

Official docs accept strings or blocks for mid-conversation system content and say
"A mid-conversation system message is itself cacheable." They do not establish that
our observed representation change causes the miss:
https://platform.claude.com/docs/en/build-with-claude/mid-conversation-system-messages

Next candidate live diagnostic, not qualification: for each target model, two synthetic
host-composed ordinary turns, one non-persisting one-token forked refresh, then one
ordinary source follow-up, using the documented verbatim option consistently. An
explicit new allowance would cap this at 8 SDK starts / 8 HTTP attempts, zero retries
and 10 minutes. It must preserve source bytes, use public subscription metadata and
record per-request usage. Even success would need expiry controls and tool-bearing
source coverage before production qualification.

The user approved `native-five-verbatim-8q-10m-v1`: the fixed 8-start/8-attempt,
zero-retry, 10-minute scope. Initial preparation stopped on a loopback request with
no cache controls and an empty tool list. Three configuration variants and an import
order correction did not resolve it, so the transient scaffold was trashed. A subsequent
matched direct-SDK/observer experiment identified the request: **session-title
generation**, with a 3059-character naming system prompt, no tools or cache controls.
Without `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, the direct SDK sends this extra
request before its normal request. With the flag, both flows send the expected cached
normal request and sentinel tool. The bridge already sets that flag at provider
activation; the standalone candidate worker had omitted it. This is an offline-proven
diagnostic construction defect, not a new provider-cache finding.

The owned scaffold was restored and the worker now matches that existing flag.
Its eight-turn offline regression failed first at 1 start/attempt, then reached Opus
and exposed the SDK's `[1m]` suffix in `modelUsage` keys. A diagnostic-only selector
accepts exactly the requested cohort id, its bare id or strict dated served id, requires
unambiguous matching canonical metadata, and retains the `firstParty`/`list` gates.
Production model-usage selection and qualification are unchanged. The matched
regression now completes both models with **8 starts, 8 loopback attempts, 0 forwarding**,
unchanged source transcript bytes/file lists, one output token on the refresh, and
5-minute wire TTL. Seven unit tests cover positive cached baselines and valid nonnegative safe-integer
counters (all-zero evidence cannot pass), immutable approval, old-id rejection,
exclusive allocation, per-model limits, second-attempt poisoning, wall/monotonic
clocks, persistence failures, marker integrity, and strict diagnostic usage matching.
These are simulated cache usages, not real hits or expiry evidence.

Runner: `diag/probe-five-cache.mjs`. The v1 marker/ledger are retained under
`diag/five-cache-v1.approved.json` / `diag/five-cache-v1.live`; historical v2 targeted
`diag/five-cache-v2.approved.json` / `diag/five-cache-v2.live`. The current fixed runner
targets the consumed v3 allocation recorded above. Readiness imports no SDK or auth. Live requires
the exact id and an owner-only, single-link, code-bound, unexpired marker, then creates
an exclusive durable allocation with no reset/restart mode. Auxiliary, retried or
unexpected requests remain refused; no transport guard was relaxed.
**v1 live invocation — refused before startup, sealed.** The retained marker and
`diag/five-cache-v1.live/{events,evidence}.jsonl` bind historical run hash
`f5752f846fad3043e0d67f08ce83b7b01c6b1edc3a373063923137959f0df678`.
Final counters: **0 reservations, 0 SDK starts, 0 HTTP attempts, 0 forwarding**;
terminal status `failed`, journal interval 1285 ms (not cleanup-inclusive).
Neither model reached a live query; there is no new cache-hit or account evidence.
No retry, reset or replacement marker/ledger is authorized for this id.

The worker suppressed its exception, so the exact failed live assertion is not
recorded. A subsequent **network-/process-launch-blocked public `resolveSettings`**
check at a synthetic cwd reported only names/types: effective `env` contains the
three previously admitted inert names `MAX_THINKING_TOKENS`,
`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`, and `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`.
The diagnostic's native-TTL-only flag object failed `preflightRuntime` as
`unsupported runtime control`; adding the existing `providerCacheControls(...,
"short")` flag overlay passed. That check observed zero launches, network calls
or credential reads. This independently reproduces the setup defect on current
settings; attribution to the hidden live assertion is inferred, not recorded.

The worker now restores that existing provider overlay in child env and flag
settings, without changing preflight admission or production code. The offline
runner now seeds the same three env names with **synthetic values** in its isolated
HOME; the matched regression first refused with **0 starts/0 attempts**, then
completed **8 starts/8 loopback attempts/0 forwarding** after restoring the overlay.
Seven guard/usage units, typecheck and LSP pass. A further live test requires a
separately approved new allocation; the sealed v1 is untouched.

**v2 separately approved and invoked once — account gate refused, sealed.**
Approval id `native-five-verbatim-8q-10m-v2`, same 8-start/8-attempt/10-minute,
zero-retry scope, historical run hash
`bbea3d1e7c606a8c5f64109a13ca293880560366cd61b007a15122b7e44ed1b2`.
The marker and ledger are retained. The worker's setup/preflight reached reservation
and SDK startup, then public `accountInfo()` returned an ineligible lane
`["firstParty",null,"none",null]`. Input was never released. Final counters:
**1 reservation, 1 SDK start, 0 HTTP attempts, 0 forwarding**; `failed`, journal
interval 1899 ms (not cleanup-inclusive). Sonnet had no model request; Opus never
started. The seven remaining SDK starts and eight unused HTTP attempts grant no
retry, reset or replacement allocation for this id. SHA-256 checks confirmed all
three sealed v1 artifacts unchanged after v2.

This is an execution-context/public-account-gate blocker, **not a Sonnet or Opus cache
failure**. It does not establish that the user lacks Team login or that an ordinary
chat would fail authentication. The cause of the missing subscription metadata is
unisolated; no credential inspection, auth override or gate relaxation was attempted.
There is still no new live 5.5 cache evidence and no production qualification.
Before allocating more cache requests, establish the public account gate in the
ordinary terminal/Pi context where chat works, under separately approved bounded
scope. Both v1 and v2 remain sealed.

### Terminal account check and offline snapshot contract

The separately approved `native-five-account-terminal-1q-60s-v1` ran once in the
existing terminal. Its retained `diag/five-account-terminal-v1.live/events.jsonl`
ends `complete` with an **ineligible** account lane
`["firstParty",null,"none",null]`: 1 reservation, 1 SDK start, zero released input,
blocked HTTP, model HTTP or forwarding. The journal interval is 2205 ms, not
cleanup-inclusive. Observation completion is not account eligibility. The allowance
is consumed and sealed; terminal execution alone did not resolve the v2 blocker.

Offline continuation verified a narrower SDK contract, not an auth cause:

- SDK 0.3.285 `sdk.mjs:140` implements `accountInfo()` as
  `(await this.initialization).account`. It returns the first initialization snapshot.
- Public `reinitialize()` sends another `initialize` request and returns its answer;
  it does not replace `this.initialization`. `sdk.d.ts:2956–2988` documents the
  first-connect versus fresh-response distinction, and warns that stdio
  reinitialization re-registers hooks and can cancel pending callbacks.
- `tests/int-sdk-account-snapshot-offline.mjs` uses the real SDK and an in-memory
  fake CLI. An ineligible first response and an eligible second response demonstrate
  that fresh-result account metadata and subsequent `accountInfo()` can differ.
  It asserts exactly two initialize requests, no user input and no native CLI launch.
  The supplied accounts are synthetic; no native subscription refresh is proven.

Read-only inspection of the installed Darwin-arm64 CLI 2.1.285's embedded source
also found the initialize response builder `Km` calling the synchronous selector
`f_e()` (account response at byte offset 201376846). That selector (178249576) takes subscription labels
from cached OAuth scopes/type; `ln()` (178225616) caches `V0()`'s credential lookup,
including null. Separate asynchronous credential-read functions exist. This is
source evidence of snapshot construction, **not proof of the observed auth cause**
or that reinitialization will resolve it. Offsets bind to CLI SHA-256
`51f09bd1e021d9fa8a1864c179799bd37cb39962a937935c5cf6823398e86db4`.
No real credentials, config files or Keychain contents were inspected.

Validation: 11 diagnostic guard units, 3 account/cache loopback integrations,
90 warming regression tests, the new SDK snapshot contract, typecheck and changed-file
LSP diagnostics passed. No new live calls, production query changes or qualification
promotion. A fresh account-only comparison would need separately approved scope;
inspect the returned `reinitialize().account` directly, not a repeated `accountInfo()`.
Even eligible metadata would not prove 5.5 cache reuse, expiry or tool-bearing safety.

**Fresh comparison executed once — account gate passed; sealed.** The distinct
`native-five-account-snapshot-1q-60s-v1` permitted one SDK start and 60 seconds for
first `accountInfo()`, exactly one `reinitialize().account`, then cached `accountInfo()`
in the same query. No user turn is ever yielded; all non-HEAD loopback HTTP is rejected
without body/header collection or forwarding. Settings, subscription recognition,
and production qualifications are unchanged. The query disables persistence, hooks,
memory and every resolved settings plugin; the synthetic cwd is cleaned only after
its detached process group exits. SDK/diagnostic errors never enter retained evidence.

Runner `diag/probe-five-account-snapshot.mjs`, owner
`diag/lib/five-account-snapshot-owner.mjs`, marker
`diag/five-account-snapshot-v1.approved.json`, ledger
`diag/five-account-snapshot-v1.live/`. The new runner refuses consumed ids and existing
allocations, and digests both verbatim-cache allocations plus the terminal-only
allocation before/after. Initial, fresh and cached sanitized snapshots are committed
in order, including partial evidence if fresh initialization fails. No restart mode.
Offline regression failed first with `initial snapshot missing`, then passed after
adding the comparison. A fourth missing-stage snapshot was also refused test-first.
Six new owner/collector units and two actual-SDK loopback integrations pass; reused
predecessor tests, typecheck and changed-file LSP also pass. Independent static
security review found no concrete blocker; native reinitialize hook/plugin effects
were not separately measured beyond the retained disable flags and offline profile.

The code-bound live run hash is
`2077a69a8ae51dcb6f9282a4285bcbefca780d4d4117dd6eb0a821a73246eb91`.
Its seven journal records end `complete`, exit 0, with **1 reservation / 1 SDK start**,
no invocation uncertainty, **zero input / blocked HTTP / model HTTP / forwarding**,
and a 2482 ms journal interval (not cleanup-inclusive). Initial, fresh and cached
snapshots all report `eligible: true`, lane `["firstParty","Claude Team",null,null]`.
Main independently checked all counters, snapshot order and the three prior digests.

This proves the public account gate can pass in this supervised real-HOME,
reviewed-env, synthetic-cwd setup. It does **not** prove that reinitialization repairs
the earlier failures: the initial account was already eligible. The difference from
the earlier runs remains unisolated; this query also explicitly disabled persistence,
and runs occurred at different times. No credentials/config were inspected or edited,
no auth override was introduced, and production account logic remains unchanged.
The one-start allowance is consumed and non-resumable. A new bounded model diagnostic
requires separate approval; there is still no new Sonnet/Opus 5.5 cache-hit, expiry or
tool-bearing evidence, and neither model is qualified.

**Production qualification:** exactly one lane is enabled in
`PRODUCTION_QUALIFIED_WARMING_MODELS`, from the v3 Haiku evidence. The lane is
`budget-max-tokens-tiny-prompt-v2`, `claude-haiku-4-5` (CLI model identical), SDK 0.3.285,
CLI 2.1.285, `firstParty`/`list`, account lane `["firstParty","Claude Team",null,null]`.
Pro, Max and Enterprise accounts, other models and any SDK/CLI bump stay off until
measured. Only one account's Team lane was measured.

**v3 as prepared:** `native-cache-3m-16q-25m-v3` covers `claude-haiku-4-5`,
`claude-sonnet-5-5` and `claude-opus-5-5`, which runs as `claude-opus-5-5[1m]` under the default
long-context settings. The budget is 16 SDK starts: 3 × 2 matrix, plus 2 Haiku expiry comparisons × 5. The
hard stop is 25 minutes. It runs on SDK 0.3.285 / CLI 2.1.285 and Pi 0.99.1, whose `cache-warmer.js` is
byte-identical to 0.87.1's. Order: Haiku matrix, then the Haiku expiry comparisons, then the Sonnet and Opus
matrix rows, because a worker failure ends the run. Marker `diag/native-cache-3m-v3.approved.json`, ledger
`diag/native-cache-3m-v3.live/`. The sealed ids v1 and both Haiku ids are refused.

**Fixed after v2 (offline proof only):** the refresh now sends the fixed turn
`REFRESH_PROMPT` (`.`). The offline actual-SDK test asserts it on the wire, and it
shows CC adds two small `<system-reminder>` blocks to that turn. The qualification key
tag changed to `budget-max-tokens-tiny-prompt-v2`, so v2 evidence does not qualify the
new refresh. The runner passes a row or comparison only if the refresh cache write is
<= 1024 tokens. A new live allocation must prove this.

**v2 as prepared:** `native-cache-haiku-12q-20m-v2`, with marker
`diag/native-cache-haiku-v2.approved.json` and ledger `diag/native-cache-haiku-v2.live/`.
Both sealed ids are refused. Before preparing it, one ordinary chat's sanitized
`init` line showed the refresh isolation inputs are clean under the real HOME: 0
plugins, only the bridge MCP server and its tools, and `apiKeySource=none`.

The v1 layout below is otherwise unchanged except for the dated-id fix: the runner targeted
`native-cache-haiku-12q-20m-v1`: `claude-haiku-4-5` only, at most 12 SDK starts and
20 minutes. It records to its own marker `diag/native-cache-haiku.approved.json` and
ledger `diag/native-cache-haiku.live/`. The sealed `native-cache-40q-40m-v1` files
are untouched, and that id is refused.

Live arms keep the real HOME and the reviewed parent env, like the ordinary chat
that passed the account gate. Only the cwd, TMPDIR and Pi agent dir are synthetic.
The protocol is unchanged: seed plus refresh, then two warm-versus-control expiry
comparisons. The worker scans only the arm's own `~/.claude/projects/<arm>`
directory, never all of `~/.claude`. Cleanup moves to Trash only the project
directories named after this run's unique temporary root. The live-only branches
(real-HOME transcript scope, cleanup) have unit coverage but no end-to-end
offline exercise.

Command, UNEXECUTED:
`env -u CLAUDE_AGENT_SDK_VERSION node diag/qualify-native-cache-warming.mjs --live native-cache-haiku-12q-20m-v1`

**Latest:** an ordinary provider chat reported `Claude Team`, `eligible=true`, so
the account gate passes in real use and the probe layouts caused the ineligible
results. Earlier, a fourth, ordinary-environment account check (full reviewed parent env,
repo cwd, default settings sources) was refused **before any SDK start**. The
user settings tier holds 10 top-level keys that `preflightRuntime()` does not
support. The ordinary provider runs the same preflight on default sources, so
with these settings native warming is refused in ordinary use regardless of
account eligibility. See [the account probe record](NATIVE-CACHE-ACCOUNT-PROBE.md).

After independent offline acceptance, task21 ran the **separately authorized
account-only probe once**; [account observation and audit](NATIVE-CACHE-ACCOUNT-PROBE.md).
The HOME-default layout omitted `CLAUDE_CONFIG_DIR` but still returned
`eligible: false`, lane `["firstParty",null,"none",null]`: **1 SDK start, zero input,
model HTTP or forwarding**, journal-observed interval **2397 ms** (60 seconds was
the limit). Its observation completed but exited 1 for ineligibility. That separate
one-start allowance is consumed and non-resumable; it did not resolve eligibility
or prove the auth cause. It does not reopen the sealed native allocation below,
qualify a model or enable warming.

After separate task23 acceptance, task24 consumed
`native-cache-account-normal-home-1q-60s-v1` once: reviewed parent HOME,
`settingSources: []`, and fresh synthetic TMP/cwd/Pi state. It also returned
`eligible: false`, the same lane, **1 SDK start and zero input/model HTTP/forwarding**.
Its four-record audit reports observation complete, exit 1, journal interval
**2460 ms** against a **60-second limit**. Main verified the accepted code hash
and 30 protected files unchanged. That allowance is now sealed too; none of the
three allocations authorizes another call. Changing HOME and settingSources
together did not resolve eligibility or identify the cause. See the account probe
document for evidence and the filesystem-settings versus global-login limitation.

**Historical state at the original 40-start run:** native warming was disabled for
every model; production qualifications were empty. The later Haiku qualification
above supersedes this historical state.
One approved live invocation exited **1**, final status **failed**, on SDK
**0.3.280**, bundled CLI **2.1.280**, Pi **0.87.1**, Node **24.11.0**.
The **40-start / 40-minute allocation is sealed**, not resumable:

| Observed boundary | Result |
| --- | --- |
| Reservations / SDK starts | **1 / 1** (first matrix seed: `claude-fable-5`) |
| Model HTTP attempts / forwarded requests | **0 / 0** |
| Public account gate | `eligible: false`, lane `["firstParty",null,"none",null]` |
| Completed sources / refreshes / expiry comparisons | **0 / 0 / 0** |
| Per-request usage evidence | None from this live run |
| Model coverage | **12 unverified**; the other **11 unattempted** |
| Journal-observed interval | **2748 ms**, not cleanup-inclusive runtime |

The pre-input `accountInfo()` snapshot in isolated HOME/config (with explicit
synthetic `CLAUDE_CONFIG_DIR` at that failed attempt) did not pass the bridge's
subscription gate. This does **not** prove that the user has no subscription,
that a later model request would have failed to authenticate, or that Fable is
unsupported; see [what `accountInfo()` does and does not show](NATIVE-CACHE-ACCOUNT-PROBE.md#what-accountinfo-does-and-does-not-show).
Further auth investigation requires separately reviewed scope; no credential-copy
or auth-routing workaround is authorized. All subsequent live work is stopped.
There are 39 mathematically unused starts, but **no authorized restart, resume,
reset, new ledger or further calls**.

Main independently inspected the retained append-only
[`events.jsonl`](native-cache-qualification.live/events.jsonl) and
[`evidence.jsonl`](native-cache-qualification.live/evidence.jsonl).
Approval ID: `native-cache-40q-40m-v1`; the retained marker is owner-only **0400**.
**HISTORICAL failed-run approved code hash, no longer current:**
`5c8be6b6243af92d21e488e1aae60286c28deb2fd371c05ab9ee765a18357690`.
The bounded REPAIRATTEMPT9 source correction below changes the code, not this
retained approval. Marker and ledger remain unchanged; do not regenerate, reset
or rerun them. Neither offline passes nor candidate evidence promotes production rows.

The original parent environment was refused by the guard. The user explicitly
approved a clean child after main reviewed 66 removed shell/Pi-metadata key names
and preserved only runner-accepted keys. No guard was weakened, auth override
added, credentials copied or user config edited. Structural readiness passed;
that was not auth proof. The first public account gate then failed as recorded above.

The historical `probe-cache-warming.mjs` used a **separate, exhausted 12-query /
20-minute allocation**. Its two SDK-only Haiku expiry successes are preserved in
[CACHE-WARMING.md](CACHE-WARMING.md), not native qualification or permission to rerun.

## Bounded REPAIRATTEMPT9 — offline metadata correction, not live recovery

The authorized account-only repair now recognizes the installed stored-subscription
shape: first-party backend, exact **Claude Pro / Claude Max / Claude Team /
Claude Enterprise** label, and omitted/undefined `tokenSource` and `apiKeySource`.
The former lowercase `max/oauth/none` fixture was invented and is now explicitly
rejected. Missing/unknown/API/free plans, non-first-party backends, token overrides,
API-key sources (even literal `none`), empty/null source values and contradictory
metadata remain ineligible. The separate init `apiKeySource: "none"` gate is unchanged.

Static provenance: installed SDK **0.3.280** `sdk.d.ts:23–32` declares optional
account fields; read-only CLI **2.1.280** embedded-JS excerpts at byte **173041917**
(`Gde` / following `ERt`) construct/map optional account sources, and byte
**173038591** (`JLn`) maps stored plans to display labels (default **Claude API**).
No real stored-subscription account was observed. Positive account literals in
the offline fixtures now simulate that source-derived public contract, **not
runtime qualification**. Actual raw fake-key SDK accounts remain rejected.

The sealed failed lane had **no subscription label** and still fails the corrected
gate. Therefore this defect does **not** establish the cause of that live failure
or make the existing isolated-auth path pass. Documented `CLAUDE_CONFIG_DIR`
credential-store isolation was a **separate, runtime-unproven hypothesis** at
repair acceptance; that repair used no credential access, storage override, auth
workaround or live probe. The later task21 HOME-default observation omitted that
override and still returned the same ineligible lane. Omission alone did not
resolve eligibility in the tested layout; the actual auth cause remains unknown.

[Repair evidence and exact commands](BRIDGE-WARMING-INTEGRATION.md#authorized-task9-repairattempt9--stored-subscription-metadata-offline-green):
focused literal contract RED **5/15**, matched GREEN **15/15**. Main independently
inspected the repair and reran **98/98** policy/warming/SDK, **18/18** native/retention,
**25/25** runner and **353/353** full unit tests, with clean typecheck/diff and LSP
diagnostics. Fingerprint/lane, snapshot, init/runtime/policy/usage, cancellation
and failure-suppression gates remain. This accepts the offline correction, not
real authentication or live qualification; historical failed-run evidence is unchanged. Production
qualification stays **empty**; native warming stays **disabled**; the failed
allocation is **sealed**, with no new allocation or calls authorized.

## Task19 — HOME-default diagnostic candidate, authentication untested

Under explicit **“Approve offline harness work”** approval, the diagnostic layout
now distinguishes its existing closed boolean modes. The **authored-only live
candidate** creates fresh synthetic HOME, `HOME/.claude`, cwd and Pi agent state,
but omits `CLAUDE_CONFIG_DIR`. The **offline SDK fixtures still always set an
explicit synthetic `CLAUDE_CONFIG_DIR`**, with fake-key loopback auth, keeping
those actual SDK/CLI runs out of the normal Keychain namespace. Neither mode
copies ambient credentials, caches, proxies or private storage controls. Parent
guards still reject inherited `CLAUDE_CONFIG_DIR` and
`CLAUDE_SECURESTORAGE_CONFIG_DIR`; no private storage override was introduced.
Worker layout validation requires the expected arm HOME/cwd/Pi paths and mode's
config policy before observation/query setup. Transcript bookkeeping now covers
the explicit offline root or synthetic `HOME/.claude`, retaining the recursive
JSONL file map and source-byte hashes, including other/new transcript files.

The [official authentication documentation](https://code.claude.com/docs/en/authentication)
describes a different credential namespace when `CLAUDE_CONFIG_DIR` differs.
Omitting it may permit normal credential discovery while filesystem settings
remain synthetic. This is a **hypothesis only**, not an observed account or auth
repair. **No HOME-only SDK query, CLI, accountInfo, initializationResult, login,
Keychain access or model request was executed.** The failed attempt above used
the previous explicit-config layout; its evidence does not describe this new
candidate. The post-metadata-repair code hash
`6235be70994dff0bb6cf30d0febf7a3ec895fe6673616772bb6742f19f83da88` is also now
historical, not a new approval. The retained approval marker and sealed allocation
remain byte-unchanged: **1 SDK start / 0 HTTP / 0 forwarded**, no reuse/reset and
no authority in the 39 unused slots.

Verified without HOME-only SDK startup:

- Pure assembly tests prove both layouts, empty synthetic settings/project
  directories, the exact environment key set, unchanged parent environment and
  refusal of absent/non-boolean modes.
- A disposable Node child blocks child-process launch APIs **before SDK import**,
  plus network APIs and non-fixture/credential file reads. It invokes only the
  real public `resolveSettings` and production runtime preflight: blank synthetic
  HOME resolves no settings; synthetic user/project settings are discovered at
  their default paths with ordinary `settingSources: undefined`; actual resolved
  hooks are rejected without executing a hook. No fabricated resolver output or
  `settingSources: []` hides policy. System managed-policy discovery remains
  real; attempted policy-helper/plutil launches would fail this check, not run.
  Observed launch/network/forbidden-read attempts were all **zero**. These are
  in-process API guards, not an OS sandbox or proof of real managed-policy/auth
  behavior. Only the public resolver is exercised, not the candidate live path.
- The same guarded child checks worker layout rejection and transcript map/hash
  sensitivity without initializing the worker or simulating live subscription
  proof. Actual fake-key SDK/native regression paths retain their existing
  account literals and raw fake-key account rejection.

Task19 TDD/validation (commands run sequentially):

```sh
node --test --test-name-pattern='synthetic layout' tests/unit-native-cache-qualification.mjs
node --test --test-name-pattern='HOME-only public resolver' tests/int-native-cache-qualification-offline.mjs
node --test --test-name-pattern='synthetic layout|HOME-only public resolver|ambient controls|unsafe inherited' tests/unit-native-cache-qualification.mjs tests/int-native-cache-qualification-offline.mjs
node --test tests/unit-native-cache-qualification.mjs tests/int-native-cache-qualification-offline.mjs
node --test --test-name-pattern='deadline-active' tests/int-native-cache-qualification-offline.mjs
node --test --test-concurrency=1 tests/unit-native-cache-qualification.mjs tests/int-native-cache-qualification-offline.mjs
npm run test:unit
npm run typecheck
# node --check on the changed runner, worker, two test files and focused helper
# git diff --check; before/after SHA-256 integrity comparison
```

Layout RED **0/2** failed on the existing explicit live override and missing mode
validation; matched GREEN **2/2**. Transcript-path RED **0/1** failed because the
missing override supplied an undefined directory; matched GREEN **1/1**. An earlier
child `tsx` import-resolution setup error was fixed with an absolute module URL
and is **not** counted as RED. Focused checks passed **5/5**. Two default-concurrency
combined runs passed **27/28**, each hitting the documented `deadline-active`
15-second watchdog with empty stderr. Isolated deadline coverage passed **1/1**;
the fully serialized file run passed **28/28**, without changing any watchdog,
guard, budget or transport implementation. Full unit suite **355/355**, typecheck,
syntax and whitespace checks passed. No percentage-coverage script is configured;
changed layout branches, default settings discovery, unsafe hooks, transcript
changes and the existing offline regression matrix are covered. Source, existing
harness, budget/transport, dependencies, marker and live-ledger hashes stayed
unchanged. Existing dirty work was preserved. Main independently inspected the
layout and resolver guards, passed the unchanged **default-concurrency 28/28**
command and **355/355** units plus typecheck/diff, and reconstructed the pre-layout
code digest in memory to verify that production, budget and transport were unchanged.
The two earlier watchdog failures remain part of the record.

This is diagnostic filesystem-isolation evidence, **not working authentication,
subscription eligibility, native cache/TTL proof or qualification**. User-facing
warming remains disabled and production qualifications empty. Any future actual
public account observation requires separate explicit bounded authorization;
none is granted here.

## Entry points and authorization

```sh
node diag/qualify-native-cache-warming.mjs
node diag/qualify-native-cache-warming.mjs --readiness
node diag/qualify-native-cache-warming.mjs --offline
```

Default/readiness import no SDK and cannot spawn a worker, authenticate, or send
model/network requests. They check arguments and the **inherited** environment,
then print the fixed cohort, allocation existence, and `markerRequired`. This is
structural readiness, **not** proof of subscription availability or safe settings.
Unknown arguments, overrides, and unsafe ambient state refuse before SDK startup.
There are no endpoint, model, quota, clock, or retry override flags.

The offline command uses disposable HOME, Claude config, Pi agent directory and
cwd, fake API-key auth, actual SDK/CLI and actual provider/native code. Only this
explicit mode substitutes subscription account/init metadata; a real fake-key
account is first asserted ineligible. It has no forwarding path. Its artifacts
say `offline-simulation`, `simulated-pass`, zero forwarded requests, zero
production qualifications, and no TTL proof. Tests additionally invoke an
exported **offline-only** temporary-root fixture to exercise faults and simulated
expiry; it cannot select live mode or the real ledger.

### Historical first-invocation procedure — completed, not permission to rerun

The original procedure required independent code/offline acceptance, an ambient
allowlist review and structural readiness, then an exclusively created **0400**
approval marker binding the fixed allocation limits to runner/helpers, all
`src/*.ts` and `package.json`. The ledger had to be absent before that first
invocation. Those first-run preconditions no longer apply: the approved invocation
has occurred and the allocation tombstone exists. Preserve both
`diag/native-cache-qualification.approved.json` and
`diag/native-cache-qualification.live`; do not delete, rename, recreate or reset them.

There is **no restart/resume/reset command**. The failed first query terminated
the allocation despite unused quota. The six spare follow-up slots were unused;
there was no blind retry or automatic follow-up. No extra unmetered auth query is
permitted. Subscription availability in isolation remains unresolved; the public
SDK account check failed before model input release. Managed/unsafe policy also
refuses before SDK spawn; source `settingSources` remains **undefined**, not `[]`.

## Fixed design and intended evidence — live coverage incomplete

Cohort (never enlarged by model catalog discovery):

- claude-fable-5, claude-fable-5-1, claude-haiku-4-5
- claude-opus-4-5, claude-opus-4-6, claude-opus-4-7, claude-opus-4-8
- claude-opus-5, claude-opus-5-5
- claude-sonnet-4-5, claude-sonnet-4-6, claude-sonnet-5

The parent owns a single fsynced, append-only budget journal. Exclusive directory
creation is an irrevocable allocation tombstone. Reservations are persisted
**before** SDK invocation; SDK startup attempts, observed model HTTP attempts,
and forwarding attempts are separate counters. Startup/forwarding counts are
conservative attempted operations: a failure immediately after durable permission
can burn a slot without starting a process or putting bytes on the network.
Partial writes poison the owner and cannot grant another start. No restart can
reset counters or the start time. Wall-clock regression, monotonic expiry, signal,
error, and deadline stop children; process groups cover SDK descendants. Children
also check the absolute deadline before SDK invocation and have query watchdogs.

Original fixed partitions (only one matrix seed start was consumed):

- **24 maximum**: one ordinary seed and one native refresh for each of 12 models.
- **10 maximum**: two independent five-call warm/control comparisons, choosing
  Haiku if its matrix row passes, otherwise the first passing cohort model.
- **6 maximum spare**, never automatically scheduled or used by this command.

The runner's unexecuted live expiry design creates two different child/session
owners per repetition. It seeds warm/control arms, invokes the installed native timer callback around warm-seed
request start +240 seconds, then issues ordinary followups after both original
seeds +366 seconds. Each arm has a nonce in the frozen sentinel tool description
**and** prompt, plus substantial synthetic prefix content. No global coordinator
is shared across arms. Exact request-start-relative times are retained. Passing
comparison checks require warm reads covering seed `cacheRead + cacheWrite`,
control reads **zero**, original expiry passed, and warm followup before the
refresh itself expires. Anything ambiguous is inconclusive. This is two repeats
for one selected model, **not a per-model expiry experiment**. No one-hour
experiment or Pi horizon change occurs.

Workers activate the actual extension, capture the prompt, invoke the registered
`streamClaudeAgentSdk`, and wait for its actual completion snapshot. They never
construct a source or call coordinator `complete()`/`runIsolatedRefresh()`.
Only the exact completed-source qualification key enters a worker-local set.
Installed Pi `CacheWarmer` supplies its zero-price `stop` decision, the registered
handler's consent override, reserved `maxTokens: 1` / `maxRetries: 0` dispatch,
and native usage entry. Its callback is invoked diagnostically for timing; this
is not a new production scheduler or a full Pi UI/session application.

A real native `stop` is recorded as `native-rejected`, with no refresh startup,
no retry and no alias/backend/pricing patch. Other errors stop the run and leave
unverified models explicit. All candidate evidence still requires main's
independent acceptance. Neither `candidate-pass` nor an offline fixture promotes
anything; the production set remains empty. The user closed this effort with
warming disabled, not with authorization to promote a model.

Each completed candidate records actual model/CLI variant, SDK/CLI/Pi versions,
served/canonical model, backend, pricing basis, derived account lane, runtime and
settings hashes, thinking-off and five-minute wire TTL, exact system/tools/input
prefix hashes, one refresh request/output token, provider stream and native
per-request usage, and source-byte/file-map preservation. Ordinary followup
writes are explicitly distinguished from maintenance. No cumulative SDK
`modelUsage` token totals stand in for request usage. Source baseline cached
tokens exclude uncached input. Hook-free public runtime preflight occurs before
**every** SDK spawn, and a hook setting test proves zero startup. No Pi tool
executor is run; tool-use stream events are rejected. Source transcript/file-map
checks cover absence of persisted forks.

All Pi model prices remain **zero** and subscription quota savings remain
**unknown**. The refresh SDK dollar budget is a **post-response stop trigger**,
not a hard monetary ceiling or a universal single-request guarantee.

## Observer and isolation boundary

The SDK constructs every request. Per-query URL IDs map to parent-owned query
IDs, including concurrent arms. A second HTTP attempt is durably counted and
blocked **before forwarding**. SDK retries are disabled; the observer uses
`node:https` without retry, redirect, request reconstruction or response replay.
Live forwarding is fixed to `https://api.anthropic.com/v1/messages` and retains
original body bytes, query string, and end-to-end headers, removing only routing
Host/hop-by-hop headers. Response bytes/encoding/headers are forwarded unchanged;
usage parsing decompresses only an observation copy. No auth header is extracted
or retained. API-key transport is refused; actual public `accountInfo()` must
establish a subscription lane before the original streaming input is released.

The only declared live SDK-option instrumentation is loopback observer routing
and `CLAUDE_CODE_MAX_RETRIES=0`, the observer's no-retry transport guard. Source
settings, settingSources, model, thinking, tools and output controls are not
rewritten. Original source runtime must hash-identically to the wrapper's real
public pre-spawn resolution. Offline additionally supplies its explicit fake key
and simulated account/init lane, never reachable through live failure fallback.
Production and observer guards are retained, not weakened to admit a model.

Inherited auth/routing/proxy/wrapper/cache/pricing/output/control overrides are
rejected **before** synthetic environment construction. Unknown environment keys
also refuse; exact bridge/SDK-owned values have narrow exemptions. Synthetic Pi
configuration uses `PI_CODING_AGENT_DIR` and synthetic cwd (covering project
`.pi/claude-bridge.json`), rather than assuming HOME alone isolates Pi config.
Claude filesystem config/HOME are synthetic and normal provider setting sources
remain unchanged. The current authored-only live candidate uses HOME-default
config discovery; the historical failed run and all actual offline SDK fixtures
use an explicit synthetic config override. Public `resolveSettings` plus production `preflightRuntime` reject
hooks/helpers/managed controls before a query can spawn. Auth availability is
never repaired by looking at or changing user credential/config files.

Only sanitized budget/evidence journals survive. Account, wire hash/shape and
response usage observations are fsynced before input release/forwarding/SDK
response delivery respectively. Raw account IDs, auth headers, prompts and
environment values are never diagnostic artifacts. The SDK's necessary transient
synthetic source transcripts exist during immutability checks and are removed,
with scratch configuration, after worker/process-group shutdown. Missing response
or usage evidence remains missing, not a guessed pass.

## Offline coverage map

| Boundary | Offline coverage | Live status / remaining gaps |
| --- | --- | --- |
| Entry guards | Default/readiness; unknown/malformed flags; unsafe inherited controls; no live allocation created by offline tests | Actual parent refusal and explicitly approved clean-child readiness observed; not auth proof |
| Approval | Temporary immutable marker; missing/writable/corrupt/changed-budget/changed-hash/symlink rejection | Real approved 0400 marker retained; live allocation sealed |
| Durable budget | Fixed 24/10/6 partitions and total 40; fsync fault; burned reservation; separate counters; clock regression and monotonic deadline | Actual 40-minute live elapsed run |
| Ownership/restart | Corrupt/exhausted/running tombstones; two competing subprocess owners, one winner; every attempted restart refused | No recovery path is implemented |
| Cleanup | Simulated deadline before startup and while an actual fake-key SDK query is parked; per-worker/group teardown; fixture process exits bounded | Real external termination while live HTTPS is in flight |
| Preflight/account | Actual public settings resolution rejects hooks before startup; actual fake API-key account rejected with 1 SDK / 0 model requests | First live public account gate failed before input; subscription availability/cause and real managed policy remain unproven |
| HTTP/no retries | Actual SDK sees synthetic 503: 1 start / 1 attempt, no retry; deliberately injected second loopback attempt blocked, separate count; 0 forwarded requests | Official HTTPS forwarding, real auth headers, compression and upstream failures are authored but **not executed** |
| Provider/native | Real ordinary provider, capture, immutable completion, native zero-price consent/replay/usage; actual native refusal branch remains refusal | Each cohort model's real backend, canonical alias, budget guard, accounting and limits |
| Controlled arms | Two isolated five-call comparisons, distinct tool prefixes, source-preserving refreshes, ordinary followup writes; simulated backend warm hit/control miss | Real five-minute retention/expiry; no offline timing is TTL evidence |
| Sanitization | Durable hashes/shape/usage/derived lane only, explicit offline labels, scratch cleanup, production qualifications 0 | Main independently inspected retained failed-run artifacts; no live response usage exists |

The fake-key fixture is **not** subscription evidence. The simulated expiry
comparison dispatches without waiting and explicitly reports
`simulated-expiry-no-wait`; it is scheduling/control-flow proof only. Neither an
ordinary matrix pair nor a selected-model comparison establishes universal model
support. API-key, thinking-enabled, active-tool warming, one-hour expiry and
AskClaude remain out of scope.

## Independently accepted offline evidence at closeout

Main reverified **338 unit tests**, **83 focused policy/warming/actual-SDK
contracts**, **18 actual native/retention integrations** (including **15 lifecycle
scenarios** and the post-account settings race), and **25 qualification-runner
checks**, plus typecheck, diff and LSP checks. Suites overlap; counts are not a
single combined total. The actual SDK runs against loopback with fake API-key
auth, explicit subscription-metadata simulation and source-derived test-local
qualification. Source/no-fork/tool isolation and native per-request usage proof
are **offline only**, not real subscription qualification or expiry evidence.

One worker runner-check run under concurrent load passed **24/25**: the
`deadline-active` subprocess hit its 15-second watchdog and produced empty stderr.
Unchanged isolated worker and main reruns passed **25/25**, with no timeout or
guard relaxation. This load-sensitive failure remains part of the record.

[Actual Pi 0.86.1 compatibility](PI-086-COMPAT.md) passed a scripts-disabled,
isolated exact-package fixture using a fake SDK on Node 24.11.0. It proves bounded
ordinary-provider/summary contracts, not live warming or Node 20 support; those Pi
packages require Node >=22.19.0. No dependency or engines change is implied.

See [BRIDGE-WARMING-INTEGRATION.md](BRIDGE-WARMING-INTEGRATION.md) for current
native/retention commands and preserved TDD history.

## Historical runner authoring validation and sequence

TDD boundary: created the unit assertions and a deliberately unimplemented budget
boundary first. `node --test tests/unit-native-cache-qualification.mjs` failed
**5/6** on missing behavior (no import/syntax failure); the identical command then
passed **6/6** after implementation. Additional marker/clock coverage brings it
to **8/8**. Integration was current-state authoring/verification, not mislabeled
production RED: its first positive run passed. Expanded fault fixtures initially
refused too early because parent/child temporary-directory roots differed;
preserving the test's TMPDIR fixed that **fixture-only** mistake. No production
defect or repair was encountered.

Commands actually executed (log redirection omitted):

```sh
node --test tests/unit-native-cache-qualification.mjs
node --test tests/int-native-cache-qualification-offline.mjs
node --test tests/unit-native-cache-qualification.mjs tests/int-native-cache-qualification-offline.mjs
node --experimental-test-module-mocks --import tsx --import ./tests/lib/setup.mjs --test tests/int-bridge-warming.mjs tests/int-cache-policy-sdk.mjs tests/int-bridge-warming-lifecycle.mjs
node --import tsx --import ./tests/lib/setup.mjs --test tests/unit-cache-policy.mjs tests/unit-cache-warming.mjs tests/int-cache-warming-offline.mjs
node --import tsx --import ./tests/lib/setup.mjs --test tests/unit-*.mjs
./node_modules/.bin/tsc --noEmit
node --check diag/qualify-native-cache-warming.mjs
# Also node --check on all three new helpers and both new tests.
git diff --check
```

Final focused runner suite: **25/25** (8 unit + 17 integration). Existing native,
retention and lifecycle regressions: **17/17**. Existing focused cache/SDK
contracts: **77/77**. Full unit suite: **332/332**. Typecheck and syntax/whitespace
checks pass. No repository percentage-coverage script or worker LSP tool is
configured; meaningful branches and remaining gaps are listed above. Pi 0.86.1
ordinary-provider compatibility is inherited main-verified evidence, not newly
installed or rerun here.

During that historical runner-authoring phase, no production, historical probe,
existing harness, credential/user config, dependency/lock or product documentation
was edited; existing dirty work was preserved. The later independent checks and
sealed live failure are recorded above. Product documentation now closes out the
effort with warming disabled; no promotion or further live work is authorized.
