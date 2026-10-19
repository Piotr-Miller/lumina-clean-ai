# Worth-fix sheet: glm-5.3 low on #247 and #269

> Companion to [`research.md`](research.md). It is the input to the owner's step 3: decide which of glm-5.3 low's
> findings were worth the author's time. The **Proposed** column is the research's own reading, checked against the
> code at each PR's head. The **Proposed** values remain the original proposals. The **Owner** column records Codex's delegated
> decisions of 2026-10-19, requested by the owner; it does not claim a separate human hand-read.
>
> - **Unit:** one row per **distinct issue**, not per finding. The 60 published findings of the 11 valid runs reduce
>   to 35 distinct issues: 10 on #247 and 25 on #269. By proposed class that is 10 W2, 18 W3, 7 FA and 0 W1. One
>   more row, 247-I21, holds a false sub-claim inside a W2 finding. 247-I14 is the true part of the false alarm 01#F3.
> - **Findings:** `01#F2` means `pr247-01#F2`, or `pr269-01#F2` in the #269 table. "k/n" counts the valid runs of
>   that PR that hit the issue.
> - **Gate verdict:** the owner's verdict of 2026-10-15/16, from the archived sheets:
>   `git show origin/feat/finder-glm-5-3:context/archive/2026-10-11-finder-glm-5-3/hand-read-247.md` and
>   `…/hand-read-269.md`.
> - **Code:** every location is at the PR head. #247's head is `dec09f8`, in the worktree
>   `~/.cache/finder-sonnet-gate/wt-247`; #269's head is `fca2778`, in `wt-269`. **Every W2 issue is still on
>   `origin/master` at the same lines,** because none of the reviewed scripts has changed since its merge.

## Classes

The **Owner** column uses these classes:

- **W1 fix-worthy.** A concrete defect with a plausible failure in how the code is actually used, and worth the
  author's time to fix.
- **W2 valid-minor.** True, but low impact: hardening for an unlikely edge case, a misleading message, or a docstring
  that disagrees with the code. A fix is optional.
- **W3 nit/noise.** True, but not worth the author's time: style, a speculative case, or a missing test for
  maintainer-only tooling.
- **FA false alarm.** The claim does not hold at the head, or it rests on a false premise.

## PR #247: `scripts/prod-fetch-results.py` (f) and `scripts/prod-result-dimensions.py` (d)

Both scripts are maintainer-only and run by hand against production with a service-role key. Their one real run, the
census of 2026-09-22, was clean: 18 results, all PNG, none unreadable.

| Issue   | Statement                                                                                                                                     | Where (head)          | Findings (k/2)               | Gate verdict | Proposed            | Owner |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------- | ------------ | ------------------- | ----- |
| 247-I1  | A stale file in `OUT` hides the "NOT found" warning (the saved count stays right)                                                             | `f:90`                | 01#F4, 02#F3 (2/2)           | accept       | W2                  | W2    |
| 247-I2  | Exact 8-character match contradicts the docstring's "any job-id prefixes"; a full UUID reports "NOT found in the jobs table"                  | `f:77-78` (doc `f:8`) | 01#F2 (1/2)                  | accept       | W2                  | W2    |
| 247-I3  | `CONFIRMED` prints even when some jobs were unreadable                                                                                        | `d:138`               | 01#F5 (part), 02#F6 (2/2)    | accept       | W2                  | W2    |
| 247-I4  | The ranged GET never checks for 206, so "never fetches a whole image" is not enforced                                                         | `d:117-119`           | 01#F5 (part), 02#F5 (2/2)    | accept       | W2                  | W2    |
| 247-I10 | `f` lacks `d`'s key-shape check: consistency only. Local URLs are already rejected (`f:55`) and an anon key exits through `die()` (`f:69-70`) | `f:47-56`             | 01#F1, 02#F1 (2/2)           | accept       | W3 (see note 1)     | W3    |
| 247-I12 | A JPEG fill byte marks the job unreadable, but results are PNG                                                                                | `d:87-97`             | 01#F6, 02#F4 (part) (2/2)    | accept       | W3                  | W3    |
| 247-I13 | A body under 24 bytes that starts with the PNG signature raises `struct.error`                                                                | `d:82`                | 02#F4 (part) (1/2)           | accept       | W3                  | W3    |
| 247-I15 | Two wanted jobs sharing the first 32 bits of their UUID overwrite one file (≈ 4·10⁻⁸ for 18 jobs)                                             | `f:84`                | 02#F2 (1/2)                  | accept       | W3                  | W3    |
| 247-I14 | Per-job sign/download errors print a raw traceback instead of `die()`                                                                         | `f:80-83`             | 01#F3 (true remainder) (1/2) | accept       | W3                  | W3    |
| 247-I20 | "The signed-URL token is printed in an `HTTPError` traceback": it is not (reproduced), and the contract covers the key, not signed URLs       | —                     | 01#F3 (1/2)                  | accept       | **FA** (see note 2) | FA    |
| 247-I21 | Sub-claim: "a 2 KB range is too small for phone EXIF". The script reads results, which are PNG                                                | —                     | 01#F5 (part)                 | accept       | FA (sub-claim only) | FA    |

Notes:

1. On 2026-10-06 the owner **rejected** the same claim when finder-sonnet raised it as R2
   (`context/archive/2026-10-05-finder-sonnet/hand-read-247.md`). The two verdicts disagree.
2. The research reproduced a real urllib `HTTPError` against a local stub. The traceback shows the source line and
   `HTTP Error 400: Bad Request`, never the URL value.

## PR #269: S-17 close (Bread calibration tooling)

The code is maintainer-only tooling of a closed change, and nothing outside `context/archive/` refers to it on
`master`. The inputs are CC-licensed photos tracked under `test-photos/licensed/`, and a Bread call costs about
$0.0006.

| Issue    | Statement                                                                                                                                                | Where (head)                                             | Findings (k/9)                                                      | Gate verdict | Proposed            | Owner |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------- | ------------ | ------------------- | ----- |
| 269-I8   | **D2.** When the upload response has no `urls.get`, `localInput` exits before returning `uploadedFileId`, so the upload is never deleted                 | `scripts/spikes/bread-spike.ts:191-194`                  | 03#F6 (1/9)                                                         | D2           | W2 (see note 3)     | W2    |
| 269-I7   | The poll loop has no cap and no `poll.ok` check; a persistent non-terminal reply loops at 1 Hz. It existed at base                                       | `scripts/spikes/bread-spike.ts:127-131`                  | 01#F5, 01#F6 (within-run dup) (1/9)                                 | accept       | W2                  | W2    |
| 269-I9   | A failed output download exits 0. The PR fixed the create path (`:119`) but not this one                                                                 | `scripts/spikes/bread-spike.ts:226-229`                  | 04#F6 (1/9)                                                         | accept       | W2                  | W2    |
| 269-I11  | Original-row diagnostics use sRGB-converted pixels, while the docstring says encoded values. Measured: S17-03 V≥0.90 0.9→1.5 %, S17-07 any=255 2.4→4.4 % | `scripts/s17/contact-sheet.py:144-145` (doc `:26-28`)    | 02#F2 (1/9)                                                         | accept       | W2                  | W2    |
| 269-I12  | Python `round()` (half to even) vs the client's `Math.round` (half up) for the sample sides; none of the 18 frozen inputs hits the tie                   | `scripts/s17/decode-inputs.py:136`                       | 10#F2 (1/9)                                                         | accept       | W2 (borderline W3)  | W3    |
| 269-I1   | `compare()` does not guard the baseline side, so a missing id gives a stack trace. The exit is already 1                                                 | `scripts/s17/desktop-stats.ts:105`                       | 01#F4, 02#F4, 03#F4, 04#F4, 05#F3, 07#F4, 08#F5, 09#F4, 10#F3 (9/9) | accept       | W2 (low end)        | W2    |
| 269-I3   | Contact-sheet captions are not HTML-escaped; they hold only numbers and a Replicate id                                                                   | `scripts/s17/contact-sheet.py:132`                       | 01#F3, 02#F1, 03#F2, 07#F3, 08#F3 (5/9)                             | accept       | W3                  | W3    |
| 269-I4   | The `startsWith("data:")` branch in the sidecar is dead                                                                                                  | `scripts/spikes/bread-spike.ts:243`                      | 05#F4, 07#F5, 08#F6, 09#F6, 10#F4 (5/9)                             | accept       | W3                  | W3    |
| 269-I5   | No golden test for `point_bilinear` / `exposure_stats`, and the repo has no Python test setup                                                            | `scripts/s17/`                                           | 02#F3, 03#F3, 05#F2, 09#F3 (4/9)                                    | accept       | W3                  | W3    |
| 269-I6   | The `*.png.json` glob vs a URL-derived extension; the pinned model outputs PNG (58 of 58 sidecars)                                                       | `scripts/s17/contact-sheet.py:94`                        | 04#F2, 07#F2 (2/9)                                                  | accept       | W3                  | W3    |
| 269-I13  | Relative imports instead of the `@/` alias, the norm in `scripts/`                                                                                       | `scripts/s17/auto-values.ts:21`                          | 01#F1, 07#F1 (2/9)                                                  | accept       | W3                  | W3    |
| 269-I14  | Field lists and percentiles are duplicated between `browser-stats` and `desktop-stats`                                                                   | `browser-stats.ts:44-56`, `desktop-stats.ts:41-53`       | 09#F1 (1/9)                                                         | accept       | W3                  | W3    |
| 269-I10  | A cleanup comment says "only after the output is saved", but `finally` also runs when `runPrediction` returns early or throws                            | `scripts/spikes/bread-spike.ts:94`                       | 04#F5 (1/9)                                                         | accept       | W3                  | W3    |
| 269-I15  | Photos are always served as `image/jpeg`; all frozen inputs are `.jpg`                                                                                   | `scripts/s17/browser-stats.ts:126`                       | 04#F1 (1/9)                                                         | accept       | W3                  | W3    |
| 269-I16  | An `evaluate` failure gives a stack trace instead of a message; the exit is already 1                                                                    | `scripts/s17/browser-stats.ts:141-153`                   | 08#F2 (1/9)                                                         | accept       | W3                  | W3    |
| 269-I18  | The original's aspect ratio drifts: worst case 0.045 %, under one pixel                                                                                  | `scripts/s17/contact-sheet.py`                           | 09#F2 (1/9)                                                         | accept       | W3                  | W3    |
| 269-I20  | With `--markdown` the stats are computed twice (milliseconds)                                                                                            | `scripts/s17/contact-sheet.py:152,156`                   | 08#F4 (1/9)                                                         | accept       | W3                  | W3    |
| 269-I22  | No guard for an empty ROI; the smallest ROI is 0.88 × 1200 px                                                                                            | `scripts/measure-hue-shares.py:151-152`                  | 03#F1 (1/9)                                                         | accept       | W3                  | W3    |
| 269-I23  | `KeyError` if the ROI field is missing; all 18 frozen entries carry it                                                                                   | `scripts/measure-hue-shares.py:123`                      | 08#F1 (1/9)                                                         | accept       | W3                  | W3    |
| 269-I2   | "`--compare` crashes on a machine without the private test photos": the inputs are tracked in `test-photos/licensed/`                                    | `scripts/s17/desktop-stats.ts:144-163`                   | 03#F5, 09#F5 (2/9)                                                  | **accept**   | **FA** (see note 4) | FA    |
| 269-I14′ | "The comparison and params-check are duplicated nearly verbatim": they decide differently; only the constants are shared                                 | `desktop-stats.ts:111-116` vs `browser-stats.ts:164-185` | 01#F2 (1/9)                                                         | reject       | FA                  | FA    |
| 269-I17  | "The original gets upscaled": inputs are ≥ 3840 px and outputs ≤ 1536 px, so it is always a downscale                                                    | `scripts/s17/contact-sheet.py:146`                       | 05#F1 (1/9)                                                         | reject       | FA                  | FA    |
| 269-I19  | "File handles are held open": Pillow closes a non-animated PNG's file after `.convert()` loads it                                                        | `scripts/s17/contact-sheet.py:139`                       | 04#F3 (1/9)                                                         | reject       | FA                  | FA    |
| 269-I21  | "`output_file` goes stale": `OUT_DIR` points at the run folder, and all 58 paths match                                                                   | `scripts/spikes/bread-spike.ts`                          | 05#F5 (1/9)                                                         | reject       | FA                  | FA    |
| 269-I24  | "`roi_convention` is not honoured": the frozen manifest's convention is what `:144,:151` do                                                              | `scripts/measure-hue-shares.py:144,151`                  | 10#F1 (1/9)                                                         | reject       | FA                  | FA    |

Notes:

3. D2 is still on `origin/master` (`scripts/spikes/bread-spike.ts:189-195`), two weeks after the owner confirmed it.
   A missing `urls.get` on a successful upload is the only trigger, and the error message prints the file id. A
   more realistic sibling leak exists that no run flagged: Ctrl-C during a cold start lasting over two minutes. Node
   skips `finally` on SIGINT.
4. Both rows were accepted at the gate. Reclassifying them changes no gate outcome: pr269-03 stays within its
   allowance, and pr269-09 still has no D2.

## Other candidates' issues on #247 that glm-5.3 low never raised

These are listed so the union is visible; their delegated decisions are included too. Sources:
`context/archive/2026-10-05-finder-sonnet/hand-read-247.md`, `context/archive/2026-10-06-finder-sonnet-effort/`, and
the glm-5.3 high screening run `s247-01`.

| Issue  | Statement                                                                                                                                                                       | Where (head)      | Raised by                                 | Proposed                           | Owner |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------- | ---------------------------------- | ----- |
| 247-I5 | The placeholder branch prints `KEY[:24]`. A real `sb_secret_…` pasted inside `<…>` puts 13 secret characters on the terminal, against the scripts' own "never printed" contract | `f:53`, `d:57`    | glm-5.3 high F1; sonnet-5 low-247-r1 (×2) | **W2, borderline W1** (see note 5) | W1    |
| 247-I6 | The unpaginated census can truncate at `max_rows` (1,000) and still print `CONFIRMED`; there are 18 results today                                                               | `d:102`           | glm-5.3 high F9; sonnet-5 high 247-r1     | W2                                 | W2    |
| 247-I7 | The unpaginated fetch query reports a false "NOT found" past `max_rows`                                                                                                         | `f:68`            | sonnet-5 high 247-r1                      | W2                                 | W2    |
| 247-I8 | No deletion guidance for the downloaded customer photos                                                                                                                         | `f:16-17`, `f:38` | sonnet-5 high 247-r1; sonnet-5 low-247-r2 | W2                                 | W2    |
| 247-I9 | Under a 022 umask, `OUT_DIR` in the shared temp directory is readable by other local users                                                                                      | `f:74`            | sonnet-5 medium-247-r2                    | W2                                 | W2    |

5. The two analysis passes disagreed here: one read I5 as W1, the other as W2. The fragment cannot be brute-forced,
   and for a JWT key those characters are the constant header. What makes it the strongest W1 candidate in all the
   recorded material is that the output is meant to be pasted onward: `d:19-20` says "the maintainer ran it and
   pasted the table". The delegated decision is W1; see below.

## Delegated owner decisions — 2026-10-19

The owner explicitly asked Codex to fill **Owner**, decide whether W2 counts, and choose whether and where to
pilot. These decisions complete step 3 of `temp_steps.md`. The original **Proposed** and **Gate verdict** values
are retained so the changes of judgement remain visible.

**Threshold: only W1 counts as worth a fix in the headline.** W2 is a valid optional improvement that may be
convenient alongside related work. Counting every W2 as worth interrupting the author would erase the distinction
this analysis was opened to measure. Maintainer tooling can still have W1 defects; its label alone is no exemption.

| Class | All 60 findings | Of the 55 accepted | Distinct glm-5.3 low issues |
| ----- | --------------- | ------------------ | --------------------------- |
| W1    | 0               | 0                  | 0                           |
| W2    | 20              | 20                 | 9                           |
| W3    | 32              | 32                 | 19                          |
| FA    | 8               | 3                  | 7                           |

**Result: 0 of 55 accepted glm-5.3 low findings warranted a fix.** The optional W2 count is **20/55**, rather than
the research's proposed 21/55, because `269-I12` is classified W3. Totals classify each published finding once,
including the within-run poll-loop duplicate. `247-I21` is only a false sub-claim of a W2 finding; the true remainder
`247-I14` does not turn the false security claim `247-I20` into another finding.

### Decisions that need explanation

- **247-I5 → W1.** Keeping the angle brackets while replacing a placeholder with a real key is a plausible
  copy/paste mistake in the documented invocation. Both scripts then print the first 24 supplied characters.
  For `<sb_secret_…>` that includes 13 characters after the prefix. The code explicitly accepts this key format,
  promises never to print the key, and encourages the maintainer to paste diagnostic output onward. Removing the
  supplied value from this error is a small, concrete fix worth making. This is partial disclosure, not proof of
  complete credential compromise; no real key or past disclosure was observed. The reproduction used a synthetic
  value and exited before network I/O. **glm-5.3 low never raised it.** The claim that every other candidate has
  zero W1 is therefore not adopted: glm-5.3 high and sonnet-5 low did raise this one distinct issue.
- **269-I8 (D2) → W2.** Running the original source with stubbed I/O reproduced one upload POST, no DELETE, no
  prediction, and exit 1 with the file id. The cleanup defect is real. For the frozen licensed corpus in this
  manually run tool, the consequence does not warrant a separate fix now. This judgement does not assume that
  Replicate normally omits `urls.get`, that uploaded files expire after a particular time, or that a privacy
  incident occurred. Not being fixed yet is context, not proof of low impact.
- **247-I20 → FA; 269-I2 → FA for both findings.** A rendered urllib `HTTPError` traceback did not include its
  synthetic signed URL/token, and the scripts' contract does not say that signed URLs are never logged. In #269,
  every manifest input path is tracked at the PR head under `test-photos/licensed/`. Loading the photos before
  `--compare` is real coupling; the claimed dependency on untracked private photos and the resulting fresh-clone
  failure are false. An uncaught error also already exits 1. This preserves the distinction between the false
  finding and an optional refactor one might suggest instead.
- **269-I12 → W3, changed from proposed W2.** The Python and client rounding rules differ in general, but the
  computed sample dimensions agree for all **18** frozen manifest entries. The offline harness is a cross-check;
  desktop browser measurements supplied the tuning values. There is no affected input or changed decision here.
  The sheet's two references to 20 frozen inputs were corrected to 18.
- **247-I10 → W3 for the narrow consistency observation.** The sibling has an extra key-shape check, but that
  does not establish the finding's claimed local-stack or anon-key protection. The URL regexp already rejects
  localhost, and the shape check itself accepts any three-part JWT. It is not an authorization check.

All other proposed issue classes are adopted, including the five historical rejections. For `269-I19`, a synthetic
single-frame PNG confirmed that Pillow loads and closes the source file handle during `.convert("RGB")`. The
`269-I20` location was corrected to `contact-sheet.py`; it is unrelated to `browser-stats.ts`.

### Direction for step 4

**End the advisory-review work; no paid pilot now.** Leave `ai-review` disabled and use CI plus
`/rune-impl-review`. The glm-5.3 low record shows no fix-worthy yield. The W1 key-printing issue in other candidates
is useful, but neither a reliable product-code yield nor added value beyond the existing review has been shown.
The corpus limitation prevents a verdict that the models cannot find product bugs; it does not create a reason to
keep experimenting without current demand. `/rune-plan` should formalize this close-out and carry `247-I5` as a
concrete follow-up; this classification step does not edit either script.

If a later owner decision reopens a pilot, the selected design is **five new PRs changing product behaviour**
(frontend, API, Edge Functions or database logic), **locally from a `feat/finder-glm-5-3` worktree**, using glm-5.3
low. Tooling, documentation and bookkeeping changes do not fill those five slots. Score only W1 that CI and
`/rune-impl-review` did not already find. This answers the eligibility/location choice without merging experimental
reviewer code into CI. The recorded $2 cap and key-limit prerequisite belong to that later paid decision.

### Verification scope

Read all issue-bearing source modules at #247 `dec09f8` and #269 `fca2778`, plus the disputed original findings.
All nine inspected scripts are byte-identical to recorded `origin/master` `1b15eb3`. Reproductions used synthetic
inputs and stubbed I/O only. No production API, model evaluation, account-credit check or GitHub mutation was run.
