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
- Committed locally as `126427f` on `feat/finder-failure-scenario` by itself, before grading. It was **not pushed**, so there is
  no external timestamp; the commit time is the only anchor until the owner pushes.

## Results (graded 2026-10-09, after the record above)

**Files.**

- `phase0-locations.py` → `phase0-findings.json`: layer D. One record per published finding, with its row, its
  dispositions and its L result. It reads the archived records through `git show` and re-checks both frozen
  diffs' sha256.
- `phase0-grades.json`: layer C. T and W per finding, with the deciding words, plus the rescue notes.
- `phase0-tally.py`: joins the two and prints every count below. It refuses to run if any of the 75 findings is
  ungraded.

**Corpus check.**

- 75 findings in 51 rows: E 32 / 26, G 38 / 20, H 5 / 5. Each count matches the archived hand-reads and raw
  records.
- Two claims appear in two sets: H-R1 ≈ E-R247-01 (retention guidance) and H-R4 ≈ E-R247-13 (JPEG `struct.error`).
  The rows are kept apart, as pre-registered.
- No evidence is missing: every finding resolves to its raw record, and every run's fetched context was
  recovered.

### Hypotheses

| Hypothesis             | Result                                                                                                                                                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H1** D2 is safe      | **Not falsified.** All 8 G-D2 findings pass L, T and W.                                                                                                                                                                                                                |
| **H2** no-wrong-result | **Falsified: 5 of 11 removed** (G-D5, G-D6, G-D8, G-D18, H-R2). Retained: G-D7, G-D9, G-D10, G-D19. Uncertain: G-D4, G-D16. Counting both uncertain rows as removed would give 7 of 11, which is partial and exactly meets §6 condition 2.                             |
| **H3** ceiling         | **14 of 21 owner-rejected rows retained**, 2 uncertain, 5 removed. Retained: all 6 "code contradicts the claim" (G-D1, D13, D14, D15, D20, H-R4), all 3 "cannot occur" (G-D3, D11, D17), the 1 "documented method" (G-D12), and 4 rows from the no-wrong-result class. |
| **H4** deterministic   | **Insufficient.** D alone removes 1 row (G-D5, a directory path) and 1 of E-R269-03's 2 findings. D + C removes 19. Uncertain rows: 6 of 51 (11.8%), under the 25% line.                                                                                               |

**The ceiling, stated plainly.** The bar removes findings that **say** nothing is wrong. It does not remove
findings that **say something false**. On this corpus, those make up most of what the owner rejected.

- In all 4 retained rows of the "friendlier message" and "missing tests" classes, the finding itself asserts
  a concrete wrong result: an uncaught exception that it says contradicts the documented contract, a geometry
  mismatch reported as a match, or a `ValueError`.
- The owner rejected those rows on facts. Node exits 1 as documented, and the `ValueError` path cannot be
  reached. That rejection was semantic, not structural.
- Even if every uncertain row counted as removed, 14 owner-rejected rows would remain. The bar cannot by itself
  reach the gate's zero-rejected bar.

**Why the deterministic layer is near-empty here.** Both #247 files and 6 of the 8 code files in #269 are new,
so every line of them is inside a diff hunk. In the two modified files (`scripts/spikes/bread-spike.ts`,
`scripts/measure-hue-shares.py`), every cited range still overlapped a hunk. L therefore passes almost any line,
including one cited for a claim the code contradicts (E-R247-08). It caught only directory paths and file-level
findings here. On diffs with smaller hunks in larger existing files it could bite harder; this corpus cannot show
how much.

**Owner-real rows (4).**

- G-D2, H-R3 and H-R5 are retained.
- **H-R1 is uncertain, and its twin E-R247-01 is removed**: a claim the owner classified real loses to the bar
  because it was written as missing guidance, not as photos outliving the retention window.
- H-R3 and H-R5 survive because "the table grows past the row cap" counts as a reachable data state, not a future
  code edit.

**Delegated labels (set E, information only).**

- The bar removes 10 of the 18 rows the delegated agent accepted: R247-01, R247-02, R269-01, R269-02, R269-03,
  R269-04, R269-05, R269-07, R269-10, R269-11.
- It removes 4 of its 8 rejected rows (R247-07, R247-11, R269-06, R269-09) and retains 2 (R247-08, R247-13; the
  delegated pre-sort calls both contradicted by the code). The other 2 are uncertain.
- The six missing-tests rows that the delegated agent accepted are all removed or uncertain. That agrees with the
  owner's D4–D8 precedent, not with the delegated labels.

### Per run, under the unchanged gate

A run fails if any published finding survives the bar without an owner-real disposition. Every set E row is
owner-unresolved, so it counts as rejected.

| Run                  | Published → surviving | Gate-failing survivors                                                           | D2             |
| -------------------- | --------------------- | -------------------------------------------------------------------------------- | -------------- |
| `low-247-r1`         | 4 → 4                 | E-R247-05, -08, -12, -13                                                         | n/a            |
| `low-247-r2`         | 4 → 3                 | E-R247-06, -10, -13                                                              | n/a            |
| `medium-247-r1`      | 3 → 1                 | E-R247-13-PNG                                                                    | n/a            |
| `medium-247-r2`      | 6 → 4                 | E-R247-03, -04, -09, -14                                                         | n/a            |
| `low-269-r1`         | 4 → **0**             | none                                                                             | absent         |
| `low-269-r2`         | 4 → **0**             | none                                                                             | absent         |
| `medium-269-r1`      | 4 → **0**             | none                                                                             | absent         |
| `medium-269-r2`      | 3 → 1                 | E-R269-08                                                                        | absent         |
| H `247-r1`           | 5 → 4                 | H-R4                                                                             | n/a            |
| G attempts 01, 03–10 | 3–6 → 2–5             | at least one of G-D1/D3/D4/D7/D9/D10/D11/D12/D13/D14/D15/D16/D17/D19/D20 in each | 7 of 9 keep D2 |
| G attempt 02         | 1 → 1                 | none                                                                             | kept           |

- **No run changes from fail to pass.** G attempt 02 published only D2 and passed already.
- Three sonnet #269 runs would publish nothing. They would still fail, on absent D2.
- **This exercise measures no recall.** G-D2 surviving shows the bar does not delete a D2 already reported. It
  does not show that sonnet would find D2; sonnet reported it in 0 of 4 **valid** #269 runs (`low` and `medium`). The fifth, the `high` run, was invalid and published nothing: an execution failure, not a detection result.

### Rescue notes (do not change any outcome)

- **E-R269-10 is the closest sonnet came to D2.** It describes the uncovered window between the upload and
  `main`'s `finally`, but calls it latent. That window contains the missing-`urls.get` exit. Under the bar, a
  finder must name a reachable trigger, so it could name that exit (D2), or drop the finding, as the bar does
  here. **This is the only route by which the contract could touch recall, and only a paid run can show which
  happens.**
- **Plausible:** E-R247-01 and H-R1 (the photos outlive the 24 h retention window); E-R247-02 and E-R247-10 (the
  short-PNG `struct.error`); E-R247-07 and E-R247-14 (an `HTTPError` outside the `try` aborts the run, by another
  mechanism).
- **Partly:** G-D5 member 4.5 names the D2 consequence ("leave uploaded files behind") without the trigger.
- **Not without invention:** G-D4 (rests on the contradicted D1) and G-D18 (owner: no wrong result).

### Per-row assessment

Member-level T, W and evidence are in `phase0-grades.json`; claims verbatim are in `phase0-findings.json`.
Legend: L ✓/✗ per member; T W as ✓ present, ✗ absent, ? borderline.

| Row           | Claim (short)                                                   | Owner                                                            | Delegated | L (members)     | T W (members)           | Outcome       | Deciding words (finding text)                                                                                                                                                    |
| ------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- | --------- | --------------- | ----------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-R247-01     | No retention/deletion guidance for downloaded production photos | unresolved                                                       | accepted  | ✓               | ✓✗                      | **removed**   | says only that retention guidance is missing; names no wrong result                                                                                                              |
| E-R247-02     | No tests for either script                                      | unresolved                                                       | accepted  | ✓               | ✗✗                      | **removed**   | testing gap; names no input and no wrong result                                                                                                                                  |
| E-R247-03     | Production project ref hard-coded as default URL (fetch)        | unresolved                                                       | rejected  | ✓ ✓             | ✓? ✗?                   | **uncertain** | 'exposes internal infrastructure details' while conceding the ref is not a secret; 'by accident … copy-pasted elsewhere', 'if the repo is ever public': hypothetical trigger     |
| E-R247-04     | OUT_DIR in shared temp dir readable by other users              | unresolved                                                       | accepted  | ✓               | ✓✓                      | **retained**  | shared multi-user host; other local users can read customer photos                                                                                                               |
| E-R247-05     | Placeholder check prints 24 chars of the key (fetch)            | unresolved                                                       | accepted  | ✓               | ✓✓                      | **retained**  | placeholder-detection failure prints 24 characters of the secret                                                                                                                 |
| E-R247-06     | No per-job error handling: one failure aborts the loop          | unresolved                                                       | accepted  | ✓               | ✓✓                      | **retained**  | a failed sign-URL call or timeout aborts the remaining jobs                                                                                                                      |
| E-R247-07     | signed["signedURL"] raises KeyError (fetch)                     | unresolved                                                       | rejected  | ✓               | ✓✗                      | **removed**   | KeyError traceback 'instead of the script's friendly die()': both end the script; message only                                                                                   |
| E-R247-08     | Date-only filenames overwrite                                   | unresolved                                                       | rejected  | ✓               | ✓✓                      | **retained**  | two jobs on one date: the second download overwrites the first                                                                                                                   |
| E-R247-09     | "missing" check fooled by stale files                           | unresolved                                                       | accepted  | ✓               | ✓✓                      | **retained**  | stale files from an earlier run give a false 'missing' result                                                                                                                    |
| E-R247-10     | No test for dimensions() parser                                 | unresolved                                                       | accepted  | ✓               | ??                      | **uncertain** | 'could silently misreport on edge-case JPEGs (e.g. APP markers with odd lengths)'                                                                                                |
| E-R247-11     | Production project ref hard-coded (dimensions)                  | unresolved                                                       | rejected  | ✓               | ✗✗                      | **removed**   | 'Same … issue as in prod-fetch-results.py': no scenario of its own                                                                                                               |
| E-R247-12     | Placeholder check prints 24 chars of the key (dimensions)       | unresolved                                                       | accepted  | ✓               | ✓✓                      | **retained**  | the placeholder check prints a fragment of the service-role key                                                                                                                  |
| E-R247-13     | JPEG parse errors abort the census                              | unresolved                                                       | rejected  | ✓ ✓             | ✓✓ ✓✓                   | **retained**  | a segment length past the 2,048 bytes raises and crashes the census; a truncated ranged response raises inside dimensions() and crashes the census                               |
| E-R247-14     | signed["signedURL"] raises KeyError (dimensions)                | unresolved                                                       | rejected  | ✓               | ✓?                      | **uncertain** | unhandled KeyError 'breaking the … error-handling style'; does not say the work aborts                                                                                           |
| E-R269-01     | manifest_roi() re-reads the manifest per call                   | unresolved                                                       | accepted  | ✓               | ✓✗                      | **removed**   | repeated manifest read; a cost with no stated consequence                                                                                                                        |
| E-R269-02     | Image.open never closed                                         | unresolved                                                       | accepted  | ✓ ✓             | ✓✗ ✓✗                   | **removed**   | unclosed image handle, 'harmless for a short-lived CLI script'; unclosed image handle until GC; no consequence                                                                   |
| E-R269-03     | No test for browser-stats comparison                            | unresolved                                                       | accepted  | ✗ ✓             | ✗✗ ✗✗                   | **removed**   | file-level finding (no startLine); testing gap 'to confirm the threshold logic actually flags differences'                                                                       |
| E-R269-04     | No tests for scripts/s17 harness                                | unresolved                                                       | accepted  | ✓               | ✗✗                      | **removed**   | testing gap; correctness 'rests on prose'                                                                                                                                        |
| E-R269-05     | No test pins point_bilinear                                     | unresolved                                                       | accepted  | ✓ ✓             | ✗✗ ✗✗                   | **removed**   | 'a future refactor or numpy-version edge case could silently shift tuning numbers'; testing gap; no wrong result named                                                           |
| E-R269-06     | BASELINE_SHA256 provenance not self-contained                   | unresolved                                                       | rejected  | ✓               | ✗✗                      | **removed**   | a reviewer 'can't verify the invariant independently': documentation                                                                                                             |
| E-R269-07     | No test for desktop-stats compare()                             | unresolved                                                       | accepted  | ✓               | ✗?                      | **removed**   | 'a bug here would silently mis-report': hypothetical bug                                                                                                                         |
| E-R269-08     | --compare crashes when photos are missing                       | unresolved                                                       | accepted  | ✓               | ✓✓                      | **retained**  | --compare with missing or stale photos crashes                                                                                                                                   |
| E-R269-09     | 1,000,000 bytes called 1 MB                                     | unresolved                                                       | rejected  | ✓               | ✓✗                      | **removed**   | 'Harmless but slightly inconsistent'                                                                                                                                             |
| E-R269-10     | Upload cleanup only in main()'s finally (latent)                | unresolved                                                       | accepted  | ✓               | ✗✓                      | **removed**   | calls itself 'latent rather than active … fragile to future edits'                                                                                                               |
| E-R269-11     | Dead startsWith("data:") check                                  | unresolved                                                       | accepted  | ✓ ✓             | ✓✗ ✓✗                   | **removed**   | dead branch 'never actually does anything'; dead branch 'could mislead a future reader'                                                                                          |
| E-R247-13-PNG | Short PNG header raises struct.error                            | unresolved                                                       | accepted  | ✓               | ✓✓                      | **retained**  | a short or empty body makes struct.unpack raise and aborts the census                                                                                                            |
| G-D1          | EXIF 5–8 draft target swapped                                   | rejected (code contradicts the claim)                            | —         | ✓ ✓ ✓ ✓         | ✓✓ ✓✓ ✓✓ ✓✓             | **retained**  | EXIF 5-8: wrong source geometry changes Auto statistics; rotated inputs: different pixels than the browser (+2 more)                                                             |
| G-D2          | **D2** — missing urls.get exit leaks the upload                 | real                                                             | —         | ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ | ✓✓ ✓✓ ✓✓ ✓✓ ✓✓ ✓✓ ✓✓ ✓✓ | **retained**  | upload without urls.get: file remains in the Replicate account; upload without urls.get: uploaded inputs left in the account (+5 more)                                           |
| G-D3          | 8-char prediction-id prefix collision overwrites                | rejected (cannot occur with the harness's inputs)                | —         | ✓ ✓ ✓ ✓ ✓       | ✓✓ ✓✓ ✓✓ ✓✓ ✓✓          | **retained**  | two runs sharing an 8-char prefix: overwrite, wrong image shown; shared prefix: overwrite, sheet misrepresents a run (+3 more)                                                   |
| G-D4          | No tests for decode-inputs.py                                   | rejected (missing tests for maintainer-only tooling)             | —         | ✓ ✓ ✓           | ?? ✗? ✗✗                | **uncertain** | testing gap that names 'the orientation sizing defect' (D1) as what a test would catch; 'Changes in these behaviors can silently alter the Auto values': future change (+1 more) |
| G-D5          | No tests for the scripts/s17 harness                            | rejected (missing tests for maintainer-only tooling)             | —         | ✗ ✗ ✗           | ✗? ✗✗ ✗?                | **removed**   | directory or non-file path                                                                                                                                                       |
| G-D6          | No tests for auto-values.ts                                     | rejected (missing tests for maintainer-only tooling)             | —         | ✓               | ✗?                      | **removed**   | 'Incorrect results here can be accepted': no trigger                                                                                                                             |
| G-D7          | No tests for contact-sheet empty cases                          | rejected (missing tests for maintainer-only tooling)             | —         | ✓               | ✓✓                      | **retained**  | testing gap that names the trigger (requested photo with no runs) and an uncaught exception                                                                                      |
| G-D8          | No tests for desktop-stats.ts                                   | rejected (missing tests for maintainer-only tooling)             | —         | ✓               | ✗?                      | **removed**   | 'Regressions … could allow stale data to go unnoticed'                                                                                                                           |
| G-D9          | Missing baseline entry: uncaught exception                      | rejected (only a friendlier message is missing, no wrong result) | —         | ✓               | ✓✓                      | **retained**  | missing baseline entry: uncaught exception 'rather than the documented controlled comparison failure'                                                                            |
| G-D10         | Malformed JSON not the documented error                         | rejected (only a friendlier message is missing, no wrong result) | —         | ✓               | ✓✓                      | **retained**  | malformed JSON 'not handled as the documented comparison error (exit status 1)'                                                                                                  |
| G-D11         | ROI collapses, NaN means                                        | rejected (cannot occur with the harness's inputs)                | —         | ✓               | ✓✓                      | **retained**  | small image collapses the ROI: NaN means                                                                                                                                         |
| G-D12         | No ICC conversion in hue diagnostic                             | rejected (documented, deliberate method)                         | —         | ✓               | ✓✓                      | **retained**  | profiled images: values are not sRGB, misleading comparisons                                                                                                                     |
| G-D13         | Photo with no runs: min() ValueError                            | rejected (code contradicts the claim)                            | —         | ✓               | ✓✓                      | **retained**  | requested photo with no runs: min() raises ValueError                                                                                                                            |
| G-D14         | Original enlarged against the rule                              | rejected (code contradicts the claim)                            | —         | ✓               | ✓✓                      | **retained**  | outputs smaller than the original: enlarged against the documented rule                                                                                                          |
| G-D15         | draft() smaller than target                                     | rejected (code contradicts the claim)                            | —         | ✓               | ✓✓                      | **retained**  | draft smaller than target: enlargement, different pixels                                                                                                                         |
| G-D16         | --all overrides positional ids                                  | rejected (only a friendlier message is missing, no wrong result) | —         | ✓               | ✓?                      | **uncertain** | --all with ids: 'unexpectedly' decodes validation inputs; no documented contract named                                                                                           |
| G-D17         | Sampler clamp differs at edges                                  | rejected (cannot occur with the harness's inputs)                | —         | ✓               | ✓✓                      | **retained**  | destination edges: buffers disagree with the browser sampler                                                                                                                     |
| G-D18         | Missing .meta.json: uncaught exception                          | rejected (only a friendlier message is missing, no wrong result) | —         | ✓               | ✓✗                      | **removed**   | typo in an id: uncaught exception 'rather than a clear harness error': both stop; message only                                                                                   |
| G-D19         | Parity ignores sample dimensions                                | rejected (only a friendlier message is missing, no wrong result) | —         | ✓               | ✓✓                      | **retained**  | geometry mismatch within tolerance: reported as a match                                                                                                                          |
| G-D20         | Non-OK create keeps polling                                     | rejected (code contradicts the claim)                            | —         | ✓               | ✓✓                      | **retained**  | non-OK create response: polls instead of terminating                                                                                                                             |
| H-R1          | No retention guidance for copied photos                         | real                                                             | —         | ✓               | ✓?                      | **uncertain** | customer photos persist in a non-auto-cleaned path; the complaint is the missing guidance                                                                                        |
| H-R2          | No key-shape / localhost check (unlike sibling)                 | rejected (only an earlier message is missing, no wrong result)   | —         | ✓               | ✗✗                      | **removed**   | checks 'diverge … for no stated reason'; no wrong result                                                                                                                         |
| H-R3          | Unpaginated jobs query: false "NOT found"                       | real                                                             | —         | ✓               | ✓✓                      | **retained**  | jobs table past the row cap: a present job reported 'NOT found'                                                                                                                  |
| H-R4          | struct.unpack on 2,048 bytes aborts the census                  | rejected (code contradicts the claim)                            | —         | ✓               | ✓✓                      | **retained**  | SOF past the fetched range: struct.error aborts the census                                                                                                                       |
| H-R5          | Unpaginated census prints CONFIRMED on a subset                 | real                                                             | —         | ✓               | ✓✓                      | **retained**  | jobs past the page size: CONFIRMED printed on a subset                                                                                                                           |

### Recommendation, against § Pre-registration §6

Under the pre-registered rule, where an uncertain row is not counted as removed, condition 1 holds and conditions 2
(5 < 7 of 11) and 3 (5 < 7 of 21) fail.

**The margin is interpretive.** Count the two uncertain owner-rejected rows (G-D4, G-D16) as removed and the
result becomes 7 of 11 and 7 of 21, exactly at both thresholds. All three conditions would then hold. So the
recommendation rests partly on how those two borderline readings are treated, and it justifies **stopping this
variant**. It does **not** show that a revised prompt cannot help. What holds under either reading: 14 of 21
owner-rejected rows survive, all of them claims with a stated failure, and no run changes from fail to pass.

**Recommendation: do not spend on the
reporting contract as the only variable.** What the evidence points to instead:

1. **Factual errors are the dominant class of owner rejections.** 10 of the 14 retained owner-rejected rows are
   code-contradicted, unreachable or documented behaviour. Three of the four retained no-wrong-result rows also
   turn on a fact the bar cannot check (exit status 1 as documented; an unreachable `ValueError`).
   - That needs a semantic check against the code. `finder-verification` built one, but its evaluation stopped
     before the verifier was measured.
2. **Recall is a separate, unsolved problem.** Sonnet reported D2 in 0 of 4 valid #269 runs; the fifth (`high`) was invalid, a failure to execute rather than a miss. Neither this bar nor a verifier
   adds recall. A contract that asks for a reachable trigger is the one cheap lever that might, via E-R269-10, and
   it is speculative.
3. **What survives of the bar is cheap.** The prompt guidance (do not report missing tests for maintainer-only
   tooling, or message-only complaints) costs nothing. It can ride along as a secondary variable in a future
   pre-registered arm, but it does not justify a run alone.

**If the owner chooses the paid run anyway, the estimate is verified as follows.**

- **Price:** `anthropic/claude-sonnet-5` is $2 / $10 per M (`GET /api/v1/models`, read
  2026-10-09T19:06:05Z), unchanged since the predecessor's pre-flight.
- **Central estimate:** 4 #247 + 4 #269 runs at the measured `low` means ($0.056979 and $0.126642) come to
  **$0.73**. A `failureScenario` of about 100 tokens on each of about 4 findings adds roughly $0.005 of finder
  output per run, and slightly more judge input. **About $0.75–0.80.**
- **Upper case:** if the contract makes `low` fetch context as `medium` did, a #269 run could cost $0.26–0.40,
  taking the total to about **$1.90**.
- What the run would measure:
  - whether the contract changes D2 recall from 0 of 4;
  - whether the removed classes stay removed when the finder writes under the bar.

  It would **not** fix the factual-error class. On the evidence here, no arm of this change can pass the
  unchanged gate unless recall moves **and** the factual errors disappear.

**Not established by Phase 0:** how sonnet writes under the bar, any recall effect, the truth of any retained
claim, and owner classifications for the 26 set E rows.

**Noted, not proposed:** `anthropic/claude-sonnet-5.5` is listed at the same $2 / $10 per M, with reasoning
**mandatory** (`supported_efforts` low…max, default `high`). Any arm using it needs its own approval and
pre-registration.

## Owner decision (2026-10-09)

**Option (a): this variant stops, and the change closes on the Phase 0 result.** No implementation and no paid
evaluation. The owner re-ran `phase0-tally.py` and confirmed the counts: 5 of 21 owner-rejected rows removed, 14
retained, 2 uncertain; 1 of 3 continuation conditions met; the already-reported D2 preserved, with no evidence of
better D2 detection; and a real problem written as missing documentation can be removed (H-R1, E-R247-01).

**The owner's reading.** A model can supply a concrete scenario that is false. The scenario requirement improves
the form of a finding, not its truth.

**Two corrections, applied above in the results and the recommendation (not in the sealed pre-registration):**

1. Sonnet's D2 record is **0 of 4 valid runs**. The fifth run was invalid. "0 of 5" conflated detection quality
   with an execution failure.
2. The retrospective justifies stopping. It does not show that a new prompt cannot help. With both uncertain
   rejections counted as removed, the result is 7 of 11 and 7 of 21, which meets the thresholds. The outcome
   therefore depends partly on interpretation; under the pre-registered uncertainty rule the thresholds were not
   reached.

**Next experiment (owner's direction; not started, needs its own change, pre-registration and approval):**

- Measure the existing verifier (`feat/finder-verification`, `packages/code-reviewer/src/verifier.ts`) on
  **frozen** findings, with the real D2 as the control that the verifier must not remove a correct finding.
- This isolates "does it tell truth from a convincing falsehood?" from finder randomness.
- Candidate frozen inputs are this change's corpus: the 21 owner-rejected rows (10 rejected on facts: code
  contradicts the claim, cannot occur, or documented method), the 4 owner-real rows, and G-D2's 8 findings.
- Carry from `finder-verification` § follow-ups F-b: the verifier withheld a whole compound finding over one
  unsupported half. Decide per-claim handling before measuring.
- **D2 detection is a separate study.**
