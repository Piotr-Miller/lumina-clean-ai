# GPT-Image-2.6 Sunburst screening test — Plan Brief

> Full plan: `context/changes/gpt-image-26-screen/plan.md`

## What & Why

This is a small paid screen, pre-registered before any render. It asks whether
`gpt-image-2.6-sunburst` at `complexity=low` is at least as faithful as real Local on the three
S-19 phase-5 scenes (S17-03/04/07), with 2 outputs each, rated blind. In S-19, GPT 2.5 looked
better but was less faithful than Local in 8 of 8 pairs, and none of its configs set `complexity`,
which defaults to `high`. The vendor's own guide says that higher complexity "can introduce
unwanted changes".

## Starting Point

- **S-19 runner:** ledger, budget lock and moderation retry are there. It cannot send
  `complexity`/`moderation`, it reads approvals from an archived folder, and it runs on Unix only.
- **S-20 tools:** the blind viewer and the fidelity scale (`none/minor/significant/severe`, crop +
  reason mandatory) are there. The builder and gate are hard-wired to S-20's design.
- **Real Local:** the files for the three scenes are pinned by hash.
- **Where things live:** the private inputs and the Local files exist only on the owner's Linux
  host.

## Desired End State

A committed verdict (`evaluations/verdict.md`), PASS or FAIL. It combines independently reconciled
six-slot run evidence with sealed blind ratings under a gate committed before any paid call.
Zero delivered outputs yield a sealed FAIL without a viewer or ratings export. Undelivered slots,
fidelity losses and budget/protocol failures are stated separately. The report distinguishes known
cost from unknown reservations and compares wall time with the 30 s guardrail. PASS requires a
compliant run within $1.50 and only opens a wider eight-photo comparison, never a deployment.

## Key Decisions Made

| Decision            | Choice                                                                                                                                     | Why (1 sentence)                                                           | Source                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------------------- |
| Parameters          | 2.6-sunburst, quality high, complexity low, moderation auto, phase-5 prompt                                                                | The question is only "is 2.6 at `low` usable"                              | Owner 2026-11-05        |
| Scenes and slots    | S17-03/04/07 × 2, tuning only; the holdout stays closed                                                                                    | Directly comparable with S-19 phase 5                                      | Owner 2026-11-05        |
| Moderation block    | ≤ 2 attempts per slot; a second block or no budget for the retry = undelivered = **FAIL**; denominator always 6; "nieoceniona", not severe | Undelivered results must not hide in a smaller denominator                 | Owner 2026-11-16        |
| Diagnostics on FAIL | Delivered outputs are still rated, but they never change the verdict                                                                       | Keeps the evidence without bending the gate                                | Owner 2026-11-16        |
| "At least a tie"    | GPT level ≤ Local level on the S-20 scale; majority = ≥ 4 of 6                                                                             | Uses the S-20 scale as is, so it can be checked mechanically               | Owner 2026-11-16        |
| Comparison scale    | GPT output size; original and Local downscaled with Lanczos                                                                                | Compares content, not the known size cap                                   | Owner 2026-11-16        |
| Host                | Code anywhere; paid run and rating on the Linux host                                                                                       | The private corpus, the Local files and Pillow are there                   | Owner 2026-11-16        |
| Tooling             | New `scripts/gpt26/` on small backward-compatible hooks in S-19/S-20 code                                                                  | Archived tools stay untouched and the old suites stay the regression guard | Plan                    |
| Gate storage        | A `gate` block inside the config JSON, committed before spend                                                                              | The config hash pins the gate                                              | Plan                    |
| Failure accounting  | One six-slot reconciler for runner, builder and gate; unknown reservations retain their bounds                                             | Images/ratings alone cannot reveal every failure                           | Owner triage 2026-11-17 |
| Seal storage        | Dedicated write-once `evaluations/gate-sealed.md`; separate seal/ratings commits retained through integration                              | File-history checks remain valid after lifecycle edits                     | Owner triage 2026-11-17 |
| Repeated Local      | Two rating passes, one slot per scene per pass; save/lock earlier answers before revealing later ones                                      | Reduces immediate cross-comparison; residual recognition remains explicit  | Owner triage 2026-11-17 |

## Scope

**In scope:** vendor-fact check, config, gate and series, the runner, the builder, the viewer copy,
the gate script, the paid run, the blind rating, the verdict and the live pointers.

**Out of scope:** production code, un-pausing Cloud, the holdout, prompt or complexity variants,
2.5-vs-2.6 attribution, extra or replacement slots, and the eight-photo follow-up.

## Architecture / Approach

The S-19 slot and ledger logic gains optional hooks with unchanged defaults. Additional scalar
request fields cannot collide with runner-owned fields. The GPT26 wrapper owns its approval
parser and separates ledger/output paths from the existing S-19 input root, without mutating
globals. Historical configs, series and pinned implementation bytes remain unchanged.

A shared offline reconciler accounts for every expected slot, attempt, unknown reservation and
terminal state, validates delivered PNGs and persistently stops spend after a bound breach.
The builder records source and transformed pixel hashes for the prescribed Lanczos resize.
The viewer preserves S-20 questions/scale while adding the two-pass reveal and answer-locking
controls. The gate rechecks run evidence, transforms and the clean write-once seal → ratings
history. All spend preconditions are enforced on the executing Linux checkout, with recorded
committed code/config/approval identities; transferring a clean Windows tree alone is insufficient.
Integration must preserve separate seal and ratings commits, never squash them together.

## Phases at a Glance

| Phase                              | What it delivers                                          | Key risk                                                      |
| ---------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| 1. Vendor facts + pre-registration | Confirmed parameters; config + gate + series committed    | Edits may not accept `complexity=low`, which stops the screen |
| 2. Runner                          | Spend only under this change's approval; offline tests    | Hooks breaking the S-19 suite                                 |
| 3. Builder + gate                  | Sealed blind set at GPT scale; mechanical verdict         | A blind leak through shared Local or file metadata            |
| 4. Paid run (Linux)                | 6 slots resolved within $1.50                             | S17-07 moderation (3 of 7 blocked in S-19)                    |
| 5. Rating + verdict + pointers     | Committed verdict; roadmap, issues and idea-notes updated | Stale pointers                                                |

**Prerequisites:** the Linux host with `test-photos/private/s19/inputs` and `local/`, Pillow,
NumPy, OpenCV, scikit-image and PyWavelets, `OPENAI_API_KEY`, the owner's committed `GPT26-SPEND`
line and passing before/after regression results on the transferred committed revisions.

**Estimated effort:** ~2 sessions of code (phases 1–3), then one short paid run and one rating
session.

## Open Risks & Assumptions

- **S17-07 may be blocked twice**, which turns the result into a FAIL with no fidelity verdict on
  that scene. This is accepted by the owner.
- **The token use of 2.6 may differ from 2.5.** A call costing more than its bound stops the
  runner persistently, including on resume. A post-response check cannot undo a billed overrun;
  report it as a budget/protocol failure. Six worst-case attempts reserve $1.20; one extra
  attempt fits under worst-case bounds, while more retries may fit after actual-cost releases.
  There is no global one-retry limit, and earlier retries may exhaust later first-attempt budget.
- **The local regression baseline is red for multiple reasons.** WSL S-19 reports six missing-PIL
  discovery errors; S-20 reports missing PIL/NumPy and three legacy archive-path failures.
  Native Windows also has encoding/symlink issues. A Phase 2 offline regression harness restores
  four byte-verified historical metadata files only in a disposable Linux checkout and runs the
  full suites before/after; neither dependencies alone nor an old host run proves this baseline.
- **Repeated Local can be recognized.** Random A/B sides and metadata controls do not hide its
  identical pixels across repeats. Two-pass locking reduces comparison; the residual limitation
  remains stated in the registration and verdict.

## Success Criteria (Summary)

- A verdict exists from reconciled six-slot evidence and, when outputs exist, committed ratings
  strictly after a dedicated write-once seal. Config/series/rules/approval were committed before spend.
- Undelivered slots, fidelity losses and diagnostics are reported separately, and spend is
  ≤ $1.50.
- The roadmap, issue mapping, idea-notes, both GPT26 passages in `temp_steps.md` and the change's
  outcome note link the canonical verdict and state its outcome. A block-scoped checker rejects
  stale current wording while retaining historical logs and unrelated proposed work.
