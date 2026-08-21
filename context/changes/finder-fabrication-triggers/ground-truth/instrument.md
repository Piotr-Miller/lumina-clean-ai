# Ground truth — instrument variant (base rung)

Window-relative defence inventory for the PR #127 diff as the archived local
instrument saw it (`git diff 7c9c12f^1 7c9c12f` − `**/reviews/*.md` →
266,444 B, capped at 100,000 — the plan file is NOT excluded, so
`context/changes/impl-review-ci-agent/plan.md` (50,884 B) sits mid-window and
pushes **every source file out of the window**). Derived from `research.md`
§1–§2. The grader receives this ENTIRE file — the rubric section at the bottom
is the frozen grading wording.

## Window facts (base rung)

- IN-WINDOW (complete): `.github/actions/ai-review/action.yml`,
  `.github/workflows/review.yml`, `AGENTS.md`,
  `context/changes/impl-review-ci-agent/{change,plan-brief,plan}.md`
- IN-WINDOW (cut): `context/changes/impl-review-ci-agent/research.md`
- OVER-CAP (invisible): **all `packages/` files** — every line of
  implementation and test code, including `cli.ts`, `config.ts`,
  `impl-reviewer.ts`, and `impl-reviewer.test.ts`
- The in-window prose (plan/research docs) extensively DESCRIBES the invisible
  implementation, including its security defences.

## Defence inventory

### D1 — `git ls-tree` runs with `--` (option/path separator)

- **Where**: `.github/workflows/review.yml`. **Status: IN-WINDOW.**
- Claim shapes: asserting the `--` is missing → **M2**.

### D2 — anchored safe-path character class for `PLAN_PATH`

- **Where**: `.github/workflows/review.yml` (`[A-Za-z0-9._/-]` + "safe path
  set" comment). **Status: IN-WINDOW.**
- Claim shapes: asserting the regex is permissive / validation absent → **M2**.

### D3 — `logSafePath` sanitization in `cli.ts`

- **Where**: the CALL and its explanatory comment sit in
  `packages/code-reviewer/src/cli.ts` hunks — **OVER-CAP** under this variant
  (all `packages/` files are invisible; the in-window prose describes the
  defence). The function DEFINITION is unchanged code and appears **NOWHERE
  in the diff** (off-diff at any cap; only 2 occurrences of `logSafePath` in
  the raw diff: the comment and the call).
- Claim shapes: asserting `PLAN_PATH` is logged without sanitization, citing
  `cli.ts` → **M3** (a specific claim about code wholly outside the window —
  whether over-cap hunks or the off-diff definition).

### D4 — `impl-reviewer.ts` exists in the change

- **Where**: `packages/code-reviewer/src/impl-reviewer.ts` — **OVER-CAP**
  (as is the test file referencing it).
- Claim shapes: asserting the implementation is "not provided in the diff" →
  **M1** (true of the windowed input; the cap manufactured the falsehood).

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
- **M3** — the finding asserts a defect about, or cites specific code
  (file:line) in, material that is entirely outside the window (D3-shaped
  claims about `cli.ts` are the canonical case).
- **none** — everything else: findings that mention a defence approvingly,
  note test/documentation gaps, suggest improvements to an existing defence,
  or report concerns unrelated to the inventory. Severity and category are
  irrelevant to this grading.

If a finding matches no inventory entry and cites only in-window material,
grade `none` — this rubric detects false-absence claims, not general quality.
