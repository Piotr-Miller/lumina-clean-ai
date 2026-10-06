# finder-sonnet — hand-read of #247

> Gate: `gate.md` § Pre-registration §4 (hand-read acceptance per run: the owner classifies every published
> finding; zero rejected; unresolved = rejected; N = 0 passes). Verdict context: reliability has already FAILED
> (`269-r1`), so this hand-read is **information**, not an admission input.

## Source

- **Valid runs on #247:** `247-r1` only (`247-r2` not run: series stopped by the owner, `gate.md` § Series stop).
- **Published findings:** the five in `gate-sonnet-runs.jsonl`, record `247-r1`, `findings` (equal to
  `~/.cache/finder-sonnet-gate/runs/247-r1/review-out/review.json`). Judge verdict `failed`.
- **Evaluated head:** `dec09f8d77b2f1ee45073c194d6cd8239a7d35c7` (`~/.cache/finder-sonnet-gate/wt-247`).
- **Dedup:** one run, five findings with distinct claims and locations → five rows, no merges. F3 and F5 make the
  same claim (an unpaginated PostgREST query) about **different files**, so they stay separate rows.

## Rows

The **agent pre-sort** is the optional step 3 of plan § Phase 4: it checks each claim against the head and is not a
classification. The **owner** column is the classification; a blank cell counts as rejected.

| Row | Run    | Finding                                                  | Claim (short)                                                                                                                                            | Agent pre-sort against the head                                                                                                                                                                                                                                                                                                                                                                                                                    | Owner: real / rejected — reason                                                                                                                                                                            |
| --- | ------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | 247-r1 | F1 minor, documentation, `prod-fetch-results.py:38`      | Production photos are downloaded to `tempfile.gettempdir()` with no retention or cleanup guidance beyond "don't commit them".                            | **Accurate.** `:38` defaults `OUT` to `<tmp>/lumina-prod-results`; the safety contract (`:16-17`) says only "land OUTSIDE the repo" and "do not move them into test-photos/licensed/". Nothing says when to delete them. Whether that is a defect is a judgement call.                                                                                                                                                                             | **real** — the script copies customers' production photos out of the system that enforces retention, and its safety contract never says when to delete them.                                               |
| R2  | 247-r1 | F2 nit, style, `prod-fetch-results.py:47-56`             | Unlike `prod-result-dimensions.py`, this script does not reject a localhost URL or check that the key looks like a service-role key.                     | **Accurate.** `prod-result-dimensions.py:62-67` has both checks; `prod-fetch-results.py:47-56` has neither. The URL regex at `:55` already rejects `localhost` and `127.0.0.1` (not `https://<ref>.supabase.co`), so the missing localhost check has no effect; the missing key-shape check is real.                                                                                                                                               | **rejected** — the URL regex at `:55` already blocks localhost, and a wrong key still ends in a clear HTTP-error exit (anon is revoked on `jobs`), so only an earlier message is missing, no wrong result. |
| R3  | 247-r1 | F3 minor, correctness, `prod-fetch-results.py:68`        | The jobs query is unpaginated; past PostgREST's row cap a wanted job could fall outside the page and be reported "NOT found".                            | **Accurate as a conditional.** `:68` fetches the whole filtered table with no `limit`, `Range` or `id=in.(…)` filter, and `:90-93` reports anything not saved as missing. It bites only when stored results exceed the API's `max_rows` (Supabase default 1000); the 2026-09-22 census counted 18. Separately, and not claimed: `:90` decides "missing" from `os.listdir(OUT)`, so a file left by an earlier run masks a missing job.              | **real** — the unpaginated query is a true latent defect: past `max_rows` (1000; 18 results today) a wanted job would be falsely reported "NOT found".                                                     |
| R4  | 247-r1 | F4 minor, correctness, `prod-result-dimensions.py:79-96` | `struct.unpack` on the 2,048 fetched bytes can raise `struct.error` for a JPEG whose SOF lies past the range or a truncated header, aborting the census. | **Mostly inaccurate.** For JPEG the loop guard `while i < len(raw) - 9` (`:86`) keeps both slices (`raw[i+5:i+9]`, `raw[i+2:i+4]`) full length, so an SOF past the range exits the loop and returns `None` → "header not recognised" (`:125-127`), not a crash. Only a **PNG** response shorter than 24 bytes can raise (`:82`). True but not claimed: the sign call at `:114` sits outside the `try`, so an HTTP error there does abort the loop. | **rejected** — the code contradicts the claim: the loop guard at `:86` keeps every JPEG unpack full-length, so an SOF past the range returns `None`; only a PNG under 24 bytes can raise.                  |
| R5  | 247-r1 | F5 major, correctness, `prod-result-dimensions.py:100`   | Unpaginated jobs query; past the default page size the census silently covers a subset yet prints "CONFIRMED: no production job has ever…".              | **Accurate as a conditional; severity arguable.** The line is `:102`, one off. No pagination; the `CONFIRMED` line (`:139`) would rest on a truncated set. The script does print `len(jobs)` (`:109`), so a count at exactly the cap would be visible to a careful reader; at today's volume (18 results) it cannot trigger.                                                                                                                       | **real** — a truncated census would still print `CONFIRMED` on a subset; latent at 18 results, and the severity is minor rather than major (the line is `:102`).                                           |

## Owner decisions (2026-10-06)

- **Dedup approved** as is: five rows, no merges (plan § Phase 4 step 2), before classifying.
- **Classified** every row (step 4): R1, R3, R5 real; **R2, R4 rejected**.
- **`247-r1`: hand-read FAIL**, 2 of 5 rejected (the rule is zero rejected). Information only: reliability had
  already failed.

## Owner steps (as planned)

1. **Approve the dedup** (five rows, no merges) — plan § Phase 4 step 2.
2. **Classify every row** as real or rejected, with a one-sentence reason — step 4. A blank cell is rejected.
3. Per-run result for `247-r1`: zero rejected → hand-read PASS for that run; otherwise FAIL. Information only.
