# Verification — Finder Tool-Loop Evals + Model Decision

Running record of evidence and deviations, phase by phase.

## Phase 1 — Fixture tree + source wiring

Commit `edf3982` (19 files, +1394/−107). Follow-up fixes from `reviews/impl-review-phase-1.md`
land in the Phase 2 commit.

### Evidence

| Criterion | Result                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------- |
| 1.1       | `promptfoo validate config` → "Configuration is valid."                                            |
| 1.2       | `tsc --noEmit` exit 0, fixture tree present                                                        |
| 1.3       | `eslint evals/finder-provider.ts` exit 0                                                           |
| 1.4       | 300 tests pass (288 before this phase); 317 after the impl-review fixes                            |
| 1.5       | Paid smoke, eval `eval-Flr-2026-08-11T12:55:06`, sonnet-5 on cross-hunk                            |
| 1.6       | Both fixture trees served through the shipped assembly on this Windows checkout                    |
| 1.7       | **PENDING** — data confirms the tool-enabled prompt was persisted; visual viewer check outstanding |

**1.5 detail:** `toolCalls: 2`, `steps: 3` (budget 5), target delivered twice, **zero refusals**,
finder cost **$0.042374**, and the review correctly identified the `JPEG_QUALITY` contract
violation. The non-zero cost is the proof that enabling OpenRouter usage accounting was required —
see Deviation 2.

**1.6 detail:** cross-hunk served 2,910 chars and clean-change 653 chars; an out-of-diff control
path was refused in both trees. The cross-hunk case's load-bearing property was asserted directly:
`JPEG_QUALITY` and "single-source" are present in the served file and **absent from the diff and
its context**, so a model that never fetches cannot link the hardcoded `0.5` to the contract.

### Impl-review follow-ups (`reviews/impl-review-phase-1.md`)

- **F2 fixed** — `resolveFixtureRoot` now confines the root to a strict descendant of
  `evals/fixtures`, checked on the **realpath** of both sides (a lexical check would miss a
  symlinked root, which `createDiffScopedSource` deliberately tolerates). The fixtures directory
  itself and non-existent roots are rejected. 8 hermetic cases in `evals/finder-provider.test.ts`.
- **F4 fixed** — delivery is now reported by `createDiffScopedSource` through an optional
  `onResult({ path, delivered })`, from the one place that knows the outcome exactly; the string
  sniffing in `instrumentSource` is deleted. The reported collision — content whose first line is
  the quoted requested path — is a regression test.
- **F1 accepted**, see Deviation 1 below. **F3 acknowledged** — a status, not a defect.

Re-verified after the fixes: 317 tests, lint and typecheck clean, config valid, and the fixture
delivery script green including the three `fixtureRoot` escape attempts.

### Deviations from the plan

**1. `createDiffScopedSourceForDiff`, not `createFsDiffScopedSource({ diff, root })`** (Phase 1 §4).

The planned signature is unimplementable. `cli.ts` builds its source from an injected `CliIo`
(`io.readFile` / `io.realpath` / `io.isRegularFile`), and `cli.test.ts` pins that seam — a helper
that reached for `node:fs` itself could not be called from the CLI without breaking its hermetic
tests. What actually duplicated between CI and the evals was the _assembly_ (parse the allowlist →
guard the empty case → wire containment), not the three-line fs binding, so the shared helper takes
the primitives as parameters and `source-provider.ts` stays pure.

Accepted knowingly, with the alternative (a Node-backed wrapper plus a source-factory injection
seam in `cli.ts`) considered and declined at plan-review triage and again at impl-review F1. The
residual cost is real and worth restating: a future hardening of the _fs adapter itself_ must be
applied in both `review-pr.ts` and `evals/finder-provider.ts`. Hardening of the allowlist
derivation and containment — the security-relevant part — is shared.

**2. OpenRouter usage accounting enabled in `reviewer.ts`** — not in the plan at all.

`describeFinderStep`'s new `cost` field is permanently `undefined` without it: usage accounting is
opt-in, and the installed provider only sends it when the model carries `usage: { include: true }`
(its request body reads `usage: this.settings.usage`). Left alone, every eval row would have
reported cost 0 — the exact blind spot #119 shipped with, and Phase 3's criterion 3.3 could never
have passed. This is the one change in Phase 1 that alters production request shape; it is free
(response fields, not tokens) and additive, and it also makes CI's `finderTelemetry` cost-aware.

**3. The cross-hunk case was registered in `promptfooconfig.yaml` during Phase 1**, though the plan
assigns config wiring to Phase 2 §3. Criterion 1.5 is a smoke run _on that case_ and cannot execute
otherwise. Phase 2 still owns the provider swap, the clean case's assertions, and moving
`scoreIssueRecall` off `defaultTest`.

**4. The planted flaw shape was changed from the phase-3 probe.** The probe modified an existing
call site, so its diff contained `- ... JPEG_QUALITY ...` — the constant's name was visible in the
hunk, and a model could infer the contract without fetching. The fixture instead _adds_ a call site
(`flattenForUpload`) in a region whose context mentions no constant, verified by assertion: the
hunk and its context contain zero occurrences of `JPEG_QUALITY`.
