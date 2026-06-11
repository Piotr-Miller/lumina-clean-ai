<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Gate the floor — wire the existing Vitest suite (incl. Docker/RLS) into CI

- **Plan**: context/changes/testing-ci-gate/plan.md
- **Mode**: Deep
- **Date**: 2026-06-09
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | PASS    |

## Grounding

7/7 paths ✓ (`.github/workflows/ci.yml`, `tests/README.md`, `package.json`, `context/foundation/test-plan.md`, `context/changes/testing-ci-gate/change.md`, `tests/env.ts`, `supabase/config.toml`). 4/4 claims ✓: 11 test files incl. `jobs.rls.test.ts`; exactly 3 required env vars in `tests/env.ts` (`SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`); `enable_confirmations = false` (`config.toml:209`); `photos` bucket created by migration (`20260528120100_create_photos_storage.sql:22-25`). `astro sync` omission in the integration job verified correct — vitest uses node env + `vite-tsconfig-paths` only, no test imports astro virtual modules (`tests/photo-job.service.test.ts:5`, `src/lib/supabase-admin.ts:8`). Progress↔Phase mechanical contract ✓ (Phase 1: 1.1–1.8; Phase 2: 2.1–2.5). brief↔plan ✓.

## Findings

### F1 — `deploy needs: [ci, integration]` makes Supabase boot a prod-deploy blocker; plan frames it as pure upside

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1, change #3 + brief "Key Decisions"
- **Detail**: The plan adds `deploy: needs: [ci, integration]` and presents it only as "the regression lock actually protects prod." But it introduces a new failure surface on the deploy path: `npx supabase start` boots Docker images on every push to master, and a boot hiccup, image-pull timeout, or a transient RLS-suite flake now blocks a production deploy even when the app itself is fine. Previously the integration suite was developer-local and could never gate shipping. The plan's "Performance Considerations" notes the ~1-2 min cost but not the _reliability_ coupling. The user opted into this gate during triage — but the plan should record the tradeoff honestly and add a cheap mitigation so an infra blip doesn't false-block a deploy.
- **Fix A ⭐ Recommended**: Keep the decision; add a boot mitigation + honest note
  - Strength: Preserves the chosen "lock protects prod" gate; a single retry/timeout on `supabase start` absorbs transient boot failures so only a real test regression blocks deploy. Matches the repo's async-timeout-backstop instinct (lessons.md).
  - Tradeoff: Deploy still waits on the integration job (~2-4 min) on every master push.
  - Confidence: HIGH — boot retry is standard CI hygiene; no app risk.
  - Blind spot: Exact flake rate of `supabase start` on ubuntu-latest not measured — retry is precautionary.
- **Fix B**: Gate deploy on `ci` only; keep integration as a PR/push gate (not a deploy `needs:`)
  - Strength: Infra flake in the integration job can never block a prod deploy; deploy stays as fast/reliable as today.
  - Tradeoff: Reverses the user's triage choice — a red RLS suite surfaces on the PR but does not hard-block the master→deploy path.
  - Confidence: HIGH — minimal YAML, well-understood.
  - Blind spot: Relies on PR discipline to not merge a red integration run.
- **Decision**: FIXED (Fix A) — boot retry added to Phase 1 change #1; reliability-coupling tradeoff recorded in change #3, Performance Considerations, and the brief.

### F2 — Unit tests run twice per push (ci `test:unit` + integration `npm test`)

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 1 (ci job retains `test:unit`; integration runs `npm test`)
- **Detail**: The `ci` job keeps `npm run test:unit` (10 files) and the new `integration` job runs `npm test` (all 11), so the 10 unit files execute twice on every push. The plan already names this as a deliberate "few seconds of redundancy" tradeoff for the simplicity of one `npm test`. The redundancy also buys fast unit feedback without waiting on Docker and decouples unit signal from a Supabase-boot failure — so keeping both is defensible.
- **Fix**: No change recommended. If ever leaner is wanted: drop `test:unit` from `ci` once `integration` is trusted — but that couples all test signal to Supabase boot, so only do it if boot proves reliable.
- **Decision**: ACCEPTED — conscious redundancy; no plan change.

### F3 — Exact `supabase status` key-export command is not pinned

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details + Phase 1 change #1
- **Detail**: The plan leaves the exact `supabase status -o env` / `--override-name` syntax for the 2.23.x CLI to implementation time, with a `-o json` + `jq` fallback. This is the one known-unknown in the plan. It's flagged honestly with a concrete fallback (not hidden), so the implementer won't guess blindly — acceptable for a plan. Just note Phase 1 cannot be marked done until that command is empirically confirmed green in a CI run, not assumed.
- **Fix**: No plan change needed. Resolve at implementation; the `-o json` fallback is the safety net if `--override-name` keys differ.
- **Decision**: ACCEPTED — resolve at implementation; confirm the exact command green in a CI run before marking Phase 1 done.
