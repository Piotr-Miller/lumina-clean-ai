---
change_id: bread-unit-cost-verification
title: Verify the Bread per-run cost against live Replicate billing
status: new
created: 2026-09-13
updated: 2026-09-13
archived_at: null
issue: 192
---

## Notes

Opened from issue #192. `roadmap.md` (Backlog Handoff, Monetization entry)
carries **Bread ≈ $0.0006/run** with its own "verify" annotation, and the
Monetization conclusion rests on it. Done when that figure is replaced by a
measured value with its sample size and date, or confirmed and the
annotation removed.

### What was established on 2026-09-13, before any measurement

- **The estimate is Replicate's own demo figure, not ours.** The pinned
  version (`BREAD_VERSION = 057a4e07…` in `src/lib/services/bread.ts`) is
  the model at replicate.com/mingcv/bread. Its page states _"costs
  approximately $0.00060 to run … Nvidia T4 GPU … Predictions typically
  complete within 3 seconds"_, and adds that this varies with inputs.
  Replicate's pricing page lists **T4 at $0.000225/sec**, so $0.0006 is about
  2.7 s of predict time **on Replicate's demo inputs**. Our inputs are
  full-size phone photos, which may run longer.
- **The balance-delta method in #192 cannot resolve the answer at our cap.**
  The billing page shows the balance to the cent. `production-config.md`
  §7 already records 4 August jobs rounding to $0.00. At about $0.0006 a
  run, one cent needs roughly 17 runs, and the production cap is 3 a day.
  Reading a delta that means anything would take about a week of maxed-out
  cap, and it would still be a coarse figure.
- **Public models bill for predict time only.** The pricing page says so:
  _"you only pay for the time it takes to process your request"_. If that
  holds, cold boots are not billed for Bread, which would correct the
  issue's "cold-boot runs are not priced like warm ones". Confirm it in the
  measurement rather than taking it as given.

### Proposed method (forward, per prediction)

Each Replicate prediction carries its own metered `metrics.predict_time`.
Cost per run = `predict_time` × the T4 rate. This is not the back-derivation
#192 warns against: it does not divide a balance drop by a job count, and it
does not need the unknown original top-up.

1. Take the Bread predictions of real production jobs. Their ids are in
   `jobs.replicate_prediction_id`. Read `predict_time` for each, either in
   the Replicate dashboard at replicate.com/predictions or through
   `GET /v1/predictions/{id}` with the production token.
2. Add a few fresh production runs on a typical night photo, inside the
   daily cap, so the sample includes current inputs.
3. Report the range and the median with the sample size and date, and note
   any cancelled predictions, which still bill for the time they ran.
4. Cross-check once against the account's billing usage for the month in
   which the sample ran, if Replicate shows per-model spend there.

**Needs the owner:** access to the Replicate account (dashboard or token)
and to production. Neither is available to an agent in this repo, which has
no Replicate token locally.
