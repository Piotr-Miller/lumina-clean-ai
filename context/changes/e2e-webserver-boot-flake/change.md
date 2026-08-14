---
change_id: e2e-webserver-boot-flake
title: Playwright webServer boot fails intermittently in CI with a blank error
status: new
created: 2026-08-15
updated: 2026-08-15
archived_at: null
---

## Notes

The `e2e` CI job intermittently fails before any test runs, during Playwright's `webServer` boot. The
error line is **blank**:

```
[WebServer] ✘ [ERROR]
```

Re-running the job passes. Observed at least **twice** during the `impl-review-ci-agent` and
`finder-security-vocabulary-bias` work, each time resolved by a plain re-run after confirming the
signature — which is precisely the habit that makes a flake permanent.

### Why it is worth a change rather than another re-run

The cost is not the minutes. It is that a blank-error boot failure is **indistinguishable from a real
regression** at a glance, so the standing response becomes "re-run and see", and a genuine `webServer`
break would get the same shrug. Two occurrences is enough to stop treating it as weather.

### What is known

- `webServer` is `npm run test:e2e:serve` = `npm run build && wrangler dev --port 4321` — a production
  build on workerd, deliberately not `astro dev` (whose Vite SSR dep-optimizer hits the dev-only
  "more than one copy of React" issue on the enhance page).
- So the boot chain is long: full SSR build, then a workerd runtime, then a port bind — several distinct
  failure points collapsed into one empty error string.
- The `e2e` job also boots an ephemeral local Supabase and backgrounds
  `supabase functions serve enhance`. Supabase image pulls from `public.ecr.aws` are already known to be
  rate-limited on shared runners, which is why `integration` and `e2e` cache images and retry
  `supabase start` once (see `lessons.md`).
- **Untested hypothesis**: a port-4321 bind race, or `wrangler dev` exiting before Playwright's
  readiness probe, or an OOM during the build step on a shared runner. Nothing has been instrumented, so
  all three are guesses.

### First deliverable is evidence, not a fix

The blank error is the actual problem — it makes every hypothesis unfalsifiable. Before changing any
timeout or adding any retry:

1. Capture `webServer` stdout/stderr to a file and upload it as an artifact on failure, so the next
   occurrence leaves something to read.
2. Record the failing run URLs as they happen; two are already lost to log expiry.

A retry added before the cause is known would convert a visible flake into an invisible one, which is
strictly worse — the same trap as the silent-degradation rule in `lessons.md`.

### Do NOT

- Do not switch `webServer` to `astro dev` to make boot faster. That regresses into the dev-only React
  duplication issue the current recipe exists to avoid.
- Do not add a blanket retry as the first move. See above.
