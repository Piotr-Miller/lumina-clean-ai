# Hand-read — deconfounded irregular re-run (n=20, 2026-08-24)

Protocol inherited: every rubric-flagged finding plus 10 deterministic clean
controls. The graded file records `groundTruth.sha256` =
`9a3031108b…`, matching the pinned value — **the freeze held** (unlike the
archived arm this run replaces).

## Flagged findings (2)

### H-1 · run 1 #8 · M3 · `review-cli.ts`

- **Finding**: "Import statement references a non-existent file
  `./internal/log-safe-path.ts` which is not provided in this diff. This will
  cause a runtime error."
- **Your read**: [x] agree · [ ] misgrade — canonical D3. The definition is
  off-diff at any cap, and the call plus its explanatory comment are in-window,
  so the locality gap is M3 rather than M1.

### H-2 · run 1 #9 · M1 · `verdict.test.ts`

- **Finding**: "Import statement references a non-existent file
  `./verdict-engine.ts` which is not provided in this diff."
- **Your read**: [x] agree · [ ] misgrade — canonical D4. `verdict-engine.ts`
  is genuinely OVER-CAP, so the claim is true of what the model saw → M1. Also
  re-confirms the renamed-import fix: the D4 pairing survived the rename, so
  this is the planted over-cap M1 and not an accidental off-diff M3.

Both flagged findings fall in the **same run (run 1)** — which is why
`fabricationRuns` is 1/20 rather than 2/20.

## Clean controls (10)

| #   | Run · finding | File               | Read                                                                                                                                                         |
| --- | ------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 1 · 0         | `notes-01-plan.md` | agree — prose boilerplate repetition                                                                                                                         |
| 2   | 2 · 0         | `notes-01-plan.md` | agree — same                                                                                                                                                 |
| 3   | 3 · 0         | `plan-guard.ts`    | agree — `guardStep*` DRY complaint                                                                                                                           |
| 4   | 4 · 0         | `plan-guard.ts`    | agree — same                                                                                                                                                 |
| 5   | 5 · 0         | `plan-guard.ts`    | agree — same                                                                                                                                                 |
| 6   | 6 · 0         | `plan-guard.ts`    | agree — same                                                                                                                                                 |
| 7   | 8 · 0         | `plan-guard.ts`    | agree — same                                                                                                                                                 |
| 8   | 9 · 0         | `plan-guard.ts`    | agree — notes `guardStep1` silently truncates at 512 chars. **True**, and an observation about behaviour rather than a false-absence claim → `none` is right |
| 9   | 10 · 0        | `notes-01-plan.md` | agree — prose duplication                                                                                                                                    |
| 10  | 11 · 0        | `notes-01-plan.md` | agree — prose duplication                                                                                                                                    |

## Tally

- Agree **12**, misgrade **0** → **0/12 = 0%**, below the 15% bar.
  **Grading VALID.**

## Manipulation check (the reason this run exists)

A first pass with a loose regex (`/duplicate|redeclar|already declared/i`)
returned **34 hits**, which would have read as "the generator fix did not
take". That was a **false positive in my check, not a failure of the fix**:
the fixture is saturated with legitimate _style_ duplication complaints
("20 nearly identical sections", "guardStep1 through guardStep19 are
identical"), and the word "duplicate" matches all of them.

Re-checked strictly for a duplicate-_declaration_ claim
(`redeclar|already declared|duplicate (const|declaration|identifier|variable)|cannot redeclare`):
**0 hits across all 230 findings.** Combined with the direct check on the
artifact — exactly **1** `const …Defaults` per file, down from 16 — the
compile error is gone and the run is valid.

Recorded because the loose check would have invalidated a sound run, and the
lesson generalises: a manipulation check has to test the specific claim, not a
keyword that the fixture's own content collides with.

## Secondary observables

- **Invented-path findings: 0 of 230** — unchanged from the archived arm, as
  predicted (the naming is identical between the two).
- **Findings volume rose** (230 vs the archived arm's 149) while fabrication
  fell (1 vs 2). More legitimate surface to comment on, less invention.
