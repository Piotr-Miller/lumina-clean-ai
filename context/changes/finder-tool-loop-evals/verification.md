# Verification — Finder Tool-Loop Evals + Model Decision

Running record of evidence and deviations, phase by phase.

## Phase 1 — Fixture tree + source wiring

Commit `edf3982` (19 files, +1394/−107), plus `084e7bc` for the follow-up fixes from
`reviews/impl-review-phase-1.md` (8 files, +368/−56).

### Evidence

| Criterion | Result                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------- |
| 1.1       | `promptfoo validate config` → "Configuration is valid."                                             |
| 1.2       | `tsc --noEmit` exit 0, fixture tree present                                                         |
| 1.3       | `eslint evals/finder-provider.ts` exit 0                                                            |
| 1.4       | 300 tests pass (288 before this phase); 317 after the impl-review fixes                             |
| 1.5       | Paid smoke, eval `eval-Flr-2026-08-11T12:55:06`, sonnet-5 on cross-hunk                             |
| 1.6       | Both fixture trees served through the shipped assembly on this Windows checkout                     |
| 1.7       | Viewer's **"Actual Prompt Sent"** panel shows the tool-enabled variant on the tool-enabled row only |

**1.5 detail:** `toolCalls: 2`, `steps: 3` (budget 5), target delivered twice, **zero refusals**,
finder cost **$0.042374**, and the review correctly identified the `JPEG_QUALITY` contract
violation. The non-zero cost is the proof that enabling OpenRouter usage accounting was required —
see Deviation 2.

**1.6 detail:** cross-hunk served 2,910 chars and clean-change 653 chars; an out-of-diff control
path was refused in both trees. The cross-hunk case's load-bearing property was asserted directly:
`JPEG_QUALITY` and "single-source" are present in the served file and **absent from the diff and
its context**, so a model that never fetches cannot link the hardcoded `0.5` to the contract.

**1.7 detail** (checked 2026-08-11, during Phase 2 — hence the Phase 2 sha on the row): promptfoo's
row-detail dialog carries TWO prompt panels, and the distinction matters here. **"Prompt"** shows the
config's raw template, which is the literal `{{diff}}` — templating is disabled repo-wide, so it is
never rendered. **"Actual Prompt Sent"** shows what the provider reported, i.e. the real system +
user pair. On the cross-hunk row (`fixtureRoot: ./fixtures/cross-hunk`) it carries all three
tool sentences — "call the getFileContext tool before judging", the cross-hunk dependency-class
sentence, and the untrusted-data sentence that names getFileContext as a channel. On the two
tool-less rows in the same eval (JS canary, React migration) those sentences are absent and the
SHORT untrusted-data variant appears instead — the phase-1 F3 tool-less variant, confirmed visually
by A/B rather than by inspecting the provider's own reporting. Evidence: eval
`eval-Flr-2026-08-11T12:55:06`, rows 3 vs 1 (`?rowId=3` / `?rowId=1`); underlying data cross-checked
via the viewer API (`response.prompt`: 3 getFileContext mentions on row 3, zero on rows 1–2).

### Impl-review follow-ups (`reviews/impl-review-phase-1.md`)

- **F2 fixed** — `resolveFixtureRoot` now confines the root to a strict descendant of
  `evals/fixtures`, checked on the **realpath** of both sides (a lexical check would miss a
  symlinked root, which `createDiffScopedSource` deliberately tolerates). The fixtures directory
  itself and non-existent roots are rejected. 8 hermetic cases in `evals/finder-provider.test.ts`.
- **F4 fixed** — delivery is now reported by `createDiffScopedSource` through an optional
  `onResult({ path, delivered })`, from the one place that knows the outcome exactly; the string
  sniffing in `instrumentSource` is deleted. The reported collision — content whose first line is
  the quoted requested path — is a regression test.
- **F1 accepted**, see Deviation 1 below. **F3 acknowledged** — a status, not a defect.

Re-verified after the fixes: 317 tests, lint and typecheck clean, config valid, and the fixture
delivery script green including the three `fixtureRoot` escape attempts.

### Deviations from the plan

**1. `createDiffScopedSourceForDiff`, not `createFsDiffScopedSource({ diff, root })`** (Phase 1 §4).

The planned signature is unimplementable. `cli.ts` builds its source from an injected `CliIo`
(`io.readFile` / `io.realpath` / `io.isRegularFile`), and `cli.test.ts` pins that seam — a helper
that reached for `node:fs` itself could not be called from the CLI without breaking its hermetic
tests. What actually duplicated between CI and the evals was the _assembly_ (parse the allowlist →
guard the empty case → wire containment), not the three-line fs binding, so the shared helper takes
the primitives as parameters and `source-provider.ts` stays pure.

Accepted knowingly, with the alternative (a Node-backed wrapper plus a source-factory injection
seam in `cli.ts`) considered and declined at plan-review triage and again at impl-review F1. The
residual cost is real and worth restating: a future hardening of the _fs adapter itself_ must be
applied in both `review-pr.ts` and `evals/finder-provider.ts`. Hardening of the allowlist
derivation and containment — the security-relevant part — is shared.

**2. OpenRouter usage accounting enabled in `reviewer.ts`** — not in the plan at all.

`describeFinderStep`'s new `cost` field is permanently `undefined` without it: usage accounting is
opt-in, and the installed provider only sends it when the model carries `usage: { include: true }`
(its request body reads `usage: this.settings.usage`). Left alone, every eval row would have
reported cost 0 — the exact blind spot #119 shipped with, and Phase 3's criterion 3.3 could never
have passed. This is the one change in Phase 1 that alters production request shape; it is free
(response fields, not tokens) and additive, and it also makes CI's `finderTelemetry` cost-aware.

**3. The cross-hunk case was registered in `promptfooconfig.yaml` during Phase 1**, though the plan
assigns config wiring to Phase 2 §3. Criterion 1.5 is a smoke run _on that case_ and cannot execute
otherwise. Phase 2 still owns the provider swap, the clean case's assertions, and moving
`scoreIssueRecall` off `defaultTest`.

**4. The planted flaw shape was changed from the phase-3 probe.** The probe modified an existing
call site, so its diff contained `- ... JPEG_QUALITY ...` — the constant's name was visible in the
hunk, and a model could infer the contract without fetching. The fixture instead _adds_ a call site
(`flattenForUpload`) in a region whose context mentions no constant, verified by assertion: the
hunk and its context contain zero occurrences of `JPEG_QUALITY`.

## Phase 2 — Grading surface

Commit `90dee42` (9 files, +606/−67), plus `e64c52f` for the follow-up fixes from
`reviews/impl-review-phase-2.md` (11 files, +335/−32).

### Evidence

| Criterion | Result                                                                       |
| --------- | ---------------------------------------------------------------------------- |
| 2.1       | 337 tests pass (317 before this phase); 357 after the impl-review fixes      |
| 2.2       | `node evals/recall-selfcheck.mjs` → 16/16; 18/18 after the impl-review fixes |
| 2.3       | `node --check evals/assertions.mjs` exit 0                                   |
| 2.4       | `promptfoo validate config` → "Configuration is valid."                      |
| 2.5       | Both failure modes fail `tool_required`, and are distinguishable at a glance |
| 2.6       | Clean-diff case passes for baseline glm-4.6, 3/3 assertions, $0.00081        |

Also green, though not phase criteria: `tsc --noEmit` exit 0 and `eslint` exit 0 on the touched eval
TS files (both are `code-reviewer` CI-job gates).

**2.5 detail** — the two component results split "never asked" from "asked and was refused", which
is the distinction the whole assertion exists for (a refusal is a model-facing STRING, so from the
model's side it looks exactly like content):

| Row                 | Verdict | Components                                                                            |
| ------------------- | ------- | ------------------------------------------------------------------------------------- |
| zero-call           | fail    | `Never called getFileContext` / `Never received <path> (requested: none)`             |
| refused fetch       | fail    | `Called getFileContext 1 time(s)` / `Asked for <path> but the source refused it`      |
| wrong path          | fail    | `Called getFileContext 1 time(s)` / `Never received <path> (requested: src/other.ts)` |
| delivered (control) | pass    | `Called getFileContext 2 time(s)` / `Received content for <path>`                     |
| absent metadata     | fail    | `No provider metadata on this row, so tool usage is unobservable`                     |

**2.6 detail** — eval `eval-1YY-2026-08-11T18:15:38`, 1/1 passing: `schema_validity` 1.00,
`no_false_alarms` 1.00, `findings: []`, cost $0.00081. **`tool_calls` was 0** — glm-4.6 did not
fetch even on a tool-enabled case, which is the same inertia phase 3 of `finder-file-context`
recorded live (0 calls in 4/4 runs). That is a Phase 3 data point, not a Phase 2 failure: the clean
case is graded on precision only, and `tool_calls` gates nothing by design.

### Impl-review follow-ups (`reviews/impl-review-phase-2.md`, APPROVED with 2 warnings)

Both accepted and fixed before Phase 3 spends the paid run — a grading bug found after the matrix
means paying for it twice.

- **F1 fixed** — `requireToolContext` read only `deliveredPaths`, so telemetry claiming delivery
  with `toolCalls: 0` passed the gate, and `readToolTelemetry` accepted `NaN` / `Infinity` /
  negative counts (a `NaN` would have silently poisoned `tool_calls`' average for that model). The
  count must now be a non-negative integer, and the gate requires delivery **and** invocation
  **and** a matching request — the provider records the request and its outcome in the same
  callback, so disagreement means the instrument is broken, and it now says so
  ("Telemetry contradicts itself: …") rather than reading as an honest zero-call model.
- **F2 fixed** — the `hardcod` recall pattern awarded full `issue_recall` to "the hardcoded 0.5
  should be configurable", a finding the case's own rubric explicitly fails and which any model can
  produce from the hunk alone. Removed; the four remaining patterns each require contract
  reasoning. The row was never mis-gated (`tool_required` + the rubric held), but the named recall
  metric would have misreported quality in `decision.md`.

New hermetic gate: `evals/promptfooconfig.test.ts` parses the ACTUAL config and asserts 3 generic
wordings miss while 4 contract wordings hit, plus two structural invariants (`scoreIssueRecall`
stays off `defaultTest`; every case's graders match its vars). `js-yaml` was promoted from a
transitive promptfoo dependency to an explicit devDependency so the test does not rely on hoisting
— the only dependency change in this phase, and it installs 5.2.3 alongside promptfoo's own pinned
5.2.2 rather than moving promptfoo's copy.

Re-verified after the fixes: **357 tests** (337 → 20 new), self-check 18/18, `node --check` clean,
config valid, typecheck and lint clean.

### Deviations from the plan

**5. `evals/README.md`'s snapshot-export command was corrected beyond the plan's wording.** It still
pointed at `context/changes/code-review-evals/results/<date>-first-matrix.json`, the PRIOR change's
folder — a path Phase 3 would have copy-pasted into an archived change. Repointed to this change's
`results/<date>-tool-loop-matrix.json`.

**6. `tool_calls` scores the raw count, so it is not a 0–1 ratio.** promptfoo averages a named metric
across rows, which makes the metric read as "getFileContext calls per row" per model — the figure
`decision.md` needs. The cost is that a tool-enabled row's aggregate score column is no longer a
ratio either; recorded in the README's metrics table rather than engineered around, since the row
score was never the decision input.

## Phase 3 — Run the matrix and decide

### Evidence

| Criterion | Result                                                                                  |
| --------- | --------------------------------------------------------------------------------------- |
| 3.1       | `results/2026-08-11-tool-loop-matrix.json` exists, parses, 48 rows                      |
| 3.2       | Non-zero `tool_calls` for 3 of 4 models (haiku 6/6, deepseek 6/6, sonnet 4/6 rows)      |
| 3.3       | Non-zero cost on every row; $0.6263 finder spend across the 48                          |
| 3.4       | Snapshot scanned: no key-shaped strings, emails, or `C:\Users\…` paths                  |
| 3.5       | `decision.md` written with the cost delta and the repair-rate column                    |
| 3.6       | Cross-hunk discriminates: best 3/3 delivered (haiku/sonnet/deepseek) vs worst 0/3 (glm) |

**Runs.** A cross-hunk-only probe was bought first (`eval-Rhd-2026-08-11T19:05:49`, 12 rows, $0.16)
to check the full matrix was worth buying; the full run is `eval-P4k-2026-08-11T19:12:16` (48 rows,
$0.6263 finder + ~51k grader tokens, 4m30s at concurrency 4). Actual spend came in under the plan's
$1–2 estimate but above the $0.40 projected from the probe — sonnet-5's React rows ($0.108 each)
dominate the total.

**Outcome.** glm-4.6 made ZERO tool calls in all 12 of its rows, failing cross-hunk 0/3 while
passing canary, React and clean 3/3 each. haiku-4.5 (11/12) and sonnet-5 (12/12) both deliver
context on 3/3 cross-hunk repeats. Recommendation is haiku-4.5, runner-up sonnet-5, at 8.1× and
48.2× the baseline cost per row respectively. Full reasoning and caveats: `decision.md`.

**3.4 detail.** Scanned for `sk-`/`Bearer`/`api_key` patterns, email addresses, Windows user paths
and secret-bearing env var names — all zero hits. The snapshot's prompts carry the repo's own
`.github/ai-review-rules.md` and the eval fixtures, both already tracked.

### Deviations from the plan

**7. The probe was not in the plan.** The plan specifies one full-matrix run. A cross-hunk-only
pass across all four models × 3 repeats was bought first ($0.16) because the load-bearing question —
whether ANY model but sonnet-5 touches the tool — could be answered for a fifth of the price, and a
"no" would have made the remaining three cases nearly moot. The full matrix was run immediately
after and is the citable artifact; the probe is recorded here only because it is spent money and
because it produced one finding the full run overturned (below).

**8. The probe's deepseek reading was wrong and the full matrix corrected it.** Deepseek failed 0/3
on cross-hunk in the probe, which was written up as a structural incompatibility of the same kind as
qwen / gpt-5.4-mini. The full run shows 8/12 usable output spread across three cases — a ~33%
single-attempt flake, not a wall. Recorded because the error is instructive: a 3-row sample of a
one-in-three failure mode reads exactly like a deterministic failure.

**9. The envelope-repair column could not be filled.** `output-repair.ts` fired zero times in 48
rows, so the repair-rate figure the plan wanted as the argument against glm-4.6 does not exist. The
harness did not reproduce the production drift — see `decision.md` § Caveats. This is a gap in the
instrument, not evidence the drift is gone, and it moves the burden onto Phase 4's live run.
