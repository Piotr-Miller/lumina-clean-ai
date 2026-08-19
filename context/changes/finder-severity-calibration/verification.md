# Pre-registration — finder severity calibration

**Committed before any measurement exists.** Git history proves the ordering: this file's commit
precedes every `results/*.json` commit in this change. Nothing below may be edited after a number
arrives except by appending a dated amendment that says what changed and why — the same discipline the
predecessor used (`context/archive/2026-08-13-finder-security-vocabulary-bias/verification.md`).

## What is being tested

**Claim under test:** the finder grades a detected cross-user authorization-boundary violation below
`major` because its prompt contains no severity rubric at all, and adding one will fix it.

**The alternative that must stay live:** the rubric is prompt-level, and `lessons.md` records three cases
in this package where a prompt fix failed and a structural one worked. Phase 3 exists because this
alternative is credible, not as a formality.

## Metrics

### 1. `defect_reported` — the target

Existing grader `requireDefectReported` (`evals/assertions.mjs:311`). Requires the **same** finding to
name the defect in `description` or `suggestion` **and** carry `critical` or `major`. Field-scoped: it
does not search `evidence` or `summary`, so a quoted vulnerable line cannot satisfy it.

**Committed baseline: 10 / 20** (`baseline-n20.json`, 2026-08-14).

### 2. Monotony rate — the mechanism

Share of draws with **more than one finding, all carrying the same severity**. No API call; computed
from any promptfoo snapshot:

```
jq -r '.results.results[] | (.response.output | if type=="string" then (fromjson? // {}) else . end
  | [.findings[]?.severity]) as $s | "\($s|length)\t\($s|unique|length)"'
```

A draw counts as monotone when the first column is > 1 and the second is 1.

**Committed baseline: 8 / 20 monotone on the vulnerable fixture** (7× `minor`, 1× `nit`); 11 / 20 on the
defended fixture (9× `minor`, 2× `nit`).

This metric exists because the target alone can be satisfied the wrong way. Pushing every severity up
would score 20/20 while leaving the distribution just as collapsed — that is the failure mode PR #146
run `32255940666` already demonstrated live (8 findings, **all `critical`**, on a clean PR).

### 3. Counter-checks — non-negotiable

- `no_false_alarms` on `clean-change.diff` (`reviewMustPass`): a `critical` or `major` on a defect-free
  diff is a manufactured finding.
- The defended fixture's `no_fabricated_absence` rubric gate.

**A run that meets the target while failing either counter-check is a FAILURE, not a partial win.**
This is stated here, before the numbers, precisely because it is the reading that will be tempting to
soften afterwards.

## Sample size, stated honestly

Every claim below rests on **n = 20 per arm**. A "20/20" result has a 95% lower bound near 83% — it is
consistent with a true rate anywhere from about 0.83 to 1.0. The pre-registered bar is therefore set on
what n=20 can actually distinguish, and no claim of "fixed" will be made stronger than the sample
supports. Where an arm ends up with a different n, the count is stated with the number, never implied.

## The decision table — total over the outcome space

Read against the **rubric arm** (Phase 2), comparing to the **Phase 1 re-measured baseline**, not the
2026-08-14 snapshot. Every cell has a disposition; there is no "decide when we see it".

| `defect_reported` | Counter-checks | Monotony        | Disposition                                                                                                                      |
| ----------------- | -------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **20 / 20**       | clean          | improved        | **PASS — ship the rubric, delete Phase 3.** The lever is identified and the mechanism moved.                                     |
| **20 / 20**       | clean          | unchanged/worse | **PARTIAL — ship, but Phase 3 stays open** as a follow-up change. Target met by pushing the constant up, not by differentiating. |
| **20 / 20**       | **inflated**   | any             | **FAIL. Do not ship.** Bought with over-reporting. Escalate to Phase 3.                                                          |
| **17–19 / 20**    | clean          | any             | **SHORT — escalate to Phase 3.** Real movement, insufficient for an authorization-boundary guarantee at this n.                  |
| **≤ 16 / 20**     | clean          | any             | **SHORT — escalate to Phase 3.** The prompt lever is not sufficient; this is the outcome `lessons.md` predicts.                  |
| any               | **inflated**   | any             | **FAIL. Do not ship.** Counter-checks are non-negotiable regardless of the target.                                               |
| **< baseline**    | any            | any             | **REGRESSION — revert the rubric,** record it, and treat the wording as the suspect before escalating.                           |

### Escalation rule, fixed in advance

"Falls short" = any row above whose disposition contains SHORT or FAIL. Only a **PASS** row stops the
change at Phase 2. A **PARTIAL** ships the rubric but does not close the question.

## Phase 1 drift rule

The Phase 1 re-measurement exists to control for hosted-model drift behind a stable model id
(`z-ai/glm-4.6`). Fixed in advance:

- If the re-measured baseline is **materially different** from the committed 10/20, the 2026-08-14
  snapshot is not a valid comparator, and every Phase 2 comparison uses the **re-measured** baseline
  only.
- "Materially different" means outside 7–13 / 20 — roughly the range two draws of n=20 from the same
  true rate can differ by chance. Inside that band, treat the population as unchanged and say so.
- Under no circumstance is the more flattering of the two baselines selected after seeing the Phase 2
  result.

## Budget

Ceiling **~$0.15 total** (user-set, 2026-08-19), covering: Phase 1 baseline, Phase 2 rubric, Phase 2
counter-checks, and one Phase 3 structural round. Roughly $0.04–$0.05 per n=20 single-fixture run at
glm-4.6 prices. Spend is recorded per run in `decision.md`; exceeding the ceiling requires stopping and
asking, not quietly continuing.

## What this pre-registration does NOT claim

- Not that the rubric will work. That is the hypothesis, and the table gives the alternative a
  pre-agreed home.
- Not that 20/20 at n=20 proves the defect class is eliminated. It bounds it; the interval is stated
  above.
- Not that the fixture reproduces every real-world instance of this defect. It reproduces **one**
  indisputable case, which is what makes it a usable instrument — and the predecessor's finding that a
  fixture can fail to reproduce a live defect applies here too.

---

## AMENDMENT — Phase 1 result, 2026-08-19 (appended after the run; nothing above was edited)

**Re-measured baseline: `defect_reported` = 15 / 20.** Committed 2026-08-14 baseline: 10 / 20.
Cost: $0.0234. Snapshot: `results/baseline-rerun-n20.json`.

**The drift rule fires.** 15 is outside the pre-registered 7–13 band, so by the rule written above the
2026-08-14 snapshot is **not a valid comparator**, and every Phase 2 comparison uses **15 / 20** as the
baseline. This is the disposition the rule assigned in advance; it is being applied as written, and it is
the less convenient of the two options — a 15/20 baseline leaves the rubric far less room to look
impressive than a 10/20 one would.

| Metric             | 2026-08-14 (n=20) | 2026-08-19 (n=20)     |
| ------------------ | ----------------- | --------------------- |
| `defect_reported`  | 10                | **15**                |
| Monotone draws     | 8                 | **6**                 |
| Monotone constant  | 7× minor, 1× nit  | 4× minor, 2× critical |
| Zero-finding draws | 0                 | 0                     |

**What this does and does not establish.** Two n=20 draws differing 10 vs 15 is a large gap, but the
sample cannot separate three explanations: genuine provider drift behind the stable `z-ai/glm-4.6` id,
ordinary sampling variance (already documented at extreme levels — PR #146 produced 8 findings and 0
findings from a byte-identical prompt), or some difference between the promptfoo invocations. **No claim
is made about which.** The rule exists precisely so this ambiguity is resolved by a rule rather than by
preference, and the conservative baseline is the one adopted.

**The defect class is unchanged and still present.** All five failing draws reported findings — zero
silence, consistent with the earlier read — and four of the five graded **every** finding `minor`. The
fifth mixed `critical` + `minor` but still filed the traversal below `major`. So the target is intact:
a detected cross-user authorization-boundary violation is still being filed below `major` in 5 of 20
draws.

**Monotony is more informative than the count suggests.** 6/20 monotone, but the constant is now `minor`
4× and **`critical` 2×** — the collapse runs in both directions on the same fixture. This corroborates
what PR #146 run `32255940666` showed live and confirms the Phase 2 wording constraint: a rubric that
only pushes authorization findings up would convert one collapse into the other, and the monotony metric
is what will catch it.

**Budget consumed: $0.0234 of ~$0.15.**
