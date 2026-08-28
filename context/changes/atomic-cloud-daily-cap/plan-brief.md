# Atomic Global Cloud AI Daily Cap — Plan Brief

> Full plan: `context/changes/atomic-cloud-daily-cap/plan.md`
> Frame brief: `context/changes/atomic-cloud-daily-cap/frame.md`
> Plan review: `context/changes/atomic-cloud-daily-cap/reviews/plan-review.md` (REVISE — all 8 findings accepted, plan revised 2026-08-28)

## What & Why

LuminaClean's global Cloud AI daily cap is a non-atomic read-then-write: the
handler counts today's billable jobs, then inserts, with nothing serializing the
two. `N` simultaneous submissions at `count = cap - 1` all pass the same count and
all insert — overshoot is `N - 1`, scaling with exactly the burst the cap exists to
stop. FR-014 was decided (2026-08-26) to stand as a **hard invariant**, so this is
non-compliance, not accepted residual risk. This plan makes admission one guarded
database write, proves it under real concurrency, and ends the documentation drift
this cap has already produced twice.

## Starting Point

`createPhotoJob` is the sole writer of `jobs` rows (authenticated INSERT was revoked
in `20260621185226`); it mints a signed upload URL then inserts. The cap check lives
one call earlier in `cloud-create-job.handler.ts`. There is no trigger and no CHECK
constraint. The repo already enforces its other paid transition — `claimJobForProcessing`
— as a single guarded write, so the cap is the one paid gate not following the
established convention. Production history (8 active UTC days, effectively one user)
shows no race signature, but is far too sparse to establish safety.

## Desired End State

An over-cap submission is rejected no matter how many requests arrive at once,
because count-and-insert happen inside one lock. A real-Postgres fan-out of 8
concurrent admissions yields exactly one row. The function is live in
`luminaclean-prod`, `SECURITY DEFINER`, executable by `service_role` alone. No live
document still calls the cap a soft, app-level, non-atomic guard. The user-facing
contract is unchanged — same 429, same code, same message.

## Key Decisions Made

| Decision                  | Choice                                                              | Why (1 sentence)                                                                                                                                                         | Source |
| ------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Contract                  | FR-014 is a hard invariant                                          | Convention exists at the same class of boundary; "bounded by concurrency" is no bound at the point of exposure.                                                          | Frame  |
| Enforcement mechanism     | `SECURITY DEFINER` RPC + `pg_advisory_xact_lock`                    | A conditional `INSERT` with a count subquery does **not** close the race under READ COMMITTED; the lock is the only fix preserving the existing predicate verbatim.      | Plan   |
| Cap value location        | RPC parameter fed from `CLOUD_DAILY_CAP`                            | Env stays the single source of truth; the database owns atomicity, not policy.                                                                                           | Plan   |
| Pre-check                 | Kept, explicitly labelled non-authoritative                         | Preserves "rejected before any storage work"; the code must say which check is load-bearing.                                                                             | Plan   |
| Race-loser semantics      | Identical 429 + `console.warn` **and** `captureWarning`             | The capture hook is a no-op locally and maps to Sentry in prod, so a capture-only call would be invisible on the very machine you debug on.                              | Review |
| Bad-cap handling          | Reject on null/negative `p_cap`; `int`/`min`/`max` on the env field | `count >= NULL` is NULL and a plpgsql `IF` would fall through to the insert — a fail-open in the one function that admits paid work.                                     | Review |
| Oracle                    | Three tests, three distinct claims                                  | The service fan-out is the atomicity oracle; the route fan-out is outcome-level only, because a later request can see the winner's row and 429 before reaching the gate. | Review |
| Prod migration ordering   | Apply + verify **before** merge                                     | CI deploys the Worker but not migrations; merging first would 500 every submission — the S-11 failure mode exactly.                                                      | Plan   |
| Post-merge evidence       | Follow-up PR carrying the smoke record **and** the archive          | The smoke cannot exist in the PR that ships the code; archiving there too means the change is stamped done only once its central claim is proven live.                   | Review |
| Ledger                    | S-05 stays `done` + annotated; new **S-16** carries FR-014          | S-05's user-facing outcome genuinely shipped; reopening a `done` row would make the ledger's `done` column unreliable.                                                   | Plan   |
| Done-ledger / issue close | Owned by `/10x-archive`, not by this plan                           | `AGENTS.md`'s archive extension already assigns them there, and #191 has no Final-mapping row to update yet anyway.                                                      | Review |
| Archive supersession      | New `lessons.md` rule + explicit pointers from every live doc       | Archives are immutable; a `lessons.md` rule reaches future work automatically, an archive only reaches whoever lands on it.                                              | Plan   |

## Scope

**In scope:** the `admit_cloud_job` migration + partial index + env-schema
constraint; rewiring `createPhotoJob`, the route handler, and both `scripts/`
callers; hermetic test rewrites (insert-spy → RPC parameters); predicate, denial and
concurrency tests; the pre-merge production migration and its verification;
correction of eight passages across six live documents plus a superseding
`lessons.md` rule; the post-merge smoke and archive in a follow-up PR.

**Out of scope:** per-user caps; moving the cap value into the database; any change
to the 429 contract or the count predicate; retrying a race loser; a counter table;
a test-only barrier in the handler; editing anything under `context/archive/`;
re-investigating the Replicate backstop (`production-config.md` §7 settled it).

## Architecture / Approach

```
POST /api/enhance/cloud/create-job
  → auth → zod → stale-job sweep
  → countCloudJobsToday()          [FAST PATH, non-authoritative]
  → createPhotoJob()
       ├─ mint signed upload URL
       └─ rpc admit_cloud_job(...)  [THE GATE]
            ├─ reject if p_cap IS NULL or < 0      (fail closed)
            ├─ pg_advisory_xact_lock(<constant>)
            ├─ count today's billable rows  (predicate unchanged)
            └─ count < cap ? insert + true : false
  → null → same 429 + console.warn + Sentry warning
```

One global lock key, transaction-scoped (a session-scoped lock would leak across
PostgREST's pooled connections). The count predicate is the SQL twin of
`countCloudJobsToday`, so a pre-model failure still frees a slot — no decrement
logic, no behavioural change.

## Phases at a Glance

| Phase                                    | What it delivers                                                                  | Key risk                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1. The atomic admission primitive        | Migration + index + env constraint + predicate/denial tests; nothing calls it yet | A wrong SQL predicate silently changes who gets charged                    |
| 2. Wire the path + concurrent oracle     | RPC wiring, both `scripts/` callers, test rewrites, the three concurrency claims  | 11 typechecked call sites and a nullable return; the insert-spy assertions |
| 3. Correct the record                    | 8 passages across 6 live docs + `lessons.md` rule + roadmap S-16 + tracker row    | Missing a stale claim — a blanket grep passes while two files stay wrong   |
| 4. Production migration (pre-merge gate) | Function live in prod, verified, evidence recorded in this PR                     | Merging before applying → 500 on every cloud submission (the S-11 failure) |
| 5. Post-merge smoke + archive            | Live smoke recorded in §7; `/10x-archive` closes the ledger and #191              | Needs a follow-up PR; the change sits un-archived until the smoke runs     |

**Prerequisites:** Docker + local Supabase for the integration and E2E gates;
Supabase access to `luminaclean-prod` and the ability to flip `CLOUD_DAILY_CAP` on
the production Worker for the smoke.
**Estimated effort:** ~2-3 sessions across phases 1-4 in one PR, plus a short
follow-up PR for phase 5.

## Open Risks & Assumptions

- Single global lock key serializes all admissions. Correct and unmeasurable at
  cap 3 and current traffic; the per-UTC-day shard is available if ever needed.
- The JS pre-check and the RPC read **different clocks** (Worker vs database). At
  the UTC-midnight boundary they can disagree by milliseconds. Correct — the guarded
  write is authoritative by definition — but it will look like a bug to whoever finds
  it first, so it is commented at the site.
- The route-layer fan-out proves the **outcome**, not that all eight requests reached
  the gate: the fast-path count can reject a latecomer that never calls the RPC. The
  service fan-out is what proves atomicity. Both are kept; the plan labels which is
  which, so a future reader does not over-trust the route test.
- The service-role key can pass any `p_cap`. Not a new hole (that key can already
  insert directly), but the invariant is enforced against _callers_, not against a
  compromised server key.
- Phase 5 depends on a human running a production smoke and opening a follow-up PR.
  If that stalls, the change stays un-archived — visible, but the evidence gap is
  exactly the kind this change exists to close.

## Success Criteria (Summary)

- 8 simultaneous service-layer admissions at `cap - 1` produce exactly one accepted
  job and exactly one row.
- A cloud job still works end-to-end on production, and `CLOUD_DAILY_CAP=0` still
  rejects, after the function is live.
- Searching the repository outside `context/archive/` finds no document claiming the
  cap is app-level-only or not DB-enforced — checked per-file, not by blanket grep.
