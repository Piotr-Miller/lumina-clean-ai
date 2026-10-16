<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: finder-glm-5-3 Implementation Plan

- **Plan**: context/changes/finder-glm-5-3/plan.md
- **Scope**: Phase 4 (phases 1–7)
- **Session**: fresh
- **Base**: 895f92e5 (parent of the first Phase 4 commit, f231ff0)
- **Head**: 593407e04569e9af5535a0a6acec932dff0f90e7
- **Worktree**: included(context/changes/finder-glm-5-3/plan.md, context/changes/finder-glm-5-3/change.md) — bookkeeping only; excluded: temp_steps.md (outside the change)
- **Checks ran at**: 593407e04569e9af5535a0a6acec932dff0f90e7 (HEAD)
- **Manual acceptance**: 2 of 2 confirmed
- **Date**: 2026-10-14
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — A whitespace-only forbidden variable passes the runner's check, against sealed §1

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/glm-gate-core.mjs:51-52
- **Detail**: Sealed `gate.md` §1 says none of the ten variables "may be set, in the shell or in `packages/code-reviewer/.env`" and that "the runner refuses every step, `preflight` included, while one is set". `forbiddenEnvSet` only counts values that are non-empty after `trim()`. A value of `" "` is therefore admitted. The CLI does not trim the value:
  - `src/config.ts:222-223` takes `" "` as the model through `||`, so the configuration line no longer matches;
  - `src/cli.ts:85-89` and `:285-289` turn `Number(" ") = 0` into a throw and exit 1.

  Either way the run is recorded as an invalid sample. At G2-01 that is a decisive `FAIL (G2)`; in G1 it uses up the one allowed invalid run. The cause is an operator configuration slip, which the sealed text says cannot happen. An empty string `""` is harmless, because every reader falls back through `||`. Separately, `preflight --manifest-only` returns before the environment check (`glm-gate.mjs:333-345`), although §1 says "preflight included". That path is free and measures nothing.

- **Fix A ⭐ Recommended**: Before Phase 5, add a dated amendment that narrows §1's claim to what the code does: the runner refuses a non-whitespace value. Make an operator check part of the protocol: before `preflight` and before each paid step, `env | grep -E '^(OPENROUTER_(REVIEW_MODEL|FINDER_PROVIDERS|MODEL|JUDGE_MODEL|IMPL_REVIEW_MODEL|REQUIRE_PARAMETERS)|REVIEW_(FINDER_MAX_STEPS|FINDER_TIMEOUT_MS|JUDGE_TIMEOUT_MS|IMPL_REVIEW_TIMEOUT_MS))='` prints nothing, and `.env` holds none of them.
  - Strength: No sealed file changes, so the manifest is not re-pinned and G5's `preflight --manifest-only` compares against the original seal. No measurement exists yet, so the amendment carries no hindsight.
  - Tradeoff: Enforcement rests on the operator, not the runner.
  - Confidence: MED — the gap needs a deliberate `export X=" "`, which the current shell and `.env` do not have; the grep is a one-line check.
  - Blind spot: CI and G5 do not use the runner, so this concerns the local series only.
- **Fix B**: Change `forbiddenEnvSet` to count any defined value (`env[name] !== undefined`), add a test, and re-pin the manifest under a dated amendment pushed before Phase 5.
  - Strength: The runner enforces exactly what the sealed text says.
  - Tradeoff: A sealed file changes, so the manifest hash changes. The amendment must re-pin it, and G5's manifest check must name the amended manifest.
  - Confidence: HIGH — a one-line change in a pure function that is already tested.
  - Blind spot: A defined but empty variable would now refuse every step. That is stricter than today, which may or may not be wanted.
- **Decision**: FIXED — Fix A (gate.md § Amendments, A1 point 1; sha256 pending until the final text is approved, then pushed before T0); siblings: scripts/glm-gate.mjs:333-345 `preflight --manifest-only` covered by the same amendment text, the `g3` / `g3 --regrade` admission uses the same `forbiddenEnvSet` and is covered, no other env guard trims (grep `trim()` in glm-gate.mjs, glm-gate-core.mjs, evals/finder-provider.ts); reopened: 4.4, 4.5

### F2 — Path-override flags on paid steps can bypass the seal, order and T0

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/glm-gate.mjs:267-285
- **Detail**: `contextFor` accepts `--manifest`, `--series`, `--results`, `--g3-rows` and `--gate` on every subcommand, paid `run` and `g3` included. With `--manifest <other>`, the runner checks against a different manifest. With `--series <new>`, the earlier ledger, the order, id reuse and T0 disappear. Sealed §5/§6 present these checks as unconditional ("the runner refuses …"). Getting around them takes a deliberate flag, so this is a gap in the stated guarantees, not a likely accident. `--inputs` and `--cache` are harmless, because inputs are still checked by sha256.
- **Fix**: In the same Phase 5 amendment as F1, add one line: paid steps (`preflight`, `run`, `g3`, `reconcile`, `continue`, `outcome`) run without `--manifest`, `--series`, `--results`, `--g3-rows` or `--gate`. Every `started` line already shows its paths, so a violation is visible in the ledger.
- **Decision**: FIXED — Fix now (gate.md § Amendments, A1 point 2). Correction: the Fix text above says every `started` line shows its paths; it does not (`glm-gate.mjs:445-451`, `:607-613`), so the amendment states that no line records them. Siblings: `scripts/glm-gate-sheet.mjs:241-270` (`--series`, `--results`, `--out-dir`, `--sheets-dir` on `sheet` / `resolve`) fixed in the same point; `--inputs` / `--cache` / `GLM_GATE_INPUTS` / `GLM_GATE_CACHE` n/a (inputs are checked by sha256); `scripts/promptfoo-gate-rows.mjs` n/a (no path-override flags); reopened: none (4.4 and 4.5 already reopened under F1)

### F3 — A second G3 step can re-read a stale export

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/glm-gate.mjs:604-648
- **Detail**: `g3` writes to a fixed `<cache>/g3/g3.export.json`, never deletes it first, and never uses the promptfoo exit code (recorded only, `:658`). If promptfoo ends without writing an export, any earlier export is read back and recorded as this step's result. Today no `g3/` directory exists in the cache, so the first G3 is safe. The only path to a second non-regrade G3 is a resumption after a confirmed auth/credit stop, and that already needs a dated amendment.
- **Fix**: Any amendment that authorizes an auth/credit resumption before a repeated G3 must require moving `<cache>/g3/g3.export.json` aside first. No code change before Phase 5.
- **Decision**: FIXED — Fix now (gate.md § Amendments, A1 point 3, which also covers `g3-regrade.export.json`). Siblings: the `g3 --regrade` export at the fixed `<cache>/g3/g3-regrade.export.json` is fixed in the same point; `run`'s `review.json` n/a (each run writes to its own `<cache>/runs/<stepId>/review-out/`, and a paid id is never reused, `glm-gate.mjs:440-441`); reopened: none (4.4 and 4.5 already reopened under F1)

## Review Notes

- **Bookkeeping in diff**: context/changes/finder-glm-5-3/change.md, context/changes/finder-glm-5-3/plan.md (committed and in the worktree).
- **Seal verified independently on 2026-10-14**:
  - § Pre-registration (355 lines) hashes to `1a34e2ef…ea802f3`, both from `git show f231ff0:` and from the worktree.
  - `gate-manifest.json` hashes to `12989509…9272ee` (5,941 B).
  - `git ls-remote` shows `refs/tags/finder-glm-5-3/seal` (tag object `4b38d4f8…`) peeled to `f231ff0`, and the branch head at `593407e`.
  - The GitHub push time itself was not re-read; it is taken from gate.md § Pre-registration seal.
- **Automated**:
  - 4.1 `npx prettier --check gate.md gate-manifest.json` — exit 0.
  - 4.2 `node packages/code-reviewer/scripts/glm-gate.mjs preflight --manifest-only` — exit 0, `MANIFEST MATCHES: 40 sealed file(s) unchanged.`
  - 4.3 not run (paid) — artifact gate.md § Pre-registration seal checked; it records the seal commit, push time and tag, and the read-only `ls-remote` above agrees.
- **A1–A8 are verbatim:** the text in gate.md §11 is identical to plan.md's (diffed with blank lines ignored).
- **Sealed claims checked against the runner:** a sub-agent compared the concrete claims in § Pre-registration and § Run manifest with the sealed code; F1–F3 are its confirmed mismatches. Everything else matched, including:
  - the 40 = 19 + 7 + 14 file count;
  - the configuration line, model, routing and limits;
  - `classifyRun`, the gate rules, order, budget, P, settlement and reconcile;
  - refusals with exit 2 and the auth/credit stop with exit 5;
  - verdict order and the sheet/resolve evidence checks.
- **Smaller differences, below the finding bar:**
  - The no-artifact reason regexes scan the raw error message line too, not only metadata lines (`glm-gate-core.mjs:190-204`). That contradicts §2's "never from model text", but only affects reason labels, and it errs toward an unsettled run.
  - The `--amendment` ref is only checked for being non-empty.
  - Verdict rule 1 uses T rather than settled spend, which is stricter.
  - The 300 s finder budget applies per attempt.
  - A new non-`.ts` file under `src/` is not detected as a manifest mismatch.
  - Unsealed but read: `tsconfig.json` and the installed `node_modules`, which are not checked against `package-lock.json`. The plan's manifest list did not require either.
- **4.4 / 4.5 will go stale by design:** both declare the whole `gate.md` as their surface, so Phase 5's write to § Results will mark them `stale` (change.md's 2026-10-14 note says so). The approval's evidence is the sealed hash, not the file. A later review should report that staleness as expected, not reopen a sealed approval.
- **Lessons:** 35 of 38 entries in `context/foundation/lessons.md` apply to impl-review (an `Applies to` naming it, or no line). None bears directly on a documentation-only phase.
- **Mutation check skipped:** Phase 4 changed no code, and the change maps to no risk in `context/foundation/test-plan.md` § 2.
