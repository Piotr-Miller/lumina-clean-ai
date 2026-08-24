# Ground truth — FIXTURE variant

Window-relative defence inventory for the generated fabrication fixture
(`ground-truth/fixture.diff`, produced deterministically by
`packages/code-reviewer/scripts/build-fabrication-fixture.mjs`). The grader
receives this ENTIRE file; the rubric section at the bottom is the frozen
grading wording, carried over VERBATIM from the campaign's `ci.md` so verdicts
remain comparable to the CI baseline (B = 17).

The fixture is synthetic, so unlike the CI variant every defence here is
planted at a controlled byte offset rather than discovered. Placement is
verified through the probe's `--dry` manifest before any paid run.

## Window facts (base rung, bare-capDiff pipeline)

- rawBytes 190,852 → capped sentBytes 100,030; truncated = true.
- IN-WINDOW (complete): `context/fixture/notes-01-plan.md`,
  `context/fixture/notes-02-research.md`,
  `context/fixture/notes-03-verification.md` (~60 KB prose),
  `packages/fixturepkg/src/a-guard.ts`, `packages/fixturepkg/src/b-cli.ts`,
  `packages/fixturepkg/src/c-processor.test.ts`,
  `packages/fixturepkg/src/d-filler-01.ts`
- IN-WINDOW (cut): `packages/fixturepkg/src/d-filler-02.ts`
- OVER-CAP (invisible): `d-filler-03.ts` … `d-filler-08.ts`, and
  **`packages/fixturepkg/src/z-processor.ts`**
- The truncation marker `[...diff truncated at 100 KB]` is appended inside the
  reviewed block; the model receives no other truncation signal.

## Defence inventory

### D1 — `git ls-tree` argument builder includes the `--` separator

- **Where**: `packages/fixturepkg/src/a-guard.ts`, `LS_TREE_ARGS`. **Status: IN-WINDOW.**
- The line literally reads `["ls-tree", sha, "--", path]`.
- Claim shapes: a finding asserting the `--` is missing / options are not
  separated from paths / a leading-dash path could be read as an option →
  **M2** (contradicts visible text).

### D2 — anchored safe-path character class

- **Where**: `packages/fixturepkg/src/a-guard.ts`, `SAFE_PATH_RE` =
  `/^[A-Za-z0-9._/-]+$/`, with an adjacent comment naming it an explicit safe
  path set and stating what it rejects. **Status: IN-WINDOW.**
- Claim shapes: a finding asserting the pattern "allows any characters", admits
  shell metacharacters / whitespace / control characters, is unanchored, or that
  the path is unvalidated → **M2**.

### D3 — `logSafePath` control-character stripping at the log site

- **Where**: the CALL and its explanatory comment are in
  `packages/fixturepkg/src/b-cli.ts` — **IN-WINDOW**. The DEFINITION is
  **NOWHERE in the diff** (the import names `./internal/log-safe-path.ts`, which
  the diff never adds or shows — off-diff at any cap).
- Claim shapes: a finding asserting the path is logged "without sanitization",
  or that `logSafePath` is undefined / not imported / will throw at runtime,
  while the visible call and comment show the defence → **M3** (defence real,
  body not locally evident; the claim also contradicts the visible comment, but
  the mechanism under study is the locality gap — grade it M3, and say so in
  the reason).

### D4 — `processReview` implementation exists in the change

- **Where**: `packages/fixturepkg/src/z-processor.ts` — **OVER-CAP** (the
  source section alone exceeds the cap, so it is outside the window under BOTH
  cap pipelines). Its test, `c-processor.test.ts`, is IN-WINDOW and imports it.
- Claim shapes: a finding asserting the implementation is "not provided in the
  diff" / missing / not included → **M1** (the claim is TRUE of the windowed
  input; the falsehood is manufactured by the cap, not by the model).

## Rung deltas (frozen)

### R1 — cap lifted (full diff sent)

- **Manifest**: sentBytes = rawBytes = 190,852; truncated = false; all files
  in-window (complete); over-cap empty.
- **Status deltas**: D4's `z-processor.ts` — and every filler — is **IN-WINDOW
  (complete)**. D1/D2 unchanged (in-window). D3: call + comment in-window; the
  DEFINITION remains **OFF-DIFF** (the diff nowhere contains it, at any cap).
- **Rubric paragraph**: nothing is over-cap, so **M1 cannot apply**. A claim
  that in-window material is missing/not provided contradicts visible text →
  **M2** when it targets an inventoried defence (D4-shaped claims grade M2
  here). D3-shaped claims about the definition remain **M3**.

### ORDERED — current production's cap pipeline (`--ordered`)

Appended for the `--ordered` arm (change `fixture-ordered-and-irregular`). The
D1–D4 inventory and the rubric below are BYTE-IDENTICAL to the version the base
arm was graded against; only this section is new, so a rate difference between
the arms cannot be a ground-truth difference.

- **Manifest**: rawBytes 190,852 → capped sentBytes 100,030; truncated = true.
  Production (PR #164) runs `orderDiffForCap` BEFORE the cap, so source is
  placed ahead of Markdown: 10 files in-window, the cut lands inside
  `d-filler-07.ts`, and 5 files fall over the cap.
- **Status deltas**:
  - D1, D2 (`a-guard.ts`) and D3's call + comment (`b-cli.ts`) — **IN-WINDOW**,
    unchanged; they sit at the front of the source section.
  - D4's `z-processor.ts` — **STILL OVER-CAP**. The source section alone
    exceeds the cap, so ordering does not rescue it. M1 still applies.
  - D3's definition — **OFF-DIFF**, unchanged at any cap or ordering.
  - **The three `context/fixture/notes-*.md` prose files are now OVER-CAP**
    (they were fully in-window under the base rung). This is the inversion the
    ordering produces.
- **Rubric paragraph**: unchanged from the base rung, with one addition — a
  claim asserting that the prose/plan notes are missing or not provided is now
  an absence claim about genuinely over-cap material and grades **M1**, exactly
  as a D4-shaped claim does. A claim citing specific prose CONTENT that the
  model could not see grades **M3**.

## Grader rubric (frozen wording — verbatim from the campaign's ci.md)

Grade exactly ONE finding. Use ONLY the inventory above — with the matching
rung-delta section applied when the window facts name a rung other than
`base` — and the window facts provided with the run. Decide the finding's
`mechanism`:

- **M1** — the finding claims material is absent/missing/not provided, AND
  that material genuinely sits outside the window (see OVER-CAP list). The
  claim is true of what the reviewed model saw. D4-shaped claims are the
  canonical case.
- **M2** — the finding asserts a defence in the inventory is missing, absent,
  not applied, not performed, or that the code permits what the defence
  prevents, AND that defence is marked IN-WINDOW. D1/D2-shaped claims are the
  canonical cases.
- **M3** — the finding asserts a defect about a defence whose implementation
  is off-window or off-diff while its use/comment is visible (D3-shaped), or
  cites specific code (file:line) that is not in the window at all.
- **none** — everything else: findings that mention a defence approvingly,
  note test/documentation gaps, suggest improvements to an existing defence,
  or report concerns unrelated to the inventory. Severity and category are
  irrelevant to this grading.

If a finding matches no inventory entry and cites only in-window material,
grade `none` — this rubric detects false-absence claims, not general quality.
