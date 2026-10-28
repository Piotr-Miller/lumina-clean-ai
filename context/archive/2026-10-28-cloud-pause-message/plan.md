# Cloud AI Pause Message Implementation Plan

## Overview

While Cloud AI is paused with the kill-switch `CLOUD_DAILY_CAP=0`, a signed-in user who submits to
Cloud is told the daily limit is reached and to come back tomorrow. That is false: the pause lasts
until S-19 meets its bar. This change gives the kill-switch its own error code and message, so a
paused Cloud says it is unavailable and points to Local. The ordinary daily-limit message stays
correct once Cloud is back.

## Current State Analysis

- `src/lib/services/cloud-create-job.handler.ts:47-52` defines one `DAILY_CAP_REACHED_BODY`
  (`daily_cap_reached`, "…Please try again tomorrow."). It is returned with 429 from the
  non-authoritative fast path (`:126-128`) and from a declined guarded write (`:144-146`).
- With `cap = 0`, `isOverDailyCap(count, 0)` is always true, so the fast path rejects every
  submission after the stale-job sweep and the count query. The guarded write is never reached.
- The client maps the error **code**, not the HTTP status, to UI copy:
  `src/lib/services/cloud-upload.client.ts:48-57` looks the code up in
  `STRINGS.uploadErrors.route` (`src/lib/enhance-strings.ts:249-254`). An unknown code falls back
  to `genericRoute` ("Couldn't start Cloud processing…").
- `CLOUD_DAILY_CAP` is an integer with `min: 0` (`astro.config.mjs:132-139`), so a negative or
  fractional cap cannot reach the handler.
- Tests pin today's kill-switch behaviour: `tests/cloud-create-job.handler.test.ts:142-153`
  ("rejects the first request when the cap is 0") expects 429 + `daily_cap_reached`; and
  `tests/cloud-upload.client.test.ts:111-119` maps `daily_cap_reached` to the UI copy.
- Production has run with `CLOUD_DAILY_CAP=0` since 2026-10-28T20:33:24Z. The owner confirmed the
  current copy end-to-end on 2026-10-28.

### Carried from predecessor

none — no Predecessor line

## Definitions

| Term                            | Decided meaning                                                                                                 | Origin                           | On degenerate data                                                                                                                                                                                                                             | Verified by   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Pause                           | `CLOUD_DAILY_CAP` resolves to exactly `0`. Any `cap > 0` is a normal day, including a day whose cap is used up. | user (owner decision 2026-10-28) | `cap = 0` with zero jobs today → pause. `cap = 1` with one job today → `daily_cap_reached`, not a pause. A guarded-write decline only happens with `cap > 0` → stays `daily_cap_reached`. A count-query failure while paused is never reached. | 1.1, 1.2      |
| Pause message (UI and API body) | "Cloud AI is temporarily unavailable due to maintenance. Please use the Local engine in the meantime."          | user (owner wording 2026-10-28)  | —                                                                                                                                                                                                                                              | 1.1, 1.2, 1.7 |

## Desired End State

With `CLOUD_DAILY_CAP=0`, `POST /api/enhance/cloud/create-job` from a signed-in user returns
**503** with
`{"error":{"code":"cloud_paused","message":"Cloud AI is temporarily unavailable due to maintenance. Please use the Local engine in the meantime."}}`,
before any sweep, count, admission or signed URL. The UI shows the same sentence. With
`cap > 0`, every response is unchanged: an over-cap or race-declined submission still gets 429
`daily_cap_reached` and the "…come back tomorrow" copy.

### Key Discoveries:

- Copy is selected by code (`cloud-upload.client.ts:52`), so a new code plus one map entry is the
  whole client change. The client needs no knowledge of 503.
- Anonymous users still get 401 first: auth, JSON parse and zod validation run before the cap
  checks, and the pause check sits after them.
- `production-config.md:178` records the S-16 smoke (2026-08-31) of the old cap-0 contract. It is a
  dated record and stays true as history. Live docs that describe what cap 0 returns need a
  pointer update (`AGENTS.md:20`, `manual-setup-runbook.md:141`).

## What We're NOT Doing

- No new env flag: the existing kill-switch drives the message (owner decision).
- No pre-emptive UI change: the Cloud toggle stays enabled, and the message appears after a submit.
  Disabling the toggle while paused needs a status endpoint and is out of scope.
- No change to the Edge Function, the database function `admit_cloud_job` or the cap semantics for
  `cap > 0`.
- No change to `CLOUD_PIPELINE_ENABLED=false` behaviour.
- No edit inside `context/archive/`.

## Implementation Approach

Branch on `cap === 0` in the handler right after zod validation and before the stale-job sweep:
return 503 with a new `CLOUD_PAUSED_BODY`. A pause should cost no database work, and the sweep's
purpose (freeing cap slots) is moot when the cap is 0. Add `cloud_paused` to the client's route
copy map. Update the two tests that pin the old cap-0 contract, and add one each for the new code.
Then point the live docs at the new contract.

## Phase 1: Distinct pause code and copy

### Overview

The handler, the UI copy, their tests, and the live docs that describe cap 0.

### Changes Required:

#### 1. Handler

**File**: `src/lib/services/cloud-create-job.handler.ts`

**Intent**: Return a dedicated pause response when the resolved cap is 0, so the kill-switch no
longer claims a daily limit was reached.

**Contract**: New constant `CLOUD_PAUSED_BODY = { error: { code: "cloud_paused", message: "Cloud AI is temporarily unavailable due to maintenance. Please use the Local engine in the meantime." } }`,
returned with HTTP 503 when `cap === 0`. The check runs after auth (401), JSON parse (400) and zod
(400), and before the sweep, `countCloudJobsToday`, `createPhotoJob` and signed-URL minting.
`DAILY_CAP_REACHED_BODY` and both 429 paths stay byte-identical for `cap > 0`. Update the
`CreateCloudJobInput.cap` doc comment and the fast-path comment that says `cap = 0` rejects
there.

#### 2. UI copy

**File**: `src/lib/enhance-strings.ts`

**Intent**: Map the new code to the owner's sentence.

**Contract**: `STRINGS.uploadErrors.route.cloud_paused` = the pause message above.
`daily_cap_reached` is unchanged.

#### 3. Tests

**Files**:

- `tests/cloud-create-job.handler.test.ts`: the cap-0 test now expects 503 with the exact
  `cloud_paused` body and no `status` key. It also asserts that the sweep/count builder, the
  admission RPC and the signed-URL mint are not called. Keep the `cap = 3` over-cap and
  `cap - 1` admit tests unchanged, so `cap > 0` provably still yields 429 `daily_cap_reached`.
  Add `cap = 1` with one job counted, which must give 429 `daily_cap_reached` and not
  `cloud_paused` (the boundary next to the pause).
- `tests/cloud-upload.client.test.ts`: add "maps a 503 cloud_paused from the route to the pause
  message and never PUTs". Keep the existing `daily_cap_reached` mapping test.

**Intent**: Pin the new contract, and pin that the old one still holds for `cap > 0`.

**Contract**: Test names describe the behaviour; the fixtures are the existing stub admin and
`jsonResponse` helpers.

#### 4. Live docs that describe what cap 0 returns

**Files**:

- `AGENTS.md`: in the Cloud AI cost protection paragraph, `0` = kill-switch → add that it returns
  503 `cloud_paused` before any database work.
- `context/foundation/manual-setup-runbook.md`: kill-switch step 5, "(pre-insert reject)" → the
  same contract.
- `context/foundation/production-config.md`: one sentence under the §7 smoke table saying the 429
  row records the contract as of 2026-08-31, and that cap 0 returns 503 `cloud_paused` since this
  change.

**Intent**: The behaviour of cap 0 is restated in these places. Grep the old wording
(`pre-insert reject`, `kill-switch`, `daily_cap_reached`) and fix every live pointer in the same
commit.

**Contract**: Prose only. `context/archive/` is untouched.

### Success Criteria:

#### Automated Verification:

- Handler and client tests pass: `npx vitest run tests/cloud-create-job.handler.test.ts tests/cloud-upload.client.test.ts` — at planning: exit 0 — expected to fail once the tests are updated, until the handler and copy change
- Full unit suite passes: `npm run test:unit` — at planning: exit 0
- Type checking passes: `npm run typecheck` — at planning: exit 0
- Lint passes: `npm run lint` — at planning: exit 0
- Formatting passes: `npm run format:check` — at planning: exit 1 — only the untracked `temp_steps.md` (owner's file, never committed); every tracked file passes
- No live doc still says cap 0 returns `daily_cap_reached`: `grep -rn "pre-insert" AGENTS.md context/foundation/manual-setup-runbook.md` — at planning: exit 0 (1 hit) — expected exit 1 after Phase 1

#### Manual Verification:

- The owner reads the pause message in the UI after the deploy, signed in on luminacleanai.com with `CLOUD_DAILY_CAP=0` — surface: src/lib/enhance-strings.ts, src/lib/services/cloud-create-job.handler.ts

**Implementation Note**: Manual checks are acceptance. `/rune-implement` commits the phase once
automated verification passes, then asks about the manual check after merge and deploy.

---

## Testing Strategy

### Unit Tests:

- Handler: cap 0 → 503 `cloud_paused`, exact body, no DB or storage calls. `cap = 1` with
  count 1 → 429 `daily_cap_reached`. Existing cap 3 tests unchanged.
- Client: `cloud_paused` → pause message, no PUT. `daily_cap_reached` mapping unchanged.

### Integration Tests:

- `tests/jobs.rls.test.ts:958` covers the race at `cap > 0` against live Supabase and stays
  unchanged. No integration test exercises cap 0.

### Manual Testing Steps:

1. After the merge and deploy, sign in on luminacleanai.com and submit a photo to Cloud.
2. See "Cloud AI is temporarily unavailable due to maintenance. Please use the Local engine in the
   meantime."
3. Switch to Local and confirm it still processes.

## References

- `context/changes/cloud-pause-message/change.md`
- Pause decision and return bar: `context/changes/cloud-model-comparison/change.md` § Production pause
- Lessons applied: _Writing a fact into its canonical home leaves every pointer to it stale_
  (phase item 4); _An admission gate … must be ONE guarded write_ (the guarded write is untouched,
  and the fast path stays labelled non-authoritative).

## Progress

> Convention: `- [ ]` pending, `- [x]` done, `- [-]` not applicable (` — n/a: <reason>` required). Append ` — <commit sha>` when a step lands. A Manual row takes ` — accepted at <full sha>` when a human confirms it. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Distinct pause code and copy

#### Automated

- [x] 1.1 Handler and client tests pass — d9d8058
- [x] 1.2 Full unit suite passes — d9d8058
- [x] 1.3 Type checking passes — d9d8058
- [x] 1.4 Lint passes — d9d8058
- [x] 1.5 Formatting passes — d9d8058
- [x] 1.6 No live doc still says cap 0 returns `daily_cap_reached` — d9d8058

#### Manual

- [x] 1.7 The owner reads the pause message in the UI after the deploy — accepted at 0464e552a59249f752a218ba0f1e903732e367a1
