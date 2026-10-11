---
date: 2026-10-11T20:11:26+02:00
researcher: Claude (Opus 5.5) for Piotr-Miller
git_commit: d4239b74238589fb783d79559cca70f7cc4d9f09
branch: master
repository: lumina-clean-ai
topic: "finder-glm-5-3 — merge the two-stage finder (no verifier), run glm-5.3 at effort low, restore AI review on a passing gate"
tags: [research, code-reviewer, finder, ai-review, glm-5.3, gates, openrouter]
status: complete
last_updated: 2026-10-11
last_updated_by: Claude (Opus 5.5)
---

# Research: finder-glm-5-3

**Date**: 2026-10-11T20:11:26+02:00
**Researcher**: Claude (Opus 5.5) for Piotr-Miller
**Git Commit**: `d4239b7`
**Branch**: master
**Repository**: lumina-clean-ai

## Research Question

Owner scope (2026-10-11, `change.md`): merge the two-stage finder from `feat/finder-verification` into master
(finder only, no verifier), switch the finder's reasoning from `{enabled: false}` to `effort: low`, and — if
`z-ai/glm-5.3` passes the gates including a live PR probe — remove the `false &&` line in
`.github/workflows/review.yml` to restore AI review.

Six areas: (1) the gates and the live-probe procedure; (2) what `802a1e0` / `15b3f71` change, separability from the
verifier, conflicts; (3) where reasoning / routing / response_format / budget are configured; (4) tests and evals a
merge touches; (5) why `finder-verification` admitted nothing and whether that applies to a finder-only setup;
(6) OpenRouter credit and glm-5.3 endpoints.

Lessons applied: 1 of 38 entries in `context/foundation/lessons.md` names `research` ("A fixture that fails to
reproduce a live defect…"). One more is directly on point although tagged plan/implement and is used as a prior:
"An offline eval proves capability exists, not that it will be used — gate adoption on a live probe"
(`lessons.md:159-164`) — the screening is exactly such an offline eval.

## Summary

1. **The two-stage finder is sound and separable, but the named two commits are not enough.** No record judges it
   defective; it fixed the serialization cause on glm-4.6 and parsed cleanly on luna. It imports nothing from the
   verifier. A clean port to master needs `2e2ae19` → `802a1e0` → `15b3f71` (with every `context/` path and
   `scripts/finder-wire-dump.mjs` dropped); the screened routing additionally needs `e5be9ff` + `b3a4a38`, which
   bring `DEFAULT_FINDER_PROVIDERS = ["novita"]` — the very default that kept `feat/finder-model-swap` unmerged.
2. **The `finder-model-swap` gates cannot be applied to glm-5.3 as written.** They require
   `reasoning: {enabled: false}` and fail any request with reasoning tokens (A3); their pre-flight says
   `mandatory: true` → stop and ask. glm-5.3 has `reasoning.mandatory: true`. Their G4 cost ceiling
   ($0.00301653 median per fixture attempt) was calibrated on non-reasoning glm-4.6; the screening's
   $0.002–0.015 per row makes a G4 failure likely.
3. **There is a stricter, later bar than the one `change.md` names.** `finder-verifier-frozen` decision 6 keeps the
   sealed "zero owner-rejected" gate (from `finder-sonnet` / `finder-sonnet-effort`: zero rejected per valid run,
   unresolved = rejected, D2 in every valid #269 run) as _the_ criterion. `finder-model-swap`'s hand-read allows
   ≤ floor(0.05·N) rejected. Read literally, `review.yml`'s "those gates" means `finder-verification`'s gates. The
   owner has to say which gate restores AI review.
4. **No change has ever run a true live probe.** The #247/#269 "probes" of earlier changes were local runs of the
   production CLI against frozen diffs. The only live gate, G5 (the change's own PR reviewed by `AI Code Review`),
   never ran. This change would be the first.
5. **Budget is tight.** OpenRouter credit is **$7.40** (`$65 − $57.603`, 2026-10-11T18:07:46Z). Prior gate series
   cost $0.21 (`finder-model-swap`) to $2.66 (`finder-verifier-frozen-sonnet`).

## Detailed Findings

### 1. The gates and the probe procedure

**`finder-model-swap`** (`context/archive/2026-10-02-finder-model-swap/gate.md` § Pre-registration, `:8-205`; G1–G4
inherited unchanged from `context/archive/2026-09-24-finder-serialization-outage/gate.md:24-56`):

| Gate         | Criterion                                                                                                                                                                                                                                                                   | Where                                |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| G2           | `clean-change` × 5, tool-enabled, **5/5** valid with `findings: []`; any finding, minor/nit included, fails                                                                                                                                                                 | `gate.md:62-66`                      |
| G3           | 4 cases × 3 = 12 promptfoo rows, grader `google/gemini-3.1-pro-preview`; required 3/3: JS-loop `issue_recall`; React `issue_recall` + `review_fails`; `flaw_stale_closure`, `flaw_lost_cleanup`, `flaw_unsafe_html`; clean `no_false_alarms`. Cross-hunk is diagnostic only | `gate.md:67-73`                      |
| G4           | median finder cost per attempt **≤ $0.00301653** (3 × glm-4.6 baseline); incomplete cost telemetry fails                                                                                                                                                                    | `gate.md:74-79`                      |
| G1           | #269 × 10, **≥ 9/10** valid (≤ 1 repair); a 429 counts as failure                                                                                                                                                                                                           | `gate.md:80-83`                      |
| G3 hand-read | min(40, N) dedup #269 findings; ≤ 2 of 40, else floor(0.05·N) rejected; unresolved = rejected; N = 0 fails                                                                                                                                                                  | `gate.md:84-92`                      |
| G5           | first `AI Code Review` on the change's own PR: green, `finderTelemetry` present, provider per step, `models.finder` = admitted model; $0.50 limit; not green blocks the merge                                                                                               | `gate.md:93`, `:184-189`             |
| A3           | every request of every gate: SDK or OpenRouter reasoning tokens > 0, or reasoning text > 0, fails the attempt                                                                                                                                                               | `gate.md:95-97`; request shape `:38` |

Order and stop rule: G2-01 alone as the A3 probe, then G2, G3/G4, G1; the first decisive failure ends the candidate;
a G4-only failure is `paused (G4 only) — owner` (`gate.md:114-134`). There is no tool-use, fabrication or severity
gate. Outcome: nobody admitted — luna `FAIL (G3 hand-read)` 19/20 rejected, qwen3.8-flash `FAIL (G3)`, minimax-m3
`FAIL (G2)`; spend $0.2111 (`gate.md:414-433`).

**`finder-sonnet` / `finder-sonnet-effort`** (a different gate; `2026-10-05-finder-sonnet/gate.md:132-273`,
`2026-10-06-finder-sonnet-effort/gate.md:156-342`): each of #247 and #269 run twice; every run valid; hand-read per
run **zero rejected** (unresolved = rejected; #247 N = 0 passes; #269 must include **D2**); monthly cost projection
`53·m247 + 8·m269 + 13·$0.199620 ≤ $10.00`. Outcomes: sonnet `NOT ADMITTED (reliability)` (`NoOutputGeneratedError`
on the 16,384 cap); effort `NOT ADMITTED` on hand-read for both arms — no #269 run published D2
(`effort gate.md:576-614`). These gates assume master's single-stage `json_schema` finder (`sonnet gate.md:82-85`).

**Ground truth.** #269 (base `3d0adc1`, head `fca2778`, diff 65,455 B): the only owner-confirmed real defect is
**D2** — `scripts/spikes/bread-spike.ts` `localInput` exits on a missing `urls.get` before returning the file id, so
`main`'s cleanup never deletes the upload; match rule at `sonnet gate.md:149-153`; rejected classes (D1, D3–D20) at
`finder-model-swap/hand-read-269.md:95-102`. #247 (base `d097949`, head `dec09f8`): no planted defect, N = 0 passes;
owner classifications at `finder-sonnet/hand-read-247.md:23-33`.

**How "probes" were actually run.** Locally, never on GitHub:
`node scripts/finder-gate.mjs --model … --endpoint … --case pr269 --n 10 --diff … --rules … --source-root <wt@fca2778>`
with `OPENROUTER_FINDER_PROVIDERS` (`finder-model-swap/plan.md:345-357`), or `scripts/sonnet-gate.mjs run …`, which
spawns `npm run review` exactly as `action.yml` does. Both scripts exist only on their feature branches. Worktrees
`~/.cache/finder-sonnet-gate/wt-247` and `wt-269` hold the frozen heads.

**Seal and budget conventions.** Hash the `## Pre-registration` section with `sha256sum`, record UTC, commit, push,
record GitHub's push time (no SHA pointer — rebase-merge rewrites SHAs); amendments carry their own hash and are
pushed before the measurement they affect (`finder-model-swap/gate.md:191-216`). Sonnet changes added a prettier
check before hashing, an annotated `<change>/seal` tag, and a hashed `gate-manifest.json`. Budget: model-swap used
$2.00 hard with stop-and-ask at $1.60; sonnet changes used T + P + $0.50 (G5 reserve) ≤ cap, T = max(counter − T0,
settled spend), counter re-read ≥ 180 s apart.

### 2. The two-stage finder against master

**What it is** (line numbers at `15b3f71`):

- `packages/code-reviewer/src/reviewer.ts` — stage 1 (`:278`) is a `ToolLoopAgent` with `getFileContext` and **no
  `output`**, so no request sends `response_format`; `prepareFinalStep` (`:140`) strips tools on the last step;
  `transcriptFromSteps` (`:152`) flattens the steps to fenced text. Stage 2 (`:321`) is a tool-less `generateText`
  over the review unit plus that transcript. Parsing: `parseFinderOutput`; no `{` or `finishReason === "length"`
  → `FinderOutputError` at once (`:366`); otherwise exactly one format-repair request that sees only the rejected
  text and the error (`:376-382`). `createReviewBudget` (`:193`) is one wall-clock budget for the whole review.
- Reasoning: `extraBody: { reasoning: { enabled: false } }` (`reviewer.ts:267`), pinned on every request by
  `reviewer.test.ts:235-242` ("… disables reasoning and requires parameters (A3)").
- `src/prompts.ts` — `FINDER_FORMAT_SECTION` (`:336`, JSON Schema from `z.toJSONSchema`), finalization and repair
  prompts (`:361`, `:411`, `:438`, `:449`); `15b3f71` adds the `<gathering-note>` fence (`:400`), fixing review
  finding F1 (`finder-verification/reviews/impl-review-phase-2-802a1e0.md:29,41`).
- `src/output-repair.ts` — `parseFinderOutput` (`:52`), `FinderOutputError` (`:93`, deliberately not a
  `NoObjectGeneratedError`, so `withOneRetry` does not retry it); the finder's envelope repair is removed.
- New `src/provider-metadata.ts`, `src/openrouter-stub.ts` (wire-level fetch stub for tests).

**Branch inventory** (`master..origin/feat/finder-verification`, 48 commits):

| Class               | Commits                                                                                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finder (src)        | `2e2ae19` (p1 step logging), **`802a1e0`**, **`15b3f71`**, `e5be9ff` + `b3a4a38` (finder routing, `OPENROUTER_FINDER_PROVIDERS`, `DEFAULT_FINDER_PROVIDERS = ["novita"]` at `config.ts:139`) |
| CI                  | `5d72458` (exclude JSONL from reviewed diff), `3b08702` (comment), `da99692` (merge of master)                                                                                               |
| Gate / eval tooling | `6e37867`, `271bee2` (`finder-wire-dump.mjs`), `3219a1c`, `0a584f6`, `7b49836`, `29b15b8`                                                                                                    |
| Verifier            | `2c4ae34`, `024adac`, `3e26005`, `c3b2f1c`, plus gate tooling `fa5afaa`, `0f2d3a9`, `5b29930`, `3f89d38`, `58fd4ec`                                                                          |
| Docs / archive      | the rest — already on master via #254, #285; they target `context/archive/` and must not be ported                                                                                           |

**Separability: clean.** At `9c85aa2`, `reviewer.ts` imports nothing from `verifier.ts` / `excerpts.ts`; the
dependency runs the other way (`verifier.ts:4-15`). All verifier wiring arrives in `2c4ae34` and later.

**Conflicts** (checked with `git merge-tree` and `git apply --check`; nothing compiled or tested):

- Master changed `packages/code-reviewer` / `.github` only once since the fork point `a4f4d34`: `68151b0`, the
  `false &&` guard.
- `802a1e0` alone, or with `15b3f71`, conflicts in `src/cli.ts`, `src/cli.test.ts`, `src/pipeline.ts` — they
  depend on `2e2ae19`.
- `2e2ae19..15b3f71` together: no conflict under `src/`; only `context/` files and `scripts/finder-wire-dump.mjs`.
  The same holds through `b3a4a38` and through `29b15b8`.

### 3. Configuration on master today

- Finder model `DEFAULT_MODEL = "z-ai/glm-4.6"` (`packages/code-reviewer/src/config.ts:14`); resolution override →
  `OPENROUTER_REVIEW_MODEL` → `OPENROUTER_MODEL` → default (`config.ts:134-145`). Repository variable
  **`OPENROUTER_REVIEW_MODEL = z-ai/glm-4.6`** is still set (`gh variable list`, 2026-10-11) and fed by
  `.github/workflows/review.yml:284-287` → `.github/actions/ai-review/action.yml:86-89`. It would override any new
  default; `finder-model-swap` required deleting it before G5 (`plan.md:473-480`).
- No `reasoning` setting and no `*_PROVIDERS` variable on master. Routing is global
  `DEFAULT_PROVIDER_ROUTING = { require_parameters: true }` (`config.ts:105`, `resolveProviderRouting` `:112-114`).
- Single-stage finder: `ToolLoopAgent` + `tolerantReviewOutput` → `Output.object` (`reviewer.ts:169`,
  `output-repair.ts:228-253`) — the SDK sends `response_format`. Pass 1 of the screening shows this path cannot parse
  glm-5.3's answer.
- Budget: `DEFAULT_FINDER_TIMEOUT_MS = 300_000` (`pipeline.ts:49`), per attempt, so up to 2 × 300 s with
  `withOneRetry`; `REVIEW_FINDER_TIMEOUT_MS` is read (`cli.ts:272-274`) but not wired in `action.yml`. Steps: CLI
  default 5 (`cli.ts:78`, `REVIEW_FINDER_MAX_STEPS`). Output cap `MAX_OUTPUT_TOKENS = 16_384` per call
  (`config.ts:57`) — reasoning tokens count against it.
- Disable gate: `.github/workflows/review.yml:23-29` (`false &&`, owner decision R11, 2026-10-04).

### 4. Tests and evals a merge touches

- `2e2ae19`: cli.test +10, pipeline.test +4. `802a1e0`: reviewer.test +18/−1, output-repair.test +18/−14,
  pipeline.test +5, cli.test +5, provider-attempts.test +4, retry.test +2, evals/finder-provider.test +3.
  `15b3f71`: reviewer.test +2.
- `reviewer.test.ts:235-242` must be rewritten for the reasoning switch (it asserts `{ enabled: false }`).
- `prompts.test.ts` is **not** touched by any finder commit — only verifier commits change it. (It pins the
  impl-review transcription by content against `prompts.ts`, not by reading the skill tree.)
- Evals: `802a1e0` / `15b3f71` change only `evals/finder-provider.ts` and its test; `promptfooconfig.yaml` changes
  only in `7b49836` (model-swap) and `fa5afaa` (verifier).
- If the gate tooling is ported, its A3 reasoning-leak checks (`finder-gate-core.mjs:648,701`,
  `promptfoo-gate-rows.mjs:242,469` at `9c85aa2`) fail every `effort: low` row and need an amendment.

### 5. Why `finder-verification` admitted nothing — and whether it applies here

- Arms (`2026-10-03-finder-verification/gate.md:156-168`): both used finder `openai/gpt-6-luna`; CONTROL verified
  with luna, MAIN with sonnet-5. **CONTROL was finder + verifier, not finder-only.**
- G3f (`gate.md:285-297`): the 12-row fixture gate computed on _published_ (post-verification) findings.
  CONTROL failed on React `issue_recall` 0/3, `flaw_stale_closure` 0/3, `flaw_lost_cleanup` 2/3
  (`gate.md:710-730`). Rows 1 and 3 were finder recall misses; row 2 was the verifier withholding a compound finding.
  G2 passed 5/5, G4 passed, 0 errors, 0 A3 leaks, 0 repairs.
- MAIN was declined because it could not fix a finder-recall failure and its pessimistic cost exceeded $2.00
  (`gate.md:740-750`).
- "None admitted" judged the luna bundle, not the two-stage finder. The two-stage finder was judged on its own
  twice and worked: on glm-4.6 "every finalization that answered parsed strictly, after at most one repair" — the
  failures were 429s and review quality (`2026-09-24-finder-serialization-outage/change.md:136-138`); on luna G1
  10/10, 0 repairs (`finder-model-swap/change.md:182-186`).
- What does carry over to a finder-only glm-5.3: **recall variance on `flaw_stale_closure`** — luna missed it in
  2/6 React rows, glm-4.6 on the two-stage finder failed it 2/3 on z-ai and Venice
  (`finder-serialization-outage/gate.md:128,131`), and a single 3-row draw "can pass or fail on the same finder by
  chance" (`finder-verification/follow-ups/successor.md:15-18`). Also **Z.AI 429s**: z-ai first-party scored G2 2/5
  on glm-4.6 (`finder-serialization-outage/gate.md:128,153`).
- The two-stage finder is the intended fix for the original outage ("keep glm-4.6, carry the output format in the
  prompt, and parse on our side", `finder-serialization-outage/change.md:88-112`), never merged
  (`:161-163`).

**Who may remove `false &&`.** R11 (`finder-verification/change.md:110-111`): restored "together with the
deployment of a finder that passed the gates". Workflow comment (`review.yml:23-27`): "the change that deploys a
finder which passes **those** gates" — literally `finder-verification`'s. Decision 6
(`2026-10-09-finder-verifier-frozen/change.md:42-44`): "The sealed 'zero owner-rejected' gate is not changed. It
stays as the earlier criterion." R7 (`finder-verification/change.md:96-97`): "A reasoning variant is a separate
construction that needs a new registration." No recorded decision forbids a finder-only pipeline; `finder-sonnet`
was itself scoped finder-only (`2026-10-05-finder-sonnet/change.md:24-26`).

### 6. OpenRouter credit and glm-5.3

Checked 2026-10-11T18:07:46Z via `GET /api/v1/credits`, `/api/v1/key`, `/api/v1/models`,
`/api/v1/models/z-ai/glm-5.3/endpoints` (JSON routes; values read from the response, not from a page):

- Credit: `total_credits 65`, `total_usage 57.603079073` → **$7.40 remaining**; `usage_daily 2.997`; no key limit.
  The counter lags (memory: `openrouter-key-counter-lags`); re-read before a paid series.
- `z-ai/glm-5.3`: `reasoning: {mandatory: true, default_enabled: true, supported_efforts: ["max","high","low"],
default_effort: "max"}` — there is no `medium`, and reasoning cannot be turned off. Supports `tools`,
  `response_format`, `structured_outputs`, `reasoning`, `reasoning_effort`.
- 40 endpoints. Z.AI (`z-ai/fp8`), Fireworks and Together: $1.40/M in, $4.40/M out, 30-min uptime 100 %. Cheapest
  listed: Wafer $0.07/$4.80, Baidu $0.35/$1.10 (output-cheapest), AkashML $0.19/$4.40 (where master's default
  routing sent pass 1). The saved snapshot `screening/glm53-endpoints.json` matches.

### What the screening measured, exactly

- Wire: the scratch wrapper `screening/glm-provider-long.ts` patched `globalThis.fetch` and replaced
  `body.reasoning` — the measured request was `reasoning: {enabled: true, effort: "low"}` (`screening/screen3.yaml:30-32`),
  not `{effort: "low"}`.
- Routing: `OPENROUTER_FINDER_PROVIDERS=z-ai,fireworks,together`, which exists only after `e5be9ff` / `b3a4a38`.
- Budget: `screening/finder-provider-long.ts` differs from `9c85aa2:packages/code-reviewer/evals/finder-provider.ts`
  in three lines — two absolute-path relocations (`:31`, `:134`) and `timeoutMs: 900_000` (`:487`). Low-effort rows
  took 4–44 s, so 900 s was not needed for them.
- Fixture rows only, n = 1–3 per case; the #269 diff (65 KB) was never run on glm-5.3.

## Code References

- `.github/workflows/review.yml:23-29` — the `false &&` guard and the R11 comment
- `.github/workflows/review.yml:284-287`, `.github/actions/ai-review/action.yml:86-89` — model variables into env
- `packages/code-reviewer/src/config.ts:14,105,112-114,134-145` — default finder model, routing, model resolution
- `packages/code-reviewer/src/reviewer.ts:169` — master's single-stage `Output.object` finder
- `packages/code-reviewer/src/pipeline.ts:49` — `DEFAULT_FINDER_TIMEOUT_MS = 300_000`
- `15b3f71:packages/code-reviewer/src/reviewer.ts:193,267,278,321,366,376-382` — budget, reasoning, stage 1, stage 2, parse, repair
- `15b3f71:packages/code-reviewer/src/reviewer.test.ts:235-242` — the A3 wire assertion to rewrite
- `origin/feat/finder-verification:packages/code-reviewer/src/config.ts:139` — `DEFAULT_FINDER_PROVIDERS = ["novita"]`

## Architecture Insights

- The two-stage split puts all tool use in stage 1 and all format obligations in stage 2; nothing crosses as
  tool-role messages. That is what makes it endpoint-independent — no reliance on a provider honouring
  `response_format`, which is the failure that disabled AI review.
- With a reasoning model, reasoning tokens now appear in **three** request kinds (loop steps, finalization, repair)
  and count against the 16,384 per-call output cap. `finder-sonnet` died on exactly that cap
  (`NoOutputGeneratedError`, not retried). A per-step reasoning bound, like `finder-sonnet-effort`'s flag
  (`gate.md:308-313`), is the precedent.
- Gates in this repo are pre-registered, hashed, pushed and tagged before any paid call; amendments are explicit.
  Changing A3, G4 and the hand-read bar for glm-5.3 is therefore an amendment to be sealed, not a plan detail.

## Historical Context (from prior changes)

- `context/archive/2026-09-24-finder-serialization-outage/` — root cause (Venice ignores `response_format`), the
  two-stage design, glm-4.6 measured on it (parse OK, 429s and quality not).
- `context/archive/2026-10-02-finder-model-swap/` — G1–G5, A3, hand-read; luna/qwen/minimax not admitted; why the
  branch was not merged (Novita default).
- `context/archive/2026-10-03-finder-verification/` — R7, R11; CONTROL FAIL (G3f) from finder recall.
- `context/archive/2026-10-05-finder-sonnet/`, `2026-10-06-finder-sonnet-effort/` — zero-rejected + D2 gate;
  effort arms; finder pin re-routes other `createReviewer` callers (`effort gate.md:621-627`).
- `context/archive/2026-10-09-finder-failure-scenario/` — docs only; gate restatement; prompt guidance against
  missing-test claims for maintainer-only tooling and message-only complaints (`change.md:89-93`).
- `context/archive/2026-10-09-finder-verifier-frozen/`, `2026-10-10-finder-verifier-frozen-sonnet/` — decision 6,
  decision 5.7; the verifier confirms false claims whatever the model.

## Related Research

- `context/changes/finder-glm-5-3/glm-screening-results.md` — the 2026-10-11 fixture screening that opened this change
- `context/archive/2026-10-02-finder-model-swap/research.md` — candidate selection for the previous swap
- `context/archive/2026-09-24-finder-serialization-outage/frame.md` — framing of the outage and fix options

## Open Questions

Owner decisions, needed before `/rune-plan` can fix the pre-registration:

1. **Which gate restores AI review.** (a) `finder-model-swap` G1–G5 with the ≤ floor(0.05·N) hand-read; (b) the
   sealed per-run gate decision 6 keeps — zero owner-rejected, unresolved = rejected, D2 in every valid #269 run;
   (c) G1–G4 + G5 from (a) with the hand-read bar of (b). Recommendation: **(c)** — the model-swap structure was
   measured on the two-stage finder and its tooling exists, while decision 6 names zero-rejected as the criterion
   that stays. Also confirm that `review.yml`'s "those gates" may be read as the chosen set.
2. **A3 amendment for reasoning.** Proposed: allowed wire body `reasoning: {enabled: true, effort: "low"}` (what was
   measured); reasoning text never parsed or published; a per-request reasoning-token bound (precedent:
   `finder-sonnet-effort` flag at 3,604.7 tokens per step for low) so the 16,384 cap is not hit.
3. **G4.** The $0.00301653 ceiling is calibrated on non-reasoning glm-4.6 and will likely fail. Replace with the
   sonnet-style monthly projection (≤ $10.00/month), or set a new per-attempt ceiling.
4. **Port set.** Minimum `2e2ae19`, `802a1e0`, `15b3f71`. Routing `e5be9ff` + `b3a4a38` only with a new
   `DEFAULT_FINDER_PROVIDERS` (e.g. `z-ai, fireworks, together` — Z.AI 429 risk noted) or none (global
   `require_parameters`, which sent pass 1 to AkashML). Gate tooling `3219a1c`, `0a584f6`, `7b49836`, `29b15b8`
   only if the gates run from master.
5. **Finder budget.** Keep 300 s (low rows 4–44 s on fixtures; #269 at 65 KB unmeasured) or raise it.
6. **Budget cap for the series.** Credit is $7.40; G5 needs a $0.50 reserve.
7. **`screening/`.** Ten files carry absolute local paths; scrub and commit, or keep out of git. They stay
   uncommitted until decided.
8. **`vars.OPENROUTER_REVIEW_MODEL`** (`z-ai/glm-4.6`) must be deleted or changed by the owner before G5.

Not verified: nothing was compiled, cherry-picked or tested (a sandboxed scratch cherry-pick was refused); the
conflict picture rests on `git merge-tree` and `git apply --check` only. glm-5.3 behaviour on the #269 diff is
unknown.
