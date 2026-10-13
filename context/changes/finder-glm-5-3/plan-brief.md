# finder-glm-5-3 — Plan Brief

> Full plan: `context/changes/finder-glm-5-3/plan.md`
> Research: `context/changes/finder-glm-5-3/research.md`

## What & Why

AI review has been off since 2026-10-04, because the single-stage finder breaks whenever an endpoint ignores
`response_format`. A 2026-10-11 fixture screening showed `z-ai/glm-5.3` at `effort: low`, on the two-stage finder,
passing all 10 of its low-effort rows (passes B 2, C 4, D 4) and fetching out-of-hunk context: a first for any GLM. This change ships that configuration and
turns AI review back on, but only if it passes a sealed gate including a live run on its own PR.

## Starting Point

master runs the single-stage finder on `z-ai/glm-4.6`, and `review.yml` carries `false &&`. The two-stage finder and
its finder-only routing sit unmerged on `feat/finder-verification`. They separate cleanly from the verifier, and five
commits apply to master without conflicts (608 → 699 tests).

## Desired End State

- **If admitted:** master reviews every eligible PR with glm-5.3 through the two-stage finder, routed only to
  Z.AI / Fireworks / Together. `review.json` shows the provider, model and reasoning-token count of every finder
  request, and never reasoning text. G5 ran green on this PR.
- **If not admitted:** AI review stays off, the PR closes unmerged, and the full measurement record is committed.

## Key Decisions Made

| Decision                 | Choice                                                                                                                      | Why (1 sentence)                                                            | Source               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------- |
| Scope                    | Merge the two-stage finder (no verifier); success restores AI review                                                        | R11 names the deploying change as the one that removes `false &&`           | Owner, change.md     |
| Restoration gate         | G1 (#269 ≥ 9/10), G2 (5/5 empty), G3 (12 rows), #247 × 2, G5 live                                                           | The precedent structure, measured on the two-stage finder                   | Owner 1              |
| Hand-read bar            | ≤ ceil(0.05 × N) rejected per valid run; unresolved = rejected; D2 in every #269 run; no cross-run dedup                    | Stricter than model-swap's pooled 5 %, closer to decision 6's zero-rejected | Owner 1              |
| Reasoning                | `{enabled: true, effort: "low"}` on every finder request; text kept out of parsing, transcript, logs, artifacts             | glm-5.3 cannot turn reasoning off; `low` is what was screened               | Owner 2              |
| Truncation               | `finish=length` on any finder request fails the attempt, unretried                                                          | Lesson: a cap hit must be its own failure class                             | Owner 2 + Plan       |
| Cost                     | ≤ $10/month: 53·m247 + 8·m269 + 13·I, finder + judge + retries + impl-review                                                | Replaces a per-attempt ceiling calibrated on non-reasoning glm-4.6          | Owner 3              |
| Routing                  | `order` = `only` = z-ai, fireworks, together; finder-only                                                                   | `only` keeps fallback inside the list                                       | Owner 4              |
| Valid run                | A technical judge failure invalidates the run; a completed verdict `failed` does not                                        | Production distinguishes technical failure from a completed verdict         | Owner 6 + review F1  |
| Budget                   | $4.50: measurement pause $3.00 / hard $3.50, G5 reserve $1.00                                                               | G5 on this PR is estimated at $0.45–0.95                                    | Owner 7              |
| Harness                  | New thin runner over the production CLI; G3 via promptfoo                                                                   | The old runners skip the judge or no longer load                            | Plan (A1)            |
| Leading inline `<think>` | Fails the attempt; `<think` anywhere in a rejected text is never logged (A2 amended 2026-10-13, review F1)                  | Fail-closed reasoning isolation                                             | Plan (A2)            |
| Telemetry truth          | Model, provider and reasoning tokens from the raw response, marked `reported` / `missing`; SDK fallbacks are never evidence | The SDK substitutes the requested id and a 0                                | Plan (A3, corrected) |
| Sealing                  | Every manifest file, comments included, is final before the seal; Phase 7 edits only non-manifest files                     | G5 must run the sealed code                                                 | Review fix           |
| Invalid runs             | Recorded without an artifact, with their reason; settled from the counter before the next step                              | A technical judge failure leaves no `review.json`                           | Review fix           |
| G3                       | Exactly the four registered cases × 3, run through the runner's budget admission                                            | Six cases would give 18 rows and bypass the budget                          | Review fix           |
| #247 reliability         | Both runs must be valid                                                                                                     | Precedent: finder-sonnet "every run valid"                                  | Plan (A5)            |
| Early cost stop          | Stop before G1 only if 53 × m247 > $10                                                                                      | A lower bound no later measurement can lower; I may still fall after G5     | Plan (A6, corrected) |

Plan assumptions A1–A8 go verbatim into the pre-registration, which the owner approves before the seal.

Review F2 (owner, 2026-10-11): before G5 the initial monthly projection is provisional. Once both run means are
final, early cost rejection uses only `53 × m247 + 8 × m269 + 13 × ($0.199620 / 2) > $10.00`; equality does not
reject. The earlier A6 stop after #247 stays unchanged. Otherwise Phase 6 records admission pending G5 with cost
provisional, and Phase 7 decides cost using the agreed final I (unchanged when G5 skips impl-review).

Review F3 (owner, 2026-10-11): the manifest explicitly includes G3's
`packages/code-reviewer/evals/review-result.schema.json` and `.github/ai-review-rules.md`. Their hashes are
checked before every paid step; hermetic tests must show that changing either file blocks preflight and spending.

Review F4 (owner, 2026-10-11): File declarations use full repo-relative paths and all 14 manual criteria declare
explicit acceptance surfaces. Progress IDs, titles and marks are unchanged.

Review F5 (owner, 2026-10-11): mixed inline-reasoning and truncation responses are tested for step, finalization
and repair. They fail without retry and never expose the sentinel in stderr or step summary, regardless of guard
ordering.

## Scope

**In scope:**

- Port five finder commits plus the JSONL diff exclusion.
- glm-5.3 configuration, the truncation and inline-reasoning guards, per-request telemetry.
- The measurement tooling, the pre-registration and seal, the paid series, the hand-read.
- On admission: the workflow flip, stale-pointer fixes and G5.
- Moving the raw screening out of git and committing a sanitized `screening-config.md`.

**Out of scope:**

- The verifier.
- `reasoning.exclude` or any other reasoning body.
- A separate reasoning cap.
- Changes to the judge or impl-review.
- New size weights.
- More live probes than G5.

## Architecture / Approach

Stage 1, a tool loop with `getFileContext`, gathers notes. Stage 2, a tool-less call, writes the JSON. If that JSON
fails to parse, one format-repair call follows. Parsing happens on our side, so no endpoint has to honour
`response_format`.

All finder requests share one model setting:

- glm-5.3;
- reasoning `low`;
- routing `only` z-ai / fireworks / together;
- the 16,384-token cap;
- one 300 s budget.

The runner invokes `npm run review` exactly as `action.yml` does, then classifies each run from `review.json` and the
CLI's telemetry lines.

## Phases at a Glance

| Phase        | What it delivers                                                                     | Key risk                                           |
| ------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------- |
| 1. Port      | Two-stage finder + routing on `feat/finder-glm-5-3`, 699 tests; screening out of git | Hidden dependency outside `packages/code-reviewer` |
| 2. Configure | glm-5.3, reasoning low, routing list, length / inline guards, per-request telemetry  | SDK model-id fallback hides the served id          |
| 3. Tooling   | Runner, G3 row checker, hand-read sheet, resolver, projection                        | New sealed code with its own bugs                  |
| 4. Seal      | Owner-approved pre-registration, hashed, pushed, tagged                              | An unconsidered rule discovered after the seal     |
| 5. Series    | G2 → G3 → #247 × 2 → G1 at the sealed commit                                         | 429s on Z.AI; 300 s timeout on #269; D2 recall     |
| 6. Hand-read | Owner verdicts on every finding; outcome                                             | Owner effort (≈ 60–100 findings)                   |
| 7. G5        | `false &&` removed, pointers fixed, live review on this PR                           | G5 cost; impl-review verdict on a large diff       |

**Prerequisites:** owner approval at the seal and before the paid series; OpenRouter credit (≥ $4.50 of the $7.40);
the `~/.cache/finder-sonnet-gate/` inputs and worktrees; the GitHub UI for the variable.
**Estimated effort:** ~3 sessions for Phases 1–4, one paid session for Phase 5, one owner session for the hand-read,
one for G5.

## Open Risks & Assumptions

- **D2 is the hardest bar.** No earlier finder published D2 in every #269 run; sonnet-effort never once did.
- **The cost gate hinges on #247 (weight 53).** m247 must stay ≤ $0.111 when m269 is $0.19.
- **The 300 s timeout has never been exercised by glm-5.3 on a 65 KB diff.** Screening used 900 s on small fixtures.
- **Z.AI first-party has returned 429s before** (glm-4.6 G2 2/5); Fireworks' plain endpoint showed `status -2` on
  2026-10-11.
- **The served model id may be the SDK's fallback** to the requested id. G2-01 records which it is before more spend.
- **Fixtures do not predict live behaviour.** G5 is the only live probe, and it runs last.

## Success Criteria (Summary)

- Every gate in the sealed pre-registration passes within $4.50, and G5 runs green on the real workflow.
- AI review comments again on eligible PRs, served by glm-5.3 through a listed provider, with no reasoning text in
  any artifact.
- If anything fails, the record says which gate, why, and at what cost, and production is unchanged.
