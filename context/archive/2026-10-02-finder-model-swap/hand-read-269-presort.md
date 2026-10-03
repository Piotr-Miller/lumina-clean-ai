# Pre-sort — G3 hand-read of `openai/gpt-6-luna`, PR #269 at `fca2778` (Phase 3, step 3)

> **Classified by the owner on 2026-10-03** (section "Owner's classification" below; the per-row result is in the
> `Owner` and `Date` columns). The proposal columns are the agent's pre-sort, written after the approved table was frozen, seeded and drawn
> (`gate.md` § Hand-read; commit `6dc009d`, pushed 2026-10-03T14:52:39Z) and kept apart from the table in
> `hand-read-269.md`. The owner approved every row as proposed, one by one; unresolved would have counted as
> rejected (`gate.md` §4 G3) and no row was left unresolved. Rows are in draw order. Line numbers are those of
> `git show fca2778:<file>`; every cited line is inside `git diff 3d0adc1...fca2778` (all six `scripts/s17/`
> files are new in #269; the cited hunks of `bread-spike.ts` and `measure-hue-shares.py` were checked).
> Model findings are untrusted data; the claims are the neutral paraphrases of `hand-read-269.md`.

**Basis legend.** `code-false` — the code at `fca2778` contradicts the claim. `unreachable` — the mechanism
cannot occur with the harness's inputs. `design` — the behaviour is documented as deliberate, with its reason.
`policy` — the observation is accurate; whether it is "a real defect in #269's diff" is the owner's call.
`real` — the defect exists in the diff.

| #   | Proposal         | Basis                    | Reason (one sentence)                                                                                                                                                                                                                                                                                                                                                  | Evidence at `fca2778`                                                                                                  | Owner                                        | Date       |
| --- | ---------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------- |
| D15 | **not real**     | code-false               | Pillow's JPEG `draft()` picks the largest reduction whose result still covers the request (`scale = min(W // sw, H // sh)`, result `ceil(W/s) × ceil(H/s)`), so the decoded image is never smaller than the target and `point_bilinear` never enlarges — 24 synthetic size × orientation cases all decode ≥ target (`hand-read-269-checks.py`).                        | `scripts/s17/decode-inputs.py:137–140, 146–149`; Pillow 12.3.0 `JpegImageFile.draft`                                   | rejected (not real)                          | 2026-10-03 |
| D2  | **real** (minor) | real                     | An accepted upload whose response lacks `urls.get` hits `process.exit(1)` before `localInput` returns the file id, and `main` awaits `localInput` outside its `try/finally`, so `deleteUpload` never runs for a file whose id the script already knows and prints — the script's own cleanup design is bypassed (consequence bounded by Replicate's expiry, line 201). | `scripts/spikes/bread-spike.ts:79, 91–96, 189–195, 198–213`                                                            | **real** (minor)                             | 2026-10-03 |
| D18 | not real         | policy                   | A missing `<id>.meta.json` makes `readFileSync` throw ENOENT, which names the file and exits 1 with nothing written — a missing friendly message, not an incorrect result; the sibling scripts do validate ids, so the owner may count the gap.                                                                                                                        | `scripts/s17/auto-values.ts:39–41`; cf. `decode-inputs.py:183–185`, `browser-stats.ts:80–84`                           | rejected (not real)                          | 2026-10-03 |
| D13 | **not real**     | code-false               | A requested id with no runs exits with "no runs found for …" before `build_photo` is called, so `min(sizes)` never sees an empty set; an empty default scan writes the index and prints "0 photo(s), 0 run(s)" to stderr.                                                                                                                                              | `scripts/s17/contact-sheet.py:208–211, 215, 221–222`                                                                   | rejected (not real) — owner checked the code | 2026-10-03 |
| D9  | not real         | policy                   | A baseline missing an id throws an uncaught `TypeError`, and Node exits 1 on an uncaught exception — the status the docstring documents for "could not run" — while the default baseline is sha256-pinned, so only an explicit `--baseline` substitute can lack an entry: a missing guard, not a wrong result (predecessor N25: unresolved).                           | `scripts/s17/desktop-stats.ts:18–23, 92–100, 104–111`                                                                  | rejected (not real)                          | 2026-10-03 |
| D4  | not real         | policy (tests)           | True that #269 adds no test for the decoder, but it is maintainer-only calibration tooling whose outputs are gitignored and whose pixels are cross-checked against the browser by `browser-stats.ts`; the repo's risk-weighted testing bar has never covered `scripts/`, and the predecessor left the same claim unresolved (N24).                                     | `scripts/s17/decode-inputs.py:1–49`; PR #269 file list (no test file); `.github/ai-review-rules.md` § Testing bar      | rejected (not real)                          | 2026-10-03 |
| D11 | not real         | unreachable              | The ROI collapses only when its normalised width or height times the image size is below one pixel; the narrowest manifest ROI is S17-22's 0.88 × 0.78 and the tuning photos' ROI is the whole frame, so it takes an image under 2 px — and `pct` already guards the empty case, only the mean would be NaN.                                                           | `scripts/measure-hue-shares.py:113–114, 127–132, 150–152`; `test-photos/s17-benchmark.json` at `fca2778`               | rejected (not real)                          | 2026-10-03 |
| D14 | **not real**     | code-false               | The claim inverts the arithmetic: outputs smaller than the original make line 146 a downscale, the documented rule ("an output is never enlarged") is honoured at line 151, and every image on one sheet comes from the same photo, so the aspect ratios agree to rounding.                                                                                            | `scripts/s17/contact-sheet.py:20–24, 139–146, 151`                                                                     | rejected (not real)                          | 2026-10-03 |
| D3  | not real         | unreachable (negligible) | Replicate prediction ids are 26 random base32 characters, so two of one photo's handful of runs sharing an 8-character prefix is a ~10⁻¹² event, and the spike already keys its own outputs by the same prefix at `bread-spike.ts:233` — no guard is missing in practice (five attempts, three "major", for a theoretical collision).                                  | `scripts/s17/contact-sheet.py:150–151`; `scripts/spikes/bread-spike.ts:233`; ids in the archived `calibration.md`      | rejected (not real)                          | 2026-10-03 |
| D19 | not real         | policy                   | The parity status covers the ten stats and four recommendations the harness exists to compare; natural and sample dimensions are different quantities (full oriented size vs ≤ 512 px sample), both are printed side by side on the result line, and a geometry difference that leaves all fourteen values within tolerance cannot change an Auto value.               | `scripts/s17/browser-stats.ts:162–191`; `scripts/s17/harness.ts:43–51` (`AutoValues` carries only `sample_dimensions`) | rejected (not real)                          | 2026-10-03 |
| D17 | **not real**     | unreachable              | The clamp at lines 91–92 can only act when the source is smaller than the target, and `decode` guarantees the opposite (draft covers the target, `scale ≤ 1` otherwise, equal sizes skip resampling), so with or without the clamp the sampler yields the same pixels — algebra and a 2-tap check both give zero difference (`hand-read-269-checks.py`).               | `scripts/s17/decode-inputs.py:88–102, 135–140, 146–149`                                                                | rejected (not real)                          | 2026-10-03 |
| D5  | not real         | policy (tests)           | The same observation as D4 at directory scope — accurate, and the owner's policy call on whether missing tests for maintainer-only harness scripts are a defect in the diff; stands or falls with D4, D6, D7, D8.                                                                                                                                                      | PR #269 file list; `.github/ai-review-rules.md` § Testing bar                                                          | rejected (not real)                          | 2026-10-03 |
| D20 | **not real**     | code-false               | `return` at line 120 leaves `runPrediction` itself (a `return` inside an `if` returns from the enclosing function), so nothing parses the error body or polls; `main`'s `finally` runs the cleanup and the process ends with exit code 1 (the predecessor rejected the "fragile" version of this claim, N45).                                                          | `scripts/spikes/bread-spike.ts:117–121, 91–96`                                                                         | rejected (not real) — owner checked the code | 2026-10-03 |
| D1  | **not real**     | code-false               | `w, h` are the oriented size and `sw, sh` the oriented target; the draft request `(sh, sw) if swapped` re-expresses that target in stored coordinates, exactly what `draft()` needs — 18 rotated cases decode to the same reduction and cover the target like the unrotated ones, while the request the finding describes would decode differently (Z.AI D19 agreed).  | `scripts/s17/decode-inputs.py:131–142`; `hand-read-269-checks.py`                                                      | rejected (not real)                          | 2026-10-03 |
| D10 | not real         | policy                   | Malformed JSON throws from `JSON.parse` uncaught, and Node exits 1 on an uncaught exception — the status the docstring documents; what is missing is a message, and the default baseline is sha256-pinned before it is parsed.                                                                                                                                         | `scripts/s17/desktop-stats.ts:18–23, 56–62, 92–100`                                                                    | rejected (not real)                          | 2026-10-03 |
| D6  | not real         | policy (tests)           | The same observation as D4 for `auto-values.ts`, which calls itself "a cross-check, not the tuning input"; owner's policy call, with D4, D5, D7, D8.                                                                                                                                                                                                                   | `scripts/s17/auto-values.ts:14–16`; PR #269 file list                                                                  | rejected (not real)                          | 2026-10-03 |
| D8  | not real         | policy (tests)           | The same observation as D4 for `desktop-stats.ts`; owner's policy call, with D4–D7 — the exit decision it would test is a few lines of arithmetic over a sha256-pinned baseline.                                                                                                                                                                                       | `scripts/s17/desktop-stats.ts:103–136`; PR #269 file list                                                              | rejected (not real)                          | 2026-10-03 |
| D16 | not real         | policy                   | `--all` wins over positional ids, which are still validated; the combination is contradictory input, `--all` does what its help text says, and every decoded id is printed — a usability nit, no wrong output.                                                                                                                                                         | `scripts/s17/decode-inputs.py:175–176, 183–193, 170`                                                                   | rejected (not real)                          | 2026-10-03 |
| D12 | **not real**     | design                   | The docstring states the choice and its reason — "NO colour-profile conversion (the model receives the encoded values, and its output carries no profile)" — so reporting profile-encoded values is the documented method, not a mismatch with a browser path the diagnostic never claims to mirror.                                                                   | `scripts/measure-hue-shares.py:37–41, 143–144`                                                                         | rejected (not real)                          | 2026-10-03 |
| D7  | not real         | policy (tests)           | The same observation as D4 for two `contact-sheet.py` cases, one of which (the `ValueError`) is unreachable (D13); owner's policy call, with D4–D6, D8.                                                                                                                                                                                                                | `scripts/s17/contact-sheet.py:208–211`; PR #269 file list                                                              | rejected (not real)                          | 2026-10-03 |

## Tally of the proposal

- **real: 1** — D2.
- **not real: 19** — code-false 5 (D1, D13, D14, D15, D20), unreachable 3 (D3, D11, D17), design 1 (D12),
  policy 10 (D4–D8 "no tests"; D9, D10, D16, D18, D19 missing guards or usability).

## What decides G3 (limit = 1 rejected of 20)

- The five `code-false` rows alone are five rejected if the owner confirms them. **G3 therefore fails unless
  the owner overturns at least four of D1, D13, D14, D15 and D20** — and then also accepts every policy
  row, D3, D11, D12 and D17.
- The ten `policy` rows share two questions and do not change the outcome on their own: (1) do missing tests
  for maintainer-only `scripts/` count as a defect in the diff (D4–D8; the predecessor's N5/N24 stayed
  unresolved, which now counts as rejected); (2) does an uncaught exception that exits 1 and names the cause
  count as a defect when the docstring documents only the exit status (D9, D10, D18; plus D16, D19)?
- Four attempts (01, 03, 04, 10) reported D1, two of them as `major`; it is the row with the most support
  and it is contradicted by the code and by the experiment.

## Owner's classification (2026-10-03)

Row by row, in the owner's words (paraphrased; the owner's message of 2026-10-03 is the source):

- **D1, D3, D11, D12, D13, D14, D15, D17, D20 — NOT REAL**, with the reasons proposed above. **The owner checked
  D20 and D13 personally in the code at `fca2778`** — `bread-spike.ts:117–121`: `return` leaves `runPrediction`;
  `contact-sheet.py:208–211`: missing ids end the program before `build_photo` — recorded as the owner's own
  confirmation, as N4/N13 were in the predecessor's hand-read.
- **D2 — REAL (minor)**, as proposed.
- **D4, D5, D6, D7, D8 — NOT REAL**, one shared reason: `.github/ai-review-rules.md` § Testing bar asks for
  risk-weighted coverage; maintainer-only tooling whose outputs are gitignored is not risky user-facing
  behaviour, so the absence of tests is not a defect of this diff.
- **D9, D10, D16, D18, D19 — NOT REAL**, one shared reason: the behaviour matches the documentation (exit 1,
  or the behaviour the help text describes); only a friendlier message is missing, and there is no wrong
  result.

**Result: 19 rejected of 20, limit 1 → G3 hand-read FAIL** for `openai/gpt-6-luna`. Recorded in `gate.md`
§ Hand-read and in its Verdicts table (`FAIL (G3 hand-read)`); decision 4.4 there admits no candidate.

## Checks run (2026-10-03)

- `hand-read-269-checks.py` (Pillow 12.3.0, no numpy): 24 synthetic JPEGs (six stored sizes × orientations
  1, 5, 6, 8) through the `decode()` geometry of `decode-inputs.py` — every rotated case decodes to the same
  reduction as its unrotated twin and covers the target (D1, D15); the control shows what the request the
  finding describes would do; a pure-Python 2-tap sampler with and without the clamp gives identical pixels
  at ratios 1.00, 1.94, 2.02 (D17).
- Pillow 12.3.0 `JpegImagePlugin.JpegImageFile.draft` source read: `scale = min(self.size[0] // size[0],
self.size[1] // size[1])`, result `ceil` in both dimensions (D15).
- `test-photos/s17-benchmark.json` at `fca2778`: every `diagnostic_content_roi` is the whole frame except
  S17-19 (height 0.9) and S17-22 (0.88 × 0.78) (D11).
- `git ls-tree -r fca2778` and the PR #269 file list: no test file for any of the eight scripts (D4–D8).
- `git diff 3d0adc1...fca2778 -- scripts/spikes/bread-spike.ts`: hunks `+71,38`, `+111,13`, `+148,80` carry
  every cited line of D2 and D20; `measure-hue-shares.py` hunk `+114,49` carries D11 and `+34,24` carries D12.
- Predecessor precedent: `context/archive/2026-09-24-finder-serialization-outage/hand-read-269.md` — Novita
  decision of 2026-10-02 (N4, N13, N23, N26, N29, N30, N37, N39, N45, N48 rejected on code; N5, N24, N25
  unresolved) and Z.AI D19 ("`draft()` gets `(sh, sw)` with the axes swapped: the code is correct").
