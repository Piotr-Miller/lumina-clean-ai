---
change_id: finder-glm-5-3
title: "Measure glm-5.3 (reasoning low) as the ai-review finder, live PR probe included"
status: archived
outcome: completed
created: 2026-10-11
updated: 2026-10-16
archived_at: 2026-10-16T16:33:09Z
archive_commit: 927a360
sync: none
---

## Notes

2026-10-14: confirmed 3.5 — accepted at 674fb79d2ecf79553b0e5f83dbd0856f7f2e8d34. Explicit owner confirmation through `/rune-implement`; recording preflight returned `recordable`. The owner accepts the dry-run sheet format as the instrument for hand-read.

2026-10-13: re-confirmed 2.7 — was accepted (no revision); accepted at b6afeb193255ff875a53e0e9254d68942c3f5730. Explicit owner confirmation through `/rune-implement`; recording preflight returned `recordable`. Previous legacy mark: verified by Codex at the owner's explicit request, 2026-10-13, after the F1–F6 fixes in the working tree.

— measure z-ai/glm-5.3 (reasoning effort low) as the ai-review finder with the two-stage finder, under the finder-model-swap gates including a live PR probe; carries the 2026-10-11 screening results

2026-10-11: owner decision — the screening result justifies a new change (this one), which qualifies decision 5.7 of `finder-verifier-frozen-sonnet` ("no further model swap now"). Screening results: `glm-screening-results.md`; raw artifacts in `screening/` (uncommitted; they contain absolute local paths — inspect before committing).

2026-10-11: owner decision (scope) — the change **includes merging the two-stage finder** (`feat/finder-verification` commits `802a1e0`, `15b3f71`; finder only, **without the verifier**) and switching the finder's reasoning from `{enabled: false}` to `effort: low`. **Success restores AI review:** if glm-5.3 passes the `finder-model-swap` gates, including the live PR probe, this change removes the `false &&` line from `.github/workflows/review.yml` (R11, 2026-10-04, `:23-29`: "the change that deploys a finder which passes those gates removes the `false &&` line"). A failure leaves AI review disabled and the two-stage finder unmerged unless the plan says otherwise.

2026-10-11: owner decisions on `research.md` § Open Questions (binding inputs for the pre-registration):

1. **Restoration gate:** G1–G5. Hand-read: at most **ceil(0.05 × N)** rejected findings **per valid run**; unresolved = rejected; every finding is classified, with no deduplication across runs. **D2 in every valid #269 run.** Add **two #247 runs**. **G2 stays strict** (5/5 empty). **G5 executes the actual GitHub `AI Code Review` workflow**; this change updates the `review.yml` comment to reference this sealed gate.
2. **Reasoning:** `{enabled: true, effort: "low"}` on every finder request (loop, finalization, repair). Reasoning text stays out of parsing, transcripts, logs and published artifacts. The 16,384 output-token limit and the 300 s timeout stay; truncation fails the attempt. No claim of a separate reasoning-token cap that has not been verified.
3. **Cost gate:** the per-attempt G4 ceiling is replaced by **≤ $10/month**, a size-weighted projection that includes finder, judge, retries and implementation review.
4. **Routing:** option A — port the finder-routing commits (`e5be9ff`, `b3a4a38`) and replace Novita with `z-ai,fireworks,together`; fallback only within that list; routing stays finder-specific. The owner deletes `vars.OPENROUTER_REVIEW_MODEL` before G5; the actual model and providers are verified in telemetry.
5. **Budget and artifacts:** **$4.00 total**, including **$0.50 reserved for G5**; pause at **$3.00** of measurement spend for reconciliation; budget exhaustion = `INCOMPLETE`. Raw `screening/` stays out of git; the summary, the reproducible configuration and sanitized metadata are committed.

2026-10-11: owner decisions during `/rune-plan`:

6. **Valid run:** a run in which the finder succeeds but the judge fails (red review) is an **invalid run** — it counts in G1 and is not hand-read.
7. **Budget amended:** **$4.50 total** — measurement pauses for reconciliation at **$3.00** and stops hard at **$3.50**; **G5 reserve $1.00** (the G5 estimate for this PR is $0.45–0.95). This supersedes the $4.00 / $0.50 split in decision 5.

2026-10-11: owner clarification during `/rune-plan-review`, F1 — decision 6 means a **technical judge failure (no completed verdict)**. A completed `verdict: "failed"` does not itself invalidate a run; all other validity and hand-read criteria still apply. The plan and runner test requirements distinguish both cases.

2026-10-11: owner decision during `/rune-plan-review`, F2 — monthly cost is **provisional before G5**. Once m247 and m269 are final, early rejection uses only **53 × m247 + 8 × m269 + 13 × ($0.199620 / 2) > $10.00**; equality does not reject. The earlier A6 stop after #247 stays unchanged. Otherwise final cost is decided after G5 with the agreed update of I; a skipped impl-review keeps I = $0.199620. The spend budget and other gates still apply.

2026-10-11: owner decision during `/rune-plan-review`, F3 — the manifest explicitly includes G3's `packages/code-reviewer/evals/review-result.schema.json` and `.github/ai-review-rules.md`. Their hashes are checked before every paid step, and hermetic tests must show that changing either file blocks preflight and spending.

2026-10-11: owner decision during `/rune-plan-review`, F4 — File declarations use full repo-relative paths, enumerated files instead of brace notation, and the results directory instead of a glob. All 14 Manual Verification criteria now declare explicit surfaces. Criterion wording and Progress IDs, titles and marks are preserved; acceptance-state resolves all 14 surfaces, with all Manual rows still pending.

2026-10-11: owner decision during `/rune-plan-review`, F5 — add mixed-condition test requirements for step, finalization and repair responses containing `<think>REASONING-SENTINEL</think>` with `finishReason: "length"`. The attempt fails without retry; the sentinel must be absent from stderr and step summary regardless of guard ordering.

2026-10-13: owner decision — G3 rows include production's single retry, prove the reasoning shape by wire capture of each finder request's `reasoning` key, and fail on a request without a provider-reported accepted model; plan.md Phase 3 § 2 (G3 rows) Contract.

2026-10-14: owner decision — a confirmed OpenRouter HTTP 401/402 (the CLI's typed `api error: status=<n>` line; for G3, the finder error's typed status) stops the series INCOMPLETE (auth/credit), is not a G2, #247 or G1 sample, and resumes only under a dated amendment; auth/credit text without a status is only suspected (invalid, unsettled); a grader 401/402 stays a grader error; plan.md § Definitions "auth/credit stop", Phase 3 §1 runner contract, Phase 4 Stops, Testing Strategy.

2026-10-14: reopened 2.7 — was accepted at b6afeb193255ff875a53e0e9254d68942c3f5730; changed: packages/code-reviewer/src/cli.ts

2026-10-14: owner decision — on a provider error (an `APICallError` with a status in the chain), the step summary shows only `<error name>: api error: status=<n>`; the provider message stays on stderr. Found by the stubbed 402 re-check of Manual 2.7 (the body sentinel reached the summary); plan.md Phase 2 § 6 Contract, 2.7 evidence.

2026-10-14: owner decision — any other SDK error in the failure's chain (an `AISDKError` without a status) puts only `<error name>: SDK error (message only in the job log)` in the step summary, because `TypeValidationError` and `JSONParseError` quote model output in their messages (ai@7.0.52); non-SDK errors, `FinderOutputError` included, keep their message; stderr unchanged. Three MODEL-SENTINEL tests in `cli.test.ts` failed before the fix; plan.md Phase 2 § 6 Contract.

2026-10-14: re-confirmed 2.7 — was reopened (last accepted at b6afeb193255ff875a53e0e9254d68942c3f5730); accepted at 20a312796062d07948ea0af8d9b78789b2105d19. Explicit owner confirmation through `/rune-implement` after the stubbed HTTP 402 re-check (conditions a–c met at that revision); recording preflight returned `recordable`.

2026-10-14: confirmed 1.8 — accepted at 4432a70cb499ffd1e9e455bcd79d78dfeac55bd2 (`screening-config.md` unchanged since 9782f38). Explicit owner confirmation after an agent check of the surface: no key, token or absolute path in the file; all 16 listed sha256 match the raw artifacts in `~/.cache/finder-glm-5-3/screening/`; the three-line delta matches `9c85aa2:packages/code-reviewer/evals/finder-provider.ts` at lines 31, 134 and 487; the three wrappers differ only in import and log path; the wire-log response counts, costs and reasoning tokens match the per-pass totals.

2026-10-14: owner decision (before the Phase 4 seal) — the CLI step line prints `kind=<step|finalization|repair>` before `provider=`, and the runner reads it into the record of a run without `review.json`. Reason: a failed run uploads no `review.json`, and the finalization and the repair otherwise print exactly like a loop step with no tool call. The gate's verdicts do not depend on it. plan.md Phase 2 § 6 Contract, Phase 3 § 1 runner contract, 2.7 evidence.

2026-10-14: reopened 2.7 — was accepted at 20a312796062d07948ea0af8d9b78789b2105d19; changed: packages/code-reviewer/src/cli.ts

2026-10-14: re-confirmed 2.7 — was reopened (last accepted at 20a312796062d07948ea0af8d9b78789b2105d19); accepted at d04c66fa6ea251f2dc0d6fe558e0eee247a5fd5b. Explicit owner confirmation after reading the configuration line and both step lines (`kind=step`, `kind=finalization`) from a stubbed real-CLI dry run at that revision; the stub's loop-step text was absent from stderr and stdout, and the 7 REASONING-SENTINEL tests passed. Recording preflight returned `recordable`.

2026-10-14: re-confirmed 2.7 — was accepted at d04c66fa6ea251f2dc0d6fe558e0eee247a5fd5b; accepted at eb5ea063faa79344efd73c6badf02f0088a332b3. Explicit owner confirmation after the stubbed real-CLI re-check of eb5ea06 (HTTP 402 summary, configuration and step lines byte-identical; a judge `AI_NoObjectGeneratedError` shows only its class in the step summary); recording preflight returned `recordable`. eb5ea06 changed packages/code-reviewer/src/cli.ts but left 2.7 checked instead of reopening it; this re-confirmation replaces that mark. Known limit recorded with the 2.7 evidence: a quoting SDK error (TypeValidationError, JSONParseError) is covered only by the MODEL-SENTINEL unit tests.

2026-10-14: owner decision (before the Phase 4 seal) — a failed implementation review shows in `comment.md` only what the step summary would: `<error name>: api error: status=<n> (provider message only in the job log)` for an `APICallError` with a status, `<error name>: SDK error (message only in the job log)` for any other SDK error, the message for a non-SDK error. One function, `publicErrorSummary` in `retry.ts` (with `hasSdkError` and `errorLabel`, moved from `cli.ts`), now serves both surfaces. The failed block carries it as `publicError`; `error` keeps the full message for the stderr `impl review: FAILED` line and `review.json`. Before the fix, the new end-to-end test showed a stubbed HTTP 402 on the impl-review request putting the provider body (`BODY-SENTINEL`) into `comment.md`. Landed before the seal because the seal covers every `packages/code-reviewer/src/**/*.ts`; plan.md Phase 2 § 6 Contract.

2026-10-14: reopened 2.7 — was accepted at eb5ea063faa79344efd73c6badf02f0088a332b3; changed: packages/code-reviewer/src/cli.ts

2026-10-14: re-confirmed 2.7 — was reopened (last accepted at eb5ea063faa79344efd73c6badf02f0088a332b3); accepted at f2ccfddd25b5483cec2ea02237adaf2620eef86d. Explicit owner confirmation after the stubbed real-CLI re-check of f2ccfdd against eb5ea06 (five cases: stderr, step summary and stdout byte-identical; `comment.md` differs only in the failed impl-review line, which no longer carries the provider body); recording preflight returned `recordable`.

2026-10-14: pre-registration approved by the owner as written (A1–A8 and the five plan- and tooling-chosen terms) and sealed — sha256 of § Pre-registration `1a34e2efa74771898d986c74f060fabf9b3d272816fd85ac10877aad2ea802f3`, taken 2026-10-14T20:16:36Z; GitHub push time 2026-10-14T20:17:37Z; annotated tag `finder-glm-5-3/seal`. Record: gate.md § Pre-registration seal. The seal authorizes no spending: Phase 5 waits for the owner's authorization after the free preflight.

2026-10-14: confirmed 4.4 and 4.5 — accepted at 593407e04569e9af5535a0a6acec932dff0f90e7. Explicit owner confirmation through `/rune-implement`: 4.4, the pre-registration (A1–A8 and the five plan- and tooling-chosen terms) was approved as written before the hash was taken; 4.5, the seal does not by itself authorize Phase 5 (gate.md § Pre-registration §10). Recording preflight returned `recordable` for both. Both rows declare the whole `gate.md` as their surface, so the Phase 5 write to § Results will make them stale; the approval itself stays recorded in gate.md § Pre-registration seal.

2026-10-14: reopened 4.4 — was accepted at 593407e04569e9af5535a0a6acec932dff0f90e7; changed: context/changes/finder-glm-5-3/gate.md

2026-10-14: reopened 4.5 — was accepted at 593407e04569e9af5535a0a6acec932dff0f90e7; changed: context/changes/finder-glm-5-3/gate.md

2026-10-14: owner decision — Amendment 1 (operator checks before paid steps) lands the Phase 4 review triage F1–F3: an operator env/.env check before `preflight` and every paid step, default paths only, and no stale G3 export. Renamed from `A1` before hashing; sha256 `2ee697fbd063324ced4a2336cc538243b8b1ec1ec887f0cbd335116c30739787`, taken 2026-10-14T20:43:19Z; pushed before T0. No sealed file changed, so the manifest pin stands. Record: gate.md § Amendments.

2026-10-14: re-confirmed 4.4 — was reopened (last accepted at 593407e04569e9af5535a0a6acec932dff0f90e7); accepted at 36156104d39257b16422547b1bbb82aef8e27752. Explicit owner confirmation through `/rune-implement` after Amendment 1 and its push record landed; the sha256 of § Pre-registration is unchanged (`1a34e2ef…802f3`). Recording preflight returned `recordable`.

2026-10-14: re-confirmed 4.5 — was reopened (last accepted at 593407e04569e9af5535a0a6acec932dff0f90e7); accepted at 36156104d39257b16422547b1bbb82aef8e27752. Explicit owner confirmation: neither the seal nor Amendment 1 authorizes spending. Recording preflight returned `recordable`.

2026-10-14: owner authorized the paid series as sealed, after reading the free preflight (T0 $57.603079 at 2026-10-14T20:47:59Z; Z.AI and Fireworks status 0, Together status −2), starting with G2-01. Before it, the owner set a credit limit on the series key (`sk-or-v1-168...eeb`) at $61.103079; verified 2026-10-14T20:54:44Z through `GET /api/v1/key`: `limit_remaining` $3.50, `limit_reset` null. Manual 5.5 is recorded once `gate/series.jsonl` is committed.

2026-10-14: owner confirmed the G2-01 probe (valid run, 0 findings; both finder requests Z.AI, reported model `z-ai/glm-5.3`, reported reasoning tokens 14 and 0, reported cost; $0.022154 settled from telemetry) and asked to run the series in the sealed order, stopping only at sealed stops. Recorded in the ledger as `continue --for probe`. Manual 5.7 is recorded once `gate/series.jsonl` and `gate/results/` are committed.

2026-10-15: reopened 4.4 — was accepted at 36156104d39257b16422547b1bbb82aef8e27752; changed: context/changes/finder-glm-5-3/gate.md (Phase 5 § Results: automatic outcome and run notes; the sealed sections are byte-identical, sha256 unchanged)

2026-10-15: reopened 4.5 — was accepted at 36156104d39257b16422547b1bbb82aef8e27752; changed: context/changes/finder-glm-5-3/gate.md (Phase 5 § Results)

2026-10-15: owner decision — the lint-staged `prettier --write` reformatted 11 `review.json` copies and `g3-rows.json` in 87f1318, so their bytes no longer matched the sha256 the gate ledger records. The original bytes are restored and the recorded hashes are never re-pinned. `.prettierignore` gets exactly the two paths of this change (`gate/results/`, `gate/g3-rows.json`) with a comment, and AGENTS.md describes the exception as protection of measurement artifacts that require identical bytes. A generic `context/changes/*/gate/…` glob was rejected: it would exempt future files without assessing them.

2026-10-15: confirmed 5.5 and 5.7 — accepted at aa33e97015600ac3455ccf8e0274fa66d2c9dc0d. Explicit owner confirmation through `/rune-implement`: 5.5, the owner authorized the paid series after reading the free preflight, with the key limit at T0 + $3.50; 5.7, the owner confirmed the G2-01 probe before G2-02 (`continue --for probe`, 2026-10-14T21:00:11Z). Recording preflight returned `recordable` for both.

2026-10-15: re-confirmed 4.4 — was reopened (last accepted at 36156104d39257b16422547b1bbb82aef8e27752); accepted at aa33e97015600ac3455ccf8e0274fa66d2c9dc0d. The sealed pre-registration (sha256 `1a34e2ef…802f3`) is unchanged. Recording preflight returned `recordable`.

2026-10-15: re-confirmed 4.5 — was reopened (last accepted at 36156104d39257b16422547b1bbb82aef8e27752); accepted at aa33e97015600ac3455ccf8e0274fa66d2c9dc0d. Recording preflight returned `recordable`.

2026-10-15: reopened 4.4 — was accepted at aa33e97015600ac3455ccf8e0274fa66d2c9dc0d; changed: context/changes/finder-glm-5-3/gate.md (Phase 5 review F1: unsealed run-note median and finish reasons corrected; sealed sections unchanged).

2026-10-15: reopened 4.5 — was accepted at aa33e97015600ac3455ccf8e0274fa66d2c9dc0d; changed: context/changes/finder-glm-5-3/gate.md (Phase 5 review F1: unsealed run notes).

2026-10-15: reopened 5.5 — was accepted at aa33e97015600ac3455ccf8e0274fa66d2c9dc0d; changed: context/changes/finder-glm-5-3/gate.md (Phase 5 review F1: unsealed run notes). The historical authorization remains recorded; this row's whole-file surface requires re-confirmation after the fix is committed.

2026-10-15: owner decision (Phase 6) — the full hand-read: the owner classifies all 60 published findings of the valid #247 and #269 runs (12 + 48), starting with pr269-02's four findings. pr269-02 can establish failure early, but sealed §8 still requires classifying every finding; "blank counts as rejected" defines how an unresolved finding is treated and does not waive that requirement. No further paid runs.

2026-10-15: owner decision (Phase 6) — the hand-read sheets are Prettier-formatted right after `sheet`, before any verdict is filled, so the commit hook changes nothing; `.prettierignore` is not extended. The ledger's `sheet` hashes (pr247 `5825aa35…f33ca4`, pr269 `9d6b3d82…681393`, 2026-10-15T18:24:48Z) describe the generated bytes before formatting and verdicts. Checked before formatting: no code reads them; `resolve` parses verdicts regardless of layout and checks only the `review.json` hashes (sealed §8 step 3); blank formatted copies resolved all 60 rows with no missing, extra or duplicate ID. plan.md Phase 6 § 1 Contract.

2026-10-16: reopened 5.7 — was accepted at aa33e97015600ac3455ccf8e0274fa66d2c9dc0d; changed: context/changes/finder-glm-5-3/gate/series.jsonl (Phase 6: `glm-gate-sheet.mjs sheet` appended its two `sheet` lines; no record line changed, `gate/results` unchanged).

2026-10-16: confirmed 6.3 and 6.4 — accepted at c07b12a49ae556bf62f13df29a1b5c7498f5540a. Explicit owner confirmation through `/rune-implement`: 6.3, all 60 findings classified, and the sheets hold the owner's decisions; 6.4, pr269-03#F6 approved as the only D2 match. Recording preflights returned `recordable`.

2026-10-16: re-confirmed 4.4 — was reopened (last accepted at aa33e97015600ac3455ccf8e0274fa66d2c9dc0d); accepted at c07b12a49ae556bf62f13df29a1b5c7498f5540a. The owner upholds the pre-registration approval, A1–A8 included; the sealed content is unchanged (sha256 `1a34e2ef…802f3`, rechecked 2026-10-16). Recording preflight returned `recordable`.

2026-10-16: re-confirmed 4.5 — was reopened (last accepted at aa33e97015600ac3455ccf8e0274fa66d2c9dc0d); accepted at c07b12a49ae556bf62f13df29a1b5c7498f5540a. The owner confirms that the seal alone does not authorize the paid Phase 5. Recording preflight returned `recordable`.

2026-10-16: re-confirmed 5.5 — was reopened (last accepted at aa33e97015600ac3455ccf8e0274fa66d2c9dc0d); accepted at c07b12a49ae556bf62f13df29a1b5c7498f5540a. The owner upholds the historical authorization of the executed series; it is not consent to any new paid run. Recording preflight returned `recordable`.

2026-10-16: re-confirmed 5.7 — was reopened (last accepted at aa33e97015600ac3455ccf8e0274fa66d2c9dc0d); accepted at c07b12a49ae556bf62f13df29a1b5c7498f5540a. The owner upholds the G2-01 probe confirmation; the appended `sheet` lines did not change the probe's evidence. Recording preflight returned `recordable`.

2026-10-16: owner decision (6.5) — outcome: `NOT ADMITTED (hand-read)` for glm-5.3 at `effort: low` (gate.md § Results, automatic outcome 2026-10-16T16:04:53Z): eight of the nine valid #269 runs have no D2 match. Per plan Phase 6 § 2, Phase 7 does not run, AI review stays disabled, PR #292 is closed unmerged (on the owner's confirmation; the branch is kept) and the next step is `/rune-archive` with `outcome: not admitted`. This sealed gate is not reopened for another effort. Follow-up: a **new change** measures glm-5.3 at `effort: high` under its own pre-registration and seal, branched from `feat/finder-glm-5-3` (the two-stage finder and the gate tooling are not on master), starting with a fixture screening at `high` (reasoning tokens, latency against the 300 s timeout, cost per row against the cost gate's headroom of about 1.87× the measured `low` runs) before any series is sealed.

2026-10-16: confirmed 6.5 — accepted at 72ee9c4dbf441ed6239541be95d861f56ebaa604. Explicit owner confirmation through `/rune-implement` of the outcome and next decision recorded above (same date); recording preflight returned `recordable`.
