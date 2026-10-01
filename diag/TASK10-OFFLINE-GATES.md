# Historical Task 10 offline prerequisite report — provenance repaired; remaining gates deferred

> Historical snapshot, not current qualification or pending work. Its empty-production
> and blocked-task statements describe that earlier phase. See [current native
> qualification](NATIVE-CACHE-QUALIFICATION.md), [integration evidence](BRIDGE-WARMING-INTEGRATION.md)
> and the [diagnostic index](README.md). The original repair evidence below is retained.

No live subscription/API queries were made. No live runner or new live ledger was
created. The exhausted historical probe and its reports were not modified.
The explicitly approved repair changes only the expected MCP server provenance
in `src/cache-warming.ts`; the production qualification set remains empty.
Task 10 is not complete and the live phase remains blocked on the gates below.

## Historical reproduction / preserved RED

```sh
node --import tsx --import ./tests/lib/setup.mjs --test tests/int-cache-warming-offline.mjs
```

Before repair, on installed SDK **0.3.280**, bundled CLI **2.1.280**, this exited **1** (reproduced again during this repair):

```text
measured SDK MCP provenance is accepted by the production isolation gate
clean SDK-created init with source:sdk is rejected by production isolatedSource
'stop' !== 'warm'
```

The actual source and fork `system/init.mcp_servers` both contain:

```json
[{"name":"custom-tools","status":"connected","source":"sdk"}]
```

`src/cache-warming.ts:isolatedSource` compared the entire array with
`[{name: "custom-tools", status: "connected"}]`. Consequently, a tool-bearing
source produced by this SDK was rejected even with test-local qualification and
subscription metadata. The regression exercises `CacheWarmingCoordinator.decide`
with this **measured** init. Its historical positive control changed only the MCP
array to the previous mocked shape without `source`; that control returned `warm`.

This was an implementation prerequisite, not a model qualification failure.
The original worker left repair to the main session. No production SDK observation
seam was needed for this prerequisite.

## Approved provenance repair / GREEN

The expected connected bridge-owned server now explicitly includes `source: "sdk"`.
The full shape is still compared exactly: provenance is not stripped or ignored.
Zero-tool sources still require an empty server array; exact tool checks and all
other gates are unchanged. Unit negatives start from an otherwise eligible,
test-locally qualified source and reject missing/unknown/config/plugin (also
user/project/local/managed/empty/null) provenance, wrong name/status, missing or
additional servers, plugins, and missing/wrong/additional tools.

The real-SDK command above was RED both before and after test updates, then GREEN
unchanged after the one-field production repair: **3 passed, 0 failed**. The measured
SDK shape is now the positive control and the missing-provenance legacy mock is
negative. The fake-key SDK fixture and separately labeled gate-only simulated
subscription boundary are unchanged; this does not qualify a subscription lane.

The GREEN run again observed two loopback model requests (caps `32`, `1`), two local
HEAD requests, zero tool calls, per-request usage `10/1/2048/32`, preserved source
bytes and prefix, and one transcript before/after with no persisted fork. Source
bytes: `7810`; source SHA-256:
`6c6de0a6499a61af78cb6c9c64c40a0c91f6841904d499b501fd71d0e2192066`.

## Checks completed before the failure

The test constructs one real SDK source query and one real SDK non-persisting
fork, using `src/prompt-stream.ts` and `src/mcp-server.ts`:

- Awaited public `accountInfo()` with streaming input withheld; zero model
  requests both immediately and after a further 200 ms for **each** query.
- Released exactly one user input per query. Captured wire caps were `32`, `1`;
  thinking absent/disabled. One model request each, no continuation. The server
  rejects unexpected additional attempts before responding.
- Fork ended at `error_max_budget_usd` after `max_tokens`; closed promptly without
  draining the SDK iterator past the terminal result.
- Per-request SDK event usage matched the fake provider's values exactly:
  input `10`, output `1`, cache read `2048`, cache write `32`. Fork result totals
  were cumulative (`20`, `2`, `4096`, `64`), **not** refresh request usage.
- Source JSONL bytes identical after refresh; one JSONL before and after, no
  persisted fork. Exact tool definitions, non-billing system blocks and original
  message prefix preserved after removing cache-control directives. Billing
  header excluded explicitly, not claimed stable.
- Zero MCP handler executions; no real hooks/config were loaded. Hooks disabled
  with empty SDK hooks and synthetic settings. This is not an adversarial hook
  execution test.
- Actual API-key `accountInfo()` returned
  `{"tokenSource":"none","apiKeySource":"ANTHROPIC_API_KEY","apiProvider":"firstParty"}`;
  production `accountEvidence` rejected it as ineligible.
- Init tools were `["mcp__custom-tools__sentinel"]`, plugins `[]`, and init
  `apiKeySource` was `ANTHROPIC_API_KEY`.
- Source and fork `modelUsage` both reported canonical model
  `claude-haiku-4-5`, provider **`firstParty`**, cost basis **`list`**,
  context window `200000`, max output tokens `32000`, thinking tokens `0`.
  This pins backend strings on this **offline API-key fixture only**, not the
  actual subscription lane. No aliasing or live-auth fabrication occurred.
- Two non-model requests were observed: `HEAD /api/hello`, answered locally.

Historical RED sanitized run: source bytes `7810`, source SHA-256
`1b29b31f9b6eb7a0e6920fc55eac23be350e6af41cf77f86cc5cdc809a01c75d`;
tool-definition SHA-256
`ba23db5ff362e6a6b73dad1a871ccb69488ecdef40ff7292b8fc3fe1fbfdc613`;
non-billing-system SHA-256
`5e1a5771120fbc5b357e1a7a3baaa1eb198adf92b843d978f2373de45adb20f9`;
original-message-prefix SHA-256
`05a7d85a6ee1898e497d9ef46983cf23102ee346e9f59c5e8ad0f9737f26c72b`.
Synthetic transcript ids/timestamps and thus source hashes change between runs.

## Fixture boundary

The SDK child receives an explicit environment, **not** `...process.env`: fake
API key, loopback-only base URL, synthetic HOME/config/cwd/TMPDIR, and traffic
suppression flags. No forwarding implementation exists. `settingSources: []`
and inline safe settings prevent loading user/project settings. Only PATH is
inherited. Temporary synthetic conversations are moved to Trash in `finally`.
The test prints only synthetic metadata, usage, hashes and stats, never headers
or raw bodies. Direct tests preload `tests/lib/setup.mjs` to isolate debug logs.

The coordinator gate test separately simulates subscription metadata and uses a
test-local qualification set. It performs no refresh dispatch and is **not**
normal `streamClaudeAgentSdk` integration, native Pi accounting, or evidence of a
live subscription account. SDK source/fork requests themselves use actual fake
API-key metadata without substitution.

## Other validation

```sh
node --import tsx --import ./tests/lib/setup.mjs --test tests/unit-cache-warming.mjs
# RED: 50 passed, 2 failed (SDK provenance rejected; tool-blocking fixture never reached query)
# GREEN: 52 passed, 0 failed
node --import tsx --import ./tests/lib/setup.mjs --test tests/unit-*.mjs
# 310 passed, 0 failed (historical pre-repair run: 309 passed)
node node_modules/typescript/bin/tsc --noEmit
# passed after repair
git diff --check
# passed after repair
```

The full unit suite includes CLI live-mode refusal guards; they reject before
any SDK query, not live success-path runs. No live calls were made.

Historically, existing SDK replay/cancellation/budget contracts ran with an isolated synthetic
environment (no old/new live success path):

```sh
fixture=$(mktemp -d /tmp/pi-task10-existing-offline.XXXXXX)
mkdir -p "$fixture/home/.claude"
env -i PATH="$PATH" HOME="$fixture/home" \
  CLAUDE_CONFIG_DIR="$fixture/home/.claude" TMPDIR="$fixture" \
  node --import tsx --import ./tests/lib/setup.mjs --test \
  --test-name-pattern='cache-warming SDK replay' tests/int-cc-contracts.mjs
# 3 passed, 0 failed
trash "$fixture"
```

Historical fixture TDD sequence: the first two fixture runs exposed a setup error (the endpoint
initially rejected the SDK's non-model HEAD request); those are **not** valid
REDs. After answering that local HEAD, the measured MCP mismatch failed. The
original regression invoked production decision logic with a passing positive
control and retained this meaningful RED. That original worker claimed no GREEN;
production repair was outside its scope. The subsequent explicitly approved
repair's matched RED/GREEN evidence is recorded above. No coverage threshold/tool
is configured in package.json; validation here is changed-behavior/failure-path
assertions plus the unit suite, not a measured coverage percentage.

## Remaining task 10 gates — not completed by this repair

The provenance prerequisite is resolved. The following previously deferred gates
remain unverified; no task 10 continuation was launched by this repair:

- No normal bridge stream/transcript/tool-continuation/source-publication or
  native decision/replay integration proof yet.
- No real-SDK conflicting user/project retention-settings matrix yet; no claim
  that managed overrides can be enforced.
- No actual Pi 0.86.1 compatibility fixture run or baseline comparison yet.
- No integrated live runner, durable 40-query/40-minute ledger, model matrix,
  expiry comparison, or eligibility promotions. There is **no ready live
  command**. The later live phase must remain blocked until these prerequisites
  and its guard tests pass.

README/changelog/context updates remain with task 13.
