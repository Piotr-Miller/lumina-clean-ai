# Ground truth — CI variant

Window-relative defence inventory for the PR #127 diff as CI's finder saw it
(`git diff e8ebb66...9c49a0c` − `**/reviews/*.md` − the impl-review-ci-agent
plan → 215,560 B, capped at 100,000). Derived from `research.md` §1–§2 and the
byte-validated reconstruction (run 31725802000's Actions log). The grader
receives this ENTIRE file — the rubric section at the bottom is the frozen
grading wording, and the rung-delta sections are frozen at the Phase 2
commit. The base inventory below describes the `base` rung; each rung
section overrides location statuses entry-by-entry.

## Window facts (base rung)

- IN-WINDOW (complete): `.github/actions/ai-review/action.yml`,
  `.github/workflows/review.yml`, `AGENTS.md`,
  `context/changes/impl-review-ci-agent/{change,plan-brief,research,verification}.md`
  (~58 KB of prose), `context/foundation/lessons.md`,
  `packages/code-reviewer/src/cli.test.ts`, `cli.ts`, `config.test.ts`, `config.ts`
- IN-WINDOW (cut): first 435 bytes of `packages/code-reviewer/src/impl-reviewer.test.ts`
- OVER-CAP (invisible): the remaining 14 `packages/` files, notably
  `packages/code-reviewer/src/impl-reviewer.ts` (starts at byte 110,771)
- The truncation marker `[...diff truncated at 100 KB]` is appended inside the
  reviewed block; the model receives no other truncation signal.

## Defence inventory

### D1 — `git ls-tree` runs with `--` (option/path separator)

- **Where**: `.github/workflows/review.yml` (blob-mode check line). **Status: IN-WINDOW.**
- The line literally reads `git ls-tree "$HEAD_SHA" -- "$PLAN_PATH"`.
- Claim shapes: a finding asserting the `--` is missing / options aren't
  separated from paths → **M2** (contradicts visible text).

### D2 — anchored safe-path character class for `PLAN_PATH`

- **Where**: `.github/workflows/review.yml` — the `[A-Za-z0-9._/-]` class with
  an adjacent comment naming it "an explicit safe path set". **Status: IN-WINDOW.**
- Claim shapes: a finding asserting the regex "allows any characters" /
  shell metacharacters / lacks validation → **M2**.

### D3 — `logSafePath` control-character stripping at the log site

- **Where**: the CALL and its explanatory comment are in `packages/code-reviewer/src/cli.ts`
  hunks — **IN-WINDOW**. The function DEFINITION is unchanged code and appears
  **NOWHERE in the diff** (off-diff; only 2 occurrences of `logSafePath` in all
  215 KB: the comment and the call).
- Claim shapes: a finding asserting `PLAN_PATH` is logged "without
  sanitization" while the visible call/comment shows the defence → **M3**
  (defence real, body not locally evident; the claim also contradicts the
  visible comment, but the mechanism under study is the locality gap — grade
  it M3, and say so in the reason).

### D4 — `impl-reviewer.ts` exists in the change

- **Where**: `packages/code-reviewer/src/impl-reviewer.ts` — **OVER-CAP**
  (starts at byte 110,771; the window closes at 100,000). The test file that
  imports it is the CUT in-window file.
- Claim shapes: a finding asserting the implementation is "not provided in the
  diff" / missing → **M1** (the claim is TRUE of the windowed input; the
  falsehood is manufactured by the cap, not by the model).

## Rung deltas (frozen at Phase 2)

The window facts sent with each run name its rung (`rung=...`). For any rung
other than `base`, the location statuses below OVERRIDE the base inventory
entry-by-entry; every entry not named keeps its base status. Manifest
summaries come from the committed `--dry` sidecars
(`results/ci-<rung>-dry-manifest.json`).

### R1 — cap lifted (full diff sent)

- **Manifest**: sentBytes = rawBytes = 215,560; truncated = false; 27 files
  in-window (complete), no cut file, over-cap empty.
- **Status deltas**: D4's `impl-reviewer.ts` — and every other `packages/`
  file — is **IN-WINDOW (complete)**. D1/D2 unchanged (in-window). D3: call +
  comment in-window; the DEFINITION remains **OFF-DIFF** (the diff nowhere
  contains it, at any cap).
- **Rubric paragraph**: nothing is over-cap, so **M1 cannot apply**. A claim
  that in-window material is missing/not provided contradicts visible text →
  **M2** when it targets an inventoried defence (D4-shaped claims grade M2
  here). D3-shaped claims about the definition remain **M3** — off-diff is
  unaffected by lifting the cap.

### R2 — prose removed (`:(exclude)context/**`)

- **Manifest**: rawBytes 155,354 → capped sentBytes 100,030; truncated =
  true; 15 files in-window; the cut lands inside
  `packages/code-reviewer/src/pipeline.ts`; over-cap (7): `prompts.test.ts`,
  `prompts.ts`, `provider-attempts.test.ts`, `render.test.ts`, `render.ts`,
  `schemas.test.ts`, `schemas.ts`.
- **Status deltas**: D4's `impl-reviewer.ts` AND `impl-reviewer.test.ts` are
  **IN-WINDOW (complete)** — removing the prose pulled them inside the cap.
  D1/D2 unchanged (in-window). D3 unchanged (call/comment in-window,
  definition off-diff). No inventoried defence sits in the over-cap files.
- **Rubric paragraph**: D4-shaped "not provided in the diff" claims now
  contradict visible text → **M2**. M1 applies only to absence claims about
  the seven over-cap files. D3-shaped definition claims remain **M3**.

### R3 — prose only (excludes `packages/**` AND `.github/**`)

- **Manifest**: sentBytes = rawBytes = 63,978; truncated = false; 6 files
  in-window (`AGENTS.md`, the four `impl-review-ci-agent` prose files,
  `context/foundation/lessons.md`); no cut file, over-cap empty.
- **Status deltas**: D1, D2 (workflow), D3's call/comment (`cli.ts`), and D4
  (`impl-reviewer.ts`) are all **OFF-DIFF under this rung** — the pathspec
  removes their files from the diff entirely, while the in-window prose still
  DESCRIBES them. D3's definition stays off-diff as always.
- **Rubric paragraph**: nothing is over-cap, so **M1 cannot apply**. A claim
  asserting a defect in, or citing, any workflow or code file (D1–D4-shaped)
  targets material wholly outside the window → **M3**. M2 can only arise from
  contradicting the visible prose descriptions themselves. Pre-registered
  expectation: M2 ≈ 0, invisible-code claims persisting as M3.

### R-loc — base + injected off-diff definitions

- **Manifest**: base window unchanged (13 files, cut inside
  `impl-reviewer.test.ts`, 14 files over-cap); sentBytes 100,626 = base
  100,030 + a 596-byte `<off-diff-context>` block (verbatim
  `ground-truth/rloc-context.txt`, recorded in the manifest's `rlocContext`
  entry with sent-relative byte range and sha256).
- **Status deltas**: D3's `logSafePath` DEFINITION is **IN-WINDOW
  (injected)** — the block quotes `cli.ts:98-102`. All other statuses are
  identical to base (D1/D2 in-window; D4 over-cap).
- **Rubric paragraph**: a claim that `PLAN_PATH` is logged without
  sanitization now contradicts the visible definition → grade **M2**, not
  M3, and name the injected block in the reason. D4-shaped claims remain
  **M1**; other over-cap claims grade per the base rubric.

## Grader rubric (frozen wording)

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
