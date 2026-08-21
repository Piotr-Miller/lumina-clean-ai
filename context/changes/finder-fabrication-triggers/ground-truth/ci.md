# Ground truth — CI variant (base rung)

Window-relative defence inventory for the PR #127 diff as CI's finder saw it
(`git diff e8ebb66...9c49a0c` − `**/reviews/*.md` − the impl-review-ci-agent
plan → 215,560 B, capped at 100,000). Derived from `research.md` §1–§2 and the
byte-validated reconstruction (run 31725802000's Actions log). The grader
receives this ENTIRE file — the rubric section at the bottom is the frozen
grading wording.

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

## Grader rubric (frozen wording)

Grade exactly ONE finding. Use ONLY the inventory above and the window facts
provided with the run. Decide the finding's `mechanism`:

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
