# Finder verification — pre-registered gate

> Plan: `context/changes/finder-verification/plan.md`. Phase 0 writes this file, Phase 3 seals it, and Phases 4–6
> measure against it.
> Owner decisions it carries (all in `change.md`):
>
> - 2026-10-03: verifier design and budget;
> - 2026-10-04: R1–R13, and the planning answers (G3 per PR, the R4 majority rule, hand-read reuse, restoring
>   `ai-review`);
> - triage of three plan reviews (`reviews/plan-review.md`);
> - the Phase 0 correction of the neutrality rule for the fixture trees.
>
> Predecessor gate: `context/archive/2026-10-02-finder-model-swap/gate.md`.

## Inputs freeze

Taken **2026-10-04, before any verifier prompt existed** (Phase 0). At this commit, no file under `packages/`
contains `buildVerifierInstructions`, and no verifier code, schema or prompt exists anywhere. Every input below
was reproduced byte for byte on 2026-10-04 from the recipe given with it.

The diffs, rules files and worktrees are kept in a local scratch directory and are not committed; they can be
rebuilt from the recipes. **Any mismatch at measurement time stops the measurement.**

**Diff recipe** (as for the archived #269 runs):

```
git diff <base>...<head> -- . ':(exclude,glob)**/reviews/*.md' ':(exclude,glob)**/results/*.json' \
  ':(exclude,glob)**/ground-truth/*' ':(exclude,glob)**/*.md' ':(exclude,glob)**/*.jsonl'
```

**Rules recipe:** `git show <head>:.github/ai-review-rules.md`. **Source root:** a clean detached worktree at
`<head>`.

### #269 (seen; measured in `finder-model-swap`)

- **Base** `3d0adc1b4910c31973c6ac98a7ce776fcb68d878`; **head** `fca2778742ec0bc02a84f42b23bf639fc32c7ad1`.
- **Diff:** 65,455 B, sha256 `1e4ec0882371989122f9e4254c93c4df1f51826a4f57dbfe04139175177e550f`.
- **Rules:** 2,929 B, sha256 `34d5fcacb550713a2bbf819b332191fc6626d52412168e0fe9b4ac3feb9cb48f`.
- **Source root:** worktree at `fca2778742ec0bc02a84f42b23bf639fc32c7ad1`; `HEAD` verified, clean.
- **Files (17):** nine PNGs under `context/archive/2026-08-31-cloud-quality-below-local/references/`
  (`01`–`09`, binary), plus the following:
  - `scripts/measure-hue-shares.py`
  - `scripts/s17/auto-values.ts`, `browser-stats.ts`, `contact-sheet.py`, `decode-inputs.py`, `desktop-stats.ts`,
    `harness.ts`
  - `scripts/spikes/bread-spike.ts`
- **Finder output exists:** yes, from `finder-serialization-outage` and `finder-model-swap`. This PR is the known
  case, and hand-read reuse (R10) applies to it.

### #240 (the unseen case)

- **Base** `035f7788409f2c60975544badf1f699ec00b119c`; **head** `54d35575430f644876264397ac5c29b38db47f42`.
- **Diff:** 18,718 B, sha256 `4487c2b0416c4a014e75390e394ddcbdcd272ec09196cb879f9c7e814ded221e`.
- **Rules:** 2,929 B, sha256 `34d5fcacb550713a2bbf819b332191fc6626d52412168e0fe9b4ac3feb9cb48f`, identical to
  `fca2778`'s.
- **Source root:** worktree at `54d35575430f644876264397ac5c29b38db47f42`; `HEAD` verified, clean.
- **Files (8):**
  - `src/components/enhance/BeforeAfterSlider.tsx`
  - `src/components/enhance/EnhanceWorkspace.tsx`
  - `src/lib/engines/result-scaling.ts`
  - `src/lib/enhance-strings.ts`
  - `tests/e2e/chroma-postpass-on.spec.ts`
  - `tests/e2e/fixtures/night-rgb-small.jpg` (binary)
  - `tests/e2e/north-star-cloud-result.spec.ts`
  - `tests/result-scaling.test.ts`
- **Finder output exists:** **no.** During the outage CI sent three of #240's heads to `z-ai/glm-4.6`:
  - run `35658349725` at `77901e9`;
  - run `35659034769` at `31a99d8`;
  - run `35659916148` at `54d3557`, whose logged diff size equals the 18,718 B above.

  All three failed with `AI_NoObjectGeneratedError`, and none produced an artifact (checked 2026-10-04: 0
  artifacts each). The PR has no review and no review comments; its only issue comment is the Cloudflare
  deployment bot's. Under research §5's rule ("seen = any finder output exists anywhere"), #240 is
  **unseen**.

- **Human defect record:** none (no review file). Phase 3 §2 collects the owner's list.

### #247 (reserve; never run in this change)

- **Base** `d097949bf217ecafb3333f63e757af67cc7daf07`; **head** `dec09f8d77b2f1ee45073c194d6cd8239a7d35c7`.
- **Diff:** 10,838 B, sha256 `21973af35cc39f60488935583a85baf894a6c1a9b51069d16de86e701b5dc2e1`.
- **Rules:** 2,929 B, sha256 `34d5fcacb550713a2bbf819b332191fc6626d52412168e0fe9b4ac3feb9cb48f`.
- **Source root:** worktree at `dec09f8d77b2f1ee45073c194d6cd8239a7d35c7`; `HEAD` verified, clean. Its source is
  not read in this change.
- **Files (2):** `scripts/prod-fetch-results.py`, `scripts/prod-result-dimensions.py`.
- **Finder output exists:** **no.** Run `35909897958` at `dec09f8` failed with `AI_NoObjectGeneratedError` and
  produced no artifact. The PR has no comments and no reviews. #247 is **unseen**, and it replaces #240 only by
  an owner decision made before the seal.

### G2 fixture

`packages/code-reviewer/evals/fixtures/clean-change.diff`, sha256
`8b326f6db0622096194e79a12dab7500c35eb6af5a7ba16f6f194f15607108cd`, and its tree
`evals/fixtures/clean-change/`. Its last change is `e8ebb66` (2026-08-12); `git log` shows no later commit on
either path.

### Verifier-only fixture trees (plan-review F1)

These trees are committed in this freeze commit and read by the verifier only; the finder never sees them. Their
provenance, the lines that are not in a diff, and the check commands are in
`packages/code-reviewer/evals/fixtures/README-verifier-trees.md`.

| File (under `packages/code-reviewer/evals/fixtures/`) | Lines | sha256                                                             |
| ----------------------------------------------------- | ----- | ------------------------------------------------------------------ |
| `js-loop/src/users.js`                                | 9     | `5e6d2a1976e6a33d5c6b547c9e8da56074eea1e6f1742cbe372baedddb84148a` |
| `react-migration/src/components/MetricsPanel.jsx`     | 55    | `7dccd391bdf4546321fcaa11a08d79b37bcabcbcede055eb2add6c83521e1f73` |

- **`users.js`**: the whole post-image of the inline JS-loop diff. Nothing is authored.
- **`MetricsPanel.jsx`**: lines 1–4 and 10–55 are the post-image of `react-migration.diff`, byte for byte.
  Line 5 (`function formatValue(value, unit) {`) is forced by the second hunk header. Lines 6–9 are authored.
  **Neutrality** (owner, 2026-10-04, Phase 0 correction): the freely authored lines 6–9 contain no identifier
  involved in the flaws at 24, 25 or 39 and have no bearing on them. `MetricsPanel` calls `formatValue` at line
  45, which cannot be avoided and takes no part in the flaws.
- **Checks at the freeze:**
  - Post-image: 9 of 9 and 50 of 50 lines match, 0 mismatches.
  - Identifiers on lines 5–9 shared with lines 24, 25 and 39: none.
  - `sed -n 5,9p … | grep -cwE …`: `0`.

### Endpoints (public endpoint list, no paid call)

Read on 2026-10-04 at 11:19:25Z from `GET https://openrouter.ai/api/v1/models/<id>/endpoints`:

| Model                       | Slug (`only`/`order`) | `provider_name` | Price per M tokens (in / out) |
| --------------------------- | --------------------- | --------------- | ----------------------------- |
| `openai/gpt-6-luna`         | `openai`              | `OpenAI`        | $0.10 / $0.50                 |
| `anthropic/claude-sonnet-5` | `anthropic`           | `Anthropic`     | $2.00 / $10.00                |

Both slugs are listed, so no owner stop is needed. The prices equal the planning figures of 2026-10-03.

### Freeze commit and push time

- **Freeze commit:** `c3b2f1cf84299fda8821e816f095e42016ea4276`
  (`docs(finder-verification): freeze gate inputs, draft pre-registration (p0)`), on
  `origin/feat/finder-verification`.
- **GitHub push time: 2026-10-04T11:25:02Z.** Source:
  `GET /repos/Piotr-Miller/lumina-clean-ai/activity?ref=refs/heads/feat/finder-verification`, event `push`,
  `573ee33..c3b2f1c`, actor `Piotr-Miller`. `git ls-remote` showed `c3b2f1c` as the branch head.
- **No verifier prompt at the freeze:** `git grep -n buildVerifierInstructions c3b2f1c -- packages/` finds
  nothing (exit 1). No verifier code, schema or prompt existed in the working tree before this push.
- **Pre-commit reformat:** the hook (`prettier --write` on `*.json`) reformatted `backcheck-269-results.json`,
  changing whitespace only. Its parsed JSON equals the carried blob `2216bcb`; the committed blob is `0173c31`.
- **Rebase protection:** annotated tag **`finder-verification/freeze`** (tag object
  `4dcb1ccc72d46571a1b4d87736178c0e452494f8`) on `c3b2f1cf84299fda8821e816f095e42016ea4276`, pushed to `origin`
  on 2026-10-04 (impl-review phase 0, F2; plan-review 3rd run F3). `git ls-remote --tags origin
'finder-verification/*'` shows it peeled to `c3b2f1c`. Phase 8 §2 only confirms that it still exists.

## Pre-registration

**UNSEALED DRAFT.** Written on 2026-10-04 in Phase 0, before any verifier prompt or verifier code existed. Phase 3
filled in (2026-10-04, pre-seal) the prompt and module hashes, the measured excerpt figures, the recomputed budget
and the owner's #240 defect list (empty). The owner then approves the section, and it is sealed
(Phase 3 §4). The Results section, appended later, never edits this section. A protocol change after the seal
goes into `## Amendments` (§9).

### 1. Arms

**Two arms share one implementation and differ only in the verifier model id** (R1).

| Arm         | Verifier                    | Verifier endpoint | Expected `provider_name` |
| ----------- | --------------------------- | ----------------- | ------------------------ |
| **CONTROL** | `openai/gpt-6-luna`         | `openai`          | `OpenAI`                 |
| **MAIN**    | `anthropic/claude-sonnet-5` | `anthropic`       | `Anthropic`              |

- **Finder** in both arms: `openai/gpt-6-luna` @ `openai` (`OpenAI`), as in `finder-model-swap`.
- **Judge** in both arms: production's, unchanged (`anthropic/claude-sonnet-5`, unpinned, with no `reasoning`
  field). Its provider and reasoning are reported, not gated.
- **Order:** MAIN runs **only if CONTROL fails a quality gate** (§4), and is still subject to the budget rule
  (§7).
- **Not arms:** Jev / typesafe.ai (R12, option 4b) and `openai/gpt-6-sol` (option 4). Both stay in reserve and
  are not measured.
- **MAIN is sealed with CONTROL:** its model, routing, prompt and limits are sealed together with CONTROL's, so
  nothing about MAIN is tuned on #240 (R9). CONTROL's labels never change MAIN's prompt or configuration.
- **Hashes** (Phase 3, 2026-10-04; printed by `packages/code-reviewer/scripts/verifier-prompt-hash.mjs`,
  content hashes only, reproduced twice byte for byte):
  - `buildVerifierInstructions()` output (2,786 chars):
    `c27d78e65136f706920463f514a84cd92dc2e6b0e2cbd471001c0859362f6fc1`;
  - `buildVerifierPrompt` on the fixed sample — the first two raw findings of attempt 1 of `finder-model-swap`'s
    #269 series (`F1 scripts/s17/decode-inputs.py:144-151`, `F2 scripts/spikes/bread-spike.ts:178-182`), merged
    and numbered as the pipeline does, excerpts planned against `fca2778` (6 blocks, 13,665 chars):
    `9f1093c77bb749358d79d01a60831808c22636953d71e01bdbe9d8d05b6a2e9c`;
  - `src/excerpts.ts`: `8dfdda7ebeebafe6436793662b81d14997924fe4e3a94465469213ac6e336714`;
  - `src/verifier.ts`: `aa8bf887bd31e05534828aea7435bfa5fdc4f97331a56f8a2ed39a559fc25b42`;
  - `src/prompts.ts`: `a045da98d0c6038b5a45c9d7734741eef2a627641e59f34ab0bd5f0740470311`;
  - `EXCERPT_LIMITS` _(plan-chosen term (5))_: `headerMaxLines` 40, `longUnitLines` 80, `longUnitContext` 30,
    `snapIdentifiers` 2, `fallbackWindow` 25, `maxCitedSpan` 60, `callerSites` 2, `callerContext` 20,
    `crossFileIdentifiers` 2, `crossFileLines` 40, `perFindingLines` 220, `perFindingChars` 16,000,
    `perReviewChars` 60,000, `maxFindings` 25; sha256 of their JSON
    `757f349278913e43ae9d8e84466400ae28577419a45d7e3c70e92ba8313eb060`.
- **Measured verifier input per #269 attempt** (instructions + rendered prompt, the 10 attempts of
  `finder-model-swap`): median 23,428 chars, max 27,818, min 9,384 (`backcheck-269-policy.json`
  `summary.perAttempt`).

### 2. Request shape under test

- **Verifier:**
  - `reasoning: {enabled: false}` (R7: no reasoning on either arm);
  - `require_parameters: true`;
  - `only` / `order` taken from `OPENROUTER_VERIFIER_PROVIDERS`;
  - no `response_format`;
  - SDK retries off; production's single transient retry (`withOneRetry`);
  - timeout 120 s;
  - one tolerant format repair, re-validated against the strict schema.
- **Verifier output:** `{verdicts: [{id, verdict: "confirmed" | "refuted" | "unsupported", quote, reason}]}`.
  Every field is required and the verdict is a string enum. `quote` may be empty. There is no `refine` or
  `superRefine`. The verifier never sees the diff, and the ids are assigned by code.
- **Finder:** as in `finder-model-swap` §2: `reasoning: {enabled: false}`, `require_parameters: true`,
  `only`/`order` from `OPENROUTER_FINDER_PROVIDERS`, no `response_format`, step budget 5, timeout 300 s, SDK
  retries off.
- **Judge:** production's, byte-identical: code, prompt builders, schema and tests (R1).

### 3. Inputs

As frozen in `## Inputs freeze` above, unchanged.

- **Excerpt policy** (R6, without E5): `plan.md` Phase 1 §2, with the `EXCERPT_LIMITS` values in §1.
- **E2 unit grammar, as implemented** (`findTopLevelUnits`; aligned 2026-10-04, impl-review phase 1 F6):
  - **Python:** a column-0 `def` / `async def` / `class` that is not inside a triple-quoted string, ending at the
    last code line (not blank, not a comment) before the next column-0 statement. A column-0 line inside a
    triple-quoted string is string content, neither a statement nor a unit start. Decorators are not part of
    the unit.
  - **TS/JS/TSX/JSX/MJS:** a column-0 `[export ][default ][async ]function[*] name`,
    `[export ][default ]class name`, or `[export ](const|let) name[: Type] = [async ](…) =>` (also `name =>`,
    and a parameter list spanning lines). A unit ends at the first following column-0 closing line matching
    `^\}[)\];]*;?\s*$` (`}`, `};`, `});`); `}: Props) {` does not end one. A unit whose first line is complete
    (balanced braces ending in `}`, or no `{` and ending in `;`) is one line. A unit with no closing line ends at
    the last non-blank line before the next unit start. An arrow whose first line opens no block also ends at
    the last code line before the next column-0 statement (a line starting with a letter, `$`, `_` or `@`).
  - **Other file types:** no units.
  - The Phase 3 unit-span check still runs against this grammar, in both directions.
- **No source root** (R8; the unusable root added by the owner 2026-10-04, impl-review phase 1 F1; the narrowed
  rule below approved by the owner 2026-10-04 instead of the literal "every finding refused"): `--source-root`
  absent, the diff declares no post-change path, **or the root is unusable**: at least one finding cites a file of
  the diff and the reader refuses every such finding (root missing, unreadable, or not the PR's checkout).
  - Off-diff findings do not count: the allowlist refuses them by design, each stays
    `unverifiable: source-refused`, and `offDiffFindingPaths` reports them.
  - A readable root at the wrong commit is not caught by this rule; CI's checkout of the PR head and the gate's
    frozen source-root commit (`## Inputs freeze`) cover it.
  - CI (`--require-verification`): exit 1 after the finder, before any verifier call. Locally:
    `skipped-no-source` with `verification.detail` naming the refusal. In the gate runner, which always sets
    `requireVerification`, that abort is a measurement error (§5), never a model failure.
- **Policy backcheck on #269** (`backcheck-269-policy.mjs` → `backcheck-269-policy.json`, run 2026-10-04): the
  implemented `planExcerpts` with the limits in §1, run attempt by attempt on the 38 raw #269 findings at
  `fca2778` through the real reader, against `backcheck-269.py`'s evidence lines (ported verbatim). A row counts
  as served by its best contributing finding.
  - **Rows (20): 9 fully served** (D1, D4, D6, D7, D9, D13, D14, D15, D20), **8 partly** (D2, D3, D10, D11, D12,
    D16, D18, D19), **2 not served** (D8, D17), **1 with no line evidence** (D5: directory-level testing claim,
    `no-locator`). Research §7 projected **10 of 20**: the implemented policy serves **one row fewer**. Of the 9,
    **4** (D9, D13, D14, D20) need nothing outside the code; the other 5 also rest on non-line evidence (the PR
    file list, Pillow's source, an experiment).
  - **Why rows are partly or not served** (no grammar fault; see the unit-span check below): evidence in another
    file that no backticked identifier names (D3 `bread-spike.ts:233`, D18, D19 `harness.ts:43–51`); evidence
    outside every window the rules open (D2 `bread-spike.ts:189–198`, D10 `desktop-stats.ts:56–62`, D11, D12
    `measure-hue-shares.py:143–144`, D16 line 170, the last line of the previous unit); a file-level `testing`
    citation that gets the header only (D8, finding 9.6); an imports-line citation whose ±25 window misses the
    sampler (D17, finding 9.2).
  - **Findings (38):** 12 full, 21 partly, 2 not served, 3 `no-locator` (the directory-level claims). Per finding:
    at most 125 lines and 7,054 chars, well under the 220 / 16,000 limits; no `excerpt-over-limit` and no
    `review-budget` (largest attempt 21,392 excerpt chars of 60,000).
  - **D13 check:** finding 5.2 cites `build_photo` at `contact-sheet.py:140–141`; `main`'s guard at 208–211 **is
    delivered** with it (block `195-226`, by the E3 caller rule).
  - **Owner decision (2026-10-04): `EXCERPT_LIMITS` stay as they are; 9 of 20 accepted knowingly.** Sent to the
    owner under plan Phase 3 §1 (fewer than 10 rows fully served). Reasons: no finding reached a limit (max 125
    lines / 7,054 chars per finding, 21,392 per review); the result comes from the window rules, not the limits;
    and adding rules tuned on #269's known rows would fit the verifier to known findings.
  - **Accepted with it: D2, the one real #269 finding, is only partly served.** Six of its eight findings
    cite `localInput` (`bread-spike.ts` 178–196); a seventh (5.1) cites line 214, outside both units. These
    seven receive `localInput`'s block (167–196) and none of `deleteUpload` (198–213), its counterpart
    (`backcheck-269-policy.json`; corrected before the seal, impl-review a8844a6 F4). The eighth (4.2) cites `deleteUpload` itself (200–202) and receives 199–213 but not `localInput`'s upload
    path (189–195) or line 198. No D2 finding is delivered all of its evidence, so the verifier may refuse to
    confirm it, and **G3h on #269 may see N = 0** (which fails G3h for #269 by §4).
- **Unit-span check** (`unit-span-check.mjs` → `unit-span-check.json`, run 2026-10-04; TypeScript 5.9.3 and
  Python `ast`, both directions): **zero mismatches** over 19 files and 56 units — #269 at `fca2778` (8 files,
  37 units: 3 Python, 5 TS), #240 at `54d3557` (7 files, 8 units), and the four fixture trees (4 files, 11
  units). #247 was not read. A probe outside the frozen inputs confirmed that the check does detect a divergence
  (`const f = function () {…}` and a decorated class are not E2 units); neither form occurs in any frozen input,
  so `excerpts.ts` was not changed.

### 4. Gates

Every gate is evaluated **per arm**. A gate that applies "on each PR series" is judged separately for #269 and
#240.

- **G2: no published findings.** `clean-change` × 5 with stages finder + verifier. **5/5** valid attempts with
  published `findings: []`; the raw finder findings are reported. Invocation as in `finder-model-swap` §4, plus
  `--stages finder,verifier --verifier-model <id> --verifier-endpoint <slug>`.
- **G3f: quality, fixtures.**
  - **Rows:** the archived 12 rows (four cases × 3), with the same filter
    `^(Finds the material|React 16->19|Cross-hunk contract|Defect-free mechanical rename)`, `-j 1`, `--no-cache`,
    and grader `openrouter:google/gemini-3.1-pro-preview`.
  - **Pass:** every required metric is 3/3, **computed on published findings**:
    - `issue_recall` 3/3 on the JS loop;
    - `issue_recall` and `review_fails` 3/3 on React;
    - `flaw_stale_closure`, `flaw_lost_cleanup` and `flaw_unsafe_html` 3/3 each;
    - `no_false_alarms` 3/3 on the clean case.
  - **Diagnostic only:** the cross-hunk metrics, never a pass.
  - **Graded output:** exactly `{summary, findings: published}`. On verifier rows, `summary` is the fixed
    code-written string `"<n> findings published after verification"`. The finder's own summary, the verdicts,
    the quotes and the rejected findings live only in `metadata.verification`.
  - **Sources:** rows without a `fixtureRoot` verify against their frozen `verifierRoot` (Inputs freeze).
  - **Failed run, not a gate result:** a run with ≠ 12 rows, or any row whose verification did not run
    (`verification.status ∉ {verified, no-findings}`).
  - **A1 (grader errors)** from `finder-model-swap` applies verbatim: its sha256 is
    `dc423199b14269d15267fb3522083378d9e8dc274973636b233667d12f5ebb9c` and its re-grade tooling is unchanged.
- **G4: finder cost, unchanged.** Median finder-only cost of the 12 rows **≤ $0.00301653**. A row with
  incomplete cost fails G4. The verifier cost of the rows is reported; its amount is not gated.
- **Verifier cost completeness on the fixture rows** (R3; owner, 2026-10-04): a verifier that was called and
  left a request without a reported cost fails the fixture result as a **cost failure, like G4** — label
  `FAIL (cost)`. It is **not** a G3f quality failure and can never trigger MAIN. A verifier that was not called
  (nothing to send) is complete.
- **G1: reliability.** **≥ 9/10 valid attempts on each PR series** (#269 × 10, #240 × 10) over the whole
  pipeline, finder → verifier → judge _(plan-chosen term (1); the owner confirms it at the seal)_. An attempt is
  valid when all of the following hold:
  - the finder is valid (≤ 1 repair);
  - the verifier is valid (≤ 1 repair) or not needed;
  - the judge is valid;
  - the finder and the verifier report the expected provider;
  - no A3 leak occurs on any finder or verifier request.

  The judge's provider and reasoning are reported, not gated.

- **G4b: whole-review cost and timeouts** (R3), per PR series:
  - the median total review cost per attempt (every finder, verifier and judge request) is **≤ $0.063**;
  - any request with no reported cost fails G4b (it is never omitted from the median). **A call of any pass that
    hit its timeout counts as a request with no reported cost**, even when its retry succeeded: a timed-out
    request emits no step, so its cost is never reported. Every request record carries `timedOut` (impl-review
    phase 2 F1, owner 2026-10-04). An interrupted attempt is cost-incomplete too. G4b is not a quality gate;
  - G1, G4b and the timeout clause are computed over **every attempt in the series file**, across invocations:
    on `--append` the runner rebuilds them from the recorded attempts, so its SUMMARY `gates` is the series
    verdict (impl-review phase 2 F2);
  - **0 verifier timeouts and 0 judge timeouts** in the 10 attempts. A timeout that was followed by a successful
    retry still counts _(plan-chosen term (2))_.
- **R13: judge latency.** Per attempt, the median and max are reported, not gated.
- **R4: recall guard (#240).**
  - **The rule:** each defect K on the owner's list that the finder raised in k ≥ 1 valid #240 attempts
    (**pre-verification** findings) must be published in **≥ floor(k/2) + 1** of those k attempts.
  - **Raised and published:** K is raised in an attempt when at least one of that attempt's findings matches K,
    and published there when at least one finding matched to K is published.
  - **Matches:** a match maps a finding to a **list** of defect ids (empty = none). The agent proposes the
    matches and **the owner approves them**.
  - **Not raised:** a K the finder never raised is reported as "not raised — no evidence about the verifier".
  - **NOT PROVEN:** if no K was raised, or the list is empty, the guard is **`NOT PROVEN`**, which can never be
    PASS. With a **non-empty** list and no K raised, the arm cannot be admitted on it, MAIN does not start by
    itself, and the owner decides.
  - **Empty list** (pre-registered rule, owner decision 2026-10-04; the list below **is** empty): R4 is
    reported as `NOT PROVEN` **for information only**. It does **not** by itself block admission or stop the
    arm when every other gate passes. Recall preservation then rests on the fixtures' required metrics, 3/3 on
    **published** findings (G3f), and #240 is stated as **no evidence about recall** (R4). `recall-guard.mjs`
    prints `R4: NOT PROVEN (empty K list — information only, gate.md §5)` and exits **3**, distinct from FAIL's
    and a non-empty NOT PROVEN's exit 1 (impl-review a8844a6 F5).
  - **Informational:** whole-pipeline detection (K published in x of **all** the series' attempts, valid or
    not; impl-review phase 2 F7). `recall-guard.mjs` refuses duplicate attempt ids or numbers, a file that is not
    one PR series, and a pre-verification finding of any attempt without a match entry.
- **G3h: hand-read, per PR** (#269 and #240 separately; both must pass):
  - **N** = the number of distinct published findings in the owner-approved table.
  - **Limit:** floor(0.05 × N); N ≤ 19 → 0; **N = 0 → G3 FAIL** for that PR.
  - Unresolved counts as rejected. The pooled figure is reported for information only.
- **A3, on every finder and verifier request of every gate:** any SDK reasoning tokens above zero, OpenRouter
  reasoning tokens above zero, or reasoning text longer than zero fails the attempt or row.
- **Provider check, on every finder and verifier request:** a missing or different `provider_name` invalidates
  the attempt or row. The judge's provider is reported only.
- **Retries:** as in production. One attempt is one `runReviewPipeline` pass, including production's single
  transient retry per pass, with no outer retry. A 429, 5xx or timeout that persists after that retry, a
  `FinderOutputError`, or a verifier or judge output error after its one repair is a **failed** attempt, never
  a skipped one. An attempt started and never finished (interrupted) is a failed attempt with incomplete cost.
- **Quality gates:** G2, G3f, R4 (FAIL) and G3h (#269 or #240) _(plan-chosen term (4))_. If CONTROL fails a
  quality gate, MAIN may start, subject to §7. G1, G4, G4b, an incomplete verifier cost on the fixture rows
  (`FAIL (cost)`), the timeout clause, an A3 leak and a provider mismatch are **not** quality gates: CONTROL then
  ends `FAIL (Gx)` or `FAIL (cost)`, the owner decides, and MAIN does not start by itself.
- **Publication** (R5): only `confirmed` findings that pass the quote check are published.
  - **Quote check:** after normalisation, the quote must have ≥ 10 non-whitespace characters _(plan-chosen term
    (3))_ and be a substring of a block assigned to the finding (`quoteMatch: "exact"`). Normalisation converts
    CRLF to LF, strips the rendered line-number prefix of every line, and trims trailing whitespace on each line.
  - **Second comparison:** if the exact comparison fails, every whitespace run on both sides is collapsed to one
    space and the substring test is repeated (`quoteMatch: "whitespace"`; token order must still match)
    _(plan-chosen term (6))_.
  - **Empty quote:** handled per finding. A `confirmed` with an empty quote → `unverifiable: quote-not-in-excerpt`.
    A `refuted` with an empty quote → kept, with `quoteVerified: false`.
  - **Not published, recorded in review.json with a reason:** `refuted`, `unsupported`, and the code-assigned
    `unverifiable`.

### 5. Measuring order and stop rule

The same order applies to each arm:

1. **G2-01 alone** (`--through 1`): the A3 and provider probe.
   - An A3 leak, or a refusal of the shape → `cannot honour the request shape (A3)`.
   - A provider mismatch → stop; the owner decides.
   - Any other failure → `FAIL (G2)`.
2. **G2-02..05** (`--start 2 --append`). Fewer than 5/5 → `FAIL (G2)`.
3. **Fixtures (G3f / G4).**
   - G3f fails → `FAIL (G3f)`.
   - **G4 fails alone** (G3f passes) → `paused (G4 only) — owner` (archived G-A1).
   - **An incomplete verifier cost** on any row → `FAIL (cost)`: a cost failure like G4, never a G3f quality
     failure, so it never triggers MAIN; the owner decides (owner, 2026-10-04).
4. **#269 × 10** (`--stages finder,verifier,judge`).
5. **#240 × 10** (the same).
6. **R4 matches and guard.**
7. **G3h hand-reads**, #269 and #240.

The verdict is a conjunction: the first decisive failure ends the arm. A measurement error (below) is a failed
run, never a gate result.

**Verdict labels** (each arm that runs gets exactly one): `PASS`, `FAIL (Gx)`, `FAIL (cost)`, `NOT PROVEN (R4)`,
`not measured (stopped after Gx FAIL)`, `not measured (budget)`, `cannot honour the request shape (A3)`,
`paused (G4 only) — owner`, `failed run — measurement error`.

**Measurement error / tooling failure.** These are results not produced by the model through the provider:

- an input hash mismatch (the runner refuses a continuation whose diff or rules sha256, or source-root git tree,
  differs from the series file's; uncommitted changes under the source root refuse to start; impl-review phase 2
  F4);
- a code mismatch: the runner refuses a continuation whose code under test differs from the series file's —
  the sealed hashes of §1 (instructions, sample prompt, `src/excerpts.ts`, `src/verifier.ts`, `src/prompts.ts`,
  `EXCERPT_LIMITS`), computed by `verifier-prompt-hash.mjs` and imported by the runner, and the git tree of
  `packages/code-reviewer/src`; uncommitted changes under that directory refuse to start (impl-review a8844a6
  F3);
- a runner crash, and **any error that is not attributable to the model** (impl-review a8844a6 F2). The
  model-attributable classes are exactly: (1) an API call error that carries an HTTP status, its own or its
  cause's (401/402 excepted, below); (2) a timeout (`TimeoutError`, its own or its cause's); (3) an
  output-validation error after the one repair: `FinderOutputError`, `VerifierOutputError` or
  `AI_NoObjectGeneratedError`. Every other error — a `TypeError` in the runner, a reader I/O error such as
  `EACCES`, a connection failure with no HTTP status — is a measurement error and stops the series;
- a grader error (A1 applies);
- an OpenRouter account error (401, or 402 for credits) — the runner classifies it as a measurement error,
  never as a model failure (impl-review phase 2 F3), and so does the fixture-row checker, from the HTTP status
  the adapter records as `metadata.errorStatus` (impl-review a8844a6 F1): such a row makes the promptfoo run a
  failed run, never a G3f failure;
- a row or attempt whose verification did not run (`skipped-no-source`, or any status other than `verified` or
  `no-findings`), including an attempt aborted because the source root is unusable (§3, No source root);
- a bug in this change's code found in a record.

When one occurs, the series is a **failed run**: measurement stops — the runner records the failing attempt,
leaves every remaining attempt `not-run (measurement error)`, and runs nothing on a continuation of a series that
recorded one (impl-review phase 2 F3) — the fix goes in as a dated, hashed amendment
pushed before the re-run, and the re-run is a fresh series. The void series' spend still counts.

**After CONTROL:**

- `PASS` (every gate, and R4 `PASS`) → decision 4.4.
- **Every other gate passes and R4 is `NOT PROVEN` only because the #240 list is empty** (owner, 2026-10-04) →
  the arm's label is `PASS`, the record states "R4 NOT PROVEN (empty K list) — information only; #240 is no
  evidence about recall; recall rests on G3f", and it goes to decision 4.4.
- A quality-gate `FAIL` → MAIN may start, subject to §7.
- `NOT PROVEN (R4)` with a non-empty list, or a FAIL that is not a quality gate → stop; the owner decides.

**If no arm passes,** production stays unchanged and `ai-review` stays off on `master`. Thresholds never change
automatically.

### 6. Hand-read: dedup, reuse, freeze, sample

This is the archived §6 of `finder-model-swap`, applied **per PR**:

- **Dedup:** the agent dedups blind, without judging correctness. Each row carries its contributing attempt IDs
  and a one-sentence grouping reason.
  - Same claimed defect and same location → one row.
  - The same defect in another file → separate rows.
  - Different claims at one location → separate rows.
  - Contradictory wordings → split, never merged.
- **The owner approves** the merges and splits, before any correctness judgement.
- **Freeze order:** approved table → `hand-read-sample.mjs freeze` → its sha256 written here → seed (32 bytes
  from `/dev/urandom`, hex, written before the draw) → `draw`. The first min(40, N) rows by
  `sha256(seed + ":" + rowId)`. No re-draw.
- **Pre-sort:** the agent may pre-sort the non-inherited rows against the PR head. **The owner classifies every
  non-inherited row.** Every judgement carries a one-sentence reason.
- **Rejected** = does not identify a real defect in the PR's diff at its head. Unresolved counts as rejected.
- **Reuse** (R10 and its 2026-10-04 extension):
  - **Conditions:** a classification is inherited only when the **PR, the code version** (#269 `fca2778`, #240
    `54d3557`), **the dedup key** (`file:startLine|category`) **and the claim** all match a row the owner already
    classified. Those rows are the #269 D-rows of `finder-model-swap`, and for MAIN also CONTROL's rows in this
    change.
  - **Approval:** `hand-read-reuse.mjs` proposes the matches as a table, and the owner approves it. A changed or
    new claim is classified again.
  - **What is inherited:** the judgement, not the observation. An inherited row still counts in its own arm's N
    and G3h result.

### 7. Budget

- **$2.00 in total** covers everything: finder, verifier, judge, grader, impl review and G5. **Stop and ask once
  the total passes $1.60.** $2.00 is never exceeded.
- **Spend:** the OpenRouter key's usage counter (`GET /api/v1/key`), read before and after every series;
  T = counter − T0. If the counter and telemetry disagree, the counter governs. While the counter lags, the T
  carried forward is max(counter, telemetry).
- **Before every series:** the projected pessimistic cost is P (table below). The series starts only if
  T + P ≤ $1.60; otherwise stop and ask. Inside the series, `--max-spend` = min(1.60 − T, 2.00 − T − A_max).
- **`--max-spend` is required** (no unlimited default; impl-review phase 2 F8) and caps the **whole series**: on
  `--append` the spend already recorded in the file counts against it (F2). A continuation therefore passes
  recorded spend + min(1.60 − T, 2.00 − T − A_max), with T read after the earlier invocation.
- **G5** runs only if 2.00 − T ≥ $0.50.
- **Pessimistic per-series table** (Phase 3, 2026-10-04: recomputed with the measured excerpt sizes). Prices
  from 2026-10-03, re-read 2026-10-04: luna $0.10 / $0.50 per M tokens, sonnet-5 $2.00 / $10.00, fresh prefix
  × 1.16; grader ≈ $0.0056 per row. Inputs and assumptions:
  - **Verifier input per #269 attempt** (§1): median 23,428 chars, max 27,818. Tokens: est. = median ÷ 3.5
    chars/token ≈ 6,694; pessimistic = max ÷ 3.0 ≈ 9,273, plus one format repair (≈ 1,000 tokens: the re-sent
    output and the repair instructions).
  - **Verifier output:** est. 60 tokens × 4 findings = 240; pessimistic 120 × 6 = 720, doubled by the repair
    = 1,440.
  - **Finder #269** (`finder-model-swap`): median $0.004783, max $0.012821. **Judge:** $0.017104 (#132, the only
    measured point) est., $0.033 pessimistic.
  - **#240:** no finder output exists, so nothing about its excerpts can be measured; it is budgeted at **#269's
    figures**, not scaled down.
  - **Fixture rows:** verifier est. 1,700 input / 150 output tokens per row, pessimistic 5,000 / 1,440; finder
    median $0.00018176, max $0.00080244; grader est. $0.0056, pessimistic $0.0070 per row.
  - **G2:** finder median $0.000114, max $0.000502 (`finder-model-swap`, 0 findings in 5/5). Est.: no verifier
    call. Pessimistic: the verifier is called on every attempt at the fixture-row pessimistic cost.
  - Estimates are rounded to the cent, pessimistic figures **up** to the cent.

  | Series                                        | CONTROL est. / pessimistic (P) | MAIN est. / pessimistic (P) |
  | --------------------------------------------- | ------------------------------ | --------------------------- |
  | G2 clean × 5 (finder + verifier)              | $0.001 / $0.01                 | $0.001 / $0.14              |
  | Fixtures 12 rows (finder + verifier + grader) | $0.07 / $0.11                  | $0.13 / $0.41               |
  | #269 × 10 (finder + verifier + judge)         | $0.23 / $0.48                  | $0.40 / $0.85               |
  | #240 × 10 (finder + verifier + judge)         | $0.23 / $0.48                  | $0.40 / $0.85               |
  | **Arm total**                                 | **$0.53 / $1.08**              | **$0.93 / $2.25**           |
  | G5 (finder + verifier + judge + impl review)  | ≤ $0.50 cap                    | ≤ $0.50 cap                 |

  Per #269 attempt: CONTROL est. $0.0228 / P $0.0477 (verifier $0.0009 / $0.0019); MAIN est. $0.0398 / P $0.0841
  (verifier $0.0179 / $0.0382). Planning figures (Phase 0 draft) for comparison: CONTROL $0.58 / $1.05, MAIN
  $1.33 / $2.12.

- **A_max per attempt** (Phase 3, recomputed by the rule): 2 × the pessimistic per-attempt cost (the series' P /
  10), rounded up to the cent, floored at $0.02. **CONTROL #269 $0.10, #240 $0.10; MAIN #269 $0.17, #240
  $0.17.** (Planning values were CONTROL $0.10 / $0.09, MAIN $0.19 / $0.16; #240 now carries #269's figures.)
- **Stated plainly:** if CONTROL spends its estimate (T ≈ $0.53), MAIN's G2 and fixtures can start (T + P ≤
  $1.60), and so can **MAIN's first PR series** (T ≈ $0.66 after MAIN's fixtures at estimate; + $0.85 = $1.51).
  **MAIN's second PR series cannot start** without an owner decision (T ≈ $1.06; + $0.85 = $1.91 > $1.60). If
  CONTROL spends its pessimistic P ($1.08), MAIN cannot start any PR series. MAIN cannot be completed within
  $2.00 with G5 reserved, so running MAIN in full needs an owner decision at that point (R2).

### 8. Production phase and G5

Only for an arm the owner admits (decision 4.4).

- **Defaults:** `DEFAULT_VERIFIER_MODEL` / `DEFAULT_VERIFIER_PROVIDERS` are set to the admitted arm.
  `DEFAULT_MODEL` / `DEFAULT_FINDER_PROVIDERS` → `openai/gpt-6-luna` / `["openai"]`, both with literal
  assertions.
- **Repository variable:** before G5 the owner deletes `OPENROUTER_REVIEW_MODEL` (`z-ai/glm-4.6`, read
  2026-10-04). `gh variable list` must then show neither `OPENROUTER_REVIEW_MODEL` nor
  `OPENROUTER_VERIFIER_MODEL`.
- **Evidence tags, before the rebase:** `finder-verification/freeze`, `finder-verification/seal` and
  `finder-verification/amendment-<n>`, pushed on the commits this file cites. The tag names are recorded here.
- **Rebase:** onto `origin/master` (which carries `68151b0`). Remove only the `false &&` line from the
  `ai-review` guard, and rewrite only the comment's first sentence. This is pushed while the PR is still a draft.
- **The PR body** names the two predecessor changes it carries (`finder-serialization-outage`,
  `finder-model-swap`) and has a `Plan: context/changes/finder-verification/plan.md` line.
- **G5 cost projection** on the real `origin/master...HEAD` diff (after the workflow's exclusions), recorded here
  before the PR is marked ready. **Over $0.50 → stop and ask.**
- **G5** is the first `AI Code Review` run after the owner marks the PR ready and adds `ai-cr:review`. It passes
  when all of the following hold:
  - the whole review is green;
  - `finderTelemetry` and `verifierTelemetry` are present;
  - `models.finder` and `verification.model` equal the admitted configuration;
  - `verification.status` is `verified` or `no-findings`;
  - every finder and verifier request is logged with its provider and its OpenRouter generation id.
- **Spend** comes from the counter. Later pushes are added to the ledger.
- **A G5 that is `not measured (budget)` or not green blocks the merge** until the owner decides.

### 9. Amendments

A protocol change after the seal goes into a `## Amendments` section placed **after** the seal. Each amendment is
dated, carries its own sha256, and is committed and pushed to `origin` **before** the measurement it affects.

- Amendments never edit this section; the seal check covers this section only.
- A change to a prompt, model, limit or criterion after a result has been seen needs a new unseen case.

### 10. Seal procedure

1. **Confirm the six terms.** Before approving, the owner confirms the six plan-chosen terms one by one, each
   recorded with its date in `## Pre-registration seal`:
   1. G1 scoped to the whole pipeline;
   2. a timeout followed by a successful retry counts against R3;
   3. the 10-character quote floor;
   4. the list of quality gates that can trigger MAIN;
   5. the `EXCERPT_LIMITS` values;
   6. the whitespace-collapsed second quote comparison.
2. **Hash the section.** After the owner's approval, record the following in `## Pre-registration seal`, with the
   approval date and any edits made before the seal:
   - the sha256 of this section's bytes, computed as
     `sed -n '/^## Pre-registration$/,/^_End of Pre-registration\._$/p' gate.md | sha256sum`;
   - the UTC time it was taken.
3. **Push.** Commit that state and push it to `origin`. Record GitHub's push time (repository activity API)
   before the price re-read and T0.
4. **Never recompute the seal.**

### #240 known defects (owner)

**K list: empty (owner, 2026-10-04).** Basis: no known defect; no later commit fixes #240's files and no issue
reports one; a code read of `src/` at `54d3557` with the ai-toolkit session found only two comment inaccuracies
(`result-scaling.ts` 4–7, "passes through untouched" despite /8 flooring; `BeforeAfterSlider.tsx` trim bound,
false only under the separately tracked `cloud-exif-orientation` bug), neither a defect.

- **Consequence** (§4 R4, §5): R4 is reported as `NOT PROVEN` for information only and does not by itself block
  admission or stop the arm when every other gate passes. Recall preservation rests on G3f's required metrics,
  3/3 on published findings, and #240 is **no evidence about recall** (R4).
- **Sources offered, not judged** (research §5; plan Phase 3 §2), all under
  `context/archive/2026-09-20-cloud-result-resolution-gap/`: `premise-check.md` (the premise notes),
  `change.md`, `plan.md` and `plan-brief.md`; and the three in-PR fixes on #240's branch, `6ae287e` ("correct the
  slider's prop contract; there is no crop to fix"), `77901e9` ("make E2E actually exercise the resolution
  disclosure") and `54d3557` ("reword the resolution caption so it cannot read as a status").

_End of Pre-registration._

## Pre-registration seal

**Sealed 2026-10-04.** The owner confirmed the six plan-chosen terms one by one and approved the section; the hash
below was then taken by §10 and is never recomputed. Nothing here is part of the hashed section. The section's own
opening line ("UNSEALED DRAFT") is part of the hashed bytes and stays as written; this record, not that line,
states the seal.

### Plan-chosen terms (the owner confirms each one)

1. G1 scoped to the whole pipeline (finder → verifier → judge; §4 G1). — Confirmed: owner (date: 2026-10-04)
2. A timeout followed by a successful retry counts against R3 (§4 G4b). — Confirmed: owner (date: 2026-10-04)
3. The 10-character quote floor (§4 Publication). — Confirmed: owner (date: 2026-10-04)
4. The list of quality gates that can trigger MAIN: G2, G3f, R4 (FAIL), G3h (§4). — Confirmed: owner (date:
   2026-10-04)
5. The `EXCERPT_LIMITS` values (§1). — Confirmed: owner (date: 2026-10-04)
6. The whitespace-collapsed second quote comparison (`quoteMatch: "whitespace"`; token order must still match;
   §4 Publication). — Confirmed: owner (date: 2026-10-04)

### Approval and hash

- Owner approval: approved by the owner (date: 2026-10-04; edits made before the seal: none beyond those already
  committed through `58fd4ec`, which the ai-toolkit session checked before the approval: 1086/1086 package
  tests, every `verifier-prompt-hash.mjs` output present in §1, unit-span check 19 files / 56 units / 0
  mismatches). The section's bytes at the seal equal its bytes at `58fd4ec`.
- Also confirmed by the owner on 2026-10-04 (outside the hashed section; already stated in §5 at `58fd4ec`): a
  connection failure with no HTTP status is a measurement error (impl-review a8844a6 F2, fail-safe).
- sha256 of `## Pre-registration` … `_End of Pre-registration._`: **`8616eda6a217c8570a2f3cba957fc2a3dfcfd5b7223c2d3b3426f08baff0c375`**, computed as
  `sed -n '/^## Pre-registration$/,/^_End of Pre-registration\._$/p' gate.md | sha256sum`.
- UTC time taken: **2026-10-04T20:59:17Z**.
- **Seal commit:** `9c85aa27f418c6d8cb669b1bedddbb333799fa02`
  (`docs(finder-verification): seal the pre-registration (p3)`), on `origin/feat/finder-verification`; its
  committed `gate.md` reproduces the sha256 above. The SHA is rewritten by Phase 8's rebase (see Rebase protection
  below).
- **GitHub push time: 2026-10-04T20:59:42Z.** Source:
  `GET /repos/Piotr-Miller/lumina-clean-ai/activity?ref=refs/heads/feat/finder-verification`, event `push`,
  `58fd4ec..9c85aa2`, actor `Piotr-Miller`. `git ls-remote` showed `9c85aa2` as the branch head. Recorded before
  any price re-read, T0 or paid call.
- **Rebase protection:** annotated tag **`finder-verification/seal`** (tag object
  `85aa508214fe24065e0559c2ec0835611c9b9a77`) on `9c85aa27f418c6d8cb669b1bedddbb333799fa02`, created and pushed to
  `origin` on 2026-10-04 by owner decision (plan Phase 8 §2; plan-review 3rd run F3). `git ls-remote --tags origin
'finder-verification/*'` shows it peeled to `9c85aa2`, next to `finder-verification/freeze` peeled to `c3b2f1c`.
  Phase 8 §2 only confirms that both still exist.
