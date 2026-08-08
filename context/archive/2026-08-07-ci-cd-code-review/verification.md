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

## Phase 3 — live E2E on real PRs (Progress 3.3 / 3.4 / 3.5)

- **Date**: 2026-08-08 (recorded at run time — primary evidence)
- **Provisioning**: 3 `ai-cr:*` labels + `OPENROUTER_REVIEW_MODEL`/`OPENROUTER_JUDGE_MODEL` variables created via `gh` (verified by list); `OPENROUTER_API_KEY` secret set by the user via the GitHub UI (first live run authenticated — no 401)
- **(a) Review on open** — PR #115 `opened` → run 31275208983 `success` (2m10s): sticky comment (`❌ FAILED` headline, marker present) + `ai-cr:failed` label
- **(b) Sticky update in place** — follow-up push `4116d17` → after the retry run, exactly ONE marker comment, SAME id (5227813452), fresh `updated_at` — no duplicate. Empirically refutes the self-review's "PATCH -F will fail" finding
- **(c) Retry label** — run 2 (31275401205, `synchronize`) failed red with `No object generated: response did not match schema` (finder output flake; schema mismatches deliberately don't retry) — posting steps skipped, last valid comment/label untouched, cause in the job summary. Adding `ai-cr:review` → run 31275495502 `success`, label auto-removed at run start, comment updated. The designed failure + recovery path both observed live
- **(d) Flawed scratch PR** — PR #116 (planted IDOR, no zod, wrong error shape, PII log, no tests): `verdict=failed`, `security_safety=2/10`, `test_risk_coverage=3/10`, `ai-cr:failed` applied. CAVEAT: the scratch branch had to include the whole feature (a `pull_request` workflow only triggers when present in the PR's merge ref; master lacks `review.yml` pre-merge), so per-file attribution of the planted flaw is unverified (top-5 findings targeted the CI files; the rest only in the runner-ephemeral `review.json`). Clean flawed-file-only re-test possible post-merge. PR closed + branch deleted after verification
- **(e) Advisory contract** — both PRs `MERGEABLE` with `ai-cr:failed`; `deploy` gates on `needs: [ci, integration, e2e]` only (static), `review.yml` never referenced
- **Live catch fixed mid-phase**: the first self-review's F7 was legitimate — `on.pull_request` lacked `branches: [master]`; fixed in `4116d17`
- **Follow-up candidates (not in scope)**: (1) consider classifying structured-output schema mismatches as retryable-once (run 2's flake cost a manual retry); (2) upload `review.json` as a run artifact for post-hoc finding inspection; (3) post-merge clean re-run of check (d)
- **Outcome**: PASS (secret user-set; live checks executed/observed by the agent at the user's request)

## Post-implementation — Codex full-plan review triage (reviews/impl-review.md)

- **Date**: 2026-08-08 (recorded at run time — primary evidence)
- **Review**: Codex full-plan impl-review (Phases 1–3, range ae3c00f..a5e1e6e): NEEDS ATTENTION — 0 critical, 4 warnings, 1 observation; drift/scope/architecture/patterns all PASS
- **Triage**: F1 (sticky lookup now requires `github-actions[bot]` author) + F2 (add-label mandatory before opposite-label removal) FIXED in `bb5837d`; F3 (same-line dedup collapse) + F4 (no retry backoff) DEFERRED to the pipeline-reliability follow-up change
- **F5 resolution**: the `bb5837d` push's run 31279153306 succeeded first-try on the final HEAD — sticky comment updated in place under the author filter (same id 5227813452, count 1), label flip clean under the strict add, PR still MERGEABLE with the advisory `ai-cr:failed`
- **Schema-flake tally**: 2 failures / 7 live runs (31275401205 on `4116d17`, 31277190123 on `a5e1e6e`) — quantifies the case for making structured-output schema mismatches retryable-once in the follow-up change
