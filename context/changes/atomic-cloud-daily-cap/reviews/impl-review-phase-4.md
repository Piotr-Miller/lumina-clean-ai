<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Atomic Global Cloud AI Daily Cap — Phase 4

- **Plan**: `context/changes/atomic-cloud-daily-cap/plan.md`
- **Scope**: Phase 4 of 5 — Production migration, pre-merge gate
- **Date**: 2026-08-29 (report saved 2026-08-30)
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Independent verification of the gate

Phase 4's claims are claims about production, so they were re-run against
`luminaclean-prod` (`tebdkqpgjjypdethpezo`) rather than read from the record.
Every recorded value reproduced:

| Check                            | Recorded in §7                                       | Re-observed                                                 |
| -------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| Function + signature             | `admit_cloud_job(uuid,uuid,text,float8,float8,int4)` | matches                                                     |
| `prosecdef`                      | `false`                                              | `false`                                                     |
| `proconfig`                      | `search_path=""`                                     | `search_path=""`                                            |
| EXECUTE — `PUBLIC`               | `false`                                              | `false`                                                     |
| EXECUTE — `anon`/`authenticated` | `false` / `false`                                    | `false` / `false`                                           |
| EXECUTE — `service_role`         | `true`                                               | `true`                                                      |
| Raw ACL                          | `{postgres=X/postgres,service_role=X/postgres}`      | matches — no `PUBLIC` entry                                 |
| `jobs_billable_created_at_idx`   | present, billable predicate                          | present, `(status <> 'failed') OR (prediction_id NOT NULL)` |
| Migration history                | 11/11 parity                                         | 11 prod migrations, 11 files, names match 1:1               |

Beyond the recorded list:

- The prod function body returned by `pg_get_functiondef` is equivalent to
  `supabase/migrations/20260828120000_atomic_cloud_daily_cap.sql` — the null/negative
  cap guard first, `pg_advisory_xact_lock(20260828140191)`, the billable count on the
  database clock, `>=` comparison, then the insert.
- **Ordering holds.** `git show master:src/lib/services/photo-job.service.ts` contains
  no `admit_cloud_job` call, so the deployed Worker cannot reach the new function — it
  is additive and inert, which is what makes DB-before-code safe (the S-11 failure mode
  inverted).
- **No new security advisor** is attributable to the change. The four prod
  `security` lints (`set_updated_at` mutable search_path, `pg_net` in public,
  `handle_queued_job` SECURITY DEFINER executable by anon/authenticated, leaked-password
  protection off) all predate it; `admit_cloud_job` raises none.
- `npm run format:check` green repo-wide.
- Advisory-lock key `20260828140191` has no other user in the repo (`supabase/`, `src/`,
  `scripts/`) — no collision risk.

## Findings

### F1 — roadmap.md still says the migration is not applied to production

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence (gap in the plan's own file list)
- **Location**: `context/foundation/roadmap.md:297` (and `:295`)
- **Detail**: S-16's Status reads "in progress (planned, implementing; migration verified
  locally, not yet applied to prod)", and Blockers still names "production database access
  to apply `20260828120000_atomic_cloud_daily_cap.sql` to `luminaclean-prod` **before** the
  PR merges (Phase 4)". Both were true when Phase 3 wrote them; Phase 4 made them false and
  did not revisit them. Phase 4's Changes Required lists only `production-config.md` §7, so
  the phase followed the plan — the plan's file list is the gap. Same class as phase-3
  F2/F3. It matters more than its size: a false claim about production state, in a live
  foundation document, inside the change opened because that exact claim landed wrong twice
  (`AGENTS.md`; `lessons.md:241`).
- **Fix**: Update the Status parenthetical to "migration applied to prod 2026-08-29,
  pre-merge" and narrow Blockers to the Phase 5 smoke, the only one still outstanding.
- **Decision**: FIXED (2026-08-30) — `roadmap.md` S-16 Status now reads "migration applied to `luminaclean-prod` 2026-08-29 pre-merge and verified — see `production-config.md` §7; Phase 5 post-merge smoke + archive outstanding", and Blockers narrowed to the Phase 5 smoke, with the cleared Phase 4 blocker kept as a dated parenthetical rather than deleted. Noted: the Blockers line was itself written during phase-3 F5 triage — the same-session edit went stale within a day, which is the cost of a status claim that duplicates state living elsewhere.

### F2 — change.md still carries "No PRODUCTION schema change has been applied yet"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/changes/atomic-cloud-daily-cap/change.md:25` (and `:65`)
- **Detail**: Line 25 is a bolded standing caveat and it is load-bearing — the phase-3 F2
  triage cited `change.md:25` as the ground truth justifying a prod-neutral rewrite of
  `production-config.md` §7. It is now false. Two smaller instances in the same file: `:65`
  ends "Findings are untriaged" although commit `e868bcd` triaged all seven findings in the
  very commit that wrote that sentence; and Phases 2 and 3 each received a dated note
  paragraph while Phase 4 received none.
- **Fix**: Replace `:25` with a dated "applied to prod 2026-08-29 (pre-merge)" note, correct
  `:65`, and add a Phase 4 note paragraph matching the Phase 2/3 pattern.
- **Decision**: FIXED (2026-08-30) — all three parts. `:25`'s bolded caveat rewritten as a dated applied-note, keeping the superseded sentence visible in an italic parenthetical because phase-3 F2 triage **cited it as ground truth**; that reasoning was sound on its date and the record should show why, not silently erase the premise. `:65` corrected — all seven phase-3 findings were triaged in `e868bcd`, the very commit that wrote "Findings are untriaged". Phase 4 note paragraph added, matching the Phase 2/3 pattern.

### F3 — §7 and criterion 4.3 describe a PR that does not exist yet

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `context/foundation/production-config.md:126`; `plan.md` Progress 4.3
- **Detail**: `gh pr list --head atomic-cloud-daily-cap --state all` returns `[]`. §7 states
  the migration was applied "**before** the implementing PR merged" (past tense), and
  criterion 4.3 is stamped "recorded in `production-config.md` §7 in this PR" while that edit
  is still uncommitted in the working tree. The sequencing is factually right — master carries
  no `admit_cloud_job` call — the point is only that the record states as completed history
  something that has not happened yet.
- **Fix**: "merged" → "merges"; commit the §7 record and open the PR so 4.3's "in this PR" is
  a fact rather than an intention.
- **Decision**: FIXED (2026-08-30), **both halves**. Tense: §7 now reads "**before** the implementing PR merges". PR: the §7 record was committed in `fb51672` and the branch opened as **PR #198** on 2026-08-30 (first push of this branch — no remote existed before), so criterion 4.3's "recorded … **in this PR**" is now a fact rather than an intention. The underlying sequencing was independently confirmed correct: `git show master:src/lib/services/photo-job.service.ts` contains no `admit_cloud_job` call, so the deployed Worker cannot reach the new function until this PR merges.

### F4 — the recorded verification is catalog-only and omits the precondition SECURITY INVOKER depends on

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `context/foundation/production-config.md:137-146`
- **Detail**: The eight rows prove the function exists, is INVOKER, and who may EXECUTE it.
  Under SECURITY INVOKER it can only write because `service_role` independently holds
  INSERT/SELECT on `public.jobs` — the whole reason phase-1 F1 dropped DEFINER. That grant is
  not in the table, and this repo has already been bitten by prod/local grant divergence
  (`20260804212000_explicit_service_role_grants_on_jobs.sql` exists because CLI 2.111+ stopped
  seeding `service_role` grants). Related: plpgsql compiles body statements lazily, so a
  successful `CREATE FUNCTION` does not prove the INSERT resolves against prod's schema, and
  nothing has executed the function in prod yet. **Both hold** — verified during this review:
  `service_role` INSERT `true`, SELECT `true`, BYPASSRLS `true`; `authenticated`/`anon` INSERT
  `false`; RLS enabled on `public.jobs`; and the table carries `id`, `user_id`, `status`,
  `source_path`, `gamma`, `strength` with the types the signature needs. The gap is in the
  record, not in production.
- **Fix**: Add two rows to the §7 verification table — `service_role`'s table privileges on
  `public.jobs`, and the INSERT column/type check — using the evidence above.
- **Decision**: FIXED (2026-08-30) — the strongest finding in this report, and a real gap in the record I wrote. Two rows added to the §7 table plus a paragraph explaining why they belong there: under `SECURITY INVOKER` the function can only write because `service_role` **independently** holds INSERT/SELECT on `public.jobs`, which a successful `CREATE FUNCTION` does not imply — and this project already carries `20260804212000_explicit_service_role_grants_on_jobs.sql` because CLI 2.111+ stopped seeding exactly those grants. Values were **re-verified against prod during triage rather than transcribed** from the report: `service_role` INSERT/SELECT `true`, `rolbypassrls true`, `authenticated`/`anon` INSERT `false`, RLS enabled, all six INSERT target columns present with matching types. The report's own framing is retained: the gap was in the record, not in production.

## Not findings

- `.claude/settings.local.json` gained a `Bash(docker exec *)` allowlist entry outside the
  plan's file list. That file is routinely committed alongside unrelated work in this repo
  (`d460304`, `b1241cb`, `600c6c5`), so it matches established practice.
- Scope held: no file under `context/archive/` touched, nothing marked `done`, the Backlog
  Handoff row not flipped, issue #191 still open.

## Triage outcome (2026-08-30)

All 4 findings resolved; **0 skipped, 0 accepted-as-risk, 0 dismissed**. The header
verdict stays **NEEDS ATTENTION** as the record of the review _as filed_.

| ID  | Filed as    | Outcome                                              |
| --- | ----------- | ---------------------------------------------------- |
| F1  | WARNING     | FIXED — roadmap Status + Blockers                    |
| F2  | WARNING     | FIXED — all three parts of `change.md`               |
| F3  | OBSERVATION | FIXED — tense + PR #198 opened; 4.3 now factual      |
| F4  | OBSERVATION | FIXED — two §7 rows, values re-verified against prod |

Every anchor was re-checked before triage rather than taken on trust, and F4's prod
values were re-queried rather than transcribed — the report critiques the Phase 4
record, which this session wrote.

**F3 was half-closed at triage time and is now fully closed.** Its second half —
committing the §7 record and opening the PR — was the user's to do under the repo's
commit rule. Done on 2026-08-30: `fb51672`, then **PR #198**. Criterion 4.3's
"recorded … **in this PR**" is therefore satisfied rather than aspirational. Recorded
here because the gap was real when this report was written, and the fix is the kind
that silently stops being true — exactly the drift class this whole change exists to
correct.

**Verification after triage:** `npm run format:check` clean.

**Standing pattern across phases 3 and 4:** six of the eleven findings so far have
been "the plan's file list is the gap" — a phase does exactly what its Changes
Required says, and a _different_ live document keeps a claim the phase invalidated.
Phase 5 should expect the same class and sweep for it deliberately.
