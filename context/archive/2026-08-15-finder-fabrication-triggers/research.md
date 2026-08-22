---
date: 2026-08-20T21:12:31+02:00
researcher: Claude (Fable 5)
git_commit: d32916f
branch: master
repository: lumina-clean-ai
topic: "Which real-diff properties trigger finder fabrication — characterize before building any fixture"
tags: [research, code-reviewer, finder, fabrication, truncation, evals]
status: complete
last_updated: 2026-08-20
last_updated_by: Claude (Fable 5)
---

# Research: Which real-diff properties trigger finder fabrication

**Date**: 2026-08-20T21:12:31+02:00
**Researcher**: Claude (Fable 5)
**Git Commit**: `d32916f`
**Branch**: `master`
**Repository**: lumina-clean-ai

## Research Question

`finder-security-vocabulary-bias` proved that "the diff is about security" is not a sufficient
condition for finder fabrication (50 synthetic rows, zero fabrications; real PR #127 diff, 2/8).
What actually triggers it? Characterize the properties of the reproducing artifact — diff size,
file count, truncation position, genuine ambiguity, committed review prose — so a representative
fixture can be designed instead of guessed at. Repo-only research; no paid probes were run.

## Summary

**"Fabrication" was never one defect.** Reconstructing the exact 100 KB windows the finder saw
(byte-validated against the Actions run log for the CI case) decomposes PR #127's four "fabricated"
findings into **three distinct mechanisms with three different causes**:

| Mechanism                                                   | #127 instance                                                                                                                               | What actually happened                                                                                                                                                                                                                                        | Whose defect                                                                                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1: Cap-manufactured falsehood**                          | F10 ("impl-reviewer.ts not provided in the diff")                                                                                           | The claim was **TRUE of the model's input** — the file starts at byte 110,771, past the 100,000-byte cap; the test file importing it is the last (cut) thing in-window. The archive refuted F10 against the _raw_ diff, not the window.                       | **Pipeline.** Same mechanism as the PR #143 impl-review incident — fixed for impl-review in #146, explicitly registered-and-unfixed for the finder. |
| **M2: Contradiction of visible defences**                   | F1, F2 (review.yml validation/regex); also `judge-diagnose-findings.json` F1 (`git ls-tree` "without `--`" — the `--` is in the shown diff) | The defence and its explanatory comment were fully in-window; the model asserted their absence anyway.                                                                                                                                                        | **Model.** The only "pure" fabrication class.                                                                                                       |
| **M3: Locality gap — defence real but not locally evident** | F7 (log-injection claim citing `cli.ts:220`)                                                                                                | The `logSafePath(...)` call + comment were in-window (CI variant), but the function **definition appears nowhere in the 215 KB diff** (unchanged code) — verifiable only via the getFileContext tool, which glm-4.6 never calls (0/4 even when strengthened). | **Model + tooling.** This is the change.md "genuine ambiguity" hypothesis, confirmed as a real instance.                                            |

**Every single-property hypothesis from change.md is falsified as a separator** by measurement
(§ Property falsification): raw size, line count, file count, truncation-per-se, review-prose
presence, and security-token density each have a **clean** artifact matching or exceeding the
reproducing one. What survives is a **conjunction**: _in-window content (code or prose) that
references security-relevant material the cap or the diff boundary has made invisible_. #127 is the
only measured artifact with that property — and it holds in both reproducing variants.

**Corrections to this change's own founding notes** (change.md:53-57):

1. The "2 of 8 fabrications locally" figure is actually a **severity-collapse-signature**
   reproduction. The probe prints only aggregate distributions; **no finding text from those runs
   was ever captured**, so fabrication was never graded locally. Fabrication has been observed
   exactly once — in the expired CI artifact, surviving as four quoted fragments.
2. "~$0.02 a probe" is unsourced. `finder-distribution.mjs` computes no cost and writes no output;
   the nearest real figure ($0.0203/row) belongs to the promptfoo fixture harness, a different
   instrument with 100× smaller inputs.
3. The probe shows the model **materially different bytes than CI did** for the same PR (two-dot
   vs three-dot, plan not excluded): under the probe's recipe the finder sees **zero source files**;
   under CI it saw `cli.ts` and `config.ts`. Both variants collapse — itself informative (visible
   source is not required) — but any future measurement must declare its variant.

**A free ground-truth exemplar sat unnoticed in the repo**:
`packages/code-reviewer/scripts/judge-diagnose-findings.json` — 14 cached finder findings on #127
(head `08f82f2`), 14/14 `critical`, containing an in-repo-verifiable M2 fabrication. Zero spend
needed to study the defect's shape.

## Detailed Findings

### 1. The reproducing artifact is actually three artifacts

| Variant                                      | Recipe                                                  | Bytes (post-exclusion)                  | Over cap   | Window contents                                                                                                                                   | Collapse observed                             |
| -------------------------------------------- | ------------------------------------------------------- | --------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| CI run 31725802000 (head `9c49a0c`)          | `git diff e8ebb66...9c49a0c` − `**/reviews/*.md` − plan | **215,560** (byte-exact vs Actions log) | 54% hidden | `.github/*`, `AGENTS.md`, ~58 KB change-doc prose, `cli.test.ts`, `cli.ts`, `config.test.ts`, `config.ts`, first 435 B of `impl-reviewer.test.ts` | 10 findings, 10/10 critical/security          |
| CI run 31723263888 (earlier head)            | same recipe                                             | 209,581                                 | over cap   | (not reconstructed)                                                                                                                               | same collapse                                 |
| Local instrument (`finder-distribution.mjs`) | `git diff 7c9c12f^1 7c9c12f` − `**/reviews/*.md` only   | **266,444**                             | 62% hidden | `.github/*`, `AGENTS.md`, change.md, plan-brief.md, **plan.md (50,884 B — half the window)**, partial research.md — **zero source files**         | 2/8 full collapse signature, 4/8 all-critical |

The two variants' shared trigger surface: workflow YAML + **58–82 KB of security-discussing
change-doc prose in-window, with the implementation hidden**. "Some source visible" vs "none" does
not change the outcome.

- Cap: `DIFF_CAP_BYTES = 100_000` exactly, pure byte-prefix + marker, no reordering —
  `packages/code-reviewer/src/pipeline.ts:40`, `:107-112`.
- Ordering is git path sort: `.github/` < `AGENTS.md` < `context/` < `packages/` < `src/` — prose
  systematically starves source (registered, unfixed: path-order bias,
  `context/archive/2026-08-19-review-diff-truncation/plan.md:75-77`).

### 2. Mechanism decomposition of the four #127 fabrications

Ground truth here is **window-relative** — the original archive graded against the raw diff and
thereby misclassified F10. Full quotes: `context/archive/2026-08-13-finder-security-vocabulary-bias/research.md:361-376`.

- **F10 (M1)**: "Missing implementation for `impl-reviewer.ts` … not provided in the diff. This is
  a critical security gap." `impl-reviewer.ts` begins at byte 110,771 of a 100,000-byte window —
  10,771 bytes past the cap. The model reported its input accurately; the severity/security framing
  is wrong but the absence claim is not. The finder is **never told its diff was truncated**: the
  only signal is the `[...diff truncated at 100 KB]` marker, which lands _inside_ `<review-unit>` —
  the block `src/prompts.ts:62` instructs the model to treat as data, never directives. The
  impl-review pass got an explicit "do not grade what you cannot see as MISSING" note in #146
  (`src/prompts.ts:257-262`, wired at `pipeline.ts:549`); `buildPrompt` for the finder
  (`src/prompts.ts:271-288`) has no such note.
- **F1/F2 (M2)**: claims about `review.yml` validation — the `[A-Za-z0-9._/-]` class and the "safe
  path set" comment were fully visible. Pure contradiction of shown text.
- **F7 (M3)**: "`PLAN_PATH` is directly interpolated into log messages without proper
  sanitization", citing `cli.ts:220`. In the CI window the `logSafePath(...)` call and its
  explanatory comment are visible, but the definition is **absent from the entire 215 KB diff**
  (only 2 occurrences: comment + call) — it is unchanged code, reachable only via getFileContext.
  glm-4.6 made 0 tool calls in 4/4 runs even with a strengthened instruction
  (`context/archive/2026-08-10-finder-file-context/verification.md:41,92-94`).
- The remaining six findings: 4 real-but-miscalibrated, 2 vacuous — severity territory, out of
  scope here (change.md "Do NOT conflate").

### 3. Why 50 synthetic rows were structurally incapable of reproducing

Every eval fixture is a **single-file diff of ≤3,546 bytes — 1/28th of the cap** — with maximal
defence locality (`hardening-defended.diff`: definition, call site, and explanatory comments all
inside one 55-line hunk). No fixture can exercise truncation (M1), invisible-but-referenced code
(M3), or prose-describing-hidden-implementation. The 0/50 result was over-determined: the fixtures
lacked the mechanism surface, not just the magic property. Fixture inventory:
`packages/code-reviewer/evals/fixtures/` (987–3,546 B), referenced from `promptfooconfig.yaml:124-341`.

Clean-row ledger for context: 20 (vocabulary-bias baseline) + 6 (severity-calibration counter) +
12 (structural-retry arms A/B) = **38 rubric-graded defended rows, zero fabrications**
(`…finder-severity-structural-retry/decision.md:19`), plus 30 matrix glm rows, plus live hardening
PRs #143/#146 — all on small or locality-perfect inputs.

### 4. Property falsification table

Measured on reconstructed diffs (commands + artifacts in scratchpad; `analyze-diff.mjs` simulates
the cap):

| Property                                                   | #127 CI (repro)                                      | #127 instrument (repro)                                     | hardening-defended (clean) | other fixtures (clean) | #143 (clean)                                                             | #86 control (clean)      | Verdict                                                                                                         |
| ---------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- | -------------------------- | ---------------------- | ------------------------------------------------------------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Bytes                                                      | 215,560                                              | 266,444                                                     | 2,451                      | 987–3,546              | 841,417                                                                  | 234,765                  | **Falsified** — #143 is 4× larger and clean                                                                     |
| Lines / added                                              | 4,024 / +3,284                                       | 4,584 / +3,838                                              | 60 / +51                   | ≤102                   | 10,549 / +10,283                                                         | 4,513 / +3,532           | **Falsified**                                                                                                   |
| File count                                                 | 27                                                   | 28                                                          | 1                          | 1                      | 17                                                                       | 56                       | **Falsified** — control has 56, clean                                                                           |
| Over 100 KB cap                                            | yes (54%)                                            | yes (62%)                                                   | no                         | no                     | yes (88%)                                                                | yes (57%)                | **Falsified alone** — #143 and control truncated, clean                                                         |
| `reviews/*.md` in diff                                     | no (excluded)                                        | no                                                          | no                         | no                     | no                                                                       | no                       | **Equalized** by the exclusion                                                                                  |
| `context/**` prose in-window                               | ~58 KB                                               | ~82 KB                                                      | no                         | no                     | prose+JSON fill window                                                   | HTML/CSS fill window     | **Falsified alone**                                                                                             |
| Security-token density (window, lines/KB)                  | 0.46                                                 | 0.36                                                        | 0.82                       | 0.00                   | 1.11                                                                     | 0.12                     | **Falsified** — fixture and #143 exceed #127, both clean                                                        |
| **In-window refs to invisible security-relevant material** | **YES** (F10 target off-window; F7 defence off-diff) | **YES, extreme** (all source invisible, prose describes it) | no (total locality)        | n/a                    | no (window is docs+JSON; nothing in-window claims an off-window defence) | no (no security subject) | **SURVIVING CANDIDATE — the only property present in both repro variants and absent from every clean artifact** |

Reading: #143 is truncated AND vocabulary-saturated but its window is documentation-plus-instrument
about itself; the control is truncated implementation with no security subject; the fixtures are
security subject with perfect locality. Only #127 combines _security-subject implementation_ with
_in-window references to material the model cannot see_.

### 5. Instrument audit — what must change before any measurement round

`packages/code-reviewer/scripts/finder-distribution.mjs` (sole commit `95da1e5`, PR #143; stale):

1. **Two-dot, hardcoded SHAs, single exclusion** (`:45-48`, `:95`) vs CI's three-dot + three
   exclusions (`.github/workflows/review.yml:183-185`). The `**/results/*.json` exclusion (#146)
   never reached the probe.
2. **No output capture** — `console.log` aggregates only (`:71-111`). This is why the 2/8 runs'
   texts don't exist.
3. **No cost telemetry** — the $0.02 figure is unsourced.
4. **Re-implemented `capDiff` copy** (`:36-43`) importing only constants; `mergeFindings` /
   `assignFindingIds` bypassed (calls `review()` directly, `:103`).
5. Model resolution reads legacy `OPENROUTER_MODEL` and **ignores `OPENROUTER_REVIEW_MODEL`** (the
   var CI sets, `review.yml:219`) — a repo-variable model change would silently not reach probes.
6. Settings that ARE faithful: tool-less confirmed (`hasSource === false` → `tools: {}`,
   `src/reviewer.ts:131,146-149`); `maxOutputTokens: 16_384` (`src/config.ts:57`); no temperature
   set anywhere in the package; `maxRetries: 0` (`src/reviewer.ts:153`).

Free exemplar: `scripts/judge-diagnose-findings.json` — 14/14 critical on #127 head `08f82f2`,
incl. the verifiable M2 case ("`git ls-tree` without `--`" vs `git show
08f82f2:.github/workflows/review.yml` line 132, which contains `--`). `judge-diagnose.mjs` is the
more recipe-faithful script (three-dot + plan exclusion, still missing `results/*.json`).

### 6. Operational definitions (for the next instrument)

Three layers existed; only the llm-rubric ever graded a paid run
(`promptfooconfig.yaml:284-300`, judged by neutral `gemini-3.1-pro-preview`): FAIL iff a finding
claims one of four _enumerated_ defences "is missing, absent, not applied, not performed, or that
the code permits what the defence prevents". The retired deterministic regex died after seven
rounds (16/20 false alarms on clean sentences; post-mortem `evals/assertions.mjs:219-245`; lesson
`lessons.md` "Don't grade natural language with regexes"). **Implication for the real diff**: a
#127 grading rubric needs a window-relative defence inventory (the F1/F2/F7/F10 targets are the
natural list), and must grade M1/M2/M3 separately — M1 "fabrications" are truthful model output.

## Code References

- `packages/code-reviewer/src/pipeline.ts:40,107-112` — `DIFF_CAP_BYTES`, `capDiff` (byte-prefix + in-band marker)
- `packages/code-reviewer/src/prompts.ts:62` — untrusted-fencing sentence that swallows the truncation marker
- `packages/code-reviewer/src/prompts.ts:257-262` vs `:271-288` — impl-review got the truncation note; finder didn't
- `packages/code-reviewer/src/reviewer.ts:131,146-153` — tool-less path, retries, token cap
- `packages/code-reviewer/scripts/finder-distribution.mjs:36-43,45-48,95-103` — probe divergences
- `packages/code-reviewer/scripts/judge-diagnose-findings.json` — free 14/14-critical exemplar w/ verifiable fabrication
- `packages/code-reviewer/evals/fixtures/` — five fixtures, 987–3,546 B, locality-perfect
- `packages/code-reviewer/evals/promptfooconfig.yaml:266-330` — `no_fabricated_absence` rubric + suppression guard (stale comment at `:279` references a deleted `fabrication_floor`)
- `.github/workflows/review.yml:164-185` — diff recipe + exclusion rationale naming this defect class

## Architecture Insights

1. **The pipeline can manufacture falsehood from truthful model output** (M1). `review-diff-truncation`'s
   own framing: "The model was not wrong … `MISSING` was the correct inference" — sound only under
   the unstated precondition that the diff is complete. That precondition is now guarded for the
   impl-review pass and still unguarded for the finder.
2. **Git path sort is a systematic starvation bias**: `context/` prose always precedes `packages/`
   source, so prose-heavy PRs review their own documentation instead of their code. Registered,
   unfixed (`review-diff-truncation/plan.md:75-77`).
3. **The truncation marker is fenced as untrusted data** — the one in-band signal of incompleteness
   sits inside the block the model is told never to obey.
4. **Tool availability does not mitigate M3 for glm-4.6** — 0 tool calls in 4/4 runs; a defence
   whose body is off-diff is unverifiable in practice.

## Historical Context (from prior changes)

- `context/archive/2026-08-13-finder-security-vocabulary-bias/` — INVALID-FIXTURE decision; definitions, 2/8 collapse runs (`research.md:83-92`), control #86 (`:94-118`), #127 finding quotes (`:361-376`)
- `context/archive/2026-08-19-review-diff-truncation/` — the #143 incident quantified; impl-review fixes shipped; **finder's identical gap + path-order bias registered as follow-ups** (`plan.md:72-77`)
- `context/archive/2026-08-10-finder-file-context/` — review-docs echo at critical severity; first truncation/path-order observation (run 31425150007); glm-4.6 0/4 tool calls
- `context/archive/2026-08-15-finder-severity-calibration/`, `2026-08-19-finder-severity-structural-retry/` — 18 more clean defended rows; severity is a separate axis (control shows monotony without security content)

## Related Research

- `context/archive/2026-08-13-finder-security-vocabulary-bias/research.md` — the predecessor whose raw-diff grading this document corrects
- Scratchpad artifacts (reproducible inputs; session-scoped): `pr127-reviewed.diff`, `pr127-instrument.diff`, `pr143-reviewed.diff`, `pr86-control.diff`, `*.cap100k`, `analyze-diff.mjs`. Persistent scratch refs in-repo: `refs/scratch/pr127`, `refs/scratch/pr143` (remove with `git update-ref -d refs/scratch/pr127` etc., or keep for the plan phase).

## Open Questions — and the pre-registered ablation ladder

The conjunction hypothesis (**H\***): _fabrication requires in-window, security-subject content
referencing material made invisible by the cap or diff boundary._ Falsifiable, and cheap to test by
ablation from the reproducing artifact. Prerequisites (instrument work, belongs in the plan):

- **P1**: probe captures full per-run finding JSON (fixes the never-captured gap)
- **P2**: probe reproduces the CI recipe exactly, or pre-declares its variant per rung
- **P3**: window-relative ground-truth inventory for #127 (grade M1/M2/M3 separately)
- **P4**: cost telemetry per run (replace the unsourced $0.02)

The ladder — each rung ablates ONE property from the #127 instrument-variant input; pre-registered
predictions under H\*; n per rung to be set in the plan (the base rate is 2/8 collapse + CI 2/2, so
n=8 is the floor, n=20 preferred):

| Rung | Ablation                                                                                                  | H\* predicts                                                                           | This rung falsifies H\* if                         |
| ---- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| R1   | **Lift the cap** (feed all 266 KB)                                                                        | M1 disappears (nothing invisible); M2 may persist; collapse rate drops                 | fabrication rate unchanged with everything visible |
| R2   | **Exclude `context/**` prose** (window fills with source instead)                                         | fabrication + collapse stop or drop sharply — prose-describing-hidden-code is the seed | rate unchanged with prose gone                     |
| R3   | **Keep prose, drop all code refs** (prose-only window)                                                    | M2 impossible (nothing visible to contradict); M3-style claims persist                 | no claims about invisible code at all              |
| R4   | **Neutralize subject** (control #86 already ran: truncated non-security → 0 fabrications, monotone-nit)   | — existing evidence, no new run needed                                                 | —                                                  |
| R5   | **Truncation note for the finder** (the #146-style sentence — an intervention, not an ablation; run last) | M1-class claims become "could not verify"                                              | note has no effect on M1-class claims              |

Existing natural experiment already on record: instrument window (zero source) vs CI window (4.5
source files) both collapse → visible source is neither necessary nor protective.

Open questions the ladder does not answer:

1. Does M2 (contradicting visible defences) have its own trigger independent of truncation? F1/F2
   and the judge-diagnose F1 all occurred in truncated runs; no non-truncated observation of M2
   exists. R1 is the discriminating rung.
2. Is severity collapse a co-symptom or a cause? (Out of scope per change.md; the control says
   monotony exists without security content — track separately.)
3. Should the finder's truncation fix (R5) simply ship regardless of ablation outcomes? It is
   already a registered follow-up of `review-diff-truncation`, and M1 needs no further evidence —
   arguably the plan's cheapest first phase.
