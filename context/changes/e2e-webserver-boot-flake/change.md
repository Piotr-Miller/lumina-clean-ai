---
change_id: e2e-webserver-boot-flake
title: Playwright webServer boot fails intermittently in CI with a blank error
status: new
created: 2026-08-15
updated: 2026-08-19
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

---

## A SECOND, DISTINCT e2e failure signature — observed 2026-08-19 (PR #151)

Recorded here rather than in a new change because the surface is the same job, but **this is not the
blank-error `webServer` boot flake above** and must not be conflated with it.

**Signature:** the job hits GitHub's 20-minute execution limit during
`npx playwright install chromium --with-deps`.

```
X Run npx playwright install chromium --with-deps
- Run npm run test:e2e            (never reached)
X The job has exceeded the maximum execution time of 20m0s
```

Run: [`32293188132`](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/32293188132), job
`96198469588`, 20m15s. The PR was a **one-line `AGENTS.md` edit**, so the change could not possibly
affect the browser gate.

**What makes it different from the entry above:**

|             | Boot flake                      | This                                    |
| ----------- | ------------------------------- | --------------------------------------- |
| Where       | `webServer` boot, after install | `playwright install`, before the server |
| Error text  | blank — `[WebServer] ✘ [ERROR]` | explicit job-timeout annotation         |
| Diagnosable | no                              | **yes**                                 |

**Notable:** `Cache Playwright browser` reported ✓ immediately before, so a cache hit did **not** prevent
the overrun. The likely cost is `--with-deps` (apt package installation), which the browser cache does
not cover. That is a hypothesis, not a measurement — nothing has been instrumented.

**Why the re-run here was legitimate**, given this change's own "re-run and see is how a flake becomes
permanent" rule: the failure carries an explicit, readable signature and a step name. The rule exists
because a _blank_ error makes every hypothesis unfalsifiable; this one names its step. The run URL is
recorded above so the evidence survives log expiry — which is exactly what the entry above says was lost
twice.

**Candidate fix, for whenever this change is planned:** cache the apt layer too, or drop `--with-deps` in
favour of a pinned dependency install, or raise the job timeout. Do not raise the timeout alone — that
hides the trend rather than fixing it, the same trap as adding a blanket retry.
