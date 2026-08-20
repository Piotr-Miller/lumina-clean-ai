# Frame Brief: e2e flakes that withhold deploys

> Framing step before /10x-plan. This document captures what is _actually_ at issue, separated from
> what was initially assumed. Investigated 2026-08-20 from run logs and artifacts, not from memory.

## Reported Observation

The `e2e` CI job intermittently fails and passes on re-run. On master pushes a failure silently
withholds the production deploy (mitigated by the #157 alarm — visible now, still withheld). The
change was opened on one signature: a blank `[WebServer] ✘ [ERROR]` during Playwright webServer boot.

## Initial Framing (preserved)

- **change.md's stated causes**: port-4321 bind race, `wrangler dev` exiting before the readiness
  probe, or OOM during build — all flagged as untested guesses; later narrowed to "crash after
  start" with an inspector-port-9229 lead.
- **Invocation framing (this session)**: run 32298488149 shows the enhance Edge Function serve
  failing _before_ Playwright, plus an inspector-port collision — the change conflates signatures.
- **Proposed direction**: /10x-frame → research → plan → implement.
- **Pre-dispatch narrowing (user, 2026-08-20)**: frame around the **sign-in seed flake** (the only
  signature still alive); the three documented signatures are exhaustive — no others seen.

## Dimension Map

The run-level observation ("e2e flaked") decomposes into three distinct signatures, each a dimension:

1. **Blank `[WebServer] ✘ [ERROR]`, crash after start** — the change's title. ← initial framing
2. **`playwright install --with-deps` job-timeout** — diagnosed + fixed in change.md's own notes.
3. **`seed.spec.ts:138` sign-in POST non-ok** — NEW (2026-08-20 06:58Z, run 32341863646), previously
   undocumented. Sub-dimensions investigated: (a) spec-side evidence discard, (b) app route,
   (c) local Supabase gateway (Kong 502 class), (d) wrangler/miniflare proxy layer.

## Hypothesis Investigation

| Hypothesis                                                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Verdict                                                    |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Sig 1 = enhance-serve failure before Playwright (invocation framing) | The `::error::…never became reachable` line was the step's cyan **script echo** in the _passing_ attempt 2; attempt 1 shows every pre-test step `success`, "Serve the enhance Edge Function + readiness probe" included (run 32298488149, job 96215353966)                                                                                                                                                                                                                                                                                                                                                                                      | **NONE — disproven**                                       |
| Sig 1 = inspector-port-9229 interaction (change.md lead)             | "Default inspector port 9229 not available, using 9230" appears in **passing** runs and attempts too — constant background noise, no discriminating power                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | **NONE — ruled out**                                       |
| Sig 1 = wrangler ProxyWorker regression                              | Collected wrangler log (artifact of 32298488149, `wrangler-2026-08-19_20-30-49_407.log`): blank `✘ [ERROR]` + debug stack `ProxyController2.emitErrorEvent / onProxyWorkerMessage / PROXY_CONTROLLER`, wranglerVersion **4.118.0** (caret drift from `^4.98.0`); crash 8s after start, mid-run — 3 specs had passed, rest got `ERR_CONNECTION_REFUSED`. Fix #153 pinned `4.113.0` **25 min after** this failure; **11/12 runs green since, zero recurrences**. Upstream corroboration: `cloudflare/workers-sdk#14926` (open) names this exact stack — wrangler exits instead of recovering when miniflare (≥4.20260722.0) auto-restarts workerd | **STRONG — resolved by pin; upstream unfixed**             |
| Sig 3 = spec discards the diagnosable evidence                       | `seed.spec.ts:138` asserts `signIn.ok()` bare — status and body are dropped; artifact + console + wrangler logs of run 32341863646 contain **no readable cause**: cause is unfalsifiable exactly the way sig 1 was before #152                                                                                                                                                                                                                                                                                                                                                                                                                  | **STRONG**                                                 |
| Sig 3 = app route returns non-2xx                                    | `src/pages/api/auth/signin.ts:6-27`: every path redirects (302→200), including Supabase `{error}` — a wrong password or an in-route 502 **cannot** produce `ok()===false`; only a _throw_ outside the route (middleware, render) or below the app can                                                                                                                                                                                                                                                                                                                                                                                           | **NONE for route; middleware throw plausible, unverified** |
| Sig 3 = Kong gateway 502 (the #154 / issue #19 class)                | Precedent real (`jobs-rls-seed-flake`: PostgREST 502 returned as `{error}`), but that shape is _returned_, not thrown — it would redirect → 200 → fail at :139, not :138. Admin `createUser` succeeded seconds before, so the stack was up                                                                                                                                                                                                                                                                                                                                                                                                      | **WEAK**                                                   |
| Sig 3 = wrangler/miniflare proxy-level failure                       | Server logged **zero** `[WebServer]` output during the whole test window — consistent with a request that never reached the Worker (an Astro 500 would log a stack); wrangler debug logs show no `[ERROR]`. Suggestive, not provable from captured evidence                                                                                                                                                                                                                                                                                                                                                                                     | **WEAK — plausible, unfalsifiable today**                  |

## Narrowing Signals

- User: frame around the sign-in flake; the three signatures are exhaustive.
- Sig 3 failed its in-run retry identically (both attempts `ok()===false`) yet passed on job re-run —
  environment-state-shaped, not code-shaped. It withheld the #156 deploy (pre-alarm).
- Sig 1's resolution loop is the method precedent: #152 captured the log → the _very next_ failure
  carried the cause → #153 fixed it within 25 minutes. Evidence-first works here, measurably.

## Cross-System Convention

This repo's established discipline (change.md itself, `jobs-rls-seed-flake`, lessons.md): **no blind
retries, no timeout raises; make the next occurrence readable, match any retry narrowly to a proven
signature.** The reframed problem statement follows that convention exactly.

## Reframed Problem Statement

> **The actual problem to plan around is**: the boot flake this change was named for is resolved
> (#152 evidence + #153 pin — record and close it), and the live flake — the seed sign-in POST
> returning non-2xx — is currently **unfalsifiable because the spec and job discard the response
> status, body, and request-level server evidence** at the moment of failure.

Signature 1 needs bookkeeping, not engineering: change.md still says "cause unknown" for a cause
that was found and fixed the same evening. Signature 3 needs the same treatment signature 1 got:
capture-first (response status/body in the assertion's failure output; request-level visibility),
so the next occurrence names its layer — app throw vs gateway vs proxy. Guessing a fix now would
repeat the exact trap the change warns about. One standing policy question rides along: the wrangler
pin is a freeze, not a cure — upstream `cloudflare/workers-sdk#14926` remains **open** and 4.124.0
**still reproduces** the regression (reproduction reported 2026-08-20), so the unpin criterion is:
**a confirmed upstream fix in #14926, followed by a controlled CI probe on the fixed version**
before the pin moves. Record that so `4.113.0` doesn't fossilize _and_ doesn't get bumped blind.

## Confidence

**HIGH** — for the reframe itself: sig 1's resolution is proven end-to-end (stack trace, version,
fix timing, 11 green runs), and sig 3's unfalsifiability is directly observable in its artifact.
The _cause_ of sig 3 is deliberately left undetermined — establishing it is what the planned work
makes possible; claiming it today would be exactly the confident-guess failure mode this skill
exists to prevent.

## What Changes for /10x-plan

Plan an **evidence-first diagnosis change**, not a fix: (1) close the sig-1/sig-2 record in
change.md; (2) make sig 3's next occurrence carry status + body + a layer-identifying trace;
(3) record the wrangler unpin criterion — confirmed upstream fix in #14926 + a controlled CI probe
on the fixed version, never a blind bump. No retries, no timeout changes, no speculative fixes —
any hardening waits until the next occurrence names its layer.

## References

- `context/changes/e2e-webserver-boot-flake/change.md` — all three signatures' history
- `tests/e2e/seed.spec.ts:129-139` — the evidence-discarding assertion
- `src/pages/api/auth/signin.ts:6-27` — all-paths-redirect route
- Runs: 32298488149 (sig 1, attempt 1 job 96215353966 + wrangler-log artifact),
  32341863646 (sig 3, job 96342424593 + artifact), 32296344491 (sig 1, third occurrence)
- Commits: 0f054ef (#152 log collection), 8756aa9 (#153 pin), b1c3cbd (#154 gateway-502 precedent)
- Upstream: `cloudflare/workers-sdk#14926` — OPEN as of 2026-08-20; 4.124.0 reproduction reported
  2026-08-20; matches our captured stack verbatim (do NOT unpin until it closes + CI probe passes)
- Investigation: inline evidence pulls this session (no sub-agent tasks dispatched — every
  hypothesis had a directly checkable artifact, and two of them died on first contact with it)
