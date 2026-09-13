---
change_id: bread-unit-cost-verification
title: Verify the Bread per-run cost against live Replicate billing
status: implemented
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

## Result (measured 2026-09-13)

**The roadmap estimate holds: Bread costs about \$0.0006 per run.**

| Statistic                | predict_time | Cost per run |
| ------------------------ | ------------ | ------------ |
| min                      | 1.071 s      | \$0.00024    |
| median                   | 2.700 s      | \$0.00061    |
| mean                     | 2.888 s      | \$0.00065    |
| max                      | 4.724 s      | \$0.00106    |
| total, 15 succeeded runs | 43.3 s       | \$0.00975    |

- **Sample.** 15 succeeded and 4 cancelled predictions of the pinned version
  `057a4e07…`, created 2026-06-18 → 2026-08-31. They come from the first page
  of `GET /v1/predictions` (up to 100 items), read by the owner with the
  production account's token on 2026-09-13. Whether older pages exist was not
  checked.
- **Method.** `metrics.predict_time` × the published T4 rate of
  \$0.000225/s (replicate.com/pricing, read 2026-09-13). This is the list
  price applied to metered time, not a billing ledger. The cross-check against
  the account's monthly usage (method step 4) was **not done**.
- **Fresh runs skipped** (method step 2). The pinned version has not changed
  since the sample, the sample already spans three months of real inputs, and
  three cap-limited runs could not move the median materially.
- **Cancelled predictions.** All four have `predict_time: null`, which is
  consistent with them costing nothing. Billing was not checked to confirm it.
- **Cold boots.** `predict_time` excludes boot by definition, so this sample
  cannot show whether boots bill. Per the pricing page they do not for public
  models. That claim stays unconfirmed.

**Consequence for the roadmap.** At the median, the 50/day cap tops out at
about \$0.91 a month. If every run were the slowest one observed, it would
be about \$1.59. The production cap of 3 a day comes to about \$0.05 a
month. The Monetization conclusion survives: the variable bill is trivial
and the real bill is fixed platform cost. `roadmap.md` now carries the
measured figure with sample size and date, and its "verify" annotation is
gone.
