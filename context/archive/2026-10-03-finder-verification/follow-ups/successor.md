# Follow-ups for a successor change

> From `finder-verification` (decision 4.4, 2026-10-05: none admitted; `gate.md` § Results). Owner-recorded
> observations, **not this change's scope**. A successor change opens with `/rune-new`.

## F-a — Finder recall variance

`openai/gpt-6-luna`, measured as the finder, omitted the stale closure caused by the empty dependency array
(`MetricsPanel.jsx`, React fixture, planted flaw at post-change line 25) in **2 of 6 React rows**:

- 0 of 3 on 2026-10-03 (`finder-model-swap`, finder alone: React metrics 3/3);
- 2 of 3 on 2026-10-05 (`finder-verification` CONTROL, rows 1 and 3: the finder raised only the lost cleanup and
  the unsafe HTML; `gate-control-promptfoo.jsonl`).

A single 3-row draw does not measure this. G3f's "3/3 per required metric" on one draw can pass or fail on the
same finder by chance, so a gate built on it confounds the intervention under test with finder variance. A
successor needs a measured miss rate (more rows per required metric, or a pre-registered acceptance rule over
repeated draws) before it attributes a G3f result to a verifier.

## F-b — Compound findings

In CONTROL's React row 2, the finder's F1 (`MetricsPanel.jsx:16`) bundled two claims:

- the **stale closure**: "the empty dependency array captures the initial `channel` and `filter`", which is
  verifiable from the component itself;
- the **missing cleanup / continuing callbacks on unmount**, which depends on what `metricsClient.subscribe`
  returns, outside the delivered excerpts.

The verifier returned `unsupported` ("the excerpts do not show how `metricsClient.subscribe` handles cleanup or
whether it returns an unsubscribe function"), and **the whole finding was withheld**, including its verifiable
part. A verdict per finding cannot publish part of a finding. Options for a successor, none decided: split
compound findings before verification, verify per claim, or have the finder emit one claim per finding.
