<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Atomic Global Cloud AI Daily Cap — Phase 3

- **Plan**: `context/changes/atomic-cloud-daily-cap/plan.md`
- **Scope**: Phase 3 of 5 — "Correct the record"
- **Commit under review**: `58bd9e3` (`docs(atomic-cloud-daily-cap): correct the record (p3)`)
- **Date**: 2026-08-29
- **Verdict**: NEEDS ATTENTION
- **Findings**: 1 critical, 2 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | FAIL    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

## What landed correctly

All seven contract items MATCH. Every factual claim in the new text was verified
against reality:

- `supabase/migrations/20260828120000_atomic_cloud_daily_cap.sql` really is
  `security invoker` (:71), `set search_path = ''` (:72), `pg_advisory_xact_lock`
  (:89, xact-scoped not session), fail-closed on `p_cap is null or p_cap < 0`
  (:79-81, before the count), `revoke all … from public / anon, authenticated` +
  `grant execute … to service_role` (:122-124), with the partial index
  `jobs_billable_created_at_idx` (:132-134) whose predicate is byte-identical to
  the count.
- `createPhotoJob` (`photo-job.service.ts:110`) really calls
  `admin.rpc("admit_cloud_job", …)` (:122), returns `null` on `admitted === false`
  (:135-141), and throws on a non-boolean (:149-153) so contract drift is a 500,
  not a 429. `cloud-create-job.handler.ts:144-146` maps `null` onto the same
  `DAILY_CAP_REACHED_BODY` 429 the fast path returns at :127.
- `lessons.md`'s archive quote is verbatim accurate against
  `context/archive/2026-06-09-cap-rejection-coverage/research.md:142-144`; the
  cross-linked rule "Keep ownership enforcement in the write, not a read-then-write
  check" exists at `lessons.md:58`.
- Every test shape named in the new test-plan §6.6 entry exists as described:
  RPC-layer oracle (`jobs.rls.test.ts:859`, `FANOUT = 8`, `p_cap = 0` warm-up burst
  at :868-874), service-layer fan-out (:894), route-layer fan-out (:921), the
  hermetic `{ data: false }` case (`cloud-create-job.handler.test.ts:219`), and the
  `p_cap = -1` denial probe (`jobs.rls.test.ts:631-637`).
- The §6.6 2026-06-10 note was **appended to**, not edited — `git diff
--ignore-all-space` shows zero deleted lines outside the Risk-table row.
- All four scope boundaries held: `## Done` has no entry for this change, the
  Backlog Handoff row is `in progress`, `gh issue view 191` → OPEN, and no file
  under `context/archive/` was modified.

## Findings

### F1 — mvp-check-report.md: 26 stale line pointers, 20 broken by this commit

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `context/mvp-check-report.md:18-21`, `:39`, `:41-42` (EN) and
  `:80-83`, `:101`, `:103-104` (PL)
- **Detail**: The plan's item 5 states verbatim: _"The line-number references to
  `photo-job.service.ts` also move; re-derive rather than copying."_ Two refs per
  section were re-derived (`:185`/`:207`). Nine were copied. Every
  `photo-job.service.ts` ref after the RPC edit is off by exactly **+47** — the
  lines this change itself added:

  | Claimed | Symbol                          | Actual |
  | ------- | ------------------------------- | ------ |
  | `:89`   | `createPhotoJob`                | 110    |
  | `:181`  | `markJobSucceeded`              | 228    |
  | `:213`  | `getJobById`                    | 260    |
  | `:233`  | `claimJobForProcessing`         | 280    |
  | `:258`  | `recordJobPrediction`           | 305    |
  | `:290`  | `markJobFailed`                 | 337    |
  | `:328`  | `markPendingJobFailedForOwner`  | 375    |
  | `:376`  | `sweepStalePendingJobsForOwner` | 423    |
  | `:490`  | `sweepAbandonedSourcesGlobally` | 537    |

  Plus `tests/cloud-create-job.handler.test.ts:191` ("anonymous auth gate (Risk
  #2)") — correct on master, pushed to `:261` by this commit's own new describe at
  `:211`. Line 191 is now `expect(res.status).toBe(400);` inside an unrelated S-12
  test.

  Three more (`jobs.rls.test.ts:460` Risk #5 → actually 963; `:593` IDOR → actually
  1096; `:629` → actually 1134) were already stale by ~47 lines before this change
  and are now off by ~500.

  13 wrong pointers per section × 2 sections = **26**. The commit message states
  "EN and PL sections, line refs re-derived."

- **Fix A ⭐ Recommended**: Re-derive all 26 numbers now, and drop line numbers from
  refs that name a unique exported symbol or describe-block title.
  - Strength: Kills the class, not the instance — a symbol name cannot drift by +47.
    The refs that survived (`:67`, `:72`, `useCloudJob.ts:232`) survived by luck of
    position, not design.
  - Tradeoff: Slightly less precise navigation without editor search; a hand pass
    over ~20 bullets.
  - Confidence: HIGH — every claimed target was located by symbol grep in seconds;
    the report already cites most of them by name.
  - Blind spot: Haven't checked whether the course submission this report serves
    requires literal line citations.
- **Fix B**: Re-derive the 26 numbers, leave the format as-is.
  - Strength: Minimal edit; preserves the document's style and the EN/PL mirror.
  - Tradeoff: Re-breaks on the next edit to `photo-job.service.ts` — this file has
    now drifted twice (the `jobs.rls` refs were already stale before today).
  - Confidence: HIGH — the correct numbers are tabulated above.
  - Blind spot: None significant.
- **Decision**: FIXED (2026-08-29) via **Fix A** — all 26 pointers re-derived and line numbers dropped wherever a unique exported symbol or describe-block title already identifies the target (18 lines changed: 9 EN + 9 PL). Every target was re-located by symbol/describe grep, not arithmetic. `useCloudJob.ts:232` kept its number (a `.select()` call, not a named export; verified still correct). Residual check: no `photo-job.service.ts:N`, `*.test.ts:N`, or bare `(:N)` pointer remains in the file.

### F2 — production-config.md still names the "application-side cap" as the enforcing control

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence (gap in the plan's own file list)
- **Location**: `context/foundation/production-config.md:124`
- **Detail**: _"Treat it as defence in depth. The enforcing control is the
  application-side cap (see `AGENTS.md` and change `atomic-cloud-daily-cap`, issue
  #191)."_ — `AGENTS.md:32`, the file this sentence points at, now says the cap is
  "enforced by one guarded database write" and calls the application-side count "a
  non-authoritative fast path … never the gate." The line was written 2026-08-26 by
  this change's own framing work, before the implementation landed. The plan's Phase
  3 file list never included `production-config.md`, so this is a plan gap, not an
  execution slip.
- **Fix**: Reword to "The enforcing control is the guarded database write
  `public.admit_cloud_job` (S-16, #191); the handler's count is a non-authoritative
  fast path."
- **Decision**: FIXED (2026-08-29) via **Fix differently** — the report's proposed wording was rejected as a same-class error: `production-config.md` describes live production, and the migration is **not yet applied to prod** (`change.md:25`), so asserting `admit_cloud_job` as the enforcing control there would trade one false statement for another. Also confirmed the plan already owns this sentence — `plan.md:681` gives Phase 4 the contract "update §7's closing pointer (currently 'the application-side cap') to name `admit_cloud_job`". Applied a prod-neutral rewrite that is true before and after the migration, with a forward reference to Phase 4's applied-date record. Phase 4's §7 append (criterion 4.3) completes it.

### F3 — The disproved Replicate billing-alert backstop survives in three upstream places

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence (gap in the plan's own file list)
- **Location**: `context/foundation/prd.md:184`; `context/foundation/shape-notes.md:34`, `:213`
- **Detail**: This phase deliberately stripped "plus a provider billing alert as
  backstop" from `roadmap.md:164` and `:344`, and `lessons.md:241` names it as
  disproved (`production-config.md` §7: Replicate deprecated self-service spend
  limits 2025-07-01; _"there was none when S-05 named it"_). The identical clause
  still stands in the PRD — upstream of the roadmap — and twice in `shape-notes.md`,
  upstream of the PRD:
  - `prd.md:184` — "…plus a cost-alert backstop from the cloud-model provider."
  - `shape-notes.md:213` — "…plus a billing alert from the cloud-model provider as backstop."
  - `shape-notes.md:34` — "…global daily cap enforced server-side + Replicate billing alert"
- **Fix A ⭐ Recommended**: Append the same dated ⚠️ supersession note the roadmap
  got, to `prd.md:184` and `shape-notes.md:213`/`:34`.
  - Strength: Matches the convention this phase just established — history kept
    visible, correction dated; a reader tracing FR-014 upstream hits the correction
    before the false claim.
  - Tradeoff: Three more files enter the change's diff after Phase 3 was reviewed as
    complete.
  - Confidence: HIGH — identical treatment applied to two roadmap bullets in this
    same commit.
  - Blind spot: `prd.md` and `shape-notes.md` are historical requirement artifacts;
    the project may prefer them frozen. No rule freezing them was found (only
    `context/archive/` is frozen).
- **Fix B**: Leave them; record the residual as a Phase 5 follow-up.
  - Strength: Keeps Phase 3's diff closed and its review verdict stable.
  - Tradeoff: The cost-control record stays self-contradictory across three live
    files; this cap's documentation has already drifted twice unnoticed.
  - Confidence: MEDIUM — depends on whether Phase 5 actually picks it up.
  - Blind spot: None significant.
- **Decision**: ACCEPTED (2026-08-29) — Fix A applied to all three sites: `prd.md:184`,
  `shape-notes.md:213` (prose non-goals) and `shape-notes.md:34` (the
  `gray_areas_resolved` YAML string; frontmatter re-parsed clean after the edit).

### F4 — mvp-check-report cites an RLS policy that was dropped in June

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `context/mvp-check-report.md:49` (EN) / `:111` (PL)
- **Detail**: "RLS policies `jobs_select_own` / `jobs_insert_own`" —
  `jobs_insert_own` was dropped by
  `supabase/migrations/20260621185226_restrict_jobs_insert_to_service_role.sql`,
  which also revokes INSERT on `public.jobs` from `authenticated`. Pre-existing, not
  caused by this change, but it is a false claim about the access-control model in
  the same bullet list F1 already reopens.
- **Fix**: Cite `jobs_select_own` plus the service-role-only insert model.
- **Decision**: FIXED (2026-08-29) via **Fix differently** — a name swap alone would still overstate RLS coverage. The post-June model is **asymmetric**: reads are owner-scoped by RLS (`jobs_select_own`, `user_id = auth.uid()`); writes are **not RLS-gated at all** — `authenticated` has no INSERT privilege, only `service_role` does, and it bypasses RLS. Both sections now state that, closing with the property that makes ownership enforced rather than assumed: the owner id comes from the session (`context.locals.user`), never the request body — verified at `cloud-create-job.handler.ts:56,70,131`. This is the same rule `lessons.md:58` names, and what the Risk #4 IDOR tests exercise. Line numbers dropped per the F1 Fix A call. **Calibration:** filed as OBSERVATION, but verification nudged the substance up — this was a false claim about the security model inside the bullet that argues the security criterion.

### F5 — New registration entries extend existing vocabularies

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `context/foundation/github-issues.md:131`;
  `context/foundation/roadmap.md:283-295`, `:315`
- **Detail**: `github-issues.md`'s Status column has only used
  `ready`/`done`/`proposed` across 16 rows; this adds `implementing`. Backlog Handoff
  has used `yes`/`done`/`on hold`; this adds `in progress`. The S-16 roadmap body
  omits `Blockers` (present in 14/15 entries) and `Parallel with` (12/15), and
  introduces two labels used nowhere else (`What it changes`, `Explicitly not in
scope`). The plan only required "a non-done status", so this is compliant — but the
  vocabulary is now unwritten.
- **Fix**: Align to existing values, or note the extension where the file defines its
  status semantics (`roadmap.md:318-324`).
- **Decision**: FIXED (2026-08-29) via **document the vocabulary**; "align to existing values" was **explicitly rejected as making the record less true**. `roadmap.md:319-324` defines GitHub `ready` as "the next indicated step (`/10x-research` or `/10x-plan`) can begin", and the Backlog Handoff column is headed "Ready for `/10x-plan`" — so `ready`/`yes` both mean "go plan this", which is false for a slice whose phases 1–3 have landed. Also established that the vocabulary was **already** mostly unwritten (3 values documented, 7 in use), so this change widened a pre-existing gap rather than creating one, and `implementing` is not invented — it is the established `change.md` frontmatter status this very skill keys off. Added the `implementing` bullet + a sentence documenting the Handoff column's drift into a status field, and restored `Blockers` / `Parallel with` to the S-16 body (canonical order confirmed against S-11). `What it changes` and `Explicitly not in scope` **kept** — they carry the entry's most load-bearing content, including the "conditional `INSERT … WHERE (SELECT count(*) …) < cap` is not an acceptable simplification" warning.

### F6 — gauntlet-loop eval exemplars now record the wrong diagnosis

- **Severity**: OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `.claude/skills/gauntlet-loop/references/eval-matrix.md:199`, `:225`,
  `:267`, `:337` (+ the byte-identical `.agents/` twin)
- **Detail**: Case 2.1's recorded pass answers credit models for naming "the
  non-atomic count→insert race" and "no SQL-side cap exists despite AGENTS.md saying
  so". Both are now the wrong answer. The rubric itself (`:475`, "Routed to
  `/10x-tdd` or a plain fix") is behaviour-only and stays valid, so nothing is
  broken — but anyone calibrating a future 2.1 run is misled.
- **Fix**: Annotate the affected observation rows as historical (dated), noting the
  cap became SQL-enforced on 2026-08-29. **Delicate**: both trees are
  `.prettierignore`d and manifest-hashed and must stay byte-identical — re-run
  `npm run check:skills` after any edit.
- **Decision**: FIXED (2026-08-29) via **annotate** — but as **one dated note, not four row edits**. The rows are a dated run log; rewriting them would rewrite history, the same thing this phase refused to do to `test-plan.md`'s 2026-06-10 note. The observations were **correct when made** — those samples found a genuine latent bug and the log should keep saying so. The real hazard is narrower than "misleading": **inverted scoring** — a calibrator could mark a fresh 2.1 run down for not naming a race that no longer exists, penalising the correct answer. Note placed under the §2 rubric where a calibrator looks. **The report's "delicate" framing was overstated**: `gauntlet-loop` is repo-authored and **not** in `.claude/.10x-cli-manifest.json` (0 matches), so there is no manifest hash to break and `10x get` will not overwrite it; the only real constraint is `PUBLIC_SKILLS` byte-parity. Both trees edited identically; `npm run check:skills` green (36 pairs).

### F7 — `npm run format:check` (criterion 3.1) fails in this working tree

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `supabase/.temp/start-secrets/supabase_edge_runtime_10x-astro-starter/main/index.ts`
- **Detail**: The only failure is a local artifact created by `npx supabase start`.
  It is ignored by the nested `supabase/.gitignore`, which Prettier does not read (it
  reads root `.gitignore` + `.prettierignore`). Re-running with that ignore path
  added: "All matched files use Prettier code style." CI is unaffected — the `ci` job
  never starts Supabase. Not a Phase 3 regression, but the stamped criterion does not
  reproduce on a machine that has run the local stack.
- **Fix**: Add `supabase/.temp/` to `.prettierignore`.
- **Decision**: FIXED (2026-08-29) via **Fix differently** — the fix belongs in root `.gitignore`, **not** `.prettierignore`. Prettier reads the root `.gitignore` by default; `supabase/.temp` was listed only in the nested `supabase/.gitignore`, which Prettier does not read — that asymmetry is the whole bug. The repo already solves this exact case one line away: `.stryker-tmp/` (`.gitignore:29`) is the same category (generated, gitignored, ephemeral tool scratch holding copies of repo files) and `format:check` says nothing about it. Matching that precedent makes the `AGENTS.md` "keep `.prettierignore` narrow" question **moot rather than requiring an exception to it** — that rule exists because maintained source went unformatted for months, and the tempting fix was to ignore it. `.prettierignore` stays at its documented three entries. Verified: `npm run format:check` → "All matched files use Prettier code style!"

## Success criteria verification

| ID  | Criterion                                 | Result                                                                                  |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| 3.1 | `npm run format:check`                    | ⚠️ fails only on the gitignored `supabase/.temp/` artifact (F7); clean otherwise        |
| 3.2 | `npm run lint`                            | ✅ 0 errors, 55 pre-existing `no-console` warnings in `scripts/spikes/`                 |
| 3.3 | `npm run check:skills`                    | ✅ no drift, 36 file pairs byte-compared                                                |
| 3.4 | File-specific assertions (eight passages) | ✅ all 22 assertions derived from the plan's contract pass                              |
| 3.5 | Passages read correctly in context        | ⚠️ the corrected passages do; the `mvp-check-report.md` bullets around them do not (F1) |
| 3.6 | `lessons.md` names the superseded insight | ✅ verbatim quote verified against `context/archive/2026-06-09-cap-rejection-coverage/` |
| 3.7 | No `context/archive/` file modified       | ✅ commit name-only listing contains no archive path                                    |
| 3.8 | Done-ledger / handoff / #191 untouched    | ✅ `## Done` has no entry; handoff `in progress`; `gh issue view 191` → OPEN            |

Mutation check skipped correctly — this phase touches no `test-plan.md` §4 risk
module (documentation only).

## Noted, out of scope

- The Progress stamps for 3.1–3.8 are uncommitted in the working tree.
- `.github/workflows/ci.yml:447` claims `CLOUD_DAILY_CAP=0` "stays authoritative" —
  stale since the 2026-06-08 flip to `3`. Unrelated to this change.
- `context/foundation/shape-notes.md:250` says the cap is "**SQL-enforced**" — a
  claim that was false from 2026-06-10 and is now **accidentally true**. ADDRESSED
  2026-08-29, with one correction to the finding: the bullet was NOT "deliberately
  preserved" — `git blame` puts it at `0c8c058` (`cap-doc-drift`, 2026-06-10), whose
  seed text read "SQL-side rate limiting (20 AI ops / user / 24h)". That change
  introduced "SQL-enforced" into a block its own header calls a verbatim capture (the
  untouched `Cloudflare Pages` bullet beside it is the control), and the 2026-08-26
  sweep that fixed `AGENTS.md` and `idea-notes.md` missed it. The line now carries a
  dated provenance note, and `AGENTS.md:32` records the sibling-file instance. The
  tally itself stays at **twice**: that sentence is scoped to `AGENTS.md`'s own
  paragraph ("this paragraph … It"), where two is correct.

## Triage outcome (2026-08-29)

All 7 findings resolved; **0 skipped, 0 accepted-as-risk, 0 dismissed**. The header
verdict above is left at **NEEDS ATTENTION** as the record of the review _as filed_ —
this section records what triage then did.

| ID  | Filed as    | Outcome                                                           |
| --- | ----------- | ----------------------------------------------------------------- |
| F1  | CRITICAL    | FIXED — Fix A                                                     |
| F2  | WARNING     | FIXED — **Fix differently** (proposed wording rejected)           |
| F3  | WARNING     | FIXED — Fix A, all three sites                                    |
| F4  | OBSERVATION | FIXED — **Fix differently** (name swap insufficient)              |
| F5  | OBSERVATION | FIXED — document, **not** align                                   |
| F6  | OBSERVATION | FIXED — one dated note, **not** four row edits                    |
| F7  | OBSERVATION | FIXED — **Fix differently** (`.gitignore`, not `.prettierignore`) |

**Four of seven were fixed differently than the report proposed.** In each case the
report's own fix would have introduced a second-order error:

- **F2** — would have asserted a production state that does not exist (the migration
  is not yet applied to prod). Same error class the phase is correcting.
- **F4** — a policy-name swap would have left the bullet implying INSERT is
  RLS-owner-scoped. It is privilege-gated and server-set.
- **F5** — "align to existing values" would have set `ready`/`yes`, both of which mean
  "go plan this" per the file's own semantics. Documented-but-wrong beats
  undocumented-but-right only if the record is allowed to lie.
- **F7** — `.prettierignore` would have needed an exception to a documented rule;
  root `.gitignore` matches an existing in-tree precedent (`.stryker-tmp/`) and needs
  none.

**Two report claims were corrected during triage:**

- F6's "delicate — manifest-hashed" framing: `gauntlet-loop` is repo-authored and is
  **not** in `.claude/.10x-cli-manifest.json`. No manifest hash, no `10x get`
  overwrite risk; only `PUBLIC_SKILLS` byte-parity applies.
- F4's OBSERVATION severity understated it — a false claim about the security model
  inside the bullet that argues the security criterion.

**Verification re-run after triage:** `npm run format:check` → clean (criterion 3.1
now reproduces on a machine that has run the local stack, closing F7);
`npm run check:skills` → no drift, 36 file pairs.

**Not re-run** (unchanged by triage, all edits documentation-only): `npm run lint`,
and the phase's file-specific assertions.
