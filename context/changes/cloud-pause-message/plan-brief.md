# Cloud AI Pause Message — Plan Brief

> Full plan: `context/changes/cloud-pause-message/plan.md`

## What & Why

Cloud AI has been paused in production with the kill-switch `CLOUD_DAILY_CAP=0` since 2026-10-28.
A signed-in user who submits to Cloud is told the daily limit has been reached and to come back
tomorrow. That is false while the pause lasts until S-19 meets its bar.

## Starting Point

The kill-switch reuses the daily-cap contract: 429 `daily_cap_reached`, and the client maps that
code to "…Try the Local engine, or come back tomorrow." The client chooses copy by error code, not
by HTTP status.

## Desired End State

With cap 0, Cloud submissions get 503 `cloud_paused`, and the UI says "Cloud AI is temporarily
unavailable due to maintenance. Please use the Local engine in the meantime." With cap > 0 nothing
changes: an exhausted day still says to come back tomorrow.

## Key Decisions Made

| Decision                  | Choice                                                                                                 | Why                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Pause vs daily limit      | Distinct code `cloud_paused` when cap is exactly 0                                                     | No new config; correct copy returns by itself when Cloud resumes (owner)      |
| Copy                      | "Cloud AI is temporarily unavailable due to maintenance. Please use the Local engine in the meantime." | Owner's wording                                                               |
| HTTP status               | 503                                                                                                    | The service is unavailable; 429 means too many requests (assumed)             |
| Where the check runs      | After auth and validation, before the sweep and the count                                              | A pause costs no database work; anonymous users still get 401 first (assumed) |
| Cloud toggle while paused | Stays enabled; message after submit                                                                    | Disabling it needs a status endpoint, out of scope (assumed)                  |

## Scope

**In scope:** handler branch and body, UI copy entry, handler and client tests, live docs that say
what cap 0 returns (`AGENTS.md`, `manual-setup-runbook.md`, a note in `production-config.md`).

**Out of scope:** a new env flag, any change to the UI toggle, the Edge Function, `admit_cloud_job`,
cap > 0 behaviour, and `context/archive/`.

## Phases at a Glance

| Phase                           | What it delivers                                      | Key risk                                                                         |
| ------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1. Distinct pause code and copy | 503 `cloud_paused` + UI sentence, tests, doc pointers | Cap 0 permanently means "maintenance"; a future non-pause use of 0 would mislead |

**Prerequisites:** none. **Estimated effort:** one short session.

## Open Risks & Assumptions

- Cap 0 now always reads as a maintenance pause. That matches the only use of cap 0 so far.
- Acceptance needs a deploy while cap is 0; production already is.

## Success Criteria (Summary)

- A signed-in user on luminacleanai.com sees the maintenance sentence, not "come back tomorrow".
- Over-cap and race-declined submissions with cap > 0 still get 429 `daily_cap_reached` (tests).
