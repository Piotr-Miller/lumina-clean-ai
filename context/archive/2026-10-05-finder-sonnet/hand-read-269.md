# finder-sonnet — hand-read of #269

> Gate: `gate.md` § Pre-registration §4 (per run; #269's published findings must include D2, confirmed to exist at
> the evaluated head; N ≥ 1 alone is insufficient).

## Source

- **Runs on #269:** `269-r1` only, and it is **invalid**: the finder's second step ended `finish=length` at the
  16,384-token cap and the SDK threw `NoOutputGeneratedError`. No `review.json` was written (`gate.md` § Results,
  `269-r1` notes). `269-r2` was not run (series stopped by the owner).
- **Published findings:** none. An invalid run publishes nothing, so there are **no rows to classify** and **no D2
  match to propose**.

## Result

- **D2 at the evaluated head:** confirmed to exist (`gate.md` § Inputs freeze, #269), but not found, because no
  finding was published.
- **Hand-read #269:** cannot pass. No run on #269 published the required D2 finding. This is recorded for
  completeness; reliability had already failed on the same run.
