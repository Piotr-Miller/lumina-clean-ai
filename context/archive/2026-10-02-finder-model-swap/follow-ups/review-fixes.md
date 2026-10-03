# Review follow-ups — finder-model-swap

Deferred items from phase reviews and acceptance, to fold into a later phase or a later change.

## From impl-review-phase-2 triage (2026-10-03)

- [ ] **T1 — the gate runner's series summary belongs in the record, not only on stdout** (from F1, owner:
      follow-up, not now). `scripts/finder-gate.mjs` prints `SUMMARY {…}` (`notRun`, `unrecorded`,
      `seriesSpend`, `seriesRetries`, `interruptedBefore`) to stdout only, so an attempt cut by `--max-spend`
      leaves no trace in the committed JSONL — it reads the same as an attempt never run. Phase 2's six
      summaries were pasted into `gate.md` by hand. Fix: append a `{"kind":"summary",…}` line to the series
      file at the end of every run (after the last attempt, before the SUMMARY print), carrying the same
      identity fields as the other lines; `readSeries` must ignore `summary` lines when pairing `started` and
      `attempt` records (they have no `attempt` number), and `assertSeriesWritable` must still accept a file
      that ends in a summary. Tests: a summary line is written with `notRun` and `unrecorded`; a continuation
      onto a file ending in a summary works; a summary line never counts as an attempt.
