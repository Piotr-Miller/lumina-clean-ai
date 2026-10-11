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
