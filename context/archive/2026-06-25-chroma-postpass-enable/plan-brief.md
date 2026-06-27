# Enable the Bread chroma-denoise post-pass in production — Plan Brief

> Full plan: `context/changes/chroma-postpass-enable/plan.md`
> Research: `context/changes/chroma-postpass-enable/research.md`

## What & Why

The S-11 chroma-denoise post-pass shipped to prod **flag-OFF** because its GO rested on a
_synthetic_ A/B. The recorded gate (observation F3 + the lesson "a synthetic-GO is a
GO-to-merge-OFF, not a GO-to-enable") requires real-Bread validation before turning it on.
This change validates on real output, adds the operational safety the dark feature lacks
(runtime toggle, telemetry, ON-path test), and only then makes a telemetry-informed prod
flip decision.

## Starting Point

The pass runs client-side after a cloud job succeeds, gated by a build-time `const`
(`chroma-denoise.ts:63`) read only in `useCloudJob`. ON re-encodes every result ≤12 MP to
JPEG q0.92 on the main thread (fail-open to raw). Today there's no runtime rollback, no
telemetry, and no test of the ON path.

## Desired End State

The post-pass is ON in production after the conditional Phase-1 GO is backed by telemetry /
real-world verification, flippable via a server secret (no code change), observable in Sentry
(run/fallback/duration), and covered by a flag-ON E2E test. A real prod job shows cleaner
shadow color; setting the secret to `false` restores raw output on the next page load.

## Key Decisions Made

| Decision     | Choice                                   | Why (1 sentence)                                                                                                                               | Source   |
| ------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| A/B source   | Local stack + real Replicate             | Real Bread output without burning prod's global `CLOUD_DAILY_CAP`.                                                                             | Research |
| Flag model   | Option B — SSR prop (server secret)      | No-code/no-CI flip via `wrangler secret put`, reusing the prop seam `index.astro` already has.                                                 | Plan     |
| Telemetry    | Sentry: fallback + success + duration    | Closes the zero-signal gap so we can see run/fallback rate after enabling.                                                                     | Plan     |
| Re-encode    | Always (as today)                        | Keep the proven Phase-4 path; skip-when-unchanged is out of scope.                                                                             | Plan     |
| ON-path test | Required before enable                   | CI must exercise the real adapter with the flag ON before users get it.                                                                        | Plan     |
| GO bar       | Conditional GO after ≥1 real noisy input | Safety must hold; sufficiency can be measurable-but-modest, but Phase 5 must lean on telemetry / real-world verification before the prod flip. | Plan     |
| NO-GO plan   | Bounded retune loop here                 | Harness sliders support it; stop without enabling if still bad.                                                                                | Plan     |

## Scope

**In scope:** real-Bread A/B + GO/NO-GO record; convert the const to a server-secret SSR
prop; Sentry telemetry around the post-pass; a flag-ON E2E test; flip the prod secret.

**Out of scope:** algorithm/defaults/12 MP-guard changes; selective re-encode; an
active-tab kill-switch (Option C); per-user/UI toggle; a DB column for the outcome;
A/B against live prod.

## Architecture / Approach

Risk-first. Phase 1 validates safety and records a conditional sufficiency read on real Bread output (gates the safety/observability buildout).
Phases 2–4 build the safe-enable infra and land with the flag still effectively OFF
(secret unset → default `false`): the gate moves from a baked `const` to a
`context:"server"` secret read at SSR in `index.astro` and threaded as a `chromaEnabled`
prop → `EnhanceWorkspace` → `useCloudJob`; Sentry instrumentation wraps the post-pass
call; an E2E spec runs the flow with the flag ON. Phase 5 flips the prod secret only after
that telemetry/verification gate is acceptable.

## Phases at a Glance

| Phase                      | What it delivers                         | Key risk                                                                                 |
| -------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1. Real-Bread A/B          | Recorded GO/NO-GO on real output (F3)    | Sourcing genuinely-noisy night inputs; NO-GO → bounded retune                            |
| 2. Runtime flag (SSR prop) | Server-secret toggle, default OFF        | Astro env boundary; threading the prop without regressions                               |
| 3. Telemetry               | Sentry run/fallback/duration signal      | Not blocking the render / object-URL lifecycle                                           |
| 4. ON-path test            | Flag-ON E2E covers the real adapter      | Wiring the ON env into the E2E webServer                                                 |
| 5. Enable in prod          | Secret flipped ON, rollback = secret OFF | Operator step; gated on telemetry / real-world verification after conditional Phase-1 GO |

**Prerequisites:** S-11 merged (done); a personal Replicate token; local stack (Docker) +
`cloudflared` for Phase 1.
**Estimated effort:** ~3–4 sessions; Phase 1 is mostly manual validation, Phases 2–4 are
small code PRs, Phase 5 is an ops flip.

## Open Risks & Assumptions

- The runtime toggle (Option B) is SSR-read → it affects **new page loads only**, not
  already-open tabs; `wrangler secret put` still ships a new Worker version.
- Re-encode stays unconditional → a generational q0.92 recompression on every result,
  accepted for now.
- NO-GO after the bounded retune means we stop without enabling (no value shipped).

## Success Criteria (Summary)

- A real-Bread before/after shows safe, measurable shadow-chroma cleanup with no luminance softening / bleeding (conditional GO).
- The flag is ON in prod, observable in Sentry, and flippable to OFF without a redeploy.
- CI exercises the flag-ON path.
