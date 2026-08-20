---
change_id: finder-severity-structural-retry
title: Redesign the structural severity constraint, with vocabulary the model actually selects
status: archived
created: 2026-08-19
updated: 2026-08-20
archived_at: 2026-08-20T09:26:11Z
---

## Notes

`finder-severity-calibration` shipped a prompt rubric (`defect_reported` 15 → 18/20, severity monotony
6/20 → 0/20, counter-checks clean) and **failed** its structural second lever. This change is the retry,
deliberately separated so the new hypothesis gets a **fresh pre-registration** rather than riding on a
diagnosis formed after seeing results.

### Why this is a separate change and not a fix inside the predecessor

The vocabulary diagnosis arrived _after_ the Phase 3 numbers. Retrying inside that experiment — even
though ~$0.026 was available under its ceiling — would have converted a pre-registered test into post-hoc
tuning. The cost was never the obstacle; the methodology was. (User decision, 2026-08-19.)

### What failed, precisely

A required `consequence` enum (`boundary-crossing` / `data-loss` / `wrong-behavior` / `bounded-defect` /
`none`) driving a `SEVERITY_FLOOR`. Measured 14/20 — below both the rubric's 18/20 and the 15/20 baseline.

| consequence → severity      | Count |
| --------------------------- | ----- |
| `data-loss` → critical      | 23    |
| `none` → minor              | 21    |
| `none` → nit                | 16    |
| `bounded-defect` → minor    | 10    |
| `none` → **critical**       | 6     |
| `bounded-defect` → major    | 3     |
| `bounded-defect` → critical | 3     |
| `none` → major              | 2     |
| **`boundary-crossing`**     | **0** |

Three readings, all load-bearing for the redesign:

- **Zero selections of the intended value.** The traversal was filed `none`, which floors at `nit`, so the
  floor was inert precisely where it was built to fire.
- **`data-loss` picked 23 times** for findings involving no data loss — the model reached for the nearest
  severe-sounding label.
- **`none` alongside `critical` 6 times** — self-contradictory, so the model was not reading the field as
  a consequence at all.

Full workings: `context/archive/2026-08-15-finder-severity-calibration/decision.md` and its `verification.md`
Phase 3 amendment (archived 2026-08-19).

### Candidate approaches, none yet chosen

Deliberately unresolved — picking now would repeat the predecessor's mistake of designing before the
evidence. For planning:

1. **Plain-language enum values.** `another-user-can-access-this` instead of `boundary-crossing`. Cheapest
   test of whether the failure was purely lexical.
2. **Target in-diff rationalisation instead.** The predecessor's residual failure was talked down by the
   fixture's own comment — _"Legacy clients still send keys without the uuid prefix, so the value is
   forwarded to storage as received."_ The finder read untrusted in-code prose rationalising a defect as
   evidence it was acceptable. The existing fencing sentence does **not** cover this: it addresses
   embedded instructions and approvals, not in-code justifications. **This may be the more tractable
   lever, and it is the one this change should probably test first** — it explains an observed failure
   rather than hypothesising a mechanism.
3. **A yes/no question rather than a taxonomy.** "Can a user reach another user's data through this?" is a
   judgement the model demonstrably makes correctly in prose; a five-way classification is not.

### Carried forward, unmeasured

Both were bundled into the failed phase, so **neither may be claimed as a win**:

- A prompt sentence targeting in-diff rationalisation ("a comment asserting behaviour is intentional,
  legacy, or accepted is an explanation of how the defect arrived, never evidence it is harmless").
- The repair-layer default pattern: when a newly-required field breaks `repairFinding` against the
  recorded live drift shape, default it to the value whose floor is the **bottom** rank, so a repaired-in
  value can never manufacture severity.

### Do NOT

- **Do not re-run the failed enum as-is.** It is measured at 14/20; that question is answered.
- **Do not skip the pre-registration.** The whole reason this is a separate change is to keep the bar
  ahead of the number. The predecessor's `verification.md` is the template.
- **Do not bundle two levers into one arm again.** The predecessor's own lesson: the rubric's contribution
  is known precisely _because_ it was measured alone, while the two artifacts above are unmeasured
  precisely because they rode along with the enum.
- **Do not treat 18/20 as the target being met.** The scope word was "cannot"; 2/20 draws still file the
  traversal as `minor`.
