---
change_id: finder-failure-scenario
title: "Require every finder finding to state a concrete failure scenario, measured free before paid"
status: new
created: 2026-10-09
updated: 2026-10-09
archived_at: null
---

## Notes

### The proposal

Keep `anthropic/claude-sonnet-5` at OpenRouter `reasoning.effort` **low** as the finder and add a required
reporting contract: every finding carries a `failureScenario` naming (1) a concrete triggering input or reachable
state, (2) the resulting wrong behaviour, output, crash or leak, and (3) the code locations that explain how it
happens. A deterministic check would drop a finding whose scenario is empty or whose cited locations are not lines
of the diff or of context the finder actually fetched.

**Structural validation is not semantic verification.** A populated field and in-range line references do not make
a claim true. The contract can at most remove findings that state no wrong result; it cannot remove plausible but
false scenarios, and nothing here measures whether it changes D2 recall.

### Owner decisions (2026-10-09, before any analysis)

1. **Direction approved for Phase 0 only** — the free retrospective over existing findings. Implementation and any
   paid evaluation need a separate approval after Phase 0 reports.
2. **Gate unchanged:** D2 in every valid #269 run **and** zero owner-rejected findings in every valid run;
   unresolved = rejected; #247 N = 0 passes. As sealed in the predecessor
   (`finder-sonnet-effort` gate § Pre-registration §4, §7).
3. **The bar applies to every finding**, whatever its category — `testing`, `documentation`, `style` and `nit`
   included. A testing finding must name the concrete failure the missing test would let through.

### Outcome (owner, 2026-10-09)

**Closed on the Phase 0 result, option (a): this variant stops.** No implementation, no paid run. The bar keeps
the reported D2 but removes only 5 of 21 owner-rejected rows (14 retained, 2 uncertain). A false scenario passes
it, because it checks form, not truth. Details, the owner's two corrections and the next experiment (the existing
verifier on frozen findings, with D2 as the true-positive control; D2 detection studied separately) are in
`phase0.md` § Owner decision.

### Why this, after five changes

| Change                        | Setting                    | Result                                                                    |
| ----------------------------- | -------------------------- | ------------------------------------------------------------------------- |
| `finder-serialization-outage` | `z-ai/glm-4.6`             | OpenRouter stopped honouring the required output format                   |
| `finder-model-swap`           | `openai/gpt-6-luna`        | Reliable; D2 in 8/8 attempts; **owner rejected 19 of 20 rows**            |
| `finder-verification`         | gpt-6-luna + verifier      | Stopped on finder recall variance before the verifier was measured        |
| `finder-sonnet`               | sonnet-5, effort `high`    | #269 run hit the 16,384 output cap; $13.90/month projected                |
| `finder-sonnet-effort`        | sonnet-5, `low` / `medium` | Valid 4/4 per arm; **D2 0/4**; $6.63 (`low`) / $9.37 (`medium`) per month |

`low` establishes operational reliability (valid output in every run, at most 3,121 reasoning tokens per step). It
does not establish review quality.

### Evidence this change builds on — where it actually lives

Only `finder-sonnet` is archived on `master`. The others are archived on **unmerged** branches, so they are cited
as `<commit>:<path>`; read them with `git show <commit>:<path>`. Archived changes are immutable — nothing here edits
them.

- **Effort gate and its carry-forward** — `086a364d9f30519bf63f163a99183ce9ecce8580:context/archive/2026-10-06-finder-sonnet-effort/gate.md`
  (§ Carry-forward for any reuse of this branch's code). Any port of that branch's code inherits:
  - **F2** — the finder's Anthropic pin re-routes every other `createReviewer` caller (evals, `demo.ts`,
    `finder-distribution.mjs`); confine it to the CLI/pipeline path before merging.
  - **F4** — `sonnet-gate.mjs` runner gaps: the `401|402` match over the whole stderr, no `'error'` listener on
    the spawn, a raw `SyntaxError` on a torn JSONL line, and absolute `/home/<user>/…` artifact paths in records.
  - The sonnet-5 code itself (provider pin, `--finder-reasoning-effort`) exists only on that branch; `master`'s
    `DEFAULT_MODEL` is still `z-ai/glm-4.6`.
- **Effort raw findings and delegated rows** — same commit, `…/gate-effort-runs.jsonl`, `…/hand-read-247.md`,
  `…/hand-read-269.md`, `…/hand-read-key.json`.
- **Owner rejection classes** — `573ee3373cfd548fcbda9c1575b17684423a1b58:context/archive/2026-10-02-finder-model-swap/hand-read-269.md`
  § Classification and `…/hand-read-269-presort.md` § Owner's classification (owner, 2026-10-03):
  - **real (1):** D2.
  - **code contradicts the claim (5):** D1, D13, D14, D15, D20.
  - **cannot occur with the harness's inputs (3):** D3, D11, D17.
  - **documented, deliberate method (1):** D12.
  - **missing tests for maintainer-only, gitignored tooling (5):** D4, D5, D6, D7, D8 — not a defect of the diff
    under `.github/ai-review-rules.md` § Testing bar.
  - **behaviour matches the documentation; only a friendlier message is missing, no wrong result (5):** D9, D10,
    D16, D18, D19.
- **High-effort sonnet owner classification** — `context/archive/2026-10-05-finder-sonnet/hand-read-247.md` (on
  `master`): R1, R3, R5 real; R2, R4 rejected (owner, 2026-10-06).

### Prompt guidance to carry, without over-excluding

The finder prompt should state the owner's established rejection classes — missing tests for maintainer-only
tooling, and friendlier messages with no wrong result — **without** excluding a tooling failure that does produce a
wrong result, or error handling whose absence has a consequence. The current prompt actively solicits testing and
documentation findings (`packages/code-reviewer/src/prompts.ts`, the "downstream scoring only sees what you surface"
line); the contract must reconcile with that, since the judge scores test coverage from findings alone.

### Repository-state discrepancy (reported, not resolved)

`context/changes/finder-serialization-outage/change.md` is tracked on `master` with `status: new` (PR #254). Its
archive, `context/archive/2026-09-24-finder-serialization-outage/`, exists only on the unmerged branches
`feat/finder-serialization-outage` (`87ba5da`), `feat/finder-model-swap` (`573ee33`) and
`feat/finder-verification` (`da99692`). The same is true of the `finder-model-swap` and `finder-verification`
archives, and of `finder-sonnet-effort` (`origin/feat/finder-sonnet-effort` only). Which state is authoritative is
the owner's call; this change neither removes the active copy nor touches any archive.

### Spending boundary

Phase 0 uses committed artifacts, the cached frozen inputs in `~/.cache/finder-sonnet-gate/` and local analysis
only — **no paid call**. A paid phase keeps model, effort, routing, fixtures, cap, step limit and retry policy
fixed, so the reporting contract is the only variable. An alternative model or a verifier arm needs its own
approval and pre-registration.

### Not in scope

Re-enabling `ai-review` (the `false &&` in `.github/workflows/review.yml` stays), changing the gate, merging any
predecessor branch, and claiming the finder is fixed.
