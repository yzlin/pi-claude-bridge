# Actual Pi 0.86.1 ordinary-provider compatibility

## Result

**PASS for the bounded offline contracts below**, on Node **v24.11.0** / npm
**11.6.1**, darwin. Both the working bridge and copied git HEAD
`227f5eb4450a070dfbc083a7fe75b8b35366b941` import and register against actual Pi
0.86.1 packages. The working bridge completes ordinary provider streaming and
Pi's bug, branch, and compaction summary paths using a **fully fake SDK query**.
No production repair was needed or made.

This is neither subscription validation nor warming qualification. Production
warming qualifications remain empty. No Claude Code process or live model
request ran in this test.

## Reproduction and isolation

```sh
PI_086_COMPAT=1 node --test tests/int-pi-086-compat.mjs
node --test tests/int-pi-086-compat.mjs
node --check tests/int-pi-086-compat.mjs
node --check tests/lib/pi-086-import-probe.mjs
```

Final opted-in run: **1 passed, 0 failed**, about 26 seconds. It made five fake
SDK queries for working source and four for HEAD. The default invocation reports
**1 skipped** and does not download packages. Both syntax checks passed.

The opt-in probe creates an OS-temporary package with exact Pi versions and
root overrides, then runs:

```sh
npm install --ignore-scripts --no-audit --no-fund --loglevel=error
```

Only the public npm registry is used. All installed instances of the six Pi
packages below are checked in the fixture lockfile for version 0.86.1; Pi's
caret dependency ranges cannot silently pull in 0.87.x. Bridge non-Pi direct
dependencies, tsx, and typebox are pinned to the repository's installed versions.
Other transitive npm dependencies are not permanently locked by this test.

The working `src/` directory is copied, not patched. HEAD `src/` is copied using
`git ls-tree` and `git show`, without checkout or worktree. Each import,
registration, and behavioral probe runs in a fresh child. No repository
package.json, lockfile, node_modules, production source, shared SDK harness, or
real configuration file is modified. Temporary installations are automatically
removed.

The child environment is allowlisted: temporary HOME, Pi/Claude directories,
cache directories, and npm configuration locations; no inherited API keys,
OAuth data, proxy settings, NODE_OPTIONS, or npm credentials. The model probes
block fetch, HTTP(S), sockets, TLS, and child-process execution. Query and
resolveSettings are replaced with synthetic implementations using Node's module
mocking; Pi packages are **not mocked**. Experimental module-mocking warnings
are expected. Errors replace the temporary root with `<fixture>`.

Metadata inspection also used these public commands:

```sh
node --version
npm --version
npm view @earendil-works/pi-coding-agent@0.86.1 version engines dependencies --json
npm view @earendil-works/pi-ai@0.86.1 version engines exports --json
npm view @earendil-works/pi-agent-core@0.86.1 version dependencies --json
npm view @earendil-works/chord@0.86.1 version --json
npm pack @earendil-works/pi-coding-agent@0.86.1 --ignore-scripts --silent
```

The archive was inspected only in a separate temporary directory, then trashed.

## Versions actually exercised

| Package | Installed in fixture |
| --- | --- |
| @earendil-works/pi-coding-agent | 0.86.1 |
| @earendil-works/pi-ai | 0.86.1 |
| @earendil-works/pi-tui | 0.86.1 |
| @earendil-works/pi-agent-core | 0.86.1 |
| @earendil-works/pi-telemetry | 0.86.1 |
| @earendil-works/chord | 0.86.1 |
| @anthropic-ai/claude-agent-sdk | 0.3.280, query mocked; CLI not run |
| @modelcontextprotocol/sdk | 1.29.0 |
| cc-session-io | 0.4.0 |
| change-case | 5.4.4 |
| tsx | 4.22.4 |
| typebox | 1.3.27 |

All six Pi packages declare Node **>=22.19.0**. Only **24.11.0** was executed.
The bridge's `node >=20` declaration does not establish Node 20 compatibility
with these Pi packages. Neither Node 20 nor the precise Node 22.19.0 minimum
was tested; that is a separate support dimension, not a demonstrated runtime
failure in this probe.

## Completed coverage

1. **Entrypoints/imports:** actual pi-ai root and `pi-ai/compat`, coding-agent
   root, and tui root import successfully. `getModels`, `contentText`,
   `getCurrentSystemMessage`, `getCurrentTools`, stream construction/cost helpers,
   `buildSessionContext`, `compact`, `generateBranchSummary`, `keyHint`, and
   `Text` are present. The new transcript APIs and compat subpath are **not** a
   missing-export incompatibility in 0.86.1. `loadExtensions` is not a root
   export; the test uses the actual shipped internal loader file.
2. **Real extension loading/registration:** Pi's `loadExtensions` (jiti) loads
   each bridge entrypoint. Its real extension runtime queues exactly one
   provider registration. Real `ModelRuntime`/`ModelRegistry`, using Pi's
   in-memory auth storage and disabled model-network refresh, accept the
   provider and resolve `claude-bridge/claude-haiku-4-5`.
3. **Real transcript normalization:** 0.86.1 `normalizeContext` folds the
   synthetic prompt and read-tool definition into a system message. The bridge
   restores the exact prompt, tool schema, and user message. This uses actual
   0.86.1 replay helpers, not replacement exports.
4. **Ordinary dispatch:** real `ModelRegistry.streamSimple` reaches the bridge.
   With fake SDK partial events, Pi receives exactly `start`, `text_start`,
   `text_delta`, `text_end`, `done`; `.result()` returns the synthetic assistant
   text and stop reason. Usage is input 10, output 3, cache read 20, cache write
   4, total 37. Prompt projection, managed prompt stream, and `custom-tools`
   MCP-server presence are checked. Short retention passes on both source
   versions. Working-source `cacheRetention: none` remains on this ordinary
   path with tools preserved and child caching disabled, rather than becoming
   an isolated summary.
5. **Actual Pi summaries:** `generateBugReportSummary` runs through the real
   registry; its normalized system transcript and `cacheRetention: none` are
   observed. Actual branch summarization and compaction are invoked through
   the bridge's registered takeover handlers. Compaction preparation is built
   by Pi's actual `prepareCompaction`. All three complete with synthetic text;
   branch output includes Pi's exact standard preamble.
6. **Summary SDK options:** all three use a string prompt/system prompt,
   `tools: []`, `settingSources: []`, `persistSession: false`, and no resume.
   Working source sets `DISABLE_PROMPT_CACHING=1`. HEAD leaves that variable
   undefined: an observed **pre-existing policy omission**, not a new ordinary
   provider ABI incompatibility. The baseline assertion preserves that exact
   difference; it does not claim HEAD satisfies the new cache policy. The new
   ordinary-`none` routing check is working-source-only, explicitly not a HEAD
   compatibility requirement.

The behavior phase imports the factory through tsx and activates it through
Pi's actual `loadExtensionFromFactory` so the SDK module replacement can be
observed. The separate registration phase uses Pi's actual jiti file loader
without mocking SDK exports. This is not a claim that Node's module mock
intercepts SDK calls through jiti.

## Development failures retained for attribution

Every iteration used the same opted-in test command above. This was a
verification-only task, with **no production behavior implementation**; there
was no meaningful production RED/GREEN cycle to claim. Concrete alternative
validation is the actual-version fixture plus HEAD control.

The first import checkpoint deliberately stopped with:

```text
AssertionError: Import now succeeds: extend the proof with actual Pi registration,
stream, transcript and summary contracts before claiming compatibility.
```

Both source imports had passed, so the behavioral proof was then added. Three
fixture-construction errors affected **both** source versions and were fixed
only in the new helper:

- `AssertionError: transcript tool definitions reach the SDK MCP server`:
  the fixture guessed `pi_tools`; the bridge's existing exported server name
  is `custom-tools`. The test now checks that real name.
- Branch equality expected bare `Synthetic reply`; actual Pi adds
  `The user explored a different conversation branch before returning here.\nSummary of that exploration:\n\n`.
  The assertion now checks the exact prefixed result, not a weakened substring.
- `Error: Claude bridge compact failed (fileOps.written is not iterable)`:
  the manually constructed preparation omitted a Pi file-ops set. It was
  replaced with **actual Pi prepareCompaction output**, not a production fix.

After those corrections the working-source contracts passed. HEAD alone failed
an overbroad new-policy assertion with `AssertionError: undefined !== '1'` at
the summary cache-disable check. Inspection of `git show HEAD:src/index.ts`
confirmed HEAD's summary env was only `{ ...process.env, ...CC_CHILD_ENV }`.
The final baseline check explicitly expects the measured undefined value while
retaining the strict `"1"` requirement for working source. No production gate
was relaxed and no observed production regression was repaired.

## Boundaries and remaining claims

- Synthetic single-user, one-text-block replies; one registered Haiku model is
  used as an ABI fixture, **not a qualified live model**.
- Tool definitions are carried, but no tool is called. No active tool loop,
  cancellation race, source transcript persistence/reuse, or multi-turn SDK
  lifecycle is established by this fixture.
- No full Pi interactive/RPC session, real SDK transport, Claude Code CLI,
  subscription auth, managed settings, cache expiry, native idle warming,
  model matrix, AskClaude behavior, or other Node runtime was tested here.
- Full unit/type suites were not repeated; the parent already owns those gates.
- A package peer range alone is not the evidence: these are bounded observed
  ordinary-path contracts against the installed 0.86.1 implementation.

Working-source SHA-256 at final verification:

```text
04a76951a46a8e547f8669184b619b4f3674c172ed8bba66282c781db6fc0291  src/index.ts
a19719f94bf2c13cdd0534a707ab5676fa434d627168cb7891aad023050f5aaa  src/models.ts
ceb93d567a76d7a5ac03ef7f55c9b437c6bcb8dda2dc82253840df16eaa716f5  src/transcript.ts
72b5429ba806a76ebfc0c6e1fe2e417ae9023516ccb12c1fbbcee5de0f5f23d7  src/query-state.ts
3766a24a1ba1599600787bb1529e98a04e631a5cb832f41223365424396c8112  src/cache-policy.ts
5dc2096c22d59695dad2cbc5e21248734133ad04011bf06ca70a876f887b3cfd  src/cache-warming.ts
```
