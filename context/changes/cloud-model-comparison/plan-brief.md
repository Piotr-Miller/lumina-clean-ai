# S-19 Cloud Model Comparison — Plan Brief

> Full plan: `context/changes/cloud-model-comparison/plan.md`
> Frame brief: `context/changes/cloud-model-comparison/frame.md`
> Research: `context/changes/cloud-model-comparison/research.md`

## What & Why

S-19 has to show a clear win over the real Local engine on ≥ 8 of 12 holdout photos, with ≤ 1
moderate loss and 0 severe regressions, before Cloud AI comes back (it is paused with
`CLOUD_DAILY_CAP=0`). Bread cannot do it. Two candidates remain: GPT Image 2.5 as a direct edit,
and NAFNet denoising with a deterministic exposure step.

## Starting Point

The spike ($0.56) left GPT outputs for S17-04 and S17-07 and a NAFNet output for S17-04. The owner
rated Bread against Local blind (0 clear wins) and Local against the original on seven tuning
photos. Historical Local downloads exist for seven of the eight tuning photos; S17-21 is missing.
These files and the unprepared spike inputs remain Phase 2 diagnostics. All new gate baselines
will be made in the app from the same full-resolution prepared sRGB files as GPT; NAFNet's
required downscale is shared with its no-NAFNet control.

## Desired End State

One recorded verdict: pass, fail, stopped before validation, or inconclusive validation due to
incomplete technical evidence. Every paid attempt is logged,
every rating comes from a blind viewer, the holdout is opened at most once, and production stays
paused. A pass leads to a separate change that plans the production switch.

## Key Decisions Made

| Decision            | Choice                                                                                                                                     | Why (1 sentence)                                                                       | Source                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------ |
| Content change      | Shape, geometry, layout, added or removed object, changed lettering → severe regression; clearer detail is not                             | Fidelity must be judged on concrete crops, not on new sharpness                        | Plan (owner, 2026-10-31) |
| Stars               | Recognisable star added, moved or removed → content change; faintest noise-like points vanishing → not automatically severe                | Denoising must not lose automatically on every night sky                               | Plan (owner)             |
| Lettering           | Changed letters → severe; unverified lettering cannot justify a win, but an independent confirmed gain can                                 | Plausible text is not confirmed text                                                   | Owner; triage 2026-10-31 |
| Candidates          | GPT Image 2.5 direct; NAFNet + exposure. Bread, class C, SCI, control-light, Nano Banana out                                               | Spike and owner ratings                                                                | Research + Plan          |
| NAFNet arms         | NAFNet + Local gamma first; a new curve only if needed, also tested without NAFNet                                                         | Separates what exposure and NAFNet each contribute                                     | Plan (owner)             |
| GPT sampling        | First technically valid result; retries only for technical errors; 3 × 3 repeats rated in full beforehand                                  | No cherry-picking; stability measured before the holdout                               | Plan (owner)             |
| Fair input          | Identical full-resolution prepared sRGB bytes for real Local and GPT; NAFNet downscale shared with its control; exact app Auto records     | Isolates input, exposure and denoise effects                                           | Frame; triage 2026-10-31 |
| Tuning gate         | ≥ 6/8 clear wins, ≤ 1 moderate loss, 0 severe, 0 content changes; one immutable config and complete evidence                               | Fixed gate, leaving margin over 8/12                                                   | Owner; plan              |
| Budget              | Base caps $3 + $3 + $5 = $11 above $0.56; a larger/new GPT config may require a numeric replacement Phase 5 cap and revised total          | All configs/retries share a persistent phase ledger; separate consent before paid work | Plan; triage 2026-10-31  |
| Sending the holdout | Positive owner approval for the exact frozen hash/vendor/terms, separate $5 consent, then an explicit Phase 7 release                      | Freeze or a dated refusal never authorises access                                      | Plan; triage 2026-10-31  |
| Gate evidence       | Join expected slots, all attempts and ratings by immutable config/input/output ids; fixed denominators; no omitted failures or best repeat | An export of successful images alone is insufficient                                   | Plan; triage 2026-10-31  |
| STOP and closure    | Valid PASS and STOP reports exit 0; invalid evidence exits 2; only an explicit PASS permits advancement                                    | A negative scientific outcome is not broken tooling                                    | Plan; triage 2026-10-31  |

## Scope

**In scope:** fair-input harness, local control arms, logged paid runner with a holdout guard,
N-arm blind viewer with fidelity flags, tally script, staged tuning runs, freezing one finalist,
one-shot validation.

**Out of scope:** production changes, Bread tuning, other candidates, self-hosted NAFNet,
best-of-N selection, tone-transfer fallback unless fidelity problems are documented.

## Architecture / Approach

Prepared common inputs (`inputs.py`) feed real Local in the app, GPT directly, and the NAFNet
downscale shared with controls. `baseline.ts` captures full-precision Auto statistics/parameters
using the app's sampler in the same browser/session; `local-arms.ts` checks those records before
using the app's Auto and gamma. `run-candidate.py` logs/reserves every attempt in one shared
ledger, with a cumulative cap per phase. All photo-processing paths share the access guard in
`protocol.py`; `viewer-inputs.py` cannot release validation images before Phase 7. All arms go into
`compare-arms.html` for blind pairwise rating (candidate vs Local at the smaller resolution of the pair); `tally.py` turns exports into bar
categories and gate verdicts only after joining the expected series, attempts and ratings.
Unverified lettering needs a rating reason, not an automatic veto on an unrelated confirmed gain.
Terminal outcomes and status pointers are recorded even when validation is never authorised.

## Phases at a Glance

| Phase                        | What it delivers                                                                                                      | Key risk                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1. Harness and viewer        | Common inputs, new app Local baselines on all 8, exact Auto, access/budget guards, viewer and tally                   | Verify Auto before measuring the control blur approximation                       |
| 2. Rate existing outputs     | Blind ratings of the 3 paid spike outputs vs Local, $0                                                                | Too few photos to stop on; used only as an early warning                          |
| 3. Core paid series          | 9 new standard GPT calls + 2 large probes; 3 new NAFNet results including S17-04 (shared cap $3)                      | Large probes are diagnostic, not a passing core                                   |
| 4. Exposure curve (optional) | Deterministic curve, with and without NAFNet, $0                                                                      | Overfitting to 3 photos                                                           |
| 5. All 8 tuning photos       | Complete the selected GPT core first; then remaining 5 photos; cap $3 only if sufficient, otherwise numeric amendment | Large needs 7 missing core calls after probes; a new prompt needs 9               |
| 6. Freeze                    | Identical passing process hash; explicit positive/declined sending decision                                           | Missing/declined consent closes the experiment without holdout access             |
| 7. Validation                | Release, prepare common inputs/real Local, one-shot finalist on all 12 (cap $5); terminal record                      | Technical/budget incompleteness stays visible; no repeated independent validation |

**Prerequisites:** the owner's consent per paid phase (including any numeric budget amendment);
new common-input Local downloads and exact app Auto records for all eight tuning photos; API keys in
`~/.config/lumina-s19.env`.
**Estimated effort:** ~4–6 sessions plus the owner's rating time (about 6 rating rounds).

## Open Risks & Assumptions

- The fixed tuning gate is ≥ 6/8, ≤ 1 moderate loss, 0 severe and 0 content changes. Core STOP
  rules are any confirmed content change in the 9 GPT calls, a repeat spread from clear win to
  moderate loss or worse, and NAFNet not beating its matched control on ≥ 2 of 3 photos. A
  technical failure is counted separately and incomplete evidence cannot PASS.
- The $11 total is the standard base branch, not a promise covering every config change. At the
  plan's estimates, a fresh large-output prompt config plus NAFNet is about $4 in Phase 5 before
  prior Phase 5 spend/retries; a numeric amendment must state the new total before any extra call.
  The $5 validation cap must fit 12 bounded initial calls before holdout release; retries may
  exhaust the remaining budget and yield an inconclusive outcome.
- GPT returns ≈ 3 MP for a 12 MP input. The blind comparison follows the quality bar (no
  enlarging), and the native resolution is recorded separately. The size probe decides whether a
  larger output is worth its cost.
- One rater on 8 + 12 photos: an internal gate, not a population claim.
- The fal NAFNet cap (3981 px) forces a downscale; the free control separates NAFNet's gain from
  the downscale's.

## Success Criteria (Summary)

- The owner can trust that a pass or fail reflects one frozen process on an unseen holdout, judged
  blind against the real Local.
- No validation photo reached a vendor before the owner decided it may.
- Cloud stays paused until a separate change ships a winner.

Triage 2026-10-31: owner requested all ten recommended plan-review fixes (F1–F10). The edits
accept this protocol, not paid calls, holdout release, implementation completion or manual checks.
