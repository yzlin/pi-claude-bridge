---
summary: "Navigation and safety boundaries for diagnostic tools, current qualification guidance and historical reports."
read_when:
  - "Choosing a diagnostic tool or cleaning up diagnostic files"
  - "Distinguishing current qualification from historical experiments"
---

# Diagnostics

Development tools and evidence, not production runtime. Tests import diagnostic
helpers; keep those dependencies. The package does not ship this directory.

## Start here

- [Native qualification](NATIVE-CACHE-QUALIFICATION.md): current exact lanes, live SDK evidence and limits.
- [Native integration](BRIDGE-WARMING-INTEGRATION.md): local SDK/native safety coverage and historical phases.
- [Account probe](NATIVE-CACHE-ACCOUNT-PROBE.md): account-only diagnostic scope and evidence.
- [Pi 0.86.1 compatibility](PI-086-COMPAT.md): ordinary-provider peer-floor coverage, not warming proof.

## Tools by question

| Question | Tools | Boundary |
| --- | --- | --- |
| Who wrote transcript records? | [audit-transcripts.mjs](audit-transcripts.mjs) | Separates bridge/synthetic and CC-live provenance; groups message blocks. |
| Where did cache reuse break? | [audit-cache.mjs](audit-cache.mjs) | Log scanner; interpret query boundaries and TTL, not just aggregate rates. |
| Which warnings or tool results remain unresolved? | [audit-warnings.mjs](audit-warnings.mjs) | Different question from cache misses. |
| Does replay preserve history? | [replay-write-path.mjs](replay-write-path.mjs), [lib/write-path.mjs](lib/write-path.mjs) | Pairing, preservation and deterministic settled prefixes; helper used by tests. |
| Are carried attachments complete? | [attachment-coverage.mjs](attachment-coverage.mjs) | Compares collector output with parent-chain ground truth. |
| What request prefix actually changed? | [capture-proxy.mjs](capture-proxy.mjs), [diff-captures.mjs](diff-captures.mjs) | Live forwarding/raw captures versus comparison of existing captures. |
| Do git or dynamic preset sections change caching? | [probe-git-cache.mjs](probe-git-cache.mjs), [probe-dynamic-sections.mjs](probe-dynamic-sections.mjs) | Manual live experiments; repository mutation, not routine tests. |
| What context window does the service report? | [context-size.mjs](context-size.mjs), [CONTEXT-SIZE.md](CONTEXT-SIZE.md) | Live model measurement; saved-report comparison is a separate mode. |
| Does a one-token refresh keep a thinking-on Opus cache warm? | [probe-opus-thinking-refresh.mjs](probe-opus-thinking-refresh.mjs) | Live direct-SDK mechanism probe; run through capture-proxy. Not a qualification. |
| Which built-in plugins does the CLI load for this login? | [probe-builtin-plugins.mjs](probe-builtin-plugins.mjs) | Uses the real login; sends no user message, so no model request. |
| Which query/account state owns logged usage? | [attrib.py](attrib.py), [EXTRA-USAGE-400.md](EXTRA-USAGE-400.md) | Investigation-specific attribution and historical findings. |

## Guides and historical reports

- [AUDIT.md](AUDIT.md): scanner guidance, provenance rules and historical findings.
- [CACHE-WARMING.md](CACHE-WARMING.md): historical standalone Haiku feasibility; current status links supersede that phase.
- [TASK10-OFFLINE-GATES.md](TASK10-OFFLINE-GATES.md): historical prerequisite repair and RED/GREEN evidence, not today's pending gates.

## Sealed qualification experiments

Bounded `probe-five-*`, `probe-native-cache-account.mjs`,
`qualify-native-cache-warming.mjs`, `qualify-opus-thinking-warming.mjs`, `probe-cache-warming.mjs` and their associated
helpers/tests retain their existing paths. Completed/failed allocations are closed;
old markers or unused slots never authorize reruns. New live work needs separately
approved scope. See the qualification report before using an entry point.

Generated `*.approved.json` and `*.live/` evidence are local and ignored by Git.
Ignoring is not deletion: preserve sealed artifacts. An explicitly approved
cleanup-only exception changed historical source/tests to remove the system `trash`
requirement for owned temporary offline fixtures. A second approved exception repinned the
sealed harnesses to SDK 0.3.293 / CLI 2.1.293 so their offline tests run. Original
code hashes identify the historical versions, not today's files; markers and live evidence stay unchanged,
and closed allocations still cannot restart. Live cleanup keeps its `trash`
requirement. Do not commit raw captures or private logs. Source, tests and reports
remain trackable.

## Before running anything

Read the tool's entry points first; filenames do not guarantee offline execution.
Scanners can read private local logs/transcripts. The capture proxy forwards live
traffic and retains sensitive request/error data. Context-size and live probes use
subscription/API capacity. Git probes mutate repositories; the dynamic-sections
probe recursively deletes its supplied directory. Use only an explicitly authorized
scope and disposable owned paths. No diagnostic was executed during this cleanup.
