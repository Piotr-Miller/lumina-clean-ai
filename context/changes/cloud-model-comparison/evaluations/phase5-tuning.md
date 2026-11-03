# Phase 5: restrained-prompt GPT config (core only)

**Core gate (`phase5-core-report.json`, `tally.py --gate core`, exit 0): `phase5-gpt` STOP**,
incomplete core: S17-07/1 technical failure. The 5 extension slots (S17-01/02/05/06/21) were never
sent: they require a PASS core report, so the tuning gate (5.2) and the 8-photo rating (5.3, 5.4)
do not apply.

- **Config:** `scripts/s19/configs/phase5-gpt.json` (sha256 `9a0f076c…`). It uses `gpt-std`'s model,
  standard size, cost bound and input, with a prompt that keeps a dark sky dark, adds no clouds,
  stars or aurora bands, does not reshape aurora and preserves neon without reconstructing strokes
  or letters. A `moderation_blocked` error is retried once (plan Phase 5 amendment, owner decision
  2026-11-02). Series `scripts/s19/series/phase5.json` (sha256 `7308f0ef…`).
- **Approval:** `S19-SPEND phase=5 cap_usd=4 decision=approved date=2026-11-02` (owner).

## Attempts (`test-photos/private/s19/attempts.jsonl`)

| Slot       | Request size | Attempts | Status                                                                                                                                                          | Vendor-reported cost    |
| ---------- | ------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| S17-03/1–3 | 2336 × 1552  | 1 each   | ok × 3                                                                                                                                                          | $0.078478 each          |
| S17-04/1–3 | 2192 × 1648  | 1 each   | ok × 3                                                                                                                                                          | $0.085726 each          |
| S17-07/1   | 2320 × 1552  | 2        | **technical failure**: HTTP 400 `moderation_blocked` on both attempts (requests `req_473a46aac48b4bd3bbcaa427aecda082`, `req_8267a2b1489948edbbee1dbb9211996d`) | unknown, $0.40 reserved |
| S17-07/2–3 | 2320 × 1552  | 1 each   | ok × 2                                                                                                                                                          | $0.077922 each          |

- **Block summary (runner):** 1 first-attempt block, 0 recovered by the retry, 1 final slot failure
  after a block.
- **Spend:** $0.6485 reported by the vendor. The Phase 5 ledger commits **$1.05 of the $4 cap**,
  because the two blocked attempts keep their full reservation.
- **S17-07 across phases:** with the same prepared input and parameters, OpenAI blocked **3 of 7**
  attempts (Phase 3: 1 of 3; Phase 5: 2 of 4), each time on slot 1. S17-03 and S17-04 were never
  blocked. The retry did not rescue the slot, so the gain in gate completion the retry was meant to
  allow did not happen.
- After the failure the runner finished the remaining core slots as diagnostics (owner decision);
  the extension stayed refused.

## Diagnostic ratings: quality vs fidelity

The owner rated the 8 outputs blind against real Local, with 1:1 crops, on **two separate axes**:
visual quality and fidelity to the original. The key was opened only after the rating was closed.
Export: `phase5-core.json` (quality in `preference`, which tally reads; fidelity in
`fidelity_preference`).

| Photo / slots    | Visual quality      | Fidelity to the original |
| ---------------- | ------------------- | ------------------------ |
| S17-04 / 1, 2, 3 | GPT slightly better | **Local clearly**        |
| S17-03 / 1, 2, 3 | GPT slightly better | **Local clearly**        |
| S17-07 / 2, 3    | GPT clearly better  | **Local clearly**        |

**In 8 of 8 pairs the aesthetic preference is opposite to the fidelity preference.** The owner's
findings, in their words:

- **S17-04 sky:** the smoother variant gives a cleaner image, but introduces uneven, wide tonal
  steps, strongly enhances the edges of the railing bars and overdraws the flag and small
  ornaments. The faithful variant keeps more noise but matches the original better.
- **S17-03 aurora:** the more striking variant smooths the bands, changes their fine course, local
  narrowings and the look of faint stars; neutralising the green cast of the snow changes the
  character of the scene. The faithful variant keeps the soft structure of the source.
- **S17-07 side neon:** better apparent detail and shadow legibility, but the letters and the
  details of faces and clothes are overdrawn, and the letter forms differ between the two attempts.
  The faithful variant keeps the source shapes, though noisy, strongly brightened and glowing.

No content change was confirmed, so no crop note is recorded; the findings above are descriptive.
The lettering flag is kept on S17-07.

## Compared with Phase 3 (`gpt-std`, same photos and size)

| Photo  | Phase 3 `gpt-std` vs Local | Phase 5 `phase5-gpt` vs Local (quality) |
| ------ | -------------------------- | --------------------------------------- |
| S17-03 | 3 clear wins               | 3 slight wins                           |
| S17-04 | 3 clear wins               | 3 slight wins                           |
| S17-07 | 2 clear wins               | 2 clear wins                            |

The restrained prompt toned down GPT's visual advantage on the sky and aurora photos, but it did not
fix fidelity: on every pair the owner judged real Local more faithful. Phase 3 was not rated on a
separate fidelity axis, so the size of any fidelity change from the prompt cannot be measured
directly. Only three scenes were rated, and the three pairs of each scene share the same Local file.

## Consequence

`phase5-gpt` STOPs at the core, like `gpt-std` and `nafnet` in Phase 3. No GPT config has passed a
core gate, so S-19 has no candidate for the tuning gate, the freeze or the holdout. The holdout
stays unopened.
