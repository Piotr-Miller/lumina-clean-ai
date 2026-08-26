# Frame Brief: Global Cloud AI Daily-Cap Contract

> Framing step before `/10x-plan`. This document captures what is actually at
> issue, separated from what was initially assumed.

## Reported Observation

The active product artifacts do not define one coherent concurrency contract
for the global Cloud AI daily cap. The PRD, shape notes, roadmap, and Risk #3
describe a hard guard that rejects any request above the cap and makes runaway
spend structurally impossible. The delivered S-05 design consciously implements
a non-atomic, best-effort `count -> insert`, accepts concurrency-bounded overrun,
and names a provider billing alert as its operational backstop.

Production history inspected on 2026-08-26 contains no credible normal-path race
signature, but traffic is too sparse to establish safety. At the same time, the
repository does not record or verify the billing alert on which the soft v1 risk
acceptance was conditioned. The alert's actual state in Replicate is unknown.

## Initial Framing (preserved)

- **User's stated cause or approach**: The cap check and job insert are separate
  application operations, so concurrent requests can pass the same count.
- **User's proposed direction**: Initially, leave the race documented because a
  production cap of 3 was assumed to expose only one extra operation. After
  correction, treat this as one contract-and-operations problem and preserve the
  production evidence before planning.
- **Pre-dispatch narrowing**: The contract is the decision node. If FR-014 is
  hard, the current implementation is non-compliant and a billing alert is not a
  correctness mechanism. If FR-014 is deliberately soft, the alert is a required
  mitigation and its unverified state is a live operational gap. Production SQL,
  provenance, results, and interpretation limits belong in this brief.

## Dimension Map

The observation could originate at these dimensions:

1. **Product contract** — active requirements may promise a hard invariant while
   a later delivery decision silently narrowed it.
2. **Concurrency envelope** — the implementation may admit more jobs than the
   cap, with overshoot bounded by demand concurrency rather than a constant.
3. **Observed production frequency** — sparse history may lower incident priority
   without testing the boundary under concurrency.
4. **Operational mitigation** — the soft-contract branch depends on a provider
   billing alert that may exist, but is neither recorded nor verified in the repo.

## Hypothesis Investigation

| Hypothesis                                                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Verdict                                        |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Active FR-014 is expressed as a hard invariant             | The PRD says the cap "actually blocks," the bill is bounded, and **any** request exceeding it is rejected; shape notes and roadmap repeat that contract (`context/foundation/prd.md:41-44,56-62,138-141`; `context/foundation/shape-notes.md:39-40,85-90,153-156`; `context/foundation/roadmap.md:152-163`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | **STRONG**                                     |
| FR-014 was later formally revised to a soft limit          | No amendment was found. S-05 calls FR-014 delivered while explicitly accepting TOCTOU overrun and excluding strict atomic enforcement (`context/archive/2026-06-03-cloud-daily-cap/change.md:11-21`; `context/archive/2026-06-03-cloud-daily-cap/plan.md:3-7,30-38`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **NONE**                                       |
| The non-atomic path is an accidental implementation defect | The implementation matches the explicit S-05 scope decision. Later Risk #3 research preserved that decision and narrowed proof to the sequential boundary (`context/archive/2026-06-09-cap-rejection-coverage/research.md:49-54,109-116,140-144`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | **NONE**                                       |
| Overshoot is bounded to `+1`                               | Count and insert are separate; each contender inserts a unique job after passing the same count. For `N` contenders at `cap - 1`, possible overshoot is `N - 1`, not a fixed constant (`src/lib/services/cloud-create-job.handler.ts:101-125`; `src/lib/services/photo-job.service.ts:89-110,122-161`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | **NONE**                                       |
| A cap race is visible in production history                | The reported aggregate has eight active UTC days and no credible ordinary-race timing signature. Its traffic and user diversity are too small to exercise concurrent admission reliably.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **NONE observed; low power**                   |
| The soft v1 acceptance has a verified operational backstop | The alert is promised in PRD, shape notes, roadmap and S-05, but no production record ever described one: `production-config.md` did not mention a billing, spend or cost alert anywhere, and neither did the flip-ON runbook (`context/foundation/manual-setup-runbook.md` §3–§4), which is where such a step would live. Every surviving mention is a forward promise in a planning document (`context/foundation/shape-notes.md:34,213`; `context/foundation/roadmap.md:163`). **Resolved 2026-08-26 by checking Replicate itself:** the self-service monthly spend limit was **deprecated 2025-07-01** — eleven months _before_ S-05 named it — so the promised backstop was not configurable at the time it was promised. It survives only as a support request. The account does carry a stronger control by a different route: prepaid credit **$19.77** with **auto-reload disabled**, which stops work at zero rather than reporting after the fact. But it is incidental (auto-reload-off is the default), bounds lifetime spend rather than per-day overrun, fails silently, and is one click from gone — see `context/foundation/production-config.md` §7. | **REFUTED — the named backstop never existed** |

## Production Evidence

**Provenance:** read-only inspection of Supabase project `luminaclean-prod`
(`tebdkqpgjjypdethpezo`) on 2026-08-26, run through the Supabase MCP
`execute_sql` tool by Claude Code during the session that produced this brief.
The aggregate and timing output contained no user IDs or other personal data,
and no write, migration or schema operation was issued. **The queries below are
the exact text executed**, recovered from that session — an earlier draft of
this brief carried semantic reproductions because the original text was not
discoverable from the workspace alone.

The aggregate follows `countCloudJobsToday`: UTC day plus
`status <> 'failed' OR replicate_prediction_id IS NOT NULL`.

```sql
select
  (created_at at time zone 'UTC')::date as utc_day,
  count(*) filter (
    where status <> 'failed'
       or replicate_prediction_id is not null
  ) as cap_count,
  count(*) filter (
    where replicate_prediction_id is not null
  ) as recorded_replicate_jobs,
  count(*) as all_rows
from public.jobs
where created_at >= timestamptz '2026-06-08 00:00:00+00'
group by 1
order by 1;
```

| UTC day    | `cap_count` | Rows with prediction ID |
| ---------- | ----------: | ----------------------: |
| 2026-06-08 |           8 |                       8 |
| 2026-06-13 |           3 |                       3 |
| 2026-06-14 |           2 |                       2 |
| 2026-06-18 |           3 |                       3 |
| 2026-06-27 |           2 |                       2 |
| 2026-08-10 |           1 |                       1 |
| 2026-08-14 |           2 |                       2 |
| 2026-08-20 |           1 |                       1 |

`replicate_prediction_id IS NOT NULL` is a stored proxy for reaching Replicate,
not a perfect provider-billing ledger: prediction creation can theoretically
succeed before persistence of its ID fails.

The 2026-06-08 timing can be refreshed without selecting IDs or user data:

```sql
select
  created_at,
  status,
  (replicate_prediction_id is not null) as reached_replicate,
  extract(epoch from (created_at - lag(created_at) over (order by created_at))) as secs_since_prev
from public.jobs
where created_at >= timestamptz '2026-06-08 00:00:00+00'
  and created_at <  timestamptz '2026-06-09 00:00:00+00'
order by created_at;
```

Note the timing query deliberately has **no** billable filter: it lists every row
that day, so the gap analysis cannot be accused of hiding a neighbouring row that
would have made two submissions look adjacent.

The eight rows span approximately 19:25–20:15 UTC, with consecutive gaps of
162–759 seconds. `created_at` records insert time, not count time, and the signed
upload-URL call between count and insert has no explicit application timeout.
Therefore the gaps do not mathematically exclude every possible overlap, but
they are strong evidence against an ordinary count-to-insert collision and fit
sequential operator testing much better.

Only eight UTC days had any cap-counted traffic across nearly three months, from
practically one user. Apart from 2026-06-08, no day exceeded the documented live
cap of 3. The data lowers incident priority; it does not establish concurrency
safety. Eight sequential cap-counted jobs on 2026-06-08 are also inconsistent
with cap 3 being effective for all eight. The durable records establish the
final flip-ON state, not the exact cap/deploy state at each earlier insertion, so
configuration/deploy sequencing remains a more accurate conclusion than "cap 3
was active throughout flip-ON."

## Narrowing Signals

- The text of FR-014 was never unsettled: it is hard. What was unsettled — and
  is now decided — was whether to preserve it or formally revise it to match the
  consciously soft S-05 design. It is preserved (see **Contract Decision**);
  this section records the signals that led there, not an open question.
- Risk #3 names a race as failure but the shipped coverage proves only sequential
  rejection. The narrowing was **not silent** — it is stated outright ("the
  concurrent-insert RACE is OUT of scope") and reasoned. What makes it drift is
  the authority it defers to: it cites the S-05 plan, not FR-014, so a delivery
  decision was treated as outranking the requirement it was meant to deliver.
  The soft reading then hardened into a settled "Architecture Insight" — _"the
  cap is a soft, app-level guardrail, not a hard invariant"_ — one archive
  removed from the decision that introduced it
  (`context/archive/2026-06-09-cap-rejection-coverage/research.md:49-54,140-144`;
  `context/foundation/test-plan.md:49-54,71-78,293-301`).
- The test plan had already flagged this exact assumption. Risk #3's "Must
  challenge" column names _"cap is checked ⇒ no off-by-one / no race"_ as the
  belief to attack (`context/foundation/test-plan.md:71-78`). The instruction to
  challenge the race was issued and then declined on cited grounds, which is why
  no one has re-opened it since.
- Production evidence changes priority, not the concurrency bound. Absence of an
  observed overshoot under sparse, mostly single-user traffic is expected under
  both a safe and an unsafe implementation.
- The backstop is conditional on the contract: it mitigates consequences of a
  soft limit but cannot make a hard invariant correct.

## Cross-System Convention

This repository enforces hard mutation invariants in one guarded database write,
for example owner authorization and the queued-to-processing claim
(`context/foundation/lessons.md:58`; `src/lib/services/photo-job.service.ts:224-247`).
The lesson is not merely a precedent but a standing rule, and its closing clause
describes the cap's failure shape exactly: _"Keep ownership enforcement in the
write, not a read-then-write check."_ The cap is a read-then-write check.
It also records and verifies genuine operational backstops: the retention reaper
has its schedule, production application, health query, and observed runs in
`production-config.md`. The billing alert has none of those durable signals.

Both conventions expose the same gap. A hard contract needs enforcement that
proves the concurrent boundary; a deliberately best-effort contract needs its
residual risk, mitigation, and verification recorded. The current state does
neither coherently because it mixes the two contracts.

## Reframed Problem Statement

> **The actual problem to plan around is**: LuminaClean has no single authoritative
> concurrency contract for its global Cloud AI daily cap—the active requirements
> promise a hard invariant, the shipped design consciously implements a soft
> guard, and the mitigation that justified the soft branch is unverified in the
> durable production record.

This is one contract-and-operations problem, not an atomicity bug plus a separate
documentation task. The contract decision determines whether concurrency
overrun is non-compliance or accepted residual risk, and only then determines
what role the billing alert must play.

## Contract Decision

**Resolved 2026-08-26 (user): FR-014 stands as a hard invariant.** The soft
branch was considered and rejected; no requirement text is revised to match the
shipped S-05 design.

Grounds, in the order that decided it:

1. **The convention already exists at the same class of boundary.**
   `claimJobForProcessing` guards the other paid transition with a single
   conditional write, and its own contract comment states that concurrent or
   replayed invocations must not create a prediction
   (`src/lib/services/photo-job.service.ts:224-247`). The cap is the second paid
   gate and the only one not following that pattern, so the hard branch completes
   an established convention rather than introducing an architecture.
2. **"Bounded by concurrency" is not a bound at the point of exposure.** The cap
   defends against a spend burst, and a burst is concurrent by definition, so the
   overshoot (`N-1`) scales with precisely the scenario the control exists for.
3. **The soft branch's mitigation has no durable record.** This repository does
   keep such records for backstops it relies on — the retention reaper has its
   schedule, production application, health query, and observed runs in
   `production-config.md`. The billing alert has none of them, so the soft
   contract's justification is unevidenced rather than merely undocumented.

A supporting, non-deciding consideration: FR-014 was never formally amended, and
rewriting a must-have to match what shipped is the same failure this cap has
already produced twice (`context/archive/2026-06-10-cap-doc-drift/`).

**The billing alert is no longer a gate on planning.** It is now defence in depth
rather than the load-bearing mitigation, and verifying it can only strengthen the
hard branch, never overturn it. It remains an operational task to confirm in the
Replicate console and record in `production-config.md` with the same durable
signals the reaper carries.

**Two costs accepted with this choice**, carried forward so planning does not
discover them late:

- **The production migration is applied by hand.** CI deploys the Worker and the
  Edge Function but not migrations. This is a known repeat failure in this
  project (S-11's jobs migrations were never `db push`ed, producing a blocking
  production bug), so the migration and its verification must be an explicit
  phase, not a footnote.
- **The counting semantics are load-bearing.** `countCloudJobsToday` excludes
  rows that are `failed` with a null `replicate_prediction_id` — a job that never
  reached Replicate cost nothing and must not consume a slot. A guarded
  conditional write against `jobs` preserves that predicate directly; a separate
  counter table does not reproduce it without decrement logic and is therefore a
  behavioural change, not a drop-in.

### Live claims the decision invalidates

Choosing the hard contract makes four statements in currently-active documents
false. They are listed here because each is a claim a reader would otherwise
trust, and because this cap's specific history is repeated documentation drift —
`context/archive/2026-06-10-cap-doc-drift/` exists because the same line was
wrong twice. Correcting them is in scope for the change; deciding **how** is the
plan's job, not this brief's.

| Artifact                                                                | What it currently asserts                                                                                                                                   | Why the decision breaks it                                                                                                        |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `context/foundation/roadmap.md:38`                                      | Slice **S-05** is `done` with **FR-014** as its PRD ref                                                                                                     | The roadmap therefore asserts FR-014 is delivered. Under a hard reading it is not, so a `done` row now carries a false claim.     |
| `AGENTS.md:32`                                                          | Describes the non-atomic `count → insert` and the race as settled fact, and warns that believing otherwise "is what stops anyone from looking for the race" | Accurate **today**, and inverted the moment the guard lands. Highest-risk line in the repo to leave stale, given its own history. |
| `context/archive/2026-06-09-cap-rejection-coverage/research.md:140-144` | Records as an **Architecture Insight** that "the cap is a soft, app-level guardrail, not a hard invariant"                                                  | Archives are immutable, so this one is **not** editable — it must be superseded by the new record, never rewritten.               |
| `idea-notes.md`                                                         | Describes the cap as enforced in the create-job handler, "**not** in a SQL trigger or constraint"                                                           | Same inversion as `AGENTS.md`, in the product-scope document.                                                                     |

The archive row is the reason this matters beyond bookkeeping: the soft reading
is written into an immutable document, so the only way it stops propagating is a
newer record that outranks it explicitly. Leaving the other three stale would
reproduce the drift this change exists to end.

## Confidence

- **HIGH** — the hard wording, deliberate soft design, non-atomic execution path,
  narrowed test oracle, and missing durable alert verification are directly
  evidenced. Production frequency is low-power evidence and is used only for
  priority, not correctness. The actual Replicate alert state remains unknown.

## What Changes for `/10x-plan`

The contract is settled (see **Contract Decision**), so planning has one goal
rather than a fork: bring the admission path, its concurrent proof, and the
operational record into compliance with a hard FR-014.

That goal decomposes into work planning must cover, not a menu to choose from:

- **Admission becomes one guarded write** at the paid boundary, following the
  `claimJobForProcessing` precedent and preserving the existing cap predicate.
- **The oracle must exercise the concurrent boundary.** Risk #3 names a race, but
  the shipped coverage proves only sequential rejection
  (`context/foundation/test-plan.md:49-54,293-301`); sequential proof cannot
  close a hard invariant.
- **The production migration is an explicit, verified phase**, for the reason
  recorded above.
- **The billing alert is confirmed and recorded** in `production-config.md` as
  defence in depth — never as the mechanism that makes the cap correct.

## References

- Product contract: `context/foundation/prd.md:41-44,56-62,138-141`
- Historical decision: `context/archive/2026-06-03-cloud-daily-cap/change.md:11-21`
- Risk/oracle drift: `context/foundation/test-plan.md:49-54,71-78,293-301`
- Admission path: `src/lib/services/cloud-create-job.handler.ts:101-125`
- Count and insert: `src/lib/services/photo-job.service.ts:89-110,122-161`
- Production state: `context/foundation/production-config.md:48-59,97-115`
- Repo convention (guarded write): `context/foundation/lessons.md:58`
- Oracle narrowing: `context/archive/2026-06-09-cap-rejection-coverage/research.md:49-54,109-116,140-144`

**Citation provenance.** Every file:line reference above was re-read in the
working tree on 2026-08-26 and confirmed to contain the claim it is cited for;
the billing-alert absence was verified by search rather than by range-read,
because a negative claim cannot be established from an excerpt. An earlier draft
of this brief cited three paths (`/root/contract_history`, `/root/backstop_docs`,
`/root/prod_evidence`) that were investigation-sandbox locations with no
existence in this repository; they are removed rather than rewritten, since no
in-repo artifact corresponds to them.
