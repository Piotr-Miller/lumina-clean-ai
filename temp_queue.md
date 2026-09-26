# temp_queue.md — pending work, portable across dev stations

> **Temporary by design.** A hand-off queue, not a tracker. `context/foundation/roadmap.md` remains
> authoritative for what the project is building; this file only records what is queued **right now**
> and who each item is blocked on, so a session on another machine can pick up without re-deriving it.
> **Delete it when the queue empties.** If an item here outlives the queue, it belongs on the roadmap
> instead.
>
> Written 2026-09-23 against master `a51c04f`.

## State when this was written

- **Zero open PRs.** Everything merged and deployed; production is on the latest commit.
- **S-18 (`cloud-result-resolution-gap`) is done and archived** →
  `context/archive/2026-09-20-cloud-result-resolution-gap/`. Issue #238 closed. Only its
  **presentation half** shipped: a caption beside the cloud Download stating both resolutions. The
  **delivery half** is Parked pending the S-17 model decision.
- **S-17 (`cloud-quality-below-local`) is `preparing`** and is the hinge — three other items wait on it.

## Options

### A — Run A, the experiment that settles S-17 ⭐ recommended

**Blocked on: the maintainer** (a metered production run).

Cloud AI caps its output long edge at 1536 px. Every failing trial in the project's history used a
source **under** that cap, so it was passed through and never downscaled. Every clean run was either
low-chroma **or** large. Saturation and size have never been separated. This run separates them.

|                    | saturated green                            | low chroma                                     |
| ------------------ | ------------------------------------------ | ---------------------------------------------- |
| **small (≤ 1536)** | **FAILS** — aurora, all 3 S-17 screenshots | Run B (optional, completes the square)         |
| **large (> 1536)** | **Run A — decisive**                       | **CLEAN** — `bcff4e39`, `c560b9d4`, `3f219e67` |

**Input is ready and committed:** `test-photos/licensed/01-aurora-fjord-kirkjufell.jpg` — 3840 × 2560,
CC BY-SA 4.0, photo by Oliver Degener (uploaded by Chr Grundo). Green dominance +88 in the sky, foreground luma 18, so it exercises both
halves of the fault's signature.

**Protocol** (full version: `context/changes/cloud-quality-below-local/defaults-experiment.md`):

1. On <https://luminacleanai.com>, signed in, select Cloud AI and upload that file.
2. **Turn Auto OFF.** Set gamma `1.00` and strength `0.05` — Cloud AI's own documented defaults. The
   app ships `1.2` / `0.2` and Auto pins gamma to the `1.50` ceiling on any night photo, so the model
   has never been run from this app at its documented operating point.
3. Screenshot the panel before submitting, so the parameters are on the record.
4. Afterwards open the **raw** `result.png` in Supabase Storage — the before/after pane is
   post-passed, the stored object is the model's own bytes.
5. Compare against `190832de`, the known-bad reference: pink-violet cast in the water and foreground
   while the aurora stays green. The fault is **luminance-gated** — it lives in shadows and
   mid-tones, not in bright areas.

**Cost:** one cap slot, ≈ $0.0006.

**Why it matters:** clean → **size** is doing the work, the fault may not reach real users at all, and
the decision becomes "bound the input size", which is far cheaper than a model swap. Magenta →
**saturation** confirmed on representative evidence, and S-13 (model swap) comes back into play.

### B — `developer-feedback`: one decision unblocks full implementation

**Blocked on: the maintainer, but only for a decision — no production access, no cost.**

Answer one question and an agent can plan and build the whole thing:

> **Can anonymous visitors submit feedback, or is it signed-in only?**

That is the entire abuse surface, and both obvious defences (Turnstile/WAF, per-user rate limiting)
are declared non-goals in this project. Details and the pre-empted objections:
`context/changes/developer-feedback/change.md`.

Two constraints already fixed there, worth not re-litigating: feedback must land in a **durable row**
readable any time, and **the app cannot send email** — the live Resend/SMTP is Supabase's, wired for
auth mail only. Any "email the developer" design needs infrastructure that does not exist.

This change is independent of S-17 and S-18.

### C — swap the `ai-review` finder model

**Blocked on: nobody. One command, no code change.**

```
gh variable set OPENROUTER_REVIEW_MODEL --body '<model>'
```

Currently `z-ai/glm-4.6`. On 2026-09-20/21 it failed with `AI_NoObjectGeneratedError` on **every** PR
carrying code, at token counts from 2.4k to 20k, while 20 consecutive runs had passed between
09-08 and 09-13. Docs-only PRs now skip correctly after PR #237.

**Not recommended yet.** It blocks nothing — `ai-review` is advisory and deliberately not a required
check — and swapping a model without measuring is guessing. Revisit when a red review actually gets
in the way.

### D — the delivery half of S-18

**Blocked on: A.** Parked in `roadmap.md`. Cloud AI returns ~1/6 of the pixels a phone photo carries
(measured: 1536 × 1024 from a 9.83 MP frame, ratio 0.160), plus a lossy JPEG re-encode of a losslessly
stored PNG. S-18 shipped the **disclosure** of this, not its closure. A model swap or a browser-side
model would change the output size outright, which is why this waits.

### E — `local-engine-ceiling`

**Blocked on: A**, plus a reference photo set. Its premise was corrected on 2026-09-21: the frozen
Bread bar it calibrates against is defective on the very class its reference set asks for. Read
`context/changes/local-engine-ceiling/change.md` before acting on it — the supersession block is at
the top. The photo set now has somewhere to live: `test-photos/`.

## Recommendation

**A, then B.** Run A is the cheapest high-impact action available: six ten-thousandths of a dollar
settles a decision that three other items hang on. B is the only work an agent can complete
end-to-end, and it needs one sentence from the maintainer.

## What does NOT travel to another machine

- ~~The two diagnostic scripts live in a `/tmp` scratchpad~~ — **resolved 2026-09-23, they now
  travel**: `scripts/prod-result-dimensions.py` (the census of every stored result's dimensions) and
  `scripts/prod-fetch-results.py` (download results by job id). Both are read-only, both take the
  service-role key from the environment at run time, and the `prod-` prefix is there so the blast
  radius is visible from the filename.
- **Production credentials.** They were deliberately never given to the agent session — the
  maintainer ran the scripts locally and pasted the output. Keep it that way.
- `.env` in a fresh clone points at the **local** stack, not production.
