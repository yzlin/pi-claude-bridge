# Account-only SDK observations

## Ordinary chat passes the account gate

One ordinary provider chat was run at the user's request: checkout extension
only (`pi -ne -ns -e ./src/index.ts --no-session`), `claude-haiku-4-5`, one
prompt, in a fresh herdr pane, with `CLAUDE_BRIDGE_DEBUG=1`. It replied
normally. The new sanitized debug line reported
`lane=["firstParty","Claude Team",null,null] eligible=true`. Only that line was
read, and the temporary log was then deleted.

So the stored subscription login is visible to `accountInfo()` in ordinary use,
and the account gate accepts it. The three ineligible probe results came from
the probe layouts: synthetic HOME in the first, and a 4-key env allowlist plus
detached process in the second. Which of those differences mattered is not
isolated. The remaining blocker is the settings preflight described below.

## Ordinary-environment result — refused before start by settings policy

The ordinary-environment candidate below ran **once** after main acceptance
(code hash `f5d56c1863a52f7798b70b8f76f9f78af7cea737b7dfe4a42a8f57ab63d51aea`).
The only change to the parent environment was unsetting `CLAUDE_AGENT_SDK_VERSION`.
The host harness had set it to a value other than the installed `0.3.280`. The
SDK sets this variable itself, and earlier accepted work treats absence as
equivalent. The two-record [audit](native-cache-account-ordinary.live/events.jsonl)
ends `failed` with **0 reservations, 0 SDK starts**, zero HTTP/input/forwarding,
and a 1673 ms journal interval. No Claude Code process launched and no
authentication occurred. No account lane was observed.

Cause, confirmed afterwards with the public resolver only (network blocked, no
SDK start, sanitized to tier and count): default `settingSources` load the
**user** settings tier. It has **10 top-level keys** outside the five that
`preflightRuntime()` supports (`autoMemoryEnabled`, `disableAllHooks`,
`includeGitInstructions`, `claudeMdExcludes`, `promptCacheTtl`), so the preflight
returned `unsupported runtime control` before permission.

**Production consequence:** the ordinary provider also resolves default sources
and runs the same preflight (`src/index.ts:1822`). With these user settings,
native warming is refused in ordinary use **independently of account
eligibility**. The account question was never the only blocker. The allocation
is sealed by design and the unused start grants no retry.

## Ordinary-environment candidate

The distinct one-start/60-second candidate (consumed above):

- approval ID: `native-cache-account-ordinary-1q-60s-v1`
- owner-only code-bound marker: `diag/native-cache-account-ordinary.approved.json`
- exclusive audit tombstone: `diag/native-cache-account-ordinary.live/`

The live arm now matches the ordinary provider more closely: it passes the full
reviewed parent environment through unchanged, runs at the repository cwd, and
omits `settingSources` from both `resolveSettings({cwd})` and query options so the
SDK uses its default user/project/local sources. It calls only `accountInfo()` on
the one query, matching the per-query account call at `src/index.ts:1843`; it
never forwards input or iterates the model stream. Before allocation or spawn,
every parent environment entry must pass the existing strict environment guard
when checked alone or belong to the frozen 66-name, user-reviewed shell/terminal/Pi
metadata set. Unknown controls and auth/config/storage/cache overrides are refused
without recording names or values. Default invocation and `--readiness` remain
SDK-free and use that same strict rule extended only by the reviewed metadata, so
readiness can run in the reviewed ordinary parent.

Live mode requires the parent and worker cwd to equal the repository root, keeps
parent `HOME` unchanged, requires `CLAUDE_CONFIG_DIR` absent, creates no synthetic
cwd/HOME/Pi/TMP state, and schedules no live filesystem cleanup. The worker repeats
the environment/layout checks. Default settings are resolved before permission;
user/project hooks, helpers, unsafe managed policy, and unknown controls fail
closed before the sole query can start, so user hooks never execute. Journal
controls identify `settingSources: "default"`, `homeMode: "ordinary-parent"`,
`cwdMode: "repo"`, and `envMode: "ordinary-reviewed"` without retaining paths or
environment names/values.

Remaining deliberate differences from an ordinary provider query are the detached
process group and its bounded kill tail, permanently withheld input,
`permissionMode: "dontAsk"`, no `--model` argument, and the reject-only loopback
`ANTHROPIC_BASE_URL`. Source inspection shows that base URL and the bare/no-model
mode do not affect the synchronous cached account predicate. Tools and MCP remain
empty, hooks are disabled again in flag settings, sessions are not persisted, and
the query is aborted/closed immediately after `accountInfo()`.

All three earlier allocations are sealed and are asserted and digested read-only
before this candidate can allocate: `native-cache-40q-40m-v1` (failed, one start,
zero HTTP/forwarding), `native-cache-account-1q-60s-v1` (complete but ineligible),
and `native-cache-account-normal-home-1q-60s-v1` (complete but ineligible, lane
`["firstParty",null,"none",null]`). Neither their markers nor audits are modified.

An observation can distinguish **“ordinary environment also has no stored-login
snapshot”** from **“probe layout caused it”**. It cannot prove request
authentication, identify an auth cause, or qualify a model/cache. No retry or model
request follows either outcome. Actual offline SDK fixtures remain synthetic:
explicit synthetic `HOME` and `CLAUDE_CONFIG_DIR`, fake key only, default settings
sources, and zero model input/HTTP. They prove that benign synthetic user/project
sources load and that a synthetic user `SessionStart` hook refuses before start
without executing.

Future exact command, **UNEXECUTED** pending main's independent code acceptance and
a fresh code-bound approval:

```sh
node diag/probe-native-cache-account.mjs --live native-cache-account-ordinary-1q-60s-v1
```

## Task24 normal-HOME result — complete but ineligible, no retry

After independent task23 acceptance, task24 invoked
`native-cache-account-normal-home-1q-60s-v1` **once**, retaining normal parent HOME
and using `settingSources: []`. Main independently inspected the sanitized report
and all four records in [the normal-HOME audit](native-cache-account-normal-home.live/events.jsonl):

| Observed boundary | Result |
| --- | --- |
| Invocation / exit code | **1 / 1** |
| Observation status / account eligibility | **complete / false** |
| Reservations / SDK starts / invocation uncertainty | **1 / 1 / false** |
| Account lane (provider, subscription, token source, API-key source) | `["firstParty",null,"none",null]` |
| Blocked HTTP / model HTTP / forwarded requests / input messages | **0 / 0 / 0 / 0** |
| Journal-observed interval | **2460 ms**; **60,000 ms was the limit**, not elapsed time |
| SDK package / Node / pre-input CLI runtime | **0.3.280 / 24.11.0 / not observed** |

This combination did not resolve eligibility. HOME and settingSources changed
together, so the observation does not isolate either factor, identify the auth
cause, or establish missing user credentials/subscription. No model/cache/TTL
qualification occurred. `complete` describes observation completion, not auth
success. The timestamp interval is not an independently timed whole-command run.

The owner-only **0400** marker and exclusive audit remain sealed. Accepted hash:
`0d7e4f30a73a3ab5162a67abc6bee88f15db5634416f622112831e1e11d85ca6`.
Main verified this code hash and **30 protected files** unchanged, including both
older allocations, production source and dependencies. All three allocations are
closed; there is no authorized retry, reset, new marker or further live call.

Task23 acceptance included main-run **17 probe units / 22 offline integrations /
372 full units / 28 existing runner tests**, typecheck, syntax, diff and LSP.
The authoring workflow returned no validated report; read-only recovery
`wf_1ab0cad48f8c` returned a validated safety report. Test-only repair1 removed
workspace-state assertions that would fail after legitimate audit creation.
Main reran **17/17** units both with simulated existing artifacts and after the
actual task24 allocation. No runtime guard was weakened.

## What `accountInfo()` does and does not show

Read-only source audit of installed SDK **0.3.280** / CLI **2.1.280**
(binary SHA-256 `387a5c5d…229d`); nothing was executed.

- **Verified:** `accountInfo()` returns the cached `initialize` response
  (`sdk.mjs` byte 968971). The headless print loop answers `initialize` through
  `Ow` → `Oy` (CLI bytes 193860088 onward), and `Oy` builds `account` from a
  synchronous `Gde()` call. Withholding the prompt does not delay this snapshot.
- **Verified:** `Gde()` reads cached/synchronous credential selectors. The same
  auth module also has async credential reads and 401 refresh/cache-reset paths.
  The public declaration (`sdk.d.ts:2960–2965`) promises account information,
  not credential validation or request readiness.
- **Correction:** an earlier trace cited CLI bytes 185961127–185961324
  (`_Me({account:ERt()})`) as the SDK path. That is the interactive caller; the
  headless engine at byte 193630739 passes no account argument.
- **Consequence:** the three observations show the pre-input snapshot failed the
  bridge's subscription gate. They do **not** show that a later model request
  would fail to authenticate, or that credentials or a subscription are missing.
- **Unresolved:** which credential selector the first-party model request uses,
  and when it refreshes, was not traced. Until it is, pre-input `accountInfo()`
  is unproven as an authentication-readiness signal, and no further live probe
  has a discriminating basis.

## Task23 implementation and offline evidence

The live candidate retains the exactly reviewed parent `HOME`, omits
`CLAUDE_CONFIG_DIR` and every private auth/storage override, and creates fresh
owned TMP, cwd and Pi-agent paths. Cleanup removes only the owned scratch root,
never normal HOME. Both public settings calls use `settingSources: []`: this
excludes user/project/local filesystem settings, **not** managed policy or normal
SDK global-config/stored-login access. The unchanged production preflight rejects
non-empty managed policy, hooks, helpers and unknown controls before permission.
This separation is account observation only; it does not qualify a model/cache or
isolate whether any result comes from HOME choice versus `settingSources`.

Actual offline SDK fixtures still use synthetic `HOME`, explicit synthetic
`CLAUDE_CONFIG_DIR`, and a fake API key. A guarded real-SDK fixture proved that
synthetic user/project/local settings were excluded and that its synthetic
`.claude.json` plus all three settings files remained byte-identical across the
fake-key `accountInfo()` branch. Static strings in the installed CLI show global
config machinery (`.claude.json`, `numStartups`, and locked config saves), but do
not prove that arbitrary settings writes occur before this SDK account boundary.
The OAuth/stored-login branch was not run during authoring; the fake-key result
cannot prove its write behavior. Stored-login access/refresh was allowed only in
the separately approved, now-consumed live execution. The probe itself never
reads, lists, stats, copies or edits real config/credentials. Real global-file
immutability and the SDK's actual credential-store/refresh operations were not
observed; the fake-key fixture does not establish those properties.

## Historical task21 result — consumed, no retry

**Task21 ran once after independent offline acceptance. No retry is authorized.**
Its synthetic-HOME/default-config candidate omitted `CLAUDE_CONFIG_DIR` but
returned the same ineligible account lane as the earlier isolated-config run.
This did not resolve eligibility; it does not establish a missing user subscription
or the auth cause. Production warming stays disabled; the production qualification
set stays empty.

Main independently checked the sanitized report and all four records in
[`events.jsonl`](native-cache-account.live/events.jsonl):

| Observed boundary | Result |
| --- | --- |
| Invocation / exit code | **1 / 1** |
| Observation status / account eligibility | **complete / false** |
| Reservations / SDK starts / invocation uncertainty | **1 / 1 / false** |
| Account lane (provider, subscription, token source, API-key source) | `["firstParty",null,"none",null]` |
| Blocked HTTP / model HTTP / forwarded requests / input messages | **0 / 0 / 0 / 0** |
| Journal-observed interval | **2397 ms**; **60,000 ms was the limit**, not elapsed time |
| SDK package / Node / pre-input CLI runtime | **0.3.280 / 24.11.0 / not observed** |

The final journal record follows the probe's cleanup path; its timestamps are not
an independently measured whole-command duration. `complete` means the observation
completed, not successful authentication or eligibility. SDK login access/refresh
was permitted, but this evidence does not establish which credential-store or auth
network operations occurred. No model/cache/TTL qualification was performed.

The historical owner-only **0400** marker and exclusive audit are retained,
non-resumable. Historical approved code hash:
`d6dda55c5a3a9b869cf5b5300d577cffbd26a2e4c0c3857ead2cbdb20596b5dd`.
The task23 adaptation changes the current code hash, so that approval no longer
describes current code and cannot authorize it. Main had verified the historical
accepted source hash and **28 protected files** unchanged. Both older allocations
remain closed; neither authorizes reset, retry or the new candidate.

Before this run, main passed **15 probe unit / 22 probe offline integration /
370 full unit / 28 existing runner tests**, plus typecheck, syntax, diff and LSP.
The authoring workflow returned no validated report; read-only recovery
`wf_ad5caab1597c` supplied a validated acceptance report without edits or auth calls.
Fake-key and simulated subscription fixtures remain offline evidence only.

## Consumed normal-HOME authority

`probe-native-cache-account.mjs` is fixed to the new normal-HOME ID and paths:

- `native-cache-account-normal-home-1q-60s-v1`
- `diag/native-cache-account-normal-home.approved.json`
- `diag/native-cache-account-normal-home.live/`

The retained marker is owner-owned regular **0400**, single-link and code-bound;
the audit directory is an exclusive durable tombstone. Any partial,
failed or completed allocation is consumed and cannot be reset/resumed. Approval
binds one SDK query invocation and 60,000 ms including cleanup, with zero input
messages and zero forwarded requests. It is not native qualification, model
generation, a refresh/expiry comparison, or authority to retry.

The current audit provenance records sanitized digests and terminal counters for
**both** sealed allocations. `native-cache-40q-40m-v1` is failed with **1 start / 0
model HTTP / 0 forwarded**. `native-cache-account-1q-60s-v1` is complete but
ineligible with **1 start / 0 model HTTP / 0 forwarded**. Their marker/journal
terminal states are asserted before a live allocation can be created; old files
are read only and never mutated. The historical 12-query feasibility allowance is
also exhausted. None of these records grants a start.

## Safety boundary

- Default and `--readiness` import no SDK, spawn nothing, perform no auth and
  create no allocation. Strict arguments; there is no offline/reset/resume CLI.
  The existing strict `guardEnvironment` runs **before** constructing a child
  environment or importing SDK. Nothing automatically cleans the parent env.
- Approval binds the main probe, its three helpers, reused guard/layout source,
  all `src/*.ts`, package/lock, SDK package metadata and public SDK declarations.
  Hash and marker are checked again before granting permission. Approval has a
  separate start-permission validity window (`approvedAt <= now < expiresAt`).
  It does not lengthen the allocation's 60-second wall/monotonic budget.
- The parent exclusively creates and fsyncs the tombstone/journal, then fsyncs a
  reservation **before** sending the child's sole query permit. `reserved` is
  distinct from observed `sdkStarts`. `invocationUncertain: true` means a permit
  was reserved but an actual invocation acknowledgement was not received; the
  slot is still burned. A synchronous `sdk.query` throw also counts as a start.
  Duplicate/concurrent starts, clock regression, expiry and persistence failure
  fail closed. No fallback, retry, reset, CLI version or unmetered auth probe.
- Live mode retains the validated parent normal HOME exactly while TMP, cwd and Pi
  agent state are fresh and owned; `CLAUDE_CONFIG_DIR` is absent. Offline actual-SDK
  fixtures retain synthetic HOME/config and fake-key auth. Both public
  `resolveSettings({cwd, settingSources: []})` and query options carry the same
  empty source list. That list disables user/project/local filesystem settings but
  still reads managed policy, which production `warmingRuntime`/`preflightRuntime`
  reject when unsafe before permission/query. No provider activation, model/source
  selection, custom executable, token injection or private auth/storage override.
  Tools/MCP are empty, hooks and memory disabled, and no prompt/system text exists.
- The async input iterator can only complete during teardown: it never yields
  any message, including an empty turn. Only `q.accountInfo()` is observed;
  never iterate `q`, request init, or release input to obtain `system:init`.
  Account completion immediately aborts/closes the query. Late completion cannot
  change status, release input, or start another query.
- The parent's loopback **reject-only** HTTP server is set through SDK
  `options.env.ANTHROPIC_BASE_URL` only, not the worker/parent ambient environment.
  HEAD connectivity can return 200. Every other request, malformed request,
  CONNECT or upgrade is blocked and fails the observation. Model-path attempts
  and all blocked attempts have separate durable counters. No body/header/URL
  retention, HTTPS forwarder, external forwarding or model SSE response exists.
  **This is not a claim of zero all-network activity:** future live normal SDK
  stored-login access/refresh can perform ordinary auth networking under the
  separate approval. The agent never reads/extracts/copies credentials.
- Parent and child watchdogs cover wall and monotonic time; parent starts from
  allocation creation, initiates shutdown at 59 seconds and allows at most one
  second for group SIGKILL. The child independently reserves its final 500 ms
  for group cleanup. Clock/deadline failure also forces group termination.
  SIGINT/SIGTERM, child failure and IPC disconnect cancel; detached process-group
  killing includes SDK descendants. Final output follows worker exit, group kill,
  server closure and synthetic-directory removal. OS scheduling/fsync cannot be
  made a hard-real-time guarantee. A crash leaves a non-resumable tombstone.
- Retained account data is only production-gate `eligible` and a bounded,
  allowlisted JSON lane (`other` replaces unknown values). Never retain raw
  account/email/org, headers, tokens, private error messages or stacks.
  SDK package/Node versions and preflight controls are safe metadata;
  `cliRuntime: null` deliberately does not invent pre-input CLI/init evidence.
  `status: complete` means observation/cleanup completed, **not** eligibility;
  an ineligible account still exits 1. Failed/uncertain/persistence-failed reports
  cannot establish eligibility. Zero `inputReleased` and `forwarded` are invariant.

## Historical task24 procedure — consumed, do not rerun

Main accepted the exact code and offline evidence, created the marker exclusively,
fsynced it and `diag/`, and authorized one execution. The following is historical
provenance, not permission to recreate a marker or rerun. The marker key order was:

```json
{"id":"native-cache-account-normal-home-1q-60s-v1","sdkStarts":1,"elapsedMs":60000,"codeHash":"<independently accepted readiness SHA-256>","approvedAt":0,"expiresAt":0}
```

The integer times defined only main's reviewed start window. Task24 ran the
accepted code from a reviewed guard-clean normal-HOME parent exactly once:

```sh
node diag/probe-native-cache-account.mjs --live native-cache-account-normal-home-1q-60s-v1
```

Main inspected the sanitized output/journal evidence and stopped after the
ineligible observation. No retry or model qualification follows.

## Historical task21 procedure — consumed, do not rerun

**The procedure below was executed once and is retained for provenance only.**
It is not permission to recreate an approval, remove the tombstone, retry, or run
another account observation. Main completed independent acceptance before the run.

1. Review the parent environment explicitly. Do not weaken the existing guard,
   blindly strip arbitrary controls, or add credential/storage controls. Readiness
   from that reviewed clean parent is:

   ```sh
   node diag/probe-native-cache-account.mjs --readiness
   ```

2. Verify the returned current source hash against the reviewed files and confirm
   the new audit/marker are absent and old failed allocation is unchanged. Only
   then create the new marker exclusively (`wx`, mode 0400), fsync its bytes and
   the `diag` directory. Do not overwrite an existing marker. Exact JSON key order:

   ```json
   {"id":"native-cache-account-1q-60s-v1","sdkStarts":1,"elapsedMs":60000,"codeHash":"<independently accepted readiness SHA-256>","approvedAt":0,"expiresAt":0}
   ```

   Replace the two zero placeholders with real integer epoch-ms approval and
   expiry timestamps defining main's reviewed start window. They are not an
   expanded runtime budget. No marker-writing utility is provided by this probe.

3. In the same reviewed clean parent environment, **task21 only**, run exactly
   once, without wrappers that retry:

   ```sh
   node diag/probe-native-cache-account.mjs --live native-cache-account-1q-60s-v1
   ```

4. Inspect only sanitized final output and `events.jsonl`. Require one observed
   start, no uncertainty, no blocked attempts/input/forwarding, complete cleanup
   and eligible account evidence before reporting account eligibility. Otherwise
   report the bounded blocker, stop, and preserve the tombstone. No auth-cause
   guesses, models promoted, retry, budget expansion or native qualification.

## Offline verification

```sh
node --test tests/unit-native-cache-account-probe.mjs
node --import tsx --test tests/int-native-cache-account-probe-offline.mjs
npm run test:unit
node --test --test-concurrency=1 tests/unit-native-cache-qualification.mjs tests/int-native-cache-qualification-offline.mjs
npm run typecheck
```

Tests create only disposable approvals/audits under `native-account-test-*`.
The offline exported entry validates that temporary root; live arguments cannot
select any simulation, fault injection or fake-key fallback. Guarded CLI tests
block SDK imports, subprocess launches and network. Observer mocks cover
eligible/ineligible/error/synchronous-throw/cancel/late completion, strict policy,
no input, close-before-result and secret sanitization. Supervisor fixtures cover
reject-only model HTTP, no external forwarding, durable reservation/start
accounting, duplicate permission, parent/child deadlines, signals/disconnect,
persistence failure and descendant cleanup. A real SDK withheld-account fixture
uses explicit synthetic config plus fake key; raw metadata is independently
rejected by the production gate, with zero model requests/input. It verifies both
empty settings-source calls, excludes synthetic user/project/local settings, and
checks that synthetic global/settings fixture files remain byte-identical. It
never starts a normal-HOME SDK or exercises OAuth/stored-login behavior.

### Task23 authoring evidence

The first unit command failed before test execution because the newly referenced
`accountArm` export did not yet exist; that module-contract/setup failure is not
claimed as a meaningful behavioral RED. The integration RED was meaningful:
**15/22 passed, 7 failed** because the observer still called both settings APIs
with default sources, causing six direct observer assertions and the guarded real
SDK settings fixture to fail. The identical focused commands then passed; final
focused totals are **17/17 unit** and **22/22 integration** after adding both old
marker-ID cases. One intermediate **15/16** unit run exposed only
a test-fixture comparison issue (`process.env`'s special object versus its plain
snapshot); comparing plain snapshots fixed it without changing behavior.

Additional sequential checks passed: the existing qualification runner **28/28**,
full unit suite **371/371**, typecheck, syntax, whitespace/diff checks, all **30
protected hashes**, and absence of the new marker/audit. There is no configured
percentage-coverage command; changed coverage includes old-ID refusal, live/offline
layout selection, settings-source equality and managed rejection before permission,
two sealed provenance rows, actual fake-key config immutability, accounting,
timeouts, sanitization and process-group cleanup. The installed CLI was inspected
statically with `strings`; no SDK/auth/CLI normal-HOME process ran.

### Historical task21 authoring evidence

Historical notes report failing authorization stubs (8 expected failures) and
failing observer behavior (7 expected failures), then matching GREEN commands;
supervised behavior also reportedly failed against a no-start stub before its
implementation. Main did not independently recover those RED runs; acceptance
rested on inspected code, independently rerun GREEN suites, and the read-only
recovery report. Later fixture corrections were not claimed as behavioral RED:
the clean fixture child needed explicit TMPDIR, macOS added the guard-accepted
`__CF_USER_TEXT_ENCODING`, and raw fake-key validation needed its evidence file.
No policy/auth boundary was relaxed to make those historical tests pass.
