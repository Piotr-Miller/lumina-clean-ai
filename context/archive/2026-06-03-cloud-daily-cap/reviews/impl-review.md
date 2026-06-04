<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Global Daily Cap on Cloud AI Requests

- **Plan**: `context/changes/cloud-daily-cap/plan.md`
- **Scope**: Full plan (Phases 1–2 of 2)
- **Date**: 2026-06-04
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

- **Plan Adherence** — all 6 planned changes MATCH (env field, `.env.example`, `countCloudJobsToday`, `isOverDailyCap`, route guard, client message); no DRIFT / MISSING / EXTRA. All 6 critical constraints satisfied: count runs before `createPhotoJob`; UTC midnight day-start (not local); `count >= cap` (0 kill-switch); reads `count` not `data.length`; `{ error: { code, message } }` envelope with no `status`; no migration/index/per-user/UI.
- **Scope Discipline** — no out-of-plan code files; "What We're NOT Doing" boundaries respected (no migration, no SQL/Edge function change, no new index, no per-user limit, no admin UI).
- **Safety & Quality** — static `.or()` count filter (no injection); 401 anon gate runs before the cap guard (no bypass); service-role admin client correct for a global cross-user count; count-query error throws → falls through to 500 (does not silently allow). De Morgan / UTC / kill-switch logic verified; `status NOT NULL` schema guards the three-valued-logic edge case.
- **Pattern Consistency** — matches sibling route (`timeout.ts`) structure + `json()` envelope, service-helper error style (`throw new Error("fn: …")`, admin injection, `JOBS_TABLE`), env-field precedent (`CLOUD_PIPELINE_ENABLED`), and the keyed-by-`code` `ROUTE_MESSAGES` map. Service stays free of `astro:env/server` (Lesson #4).
- **Success Criteria** — `npx astro check` → 0 errors (76 files); full `vitest` suite 84/84 (incl. live count-predicate `jobs.rls.test.ts` + client 429 mapping). Manual 2.4/2.5/2.6 evidenced via HTTP smoke (kill-switch, boundary, below-cap accept, both predicate cases) + in-browser run (rejection message rendered; below-cap submit created a `jobs` row).

## Findings

### F1 — Global cap count is not covered by any index

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — already documented & deferred by the plan
- **Dimension**: Architecture / Performance
- **Location**: src/lib/services/photo-job.service.ts:79-83
- **Detail**: The count filters on `created_at` + `status`/`replicate_prediction_id` with no `user_id` predicate. The only index on `jobs` (`jobs_user_id_created_at_idx`) leads on `user_id`, so the global query can't use it and seq-scans the day's rows. This is the design shift from the migration's implied per-user cap (index-friendly) to the PRD's global cap. The plan's "Performance Considerations" + "What We're NOT Doing" already document this as acceptable at `small/low` scale and explicitly defer the index. Confirms the plan's own note; not a deviation.
- **Fix**: None inline (an index needs its own migration, out of scope here). Tracked as a follow-up.
- **Decision**: FOLLOW-UP — logged to `context/changes/cloud-daily-cap/follow-ups/review-fixes.md` (add a global `jobs.created_at` or partial daily-cap index if cloud volume grows; revisit after measuring table growth / query latency).
