# Verification notes — ci-cd-code-review

> Secret-free audit trail for manual (live) checks. Raw artifacts and
> credentials are deliberately not retained; each line names its provenance.

## Phase 1 — live local run (Progress 1.5 / 1.6)

- **Date**: 2026-08-07 (commit `ca102ed` date; the run itself left no timestamped record)
- **Command**: `npm run review -- --diff-file <synthetic.diff>` with the real `OPENROUTER_API_KEY` (never recorded here)
- **Models** (`result.models`): finder `z-ai/glm-4.6` — resolved via the legacy `OPENROUTER_MODEL` fallback; judge `anthropic/claude-sonnet-5` — `DEFAULT_JUDGE_MODEL` (no `OPENROUTER_JUDGE_MODEL` set). Derived on 2026-08-08 from the current local `.env` + `config.ts` resolution chain, consistent with the plan's "finder=glm, judge=sonnet" annotation — not read from a retained artifact.
- **Artifact checks** (per Progress 1.5): `review.json` + `comment.md` produced; scores named-field (6 criteria); `findingIds` referenced real F-ids; verdict + non-empty `verdictReason` model-owned
- **Outcome**: PASS (user-attested; raw evidence unavailable)
- **Provenance**: note written post-hoc on 2026-08-08 during impl-review triage (F8) — a reconstruction from the local env, commit metadata, and plan Progress annotations, not primary evidence. Future live checks should append their note here at run time.

## Phase 2 — action command-chain dry-run (Progress 2.4 / 2.5)

- **Date**: 2026-08-08 (recorded at run time — primary evidence)
- **Command**: from a clean state (`rm -rf .review-out && npm ci`), `npm run review -- --diff-file <synthetic.diff> --out-dir .review-out --project-context-file .github/ai-review-rules.md` — the exact chain `.github/actions/ai-review/action.yml` runs, incl. the F4 rules path
- **Input**: synthetic diff with planted flaws — IDOR (client-supplied `jobId` through an admin client, no owner scope), no zod validation, wrong API error shape, PII logging, manual class concatenation instead of `cn()`, no tests
- **Result**: exit 0 with `verdict=failed` (advisory exit-code contract held live); 7 findings; models `finder=z-ai/glm-4.6` (legacy `OPENROUTER_MODEL`), `judge=anthropic/claude-sonnet-5` (default)
- **Artifact checks**: `review.json` — named-field scores (`implementation_correctness=4, idiomaticity=6, complexity=8, test_risk_coverage=3, documentation=6, security_safety=2`), all `findingIds` refs valid (F1–F7, 0 dropped), non-empty model-owned `verdictReason`; `comment.md` — `<!-- ai-cr:sticky -->` marker at end (upsert anchor), `❌ FAILED` headline, 6-criteria table, 2,840 chars
- **Signal check**: the planted IDOR/PII/test gaps drove exactly the intended criteria down (security 2, tests 3) — the base-branch rules file reached the finder
- **Guard read-through (2.5)**: all six requirement guardrails present in `review.yml` — fork (`head.repo.full_name == github.repository`), draft, bot author, `ai-cr:review`-only label gate + removal step, per-PR concurrency w/ cancel-in-progress, `permissions: {}` + job-scoped `contents: read, pull-requests: write`
- **Outcome**: PASS (both checks executed by the agent at the user's request)
