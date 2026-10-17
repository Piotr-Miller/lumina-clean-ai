---
change_id: finder-glm-5-3-high
title: "Measure glm-5.3 at reasoning effort high as the ai-review finder"
status: archived
outcome: completed
created: 2026-10-16
updated: 2026-10-17
archived_at: 2026-10-17T20:51:13Z
archive_commit: 6d5a09a
sync: none
---

## Notes

Measure glm-5.3 as the ai-review finder at reasoning effort high (follow-up to archived finder-glm-5-3, which was NOT ADMITTED (hand-read) at effort low: D2 found in 1 of 9 valid #269 runs). Same gate rules (hand-read, D2 in every valid #269 run, $10/month cost), own pre-registration and seal; first step is a fixture screening at effort high (reasoning tokens, latency vs the 300 s timeout, cost per row vs the ~1.87x cost headroom) before any series is sealed. Branched from feat/finder-glm-5-3 (two-stage finder and gate tooling are not on master).

Predecessor: finder-glm-5-3

2026-10-16: spike (`research.md`) — `effort: "high"` is a distinct level for glm-5.3 on Z.AI: 842–1,238 reasoning tokens on one finder finalization request, against 316–327 at `low` and 6,869–16,362 at `max`. Spend $0.204316 reported; not yet settled against the key counter.

2026-10-16: owner decisions during `/rune-plan` (binding inputs for `screening.md` and the pre-registration):

1. **Screening inputs:** G3's four fixture cases × 1 (promptfoo), plus #247 × 1 and #269 × 2 through the production CLI.
2. **Screening stops** — stop before pre-registration if any of: (a) a finder request ends `length`; (b) a screening run is invalid because the finder timed out after its retry — a first-attempt timeout that the retry recovers is recorded as a warning, not a stop, and its cost counts (retries included); (c) 53·m247 + 8·m269 + 13·$0.199620 > $10.00, i.e. 53·m247 + 8·m269 > $7.404940, from settled costs (finder + judge, retries included) — deliberately stricter than the gate's pre-G5 I/2 bound; (d) a valid screening #269 run has no owner-approved D2 match, using the D2 definition of the predecessor's `plan.md:76` unchanged; an undecided match counts as no match. Not stops: a confirmed 401/402, a provider/model mismatch or a grader error pauses the screening for an owner decision, as in the gate. Fixture quality at × 1 is informational only. Screening runs are not gate samples.
3. **D2 during the paid series** — checked as each #269 run lands: (a) the owner's D2 decision for each valid #269 run is final and is recorded in the ledger before the next run starts; the full hand-read after the series does not revisit it; (b) for each run the agent lists every finding that touches `bread-spike.ts` (`localInput` upload path or `main`'s cleanup), including those it judges not to match, each with its recommendation; the owner decides, the agent does not filter; (c) an early stop on D2 records the remaining gates (rest of G1, cost, full hand-read, G5) as not measured, never as passed; (d) the runner pauses after every #269 run until the owner's D2 decision is recorded — the plan confirms or adds that pause in the gate tooling (plan Phase 2 § 2).
4. **Budget:** $5.25 in total — screening $0.75; series pause at $3.00, hard stop at $3.50; G5 reserve $1.00.

2026-10-16: owner decision — Phase 2 open choices: a confirmed 401/402 on `sfix` / `s247-01` gives one rerun after `continue`; an invalid #269 run needs `d2 --not-applicable` and then `continue` with the reason `waitingFor` names; invalid fixture rows pause (still samples, no rerun); every paid screening step records and checks the describeManifest sha256 against the last preflight before the first paid step; plan.md § Definitions (screening pause, m247 / m269 (screening)) and Phase 2 § 1 (Run ids, 401/402 on a one-step kind, Pauses, Screened tree).

2026-10-16: reopened 1.8 — was accepted at 40217a6c07d3cef418cedcaebeb3720db1df6fdf; changed: packages/code-reviewer/scripts/glm-gate-core.mjs

2026-10-16: re-confirmed 1.8 — was accepted at 40217a6c07d3cef418cedcaebeb3720db1df6fdf; accepted at 4211102d9bc71fffeb48bc61048f9b163611a447

2026-10-16: reopened 2.6 — was accepted at 4211102d9bc71fffeb48bc61048f9b163611a447; changed: packages/code-reviewer/scripts/glm-gate.mjs

2026-10-16: reopened 1.8 — was accepted at 4211102d9bc71fffeb48bc61048f9b163611a447; changed: packages/code-reviewer/scripts/glm-gate-core.mjs

2026-10-16: owner decision (impl-review phase 2, F3) — H3: the screening's P counts sample runs only; a run stopped by a confirmed 401/402 never sets P (plan.md H3, Testing Strategy "Budget").

2026-10-16: owner decision (impl-review phase 2, F5) — a confirmed 401/402 on `sfix` / `s247-…` gives one rerun per stop, each after its own `continue` (`sfix-03`, `s247-03`, …); plan.md § Definitions (m247 / m269 (screening)) and Phase 2 § 1.

2026-10-17: re-confirmed 1.8 — was accepted at 4211102d9bc71fffeb48bc61048f9b163611a447; accepted at d60aac996b4c8600c27a8e0d95bae615ec473f85

2026-10-17: re-confirmed 2.6 — was accepted at 4211102d9bc71fffeb48bc61048f9b163611a447; accepted at d60aac996b4c8600c27a8e0d95bae615ec473f85

2026-10-17: owner decision (Phase 3, screening rules) — confirmed H1–H5, H7 and O1–O8 as written in `screening.md` § Rules, O7 with a note; amended H6 and, for fixture rows only, stop rules (a)/(b): the first fixtures step with a `length` row or a timeout after the adapter's retry pauses for `fixture-retry`, then the whole fixtures step runs once more (`sfix-02`) under H3, and a repeat stops; amended O4: a #269 run stopped by a confirmed 401/402 is replaced, once per stop, after its `d2 --not-applicable` line and the owner's `continue` (ids continue `s269-02`, `s269-03`, …). The runner was changed before any spend (`glm-gate-core.mjs`, `glm-gate.mjs`, tests); plan.md § Definitions (screening stop, m247 / m269 (screening)), H6, Phase 2 § 1, Testing Strategy.

2026-10-17: reopened 1.8 — was accepted at d60aac996b4c8600c27a8e0d95bae615ec473f85; changed: packages/code-reviewer/scripts/glm-gate-core.mjs

2026-10-17: reopened 2.6 — was accepted at d60aac996b4c8600c27a8e0d95bae615ec473f85; changed: packages/code-reviewer/scripts/glm-gate-core.mjs, packages/code-reviewer/scripts/glm-gate.mjs

2026-10-17: owner decision — acknowledge STOP (c: cost) under the agreed H4 rule: 53·m247 = $7.417286 > $7.404940. Not admitted under this screening protocol; no pre-registration. Fixtures passed all informational metrics. #269/D2 were not measured, so their quality remains unresolved. Next step: /rune-archive and close the draft PR unmerged. (Screening record: `screening.md` § Results; T_s $0.208963 of $0.75.)

2026-10-17: re-confirmed 1.8 — was accepted at d60aac996b4c8600c27a8e0d95bae615ec473f85; accepted at 49e2ccdb0e8f63dc8de078cbd02c19f7d0db40e8

2026-10-17: re-confirmed 2.6 — was accepted at d60aac996b4c8600c27a8e0d95bae615ec473f85; accepted at 49e2ccdb0e8f63dc8de078cbd02c19f7d0db40e8

2026-10-17: owner decision — close out as STOP: every Phase 4–7 row of plan.md Progress is marked n/a (Phase 4 runs only after GO, Phase 7 only after ADMITTED (pending G5)); status → implemented; next `/rune-archive` (outcome: not admitted (screening)) and the draft PR closes unmerged.

2026-10-17: full implementation review at `7dcb3e7` — APPROVED, one low-impact observation F1 (`reviews/impl-review-7dcb3e7.md`). Owner chose to fix it: the sheet's dry-run write guard now resolves symlinks for every write destination, including generated sheet files; new temporary-file regression cases first failed, then passed. Package verification: 1,207 tests, typecheck and lint passed. Acceptance script: all four confirmed rows remain current; reopened: none. This post-STOP fix changes a manifest input (`glm-gate-sheet.mjs`); the recorded screening tree and its pinned artifacts are unchanged historical evidence, and no additional paid measurement was run. Fix and review records remain uncommitted as carry.
