# Phase 4 — Live probe: pre-registered design

**Status: EXECUTED 2026-08-13 — all criteria closed (4.2–4.8).** Everything above the `## Outcome`
heading was written **before** the probe ran and has not been edited since; the git history shows the
pre-registration (`e5e33b1`) landing before any result existed. See `## Outcome` for the result
against each criterion. 4.8 initially could not be computed at all; the instrumentation it needed was built in PR #132 and the ratio is recorded below.

## Why this file exists before the run

`context/foundation/lessons.md`: _an offline eval proves capability exists, not that it will be
used._ The `finder-tool-loop-evals` change established the harder version of that rule the expensive
way — two models were nearly adopted on fixture evidence that did not survive a live probe
(`deepseek-v4-flash`: 6/6 on fixtures, 0/3 live). The countermeasure is to decide **what result would
falsify the claim** before seeing any result.

That discipline is under specific pressure here, which is the reason this file is written first
rather than alongside the run:

- The phase-2 local probe (criterion 2.15, below) **already** showed two of the four behaviours this
  phase measures. Writing the bar after seeing that would be anchoring, not pre-registration.
- The bar below is therefore deliberately stated in terms a run can **fail**. If every criterion is
  written so that anything counts as a pass, the probe measures nothing.

## Probe construction

A throwaway PR whose ground truth is known because we injected it.

| Element                | Value                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch                 | `scratch/impl-review-probe`                                                                                                                                               |
| PR                     | to `master`, **non-draft** (`review.yml` skips drafts), title prefixed `DO NOT MERGE — scratch:`                                                                          |
| Plan                   | `context/changes/probe-impl-review/plan.md`                                                                                                                               |
| Plan supplied via      | explicit `Plan: context/changes/probe-impl-review/plan.md` line in the PR body (the body override, criterion 1.8 — deterministic, not dependent on the convention lookup) |
| Probe "implementation" | `context/changes/probe-impl-review/impl/*.ts`                                                                                                                             |

**Why `context/changes/` holds the probe files.** Root `tsconfig.json` excludes `context/changes`, and
`eslint.config.js` ignores `context/changes/**`, so probe files cannot break the `ci` job — but
`review.yml` strips only `**/reviews/*.md` and the plan file itself from the reviewed diff, so the
probe's `impl/*.ts` files **do** reach the pass as ordinary diff content. The probe is therefore
realistic to the reviewer and invisible to every other gate. `packages/code-reviewer` is untouched,
so the `code-reviewer` job is unaffected.

**These files are never merged.** The branch is deleted after the probe.

## Injected ground truth

The scratch plan declares four changes and one exclusion. The diff then deviates in three specified
ways, keeps one control, and adds one benign unplanned helper.

| #   | Injected state       | Plan says                                                                                                        | Diff does                                                          | Correct verdict                   |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------- |
| 1   | **MATCH** (control)  | `impl/rate-limit.ts` adds `RATE_LIMIT_MAX` + `isRateLimited(count)`                                              | exactly that                                                       | no finding                        |
| 2   | **DRIFT**            | `impl/retry.ts` adds `retryDelayMs(attempt)`, plan states outright "backoff is exponential, never a fixed delay" | returns a fixed `2000`                                             | flagged, `plan_adherence`         |
| 3   | **MISSING**          | `impl/audit-log.ts` adds `recordAudit(event)`                                                                    | file absent from the diff entirely                                 | flagged, `plan_adherence`         |
| 4   | **PROHIBITED EXTRA** | "What We're NOT Doing": _no in-memory caching layer — cache invalidation is out of scope for this slice_         | adds `impl/cache.ts`, a `Map`-based cache                          | flagged, `scope_discipline`       |
| 5   | **BENIGN EXTRA**     | not mentioned anywhere, not excluded                                                                             | adds `impl/clamp.ts`, a 3-line helper used only by `rate-limit.ts` | unflagged, **or** WARNING at most |

The scratch plan also carries an Automated Verification checkbox — `` - [x] `npm test` `` — checked, so
the "author claims this passed" case is present for criterion 4.7 to be tested against.

Cases 4 and 5 together are the load-bearing pair: they separate a reviewer that **understands
exclusions** from one that merely pattern-matches "unplanned". A reviewer that flags both, or neither,
has failed to make the distinction even if its raw hit-rate looks fine.

## The bar, written in advance

| #   | Criterion                     | PASS requires                                                                                   | FAIL is                                                                                                |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 4.3 | MISSING caught                | a finding naming `audit-log.ts` / `recordAudit` as planned-but-absent                           | silence, or naming it as something other than missing work                                             |
| 4.4 | DRIFT caught                  | a finding naming the fixed delay as contrary to the plan's stated exponential-backoff decision  | silence, or flagging `retry.ts` only on generic style grounds without reference to the plan's decision |
| 4.5 | Prohibited EXTRA flagged      | a `scope_discipline` finding naming `cache.ts` as excluded-but-implemented                      | silence, or flagging it as merely "unplanned" without connecting it to the exclusions list             |
| 4.6 | Benign EXTRA not over-flagged | `clamp.ts` unflagged, or flagged at WARNING/OBSERVATION                                         | any CRITICAL on `clamp.ts` — that is a **false positive** and fails this criterion                     |
| 4.7 | No fabricated command results | no claim, implication, or assumption anywhere in the output that a check ran, passed, or failed | any sentence asserting an observed command result, including agreeing that `npm test` passed           |
| 4.2 | Run completes                 | `ai-review` run green, `ai-review-output` artifact uploaded with `review.json` + `comment.md`   | technical failure, or a run producing no artifact                                                      |

**Additional falsifiers — any one of these is a phase-4 failure even if 4.3–4.7 all pass:**

- The pass reports a MISSING finding for work named only in "What We're NOT Doing". Excluded work is
  never missing work; this is the contradiction the vendored criteria resolve deliberately
  (plan-review F2), and a violation means the resolution did not take.
- `implReview.status` is `reviewed` but the grades contradict the findings in a way the phase-2
  consistency rules should have rejected — that would mean validation is not running in the real path.
- The `ai-cr:*` labels or the job's exit code differ from what the same PR would produce with the pass
  disabled. The pass is advisory; if it can change either, isolation has failed.

## Cost record (to be filled from the run)

Read from the uploaded `review.json`, not from a provider dashboard — a dashboard figure cannot be
correlated across retries or concurrent runs (plan-review F3).

| Measure            | Source                         | Value                             |
| ------------------ | ------------------------------ | --------------------------------- |
| Impl-review spend  | `implReviewTelemetry.cost`     | **$0.199620**                     |
| Impl-review tokens | `implReviewTelemetry`          | 33,675 in / 13,227 out, 1 attempt |
| Finder spend       | `finderTelemetry.cost`         | $0.003983 (7,940 in / 325 out)    |
| Judge spend        | `judgeTelemetry.cost`          | $0.017104 (3,852 in / 940 out)    |
| Baseline           | finder + judge                 | $0.021087                         |
| **Ratio**          | impl-review ÷ (finder + judge) | **9.47×**                         |

Source: run [31735830016](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31735830016) on
PR #132, read from the uploaded `review.json` and echoed by the CLI as
`review cost: finder=$0.003983 judge=$0.017104 impl=$0.199620 impl/(finder+judge)=9.47x`.

**The criterion was uncomputable until the instrumentation was built.** `finderTelemetry` had no
`cost` key — the per-step value was computed by `describeFinderStep` and dropped — and the judge had
neither a telemetry block nor `usage: { include: true }`, so its cost was permanently undefined. The
numerator was instrumented and the denominator did not exist. Built in PR #132.

**9.47× is the number to sit with.** The implementation review costs nearly ten times the entire code
review it rides alongside, on a moderate PR. That is not a rounding error on the existing bill — it
is the bill. Whether it is worth paying on every plan-bearing PR is a product decision, not a
technical one, but it should now be made deliberately rather than discovered in an invoice.

The ratio is the decision-relevant number, not the absolute — an absolute nobody can calibrate is how
the 57.6× finder premium nearly got adopted. Pre-registered reference point: the phase-2 local probe
cost **$0.236084** for one call on a 22.8k-char plan and a 92.3k-char diff. A probe run materially
above that on a much smaller diff would itself be a finding worth chasing.

## Prior evidence — NOT this probe

Criterion 2.15 ran the pass locally against a **real archived** plan
(`context/archive/2026-08-10-finder-file-context/plan.md` at merge commit `bf15246`), reconstructing
that PR's implementation surface. Result: `NEEDS_ATTENTION`, 51407/13327 tokens, **$0.236084**, two
findings — an unplanned `finder-max-steps` action input the plan had explicitly excluded, and a
Progress checkbox (2.4, "nothing else moved") the diff contradicts.

**This is not the phase-4 probe and does not substitute for it**, for two reasons:

1. Its ground truth was **discovered, not injected** — nobody wrote down beforehand what that diff
   contained, so it cannot falsify anything.
2. It exercised only the prohibited-EXTRA and suspicious-manual-claim paths. MISSING, DRIFT, and the
   benign-EXTRA false-positive case were never presented to the model at all.

It is recorded here as encouraging prior evidence and as the cost reference point above — and as the
explicit reason this bar was written before the probe ran.

## Outcome

Executed 2026-08-13 against the ground truth above, **unchanged since pre-registration**.

**Run twice — locally first, then as the recorded design.** The first execution was local
(`scratchpad/phase4-probe.mjs`), because `review.yml` declares `branches: [master]` and a
master-based PR would have checked out _master's_ reviewer, which did not yet contain the third
pass. After #127 merged, the probe ran **exactly as pre-registered**: scratch branch
`scratch/impl-review-probe`, PR [#128](https://github.com/Piotr-Miller/lumina-clean-ai/pull/128) to
master, `Plan:` body override, probe files under `context/changes/probe-impl-review/`.

Both runs agree, which is the useful part:

|          | Local (`phase4-probe.mjs`)  | CI, run [31732703115](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31732703115) |
| -------- | --------------------------- | ----------------------------------------------------------------------------------------------- |
| Verdict  | REJECTED                    | REJECTED                                                                                        |
| Findings | 6                           | 6 (same six, same dimensions and severities)                                                    |
| Grades   | 3 FAIL / 2 WARNING / 2 PASS | identical                                                                                       |
| Cost     | $0.068316                   | $0.057188                                                                                       |
| Attempts | 1                           | 1                                                                                               |

One difference worth recording: the CI run anchored **none** of its findings to a file, while the
local run anchored four of six. The bar never required file anchors, so this is not a criterion
failure — but a finding that names `cache.ts` only in its prose is harder to act on than one the
renderer can link, and it is drift worth watching rather than discovering later.

Result: `REJECTED` — `plan_adherence` FAIL, `scope_discipline` FAIL, `architecture` FAIL,
`safety_quality` WARNING, `test_coverage` WARNING, `pattern_consistency` PASS, `success_criteria` PASS.

| #   | Criterion                        | Result   | Evidence                                                                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 4.3 | MISSING caught                   | **PASS** | P1 (CRITICAL, `plan_adherence`): "audit-log.ts / recordAudit never implemented … The diff contains no such file"                                                                                                                                                                                                                                       |
| 4.4 | DRIFT caught                     | **PASS** | P2 (CRITICAL): quotes the plan's "never a fixed delay" decision and identifies `void attempt; return 2000` as "exactly the fixed-delay behavior the plan calls out as wrong". Filed under `architecture` rather than `plan_adherence` — the bar named the substance, not the dimension, and a contradicted architectural decision is a defensible home |
| 4.5 | Prohibited EXTRA flagged         | **PASS** | P3 (CRITICAL, `scope_discipline`): quotes the exclusion verbatim, then names `cache.ts` as "exactly that". Connected to the exclusions list, which is what the bar required                                                                                                                                                                            |
| 4.6 | Benign EXTRA not over-flagged    | **PASS** | P6 (**OBSERVATION**/LOW): "only used by rate-limit.ts, so it is incidental to planned work rather than a scope violation on its own." Not CRITICAL, and the reasoning is the right one                                                                                                                                                                 |
| 4.7 | No fabricated command results    | **PASS** | No claim anywhere that a check ran. P5 refers to the plan "marking `npm test` as already satisfied" — describing the author's claim, never asserting an observed result                                                                                                                                                                                |
| 4.2 | Run completes, artifact uploaded | **PASS** | PR #128, run 31732703115: green, `ai-review-output` carries `review.json` + `comment.md`, `implReview.status: reviewed`                                                                                                                                                                                                                                |

**Additional falsifiers — all clear.** No excluded work was reported as missing (the second exclusion,
distributed rate limiting, was correctly silent). Grades agree with findings: every CRITICAL sits on a
dimension graded FAIL, and the verdict is REJECTED, so the phase-2 consistency rules held on live
output. Labels/exit code not applicable to a local run.

**Unplanned true positive.** P4 (WARNING) found a real defect in the probe fixture itself: `cacheSet`
stores raw `ttlMs` as `expiresAt` without adding the current time, and `cacheGet` treats any
`expiresAt >= 1` as valid, so nothing ever expires. That bug was not injected deliberately — the pass
found a genuine one while correctly flagging the file as out of scope.

### Blocking gap found: criterion 4.8 cannot be computed as written

4.8 asks for the impl-review cost "stated as a ratio against the run's finder+judge spend", read from
`review.json`. **That baseline does not exist.** On run
[31723263888](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31723263888):

- `implReviewTelemetry`: `{attempts: 1, inputTokens: 61493, outputTokens: 16976, cost: 0.292746}` ✅
- `finderTelemetry`: tokens only — **no `cost` key**, despite `createReviewer` enabling usage accounting
- the judge: **no telemetry block at all** — none was ever designed

So the numerator is instrumented and the denominator is not. Either the finder's missing cost is
investigated and a judge telemetry block added, or 4.8 is restated in terms of what is actually
measurable. This is a pre-registration doing its job: the criterion was written before anyone checked
whether the data existed.

**Standing.** 4.2–4.7 pass, reproduced identically across a local run and the pre-registered CI run.
That is two samples, not a rate — the bar asked whether the pass _can_ make these distinctions, and it
did, including the prohibited-vs-benign EXTRA pair that separates understanding exclusions from
pattern-matching "unplanned". It does not tell you how often it will.
