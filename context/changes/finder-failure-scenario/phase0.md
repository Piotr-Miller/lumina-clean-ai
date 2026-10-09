# finder-failure-scenario — Phase 0: free retrospective of the reporting bar

> Owner decisions (2026-10-09, `change.md` § Owner decisions): direction approved for Phase 0 only; gate unchanged;
> the bar applies to every finding regardless of category. Phase 0 makes **no paid call**. Everything below
> § Pre-registration was written, formatted and hashed before any row was graded.

## Pre-registration

### 1. Question

Would requiring a concrete failure scenario on every finding have removed the findings the owner rejected, while
keeping every reported D2? And how much of that removal could deterministic code enforce?

This is a retrospective over findings written **without** the bar. It cannot show how a finder writes **under**
the bar, and it cannot measure recall (§7).

### 2. The proposed reporting bar

A finding satisfies the bar when all three parts hold.

- **T: trigger.** It names a concrete input or reachable state of the code **at the head**. "If a future edit…",
  "fragile to refactors" and "could in principle" are not triggers. A finding that calls its own scenario latent or
  future-only fails T on its own words.
- **W: wrong result.** It names an observable incorrect result that follows from T: a wrong value or output, a
  crash or uncaught exception that aborts the work, a leak, loss or overwrite of data or files, a security
  exposure, or a decision or exit status that contradicts the code's own documented contract.
  - These are **not** wrong results: a missing test or missing documentation by itself; a naming, style or
    consistency preference; a performance cost with no stated consequence; and an outcome the finding itself
    describes as the documented one (for example "exits 1") whose only complaint is a less friendly message.
  - A **testing** finding meets W only when it names the concrete wrong result that the missing test would let
    through, reachable per T.
- **L: location.** The finding's cited `file` is a path in the frozen diff, and its `[startLine, endLine]`
  (`endLine` defaulting to `startLine`) overlaps either:
  - the head-side line span of a hunk of that file in the frozen diff (added and context lines), or
  - a range the **same run** fetched with `getFileContext` for that file.

  A file-level finding (no `startLine`), a directory path or a file outside the diff fails L.

**Two enforcement layers, scored separately:**

- **Deterministic layer (D):** what code can check. Retrospectively that means L only, since the proposed
  `failureScenario` field does not exist in these findings, so its emptiness cannot be tested.
- **Contract layer (C):** T and W, judged by reading the finding's **own text**. Its truth is not judged: a
  claimed crash meets W even if the code shows no crash. Whether the claim is true is the owner disposition's job
  (§4), not the bar's.

### 3. Corpus and evidence sources

51 rows from 75 published findings, verified against the raw records on 2026-10-09:

| Set | Source (commit:path)                                                                                                                | Runs                         | Findings | Rows | Dispositions                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------: | ---: | ------------------------------------------------- |
| E   | `086a364:context/archive/2026-10-06-finder-sonnet-effort/` `gate-effort-runs.jsonl`, `hand-read-{247,269}.md`, `hand-read-key.json` | 8 (4 `low`, 4 `medium`)      |       32 |   26 | owner: none (unresolved); delegated agent: all 26 |
| G   | `573ee33:context/archive/2026-10-02-finder-model-swap/` `gate-openai-pr269.jsonl`, `hand-read-openai.json`, `hand-read-269*.md`     | 10 gpt-6-luna attempts, #269 |       38 |   20 | owner: all 20 (2026-10-03)                        |
| H   | `master:context/archive/2026-10-05-finder-sonnet/` `gate-sonnet-runs.jsonl`, `hand-read-247.md`                                     | 1 (`247-r1`, effort `high`)  |        5 |    5 | owner: all 5 (2026-10-06)                         |

- **Frozen diffs:** `~/.cache/finder-sonnet-gate/247/pr.diff` (sha256 `21973af3…5dc2e1`) and
  `~/.cache/finder-sonnet-gate/269/pr.diff` (sha256 `1e4ec088…550f`). Both re-hashed on 2026-10-09. The #269 diff
  is byte-identical to the one set G was reviewed against (`finder-model-swap` gate § inputs, same sha256).
- **Fetched context:** set G from each request's `fileContextCalls`; sets E and H from the run's `stderr.log` /
  console log tool-call lines. Where a run's fetches cannot be recovered, L uses the diff alone, and that is
  recorded per finding.
- **D2:** one row (G-D2) holding 8 findings, one from each of attempts 01–08. **No sonnet run has ever reported
  D2.** The high-effort #269 run was invalid, and the four effort #269 runs had no match (owner-approved).
- **Duplicates across sets** are listed, not merged, because each set was graded under its own gate.

### 4. Classification recorded per row

Each row gets:

1. **Original claim**, as the archived neutral paraphrase.
2. **Disposition, kept in separate columns by authority:**
   - **owner:** real, rejected or unresolved. Under the unchanged gate, unresolved counts as rejected.
   - **delegated:** set E only, information.
   - **own estimate:** mine, only where no other exists, labelled as such.
3. **D (L)** per member finding: pass, or fail with the reason.
4. **C:** T and W each present, absent or borderline, with the words of the finding that decide it.
5. **Bar outcome:**
   - **removed**: every member fails D or C;
   - **retained**: every member passes D and C;
   - **partly removed**: members differ. Retained for gate purposes, since a surviving member still fails its run.
   - **uncertain**: C turns on a borderline reading. Not counted as removed.
6. **Rescue note:** could a revised finder plausibly supply a T and W for this claim, from code facts already in
   the archived pre-sorts? Recorded separately. It **never** changes the outcome, and no stronger scenario is
   invented for an existing finding.

### 5. Falsification criteria

- **H1, D2 is safe.** Falsified if **any** of the 8 G-D2 member findings fails D or C.
- **H2, the bar removes the no-wrong-result class.** The class is the 11 owner-rejected rows whose basis was "no
  wrong result":
  - missing tests: G-D4 to G-D8;
  - friendlier message only: G-D9, G-D10, G-D16, G-D18, G-D19, H-R2.

  H2 is **supported** if ≥ 9 of the 11 are removed, **partial** at 6–8, and **falsified** at ≤ 5.

- **H3, the ceiling.** Count the owner-rejected rows (21: G 19, H 2) the bar retains. If any retained row's
  owner basis is "the code contradicts the claim", "cannot occur" or "documented method", the bar cannot by
  itself reach the gate's zero-rejected bar. The report states that ceiling.
- **H4, deterministic sufficiency.**
  - Report removals by D alone and by D + C.
  - If D alone removes fewer than half of what D + C removes, **or** more than 25% of the 51 rows are uncertain,
    the report states that deterministic enforcement is insufficient. The bar would then rest on the model's
    compliance or on a semantic check.

### 6. Criterion for recommending a paid phase

Recommend implementation plus a paid evaluation only if **all** hold:

1. H1 is not falsified.
2. H2 is supported or partial with at least 7 of 11 removed.
3. The bar removes at least 7 of the 21 owner-rejected rows (one third).

If all three hold, the recommendation still says plainly that only a paid run can show whether the contract
changes D2 recall (baseline 0/4 at `low`). Passing the gate needs that recall. If any condition fails, the report
recommends **not** spending on this variable alone, and names what the evidence points to instead.

**Disclosure.** Before writing this section, I had read the owner's classification bases and the owner had seen
my preliminary estimate that the bar removes about 5–6 of gpt-6-luna's 19 rejected rows. These thresholds are
therefore not blind to that estimate. They were fixed before any row-by-row grading.

### 7. Limits of what this can establish

- The findings were written without the bar. A finder told to write a scenario may instead invent a plausible
  one for the same false claim, or drop a true finding. Neither shows here.
- **Recall is unmeasurable here.** Keeping G-D2 shows the bar does not delete an already-reported D2. It says
  nothing about whether sonnet would **find** D2.
- Owner dispositions exist for 25 of 51 rows (G and H). All 26 E rows are owner-unresolved. Their delegated labels
  contradict the owner's missing-tests precedent, so E informs the D/C analysis but cannot count as owner
  removals.
- C is graded by one rater (me) with no inter-rater check. L checks only the primary cited range, not line
  numbers mentioned inside the description.
- Set G is a different model (gpt-6-luna), and half of set E runs at `medium`, not the proposed `low`.

_End of Pre-registration._

## Pre-registration record

- sha256 of `## Pre-registration` … `_End of Pre-registration._` (129 lines):
  **`c38aa481b5a8dd3c8027e69df04798df1d2c3e80070f7c48ff6bc20851d0716a`**, computed as
  `sed -n '/^## Pre-registration$/,/^_End of Pre-registration\._$/p' phase0.md | sha256sum` after
  `npx prettier --check` passed.
- UTC time taken: **2026-10-09T19:03:34Z**, before any row was graded.
- Committed locally on `feat/finder-failure-scenario` by itself, before grading. It was **not pushed**, so there is
  no external timestamp; the commit time is the only anchor until the owner pushes.
