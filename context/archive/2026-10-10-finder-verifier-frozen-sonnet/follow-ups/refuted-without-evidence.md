# Candidate study: refuted without evidence

> Status: **candidate only** (owner decision 2026-10-11, plan 5.7). Not started; no stage or model swap is planned.

## Observation

In stage 2 (`gate.md` § Results, sonnet-5 @ anthropic), two true D2 variants were `refuted` with a verified quote in
every base repeat and published 3/3 in arm O:

- **D2 #4.2** (`openai-pr269-04#4.2`): all three base reasons say the excerpts do not show the exit path, and still
  answer `refuted`, quoting the cleanup `finally` in `main`. Stage 1 (luna) answered `unsupported` there in all three
  repeats.
- **D2 #3.2** (`openai-pr269-03#3.2`): the excerpt does show the exit path, and the reasons contradict themselves.

Rule (4) of the sealed true-class diagnosis labels both `evidence-delivery limit`, because O publishes them. The
label says that delivery made the difference; it does not say why the verifier refuted a true claim instead of
answering `unsupported` when its evidence was missing.

## Question for a future change

When the excerpts lack the evidence a claim needs, what makes the sealed verifier answer `refuted` rather than
`unsupported`, and does the sealed quote check let such a refutation through because the quote is real but
off-target?

## Pointers

- `context/changes/finder-verifier-frozen-sonnet/series-sonnet-report.md` — the per-finding outcome table; the full
  reasons and quotes are in the JSON `detail` of `harness.mjs report --series series-sonnet.jsonl --out <file>`,
  which reproduces from the committed series.
- `context/changes/finder-verifier-frozen-sonnet/series-sonnet.jsonl` — the raw responses.
- `context/archive/2026-10-09-finder-verifier-frozen/gate.md` § Results — stage 1's `unsupported` on D2 #4.2.
