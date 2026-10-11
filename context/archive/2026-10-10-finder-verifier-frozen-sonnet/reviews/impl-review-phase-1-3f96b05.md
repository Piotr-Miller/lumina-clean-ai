<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Sealed verifier on frozen findings, stage 2 (sonnet-5)

- **Plan**: context/changes/finder-verifier-frozen-sonnet/plan.md
- **Scope**: Phase 1 (phases 1–5)
- **Session**: fresh — Codex did not implement this phase; two read-only delegates received independent, fresh context
- **Base**: f4936be0ec939d4946acc3554df2a75c63a436b0 (Progress — parent of the phase-1 commit)
- **Head**: 3f96b05e134e9e39d177f224e29442ac54e0fd02
- **Worktree**: included(context/changes/finder-verifier-frozen-sonnet/plan.md — existing Progress SHA suffixes); no other initial local changes
- **Checks ran at**: 3f96b05e134e9e39d177f224e29442ac54e0fd02 (current HEAD; implementation unchanged)
- **Manual acceptance**: 0 of 1 confirmed — pending: 1.10; checklist corrections identified below
- **Date**: 2026-10-11
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

The nine planned automated checks pass. Their coverage misses the false-green probe outcomes below. Manual acceptance is reported separately; its unchecked row does not itself lower the verdict.

## Findings

### F1 — An account condition violation can end with PROCEED

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: context/changes/finder-verifier-frozen-sonnet/harness.mjs:1157
- **Detail**: `probeChecklist` considers successful-response telemetry but ignores the attempt's `condition-violation` status. A malformed HTTP 200 completion from Anthropic, followed by HTTP 401 during repair, is correctly classified as `condition-violation / account-401` by the inherited classifier. Nonetheless, all four checklist holds are true, the outcome is `PROCEED`, and the probe CLI exits 0. This contradicts the inherited account/condition stop rules and gives the owner conflicting instructions. The same class includes 402 and measurement errors that leave earlier successful telemetry intact.
- **Fix**: Preserve the specific provider/reasoning/headroom outcomes, but refuse progression for any otherwise unhandled condition violation, displaying its recorded cause. Add an offline malformed-200 → repair-401/402 regression and a measurement-error case. Do not conflate an ordinary parser failure or the explicitly informational `budget-stopped` state with a condition violation.
  - Strength: Keeps the approved telemetry-based probe rules while respecting inherited stop conditions.
  - Tradeoff: Requires outcome precedence to be stated explicitly.
  - Confidence: HIGH — reproduced through `runProbe` and the sealed verifier with injected transport.
  - Blind spot: The real endpoint has not been called; this finding concerns deterministic local outcome selection.
- **Decision**: FIXED (2026-10-11) — the checklist now never proceeds past an account error (401/402) on any request, or past any other condition violation that items 1–4 do not explain; it prints the recorded cause. A plain format failure and `budget-stopped` stay information only. Precedence is stated in the code and in plan Phase 2 (owner decision 2026-10-11). New self-test cases: malformed 200 → repair 401, → repair 402, → connection error on the repair, and a plain format failure that still proceeds. Mutant "account rule removed" fails 2 cases.

### F2 — A failed generation read is displayed as absent evidence and passes

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: context/changes/finder-verifier-frozen-sonnet/harness.mjs:1118
- **Detail**: `liveGeneration` returns `{ status: 500 }` or `{ status: 401 }` when the lookup fails. The checklist reduces each missing `provider_name` to `null`, and `genOk` accepts it. It therefore prints `provider_name [absent]` and returns `PROCEED` despite an unsuccessful evidence read. Missing completion IDs skip the lookup entirely and also pass. A successfully read record with an optional field absent is a different observation from an unreadable record. Phase 2 requires the generation read and its observed evidence; lessons.md explicitly distinguishes “absent” from “could not see.” The existing 404 self-test also treats an unavailable record as acceptable without making that policy explicit in the plan.
- **Fix**: Report lookup status and missing IDs explicitly. Make an unsuccessful or unperformed generation read an undetermined outcome requiring an owner decision, unless a specific exception is approved before the probe. Keep optional-field absence distinct from read failure and add regressions for 401, 500, exhausted 404, and missing ID.
  - Strength: The owner sees which required observation is unavailable and why.
  - Tradeoff: A delayed generation record can postpone sealing; an explicit exception could avoid a second paid probe.
  - Confidence: HIGH — HTTP 500 and missing-ID cases reproduced with otherwise successful completions.
  - Blind spot: The owner has not defined whether exhausted 404 may be accepted; this report does not choose that policy on their behalf.
- **Decision**: FIXED (2026-10-11) — item 8 requires the generation record of every successful response to be read (HTTP 200); a failed, exhausted-404, connection-failed or skipped read (no generation id) is printed with its status as NOT READ and the outcome is UNDETERMINED, never PROCEED. A record that was read but lacks `provider_name` still prints `absent` and does not block. The lookup now retries a 404 ten times, 3 s apart, and keeps the last status. This follows the owner's 2026-10-11 direction that the probe must not proceed despite an unsuccessful generation read; an exhausted 404 is treated as unsuccessful, and accepting it would need a separate owner decision. The way out is a free re-read. Five new cases; mutant "generation rule removed" fails 5 cases.

### F3 — Final spend above the probe cap does not stop progression

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: context/changes/finder-verifier-frozen-sonnet/harness.mjs:1265
- **Detail**: After the final counter read, `runProbe` computes and prints `T = max(counter delta, recorded spend)`, but does not use T to gate the outcome. With cap $0.60, start counter 10, end counter 11, and recorded cost $0.02, it prints T $1.000000 and returns `PROCEED`. Phase 2's automated criterion explicitly requires this measure of spend to stay at or below $0.60. Whether the discrepancy comes from accounting lag, another use of the key, or a broken price assumption, the owner must reconcile it rather than receive a clean progression signal. This check cannot undo incurred spend; it can stop an invalid acceptance.
- **Fix**: After the final counter read, compare T with the invocation's probe cap. If exceeded, report both cost sources and an explicit stop-and-ask outcome, returning a nonzero CLI status. Add a regression in which the final counter delta alone exceeds the cap, plus the equality boundary.
  - Strength: Aligns the probe outcome with its existing spend criterion and authoritative accounting definition.
  - Tradeoff: A counter discrepancy may require reconciliation even when the recorded completion is cheap.
  - Confidence: HIGH — reproduced with injected start/end counters and no network traffic.
  - Blind spot: The origin of a real counter discrepancy would require account evidence; the harness should not guess it.
- **Decision**: FIXED (2026-10-11) — item 7 compares T = max(counter Δ, recorded) with the probe's `--cap` after the final counter read; above it the outcome is STOP AND ASK (spend) and the CLI exits 3. New cases: counter Δ $0.61 against $0.60 → stop; exactly $0.60 → holds. Mutant "spend rule removed" fails 1 case.

### F4 — Missing reasoning fields are rendered as zero counts

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/finder-verifier-frozen-sonnet/harness.mjs:1146
- **Detail**: Missing `message.reasoning` and `message.reasoning_details` become zero lengths/counts and print as `wire reasoning text chars [0]` and `wire reasoning_details [0]`. These can reasonably be interpreted as derived counts of observed content; they are not a missed-reasoning defect. However, Phase 1 explicitly promises that absent fields print `absent`, never 0, and the stub demo presents them alongside truly observed token values. Presence should be clear if that literal contract is retained.
- **Fix**: Preserve raw-field presence separately from computed counts and display `absent` for absent wire fields, or explicitly describe these entries as derived counts in the plan and checklist. Test an absent field separately from an explicitly empty field.
- **Decision**: FIXED (2026-10-11) — the wire record keeps each field's raw state (`absent`, `null`, or its type) apart from the derived counts, and the checklist prints that state. On the SDK side the provider fills `reasoning_details: []` when the field is absent (`@openrouter/ai-sdk-provider@3.0.0`, `dist/index.js:3844`), so that count is labelled derived. New case: `reasoning: null` and `reasoning_details: []` print as `[null]` and `[0]`.

## Automated verification

All commands were executed offline with stdout/stderr captured to files; no check command was piped to a summarizer. Harness commands used `FV_PKG=/home/piotrmiller/.cache/finder-verifier-frozen-sonnet/fv-seal/packages/code-reviewer` and `FV_OUT=/tmp/finder-sonnet-review-zREUPC`.

| Row  | Command / verification                                                                                                                       | Exit         | Observed result                                                                                        |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------ |
| 1.1  | `git -C <sealed-worktree> rev-parse HEAD HEAD:packages/code-reviewer/src` and clean status                                                   | 0            | HEAD `9c85aa27f418c6d8cb669b1bedddbb333799fa02`, src `9be9423531d08ec932f82db7683e97d4da5ddf5c`; clean |
| 1.2  | `npm test` in sealed package                                                                                                                 | 0            | 29 files, 1,086/1,086 tests                                                                            |
| 1.3  | `npx --no-install tsx context/archive/2026-10-09-finder-verifier-frozen/harness.mjs self-test`                                               | 0            | 72/72                                                                                                  |
| 1.4  | `npx --no-install tsx context/changes/finder-verifier-frozen-sonnet/harness.mjs self-test`                                                   | 0            | 93/93                                                                                                  |
| 1.5  | Same stage-2 harness, `dry-run`                                                                                                              | 0            | 19 batches, 38 requests, sonnet wire assertions pass, `summary.failures: []`                           |
| 1.6  | Same harness, `plan`; `npx --no-install prettier --config .prettierrc.json --write <scratch>/harness-plan-check.json`; exact byte comparison | 0            | Byte-identical to archive, SHA256 `d0743e843a67569459b0d204dfa950b4a48a517c723261233a22c54a5367c88c`   |
| 1.7a | Scratch harness with wire reasoning-details check removed, `self-test`                                                                       | 1 (expected) | 90/93; mutant detected                                                                                 |
| 1.7b | Scratch harness with the wire provider comparison left at `OpenAI`, `self-test`                                                              | 1 (expected) | 54/93; mutant detected; SDK provider comparison retained in this narrower mutant                       |
| 1.7c | Scratch harness with probe cap check disabled, `self-test`                                                                                   | 1 (expected) | 92/93; mutant detected                                                                                 |
| 1.8  | `git diff --exit-code f4936be -- context/archive/`                                                                                           | 0            | Archive unchanged                                                                                      |
| 1.9  | `npx --no-install prettier --check context/changes/finder-verifier-frozen-sonnet`                                                            | 0            | All matched files formatted (before this review's bookkeeping writes)                                  |

Prettier must use the repository config when its target is outside the repository. The initial scratch formatting used defaults and differed only in layout; applying `.prettierrc.json` restored the exact archived bytes.

## Offline reproduction evidence

The safety delegate appended injected probe cases to a scratch copy of the committed harness, replacing its normal mode dispatch. The lead reran that copy with `npx --no-install tsx /tmp/fv-safety-qfx92m6a/probe-review.mjs self-test`. It exited 0 and produced the following actual observations; no credentials or network calls were used:

| Injected scenario                               | Attempt status / cause              | Sends | T          | Holds 1–4 | Outcome   |
| ----------------------------------------------- | ----------------------------------- | ----- | ---------- | --------- | --------- |
| Generation lookup HTTP 500                      | `ok`                                | 1     | $0.02      | all true  | `PROCEED` |
| Completion ID missing                           | `ok`                                | 1     | $0.02      | all true  | `PROCEED` |
| Malformed HTTP 200, repair HTTP 401             | `condition-violation / account-401` | 2     | $0.2049188 | all true  | `PROCEED` |
| Counter 10 → 11, cap $0.60, recorded cost $0.02 | `ok`                                | 1     | $1.00      | all true  | `PROCEED` |

The fixtures use the real `prepareProbe`, `runProbe`, gated fetch and sealed verification pipeline. They inject Anthropic completions with prompt_tokens 100, completion_tokens 5 and cost $0.02; generation and counter reads are injected separately. Raw logs are at `/tmp/finder-sonnet-review-zREUPC/checklist-repro.log`; these temporary paths are supplementary, while the scenarios and results above are the durable evidence.

## Manual 1.10 and push decision

Read the complete supplied `demo-checklists.txt`, including absent-field, encrypted-reasoning, missing-provider, excess-prompt-token, retry and budget-stopped examples. The explicit reasoning/provider/headroom refusal messages name the observation and next step. The budget-stopped example matches the plan's informational parser-outcome rule and is not a finding by itself.

Manual 1.10 is not confirmed: the additional condition-violation and incomplete-evidence cases produce conflicting or incomplete guidance. Keep its Progress row unchecked until the checklist corrections are reviewed.

Decision under the owner's request to handle steps 1–3: do not push `3f96b05` yet. Correct and re-review the checklist before the paid Phase 2 probe, then push the instrument; waiting until after spending would validate too late. Remote branch was read-only verified at `f4936be0ec939d4946acc3554df2a75c63a436b0` on 2026-10-11. No push or paid call was made during this review.

## Review Notes

- **Bookkeeping in diff**: change.md, plan-brief.md, plan.md, research.md under this change folder. The harness is evaluated as executable implementation even though it lives under context/.
- **Lessons**: 35 of 38 entries apply to impl-review by their stage tags. The failure-metric and diagnostic-honesty rules directly support F1–F3; production-specific lessons have no touched surface here.
- **Independent passes**: plan drift and safety/quality/patterns, each read-only with fresh context. Findings were reconciled against the plan and offline evidence.
- **Scope additions accepted for this review**: FV_OUT support for `plan`; bounded read-only generation polling; generation native reasoning as an additional probe observation. They do not alter the sealed series request or scoring.
- **Later-phase clarification**: Definitions E promises the stage-1 measured-token projection ($1.68) in the report, while Phase 1 says reporting stays unchanged and Phase 3 explicitly carries the projection into gate §10. Resolve the intended report placement before sealing; no Phase-1 missing-implementation finding is assigned.
- **Mutation gate**: Stryker skipped — this experiment harness does not change behavior behind the application's mapped risks in test-plan.md. The three Phase-1 scratch mutants above were run as required by this plan.
- **Uncommitted output**: this report and the change.md review/decision note. Existing plan.md Progress SHA suffixes are preserved and remain uncommitted. Skill review output is carried for the next implementation commit; no review commit was created.

To keep a hand edit to a carried file, re-adopt it:

```sh
rune_root=$(git rev-parse --show-toplevel) && cd "$rune_root" && C="$(git rev-parse --git-path rune)/finder-verifier-frozen-sonnet.carry" && p='context/changes/finder-verifier-frozen-sonnet/<file>' &&
rune_path=$(realpath -m -- "$p" 2>/dev/null || python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$p") && case "$rune_path" in "$(pwd -P)/context/changes/finder-verifier-frozen-sonnet/"?*) p=${rune_path#"$(pwd -P)/"} ;; *) echo "refused: $p is outside the change folder" >&2; false ;; esac && h=$(git hash-object -- "$p") && { [ -f "$C" ] && while IFS= read -r l; do [ "${l#* }" = "$p" ] || printf '%s\n' "$l"; done < "$C"; echo "$h $p"; } > "$C.new" && mv "$C.new" "$C"
```

## Re-review 2 (2026-10-11)

- **Scope**: Phase 1 (phases 1–5) — the report's scope
- **Session**: fresh — this session did not implement the phase or the fix commit
- **Base**: 3f96b05e134e9e39d177f224e29442ac54e0fd02 (previous round)
- **Head**: 5df870fc6f8a6e6bfdfe34eb3a4ca2151666450a
- **Worktree**: excluded — `git status --porcelain --untracked-files=all` was empty at review start
- **Checks ran at**: 5df870fc6f8a6e6bfdfe34eb3a4ca2151666450a (current HEAD)
- **Manual acceptance**: 0 of 1 confirmed — pending: 1.10 (the owner's 2026-10-11 decision holds the push until this round passes; it passes, so 1.10 is now the owner's read of the stubbed checklist)
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations (F6 added during the owner's manual 1.10 read)
- **Closes**: F1, F2, F3, F4

### Verdicts

| Dimension           | Verdict                  |
| ------------------- | ------------------------ |
| Plan Adherence      | PASS                     |
| Scope Discipline    | PASS                     |
| Safety & Quality    | PASS (1 observation, F5) |
| Architecture        | PASS                     |
| Pattern Consistency | PASS                     |
| Success Criteria    | PASS                     |

### How each earlier finding was verified

Incremental surface: one commit, `5df870f fix(finder-verifier-frozen-sonnet): address phase 1 review (p1)` — `harness.mjs` (+325/−53), `plan.md` (Phase 2 § Probe record items 7–8, outcome rules, precedence; Progress SHA suffixes), `change.md` (two owner-decision notes), and round 1 of this report. Every planned Phase 1 item outside that diff keeps round 1's evidence.

- **F1 — account / other condition violation can PROCEED → closed.** `probeChecklist` (`harness.mjs:1145`) now derives `account` from every sent request's status (401/402) or a `result.cause` of `account-*`, and pushes `STOP AND ASK (account)` first. A `condition-violation` that items 1–4 do not explain (a `measurement-error`, for one) pushes `STOP AND ASK (condition violation)`. I enumerated every `classifyAttempt` cause (`unbounded-request`, `account-*`, a latched provider/reasoning/bound violation, `measurement-error`): each reaches a blocking entry, through `UNDETERMINED: no successful response`, rule 2, rule 1 / `REOPEN PHASE 1`, rules 3–4 or the new catch-all. `failed-attempt` (plain format failure) and `budget-stopped` proceed, as plan Phase 2 now states. Precedence in code matches the plan's line (account → 2 → no success → 1 → 3–4 → other violation → 7 → 8). Mutant "account rule removed" (`if (account !== null)` → `if (false)`): self-test 103/105, failing exactly the 401 and 402 cases.
- **F2 — unread generation record passes as absent → closed.** `liveGeneration` (`harness.mjs:1105`) keeps the last status and an error string, retries a 404 or a connection failure up to ten times, and returns `{status, error}` on anything but a 2xx. The checklist builds `genReads` per successful response: no generation id, not looked up, or `status !== 200` → `NOT READ (<why>)` on line 1 and line 8, and `UNDETERMINED (item 8)` blocks. A record read with `provider_name` missing still prints `absent` and does not block. Mutant "generation rule removed": 100/105, failing exactly the five F2 cases (401, 500, exhausted 404, connection failure, missing id).
- **F3 — final spend above the cap proceeds → closed.** `runProbe` now passes `spend = {T: spendT(state), recorded, counterDelta, cap}` after the end counter read; `holdSpend = T ≤ cap + 1e-9` is item 7 and `STOP AND ASK (spend)` blocks; the CLI exits 3 on any non-PROCEED outcome (`harness.mjs:3388`). Mutant "spend rule removed": 104/105, failing the counter-Δ-$0.61 case; the $0.60 equality case holds in the unmutated run.
- **F4 — missing reasoning fields print as 0 → closed.** The wire record now carries `reasoningField` / `reasoningDetailsField` as `absent` / `null` / the value's type, kept apart from the derived counts; line 2 prints the raw state for the wire and labels the SDK counts `(derived)`. The SDK `reasoningDetails` becomes `null` when the metadata key is missing; its only readers use `?? 0` (`stepViolations`) or `fmt` (prints `absent`), so no comparison breaks. The null / `[]` case passes.

### Automated verification (re-run at 5df870f)

Every command's stdout and stderr went to a file under the session scratchpad; pass/fail is the exit status. `FV_PKG=~/.cache/finder-verifier-frozen-sonnet/fv-seal/packages/code-reviewer`, `FV_OUT=<scratch>/fvout`.

| Row  | Command                                                                                                                          | Exit         | Observed                                                                                                                                                                                                                                  |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | `git -C <wt> rev-parse HEAD HEAD:packages/code-reviewer/src`; `git -C <wt> status --porcelain`                                   | 0            | `9c85aa27…`, `9be94235…`; clean                                                                                                                                                                                                           |
| 1.2  | `npm test` in `<wt>/packages/code-reviewer`                                                                                      | 0            | 29 files, 1086/1086                                                                                                                                                                                                                       |
| 1.3  | `npx --no-install tsx context/archive/2026-10-09-finder-verifier-frozen/harness.mjs self-test`                                   | 0            | 72/72                                                                                                                                                                                                                                     |
| 1.4  | `npx --no-install tsx context/changes/finder-verifier-frozen-sonnet/harness.mjs self-test`                                       | 0            | **105/105** (93 in round 1 + 12 review cases)                                                                                                                                                                                             |
| 1.5  | `… harness.mjs dry-run`                                                                                                          | 0            | `"failures": []`                                                                                                                                                                                                                          |
| 1.6  | `… harness.mjs plan` → `prettier --config .prettierrc.json --ignore-path /dev/null --write` → `cmp` with the archived check file | 0            | byte-identical, sha256 `d0743e84…`. Without `--ignore-path /dev/null` prettier 3.9.6 silently skipped the scratch file (exit 0, 1-space indent kept) — a check that compares after formatting must confirm the formatter touched the file |
| 1.7a | scratch copy, wire `reasoning-details` check removed, `self-test`                                                                | 1 (expected) | 102/105                                                                                                                                                                                                                                   |
| 1.7b | scratch copy, `PROVIDER_NAME = "OpenAI"`, `self-test`                                                                            | 1 (expected) | 104/105                                                                                                                                                                                                                                   |
| 1.7c | scratch copy, `cap > PROBE_CAP_HARD` refusal removed, `self-test`                                                                | 1 (expected) | 104/105                                                                                                                                                                                                                                   |
| 1.8  | `git diff --exit-code -- context/archive/`                                                                                       | 0            | archive unchanged                                                                                                                                                                                                                         |
| 1.9  | `npx --no-install prettier --check context/changes/finder-verifier-frozen-sonnet`                                                | 0            | all matched files formatted (before this round was appended)                                                                                                                                                                              |

### F5 — A free read that throws after the paid attempt leaves the probe without a checklist or a way to finish

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: context/changes/finder-verifier-frozen-sonnet/harness.mjs:1122
- **Detail**: F2's rewrite of `liveGeneration` guards the `fetch` call, but the parse of a 2xx body (`(await res.json())?.data`, line 1122) sits outside the `try`. A 2xx response that is not JSON throws out of `runProbe`'s generation loop (`:1361`), and `main` rethrows anything that is not a `HarnessRefusal` (`:3428`). The same shape holds for the end counter read at `:1365`: `liveCounter` refuses on a non-2xx (`:876`), which exits 2 before the checklist. In both cases the paid attempt is done and its `end` line is journaled, but no `generation` or end `counter` line is written and no checklist is printed — and `runProbe` refuses an existing probe path (`:1288`), so the harness cannot finish the record; the owner reconstructs it by hand or authorizes a second paid probe, which "What We're NOT Doing" forbids without a new decision. Criterion 2.1 (journal complete, counters included) would then fail for a reason unrelated to the endpoint. This is not a regression of the fix and the failure needs OpenRouter to misbehave on a free GET, so it is an observation, but it is the one gap left in the "could not see, never absent" contract F2 established. The self-test cannot reach it: `liveGeneration` and `liveCounter` use the global `fetch`, not the injected `fetchImpl`.
- **Fix**: In `liveGeneration`, move the body parse inside the `try` (or wrap it) and record a non-JSON 2xx as `{ status, error: "2xx with a non-JSON body" }`, which the checklist already renders as `NOT READ (…)` and blocks with `UNDETERMINED (item 8)`. In `runProbe`, catch a `HarnessRefusal` from the end counter read, journal it (`kind: "counter", usage: null, error`) and let the checklist print with `counter Δ n/a` so item 7 reads from the recorded cost alone and the outcome is still decided from what was observed. Sibling: the series' end counter read at `:1013` is unchanged and needs nothing — a series resumes.
- **Decision**: FIXED (2026-10-11) — Fix as proposed, extended so an unread end counter blocks rather than prints: `liveGeneration` parses the 2xx body inside a guard and returns `{status, error}` on a non-JSON body; the checklist counts a record with an `error` as NOT READ whatever its status; `runProbe` journals a failed end counter read as `usage: null` with the error and the checklist prints `end counter NOT READ (…)` with outcome `UNDETERMINED (item 7)`; `seriesState` ignores a non-numeric usage. Plan Phase 2 items 7–8 and the outcome rules carry the two sentences. Self-test 107/107 (two new cases); mutants "item 7 counter rule removed" and "error-bearing record counted as read" each fail exactly one case; dry run and prettier pass. Siblings: the series' end counter read (`harness.mjs:1013`) n/a (a series resumes, and `liveCounter`'s refusal is the sealed stage-1 behaviour); `liveCredits` n/a (runs before any paid call); the start counter read in `runProbe` n/a (before the paid attempt, refusal costs nothing).

### F6 — The checklist contradicts itself on an unread generation record and uses "none" for "not read"

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/finder-verifier-frozen-sonnet/harness.mjs:1198 (`probeChecklist` lines)
- **Detail**: Raised from the owner's manual 1.10 read of the stubbed checklists (26 scenarios). With a generation record unread, line 1 ended `→ holds` while the same line said `NOT READ` and the outcome said "item 1 is incomplete"; lines 2 and 5 printed `[none]` (the empty-list word) for a record that was not read; a missing generation id printed as `absent:`; a request that threw printed `HTTP [200, absent]`; and two outcome messages (`STOP AND ASK (rule 1)` for a foreign wire provider, `UNDETERMINED: no successful response`) had no stub case, so the owner had never seen them. The decision logic was right in every scenario; the wording failed 1.10's "says what was observed, what is absent".
- **Fix**: Display-only edits in `probeChecklist`: line 1 ends `incomplete (generation record not read, item 8)` when `hold1` holds but `genRead` does not; `not read`, `no successful response`, `no id` and `error` replace `none` / `absent` where nothing was read; two self-test cases added for the unseen messages, and the F2 and connection-error cases assert the new wording. Rules and precedence untouched.
- **Decision**: FIXED (2026-10-11) — owner's "zgoda" on points 1–4 and 6 of the 1.10 read; point 5 (PROCEED after a format failure or `budget-stopped` without naming it in the OUTCOME line) left as the owner's rule. Self-test 109/109, dry run `failures: []`, prettier clean. Demo regenerated from the fixed harness to `demo-checklists.txt` (26 sections). Siblings: none (the wording lives only in `probeChecklist`; the series `report` mode prints no checklist).

### Notes

- **Bookkeeping in diff**: `context/changes/finder-verifier-frozen-sonnet/change.md`, `plan.md`, `reviews/impl-review-phase-1-3f96b05.md`.
- **Lessons**: 36 of 38 entries apply to impl-review by their stage tags (two are scoped to other stages). "A check that cannot say what it found is a safety defect" and "A guard metric that only exists on success cannot detect failure" are the priors behind F5.
- **Progress SHAs**: the nine Phase 1 Automated rows still carry `3f96b05`, while the harness they certify also changed in `5df870f`. The gate was re-run here at `5df870f` and passes, so the rows are true at the current head; a reader following the suffix alone would land on the pre-fix instrument. The implement skill's next commit, or the push, is the natural place to refresh them.
- **Delegation**: both passes were run in this session (one changed code file, 325 lines); no sub-agents.
- **Mutation gate**: Stryker skipped — the diff touches no code behind a `test-plan.md` §2 risk. The three plan mutants and three fix mutants above were run on scratch copies.
- **Uncommitted output**: this round and the carry record. No push and no paid call were made.
- **Owner decision during triage (2026-10-11)**: the $1.68 projection goes into gate §10 only; plan Definitions E amended, `report` mode unchanged. This closes round 1's "later-phase clarification" note.
- **New file**: `demo-checklists.txt` in the change folder — the stubbed checklist output the owner reads for manual 1.10; untracked, to be adopted by the next workflow commit or dropped by the owner.
