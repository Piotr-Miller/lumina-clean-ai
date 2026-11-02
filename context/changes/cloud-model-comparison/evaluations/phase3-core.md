# Phase 3: first paid series on the core tuning photos

**Core gate (`phase3-report.json`, `tally.py --gate core`, exit 0):**

| Config      | Role  | Slots                     | Verdict    | Reason                                                 |
| ----------- | ----- | ------------------------- | ---------- | ------------------------------------------------------ |
| `gpt-std`   | core  | 8 ok, 1 technical failure | **STOP**   | incomplete core: S17-07/1 technical failure            |
| `gpt-large` | probe | 2 ok                      | DIAGNOSTIC | probe-only config: no core slots in this series        |
| `nafnet`    | core  | 3 ok                      | **STOP**   | NAFNet preferred over its control on 0 of 3, needs ≥ 2 |

Both STOPs reject a **configuration**, not a model (plan Phase 3). The ratings themselves favour
GPT strongly: every one of its 10 rated outputs is a clear win over real Local.

- **Inputs:** the prepared common sRGB inputs (`inputs.py`), the NAFNet downscale for NAFNet and its
  control. Reference: real Local from the app on the same common input (`local/<id>.jpg`, Auto
  recomputed in the owner's Chrome, session `f2814060…`).
- **Ratings:** verdicts pasted into the Claude session on 2026-11-02 by the owner. The rater worked
  on 16 blind pairs in `test-photos/private/s19/phase3-blind/` (received as a ZIP: `oryginal`/`A`/`B`
  per pair, PNG sRGB without metadata, each pair at the smaller arm's size). Pair order was shuffled
  and A/B drawn per pair with `secrets`; the sealed key's sha256 is in `phase3-core.json`
  (`rating_method`). The rater states they did not open the key or compare files across pairs.
- **Blinding limits:** pairs of one photo share the same reference file at the same size, so a
  rater comparing files across pairs could identify the reference. Crop notes ("Kadr") were
  referenced in the pasted text but not included.
- **Flags:** "possible content change" on the S17-03 aurora bands is recorded as `rater_flag` and
  `unverified_reconstruction`, **not** as a confirmed `content_change`. Confirming it is the owner's
  decision (see below); it would make `gpt-std` STOP for a second, independent reason.

## Attempts (`test-photos/private/s19/attempts.jsonl`)

| Config      | Slot         | Request size                          | Status                                                                                                                            | Vendor-reported cost                |
| ----------- | ------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `gpt-std`   | S17-03/1–3   | 2336 × 1552                           | ok × 3                                                                                                                            | $0.077828 each                      |
| `gpt-std`   | S17-04/1–3   | 2192 × 1648                           | ok × 3                                                                                                                            | $0.085076 each                      |
| `gpt-std`   | S17-07/1     | 2320 × 1552                           | **technical failure**: HTTP 400 `moderation_blocked` (request `req_c3f091d0d01447848dde3b6ac38e7e9d`); not transient, so no retry | unknown, $0.20 reserved             |
| `gpt-std`   | S17-07/2–3   | 2320 × 1552                           | ok × 2                                                                                                                            | $0.077272 each                      |
| `gpt-large` | S17-04/1     | 3312 × 2480                           | ok                                                                                                                                | $0.144716                           |
| `gpt-large` | S17-07/1     | 3520 × 2352                           | ok                                                                                                                                | $0.131182                           |
| `nafnet`    | S17-03/04/07 | 3840 × 2560, 3968 × 2976, 3968 × 2640 | ok × 3                                                                                                                            | not reported by fal; $0.78 reserved |

Known spend $0.9192 (GPT). The ledger commits **$1.90 of the $4 cap**: the known costs plus the
full reservations of the blocked call and the three NAFNet calls, whose costs are unknown. No
retry, no budget refusal, no unreconciled attempt. The moderation block is random for this input:
slots 2 and 3 of the same prepared S17-07 file went through.

## S17-03 (aurora, ProPhoto RGB source)

| Pair | Candidate   | Reference | Preference       | Category  | Flag (rater)                                                        |
| ---- | ----------- | --------- | ---------------- | --------- | ------------------------------------------------------------------- |
| 12   | `gpt-std` 1 | Local     | candidate-clear  | clear win | possible content change: reconstruction of the aurora band shapes   |
| 14   | `gpt-std` 2 | Local     | candidate-clear  | clear win | possible content change: modified course of the aurora bands        |
| 07   | `gpt-std` 3 | Local     | candidate-clear  | clear win | possible content change: new or strongly reconstructed aurora bands |
| 05   | NAFNet + γ  | Local     | reference-slight | tie       | —                                                                   |
| 02   | NAFNet + γ  | control   | tie              | tie       | —                                                                   |

**Spread across the 3 GPT repeats:** none in category, all clear wins. All three carry the same
fidelity concern, so it is systematic, not a single draw.

## S17-04 (White House, Display P3 source)

| Pair | Candidate     | Reference | Preference       | Category  | Flag (rater)                                                  |
| ---- | ------------- | --------- | ---------------- | --------- | ------------------------------------------------------------- |
| 06   | `gpt-std` 1   | Local     | candidate-clear  | clear win | fidelity note: sky strongly changed, black → navy with clouds |
| 10   | `gpt-std` 2   | Local     | candidate-clear  | clear win | fidelity note: strong change of the night sky                 |
| 03   | `gpt-std` 3   | Local     | candidate-clear  | clear win | fidelity note: strong reinterpretation of the night sky       |
| 09   | `gpt-large` 1 | Local     | candidate-clear  | clear win | fidelity note: strong reinterpretation of colour and clouds   |
| 15   | NAFNet + γ    | Local     | reference-slight | tie       | — (green cast on the night sky)                               |
| 08   | NAFNet + γ    | control   | reference-slight | tie       | — (green cast, no meaningful detail gain)                     |

**Spread across the 3 GPT repeats:** none, all clear wins. The rater does not count the clouds as
invented: faint sky structure is visible in a strongly brightened original. Their exact
reconstruction remains uncertain.

## S17-07 (night portrait, Adobe RGB source)

| Pair | Candidate     | Reference | Preference       | Category  | Flag (rater)                                        |
| ---- | ------------- | --------- | ---------------- | --------- | --------------------------------------------------- |
| —    | `gpt-std` 1   | —         | not rated        | —         | technical failure (moderation block)                |
| 04   | `gpt-std` 2   | Local     | candidate-clear  | clear win | unverified lettering: side neon                     |
| 13   | `gpt-std` 3   | Local     | candidate-clear  | clear win | unverified lettering: side neon                     |
| 01   | `gpt-large` 1 | Local     | candidate-clear  | clear win | unverified lettering: side neon                     |
| 16   | NAFNet + γ    | Local     | reference-slight | tie       | — (heavier smoothing, smeared detail)               |
| 11   | NAFNet + γ    | control   | reference-slight | tie       | — (purple discolouration, local blur in dark areas) |

**Spread across the GPT repeats:** none among the two rated, both clear wins on faces, clothes,
brick and the facade, independent of the neon.

## Tally per arm

| Arm         | vs Local                               | vs control                |
| ----------- | -------------------------------------- | ------------------------- |
| `gpt-std`   | 8 clear wins (1 slot unrated: blocked) | —                         |
| `gpt-large` | 2 clear wins                           | —                         |
| NAFNet + γ  | 3 reference-slight (ties)              | 1 tie, 2 reference-slight |

No severe regression was flagged. No content change was confirmed.

## Native resolution

GPT returns the requested size, below the common input: standard 2192–2336 px wide (3.4–3.6 MP)
against 3840–5145 px inputs; the large probe 3312–3520 px (8.2 MP). NAFNet keeps its downscaled
input size (≤ 3968 px). Each blind pair was shown at the smaller arm's size, so the GPT wins were
judged at GPT's resolution, with Local scaled down to it. Whether that resolution loss matters at
full size was not rated.

## Owner decisions still open

- **3.5:** confirm these verdicts as yours, or name who made them (the pasted text says the rater
  received a ZIP).
- **3.6, core gate:** the report gives `gpt-std` STOP (moderation block) and `nafnet` STOP (0 of 3
  over its control). Also decide whether the S17-03 aurora flags are **confirmed** content changes.
- **3.7, output size:** the rater chose **standard**, before unblinding. But under the plan only a
  _surviving_ standard config can be carried forward (Phase 5). After this STOP, the GPT routes
  left are completing the large config's own 3 × 3 core, or a new config, each needing a numeric
  Phase 5 budget amendment. Or the experiment closes here as "stopped before validation".
