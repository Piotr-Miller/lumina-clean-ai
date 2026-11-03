<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: S-19 Cloud Model Comparison Implementation Plan

- **Plan**: context/changes/cloud-model-comparison/plan.md
- **Scope**: Phase 1 (phases 1–7)
- **Session**: fresh
- **Base**: 0b6c72895d00c504ca346a2d1563af079d019528 (merge-base with `origin/master`; local `master` is stale at 4a996a3). The commits 026b6a7..ef80a97 in that range are pre-plan benchmark, spike, research and the plan itself; the Phase 1 implementation is ea87ae4 alone.
- **Head**: ea87ae4867feb99d88346d0d49ef6f8b6e29a31c
- **Worktree**: excluded (clean at review time; HEAD 4236167 is three docs-only commits past the head, with no change under `scripts/`)
- **Checks ran at**: ea87ae4 (temporary checkout; `node_modules`, `.astro/` and `test-photos/private/` linked or copied from the main checkout)
- **Manual acceptance**: 1 of 3 confirmed — pending: 1.13; unverifiable: 1.9
- **Date**: 2026-10-31
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 9 warnings, 2 observations (F11 split from F3 during triage)
- **Head rewritten during triage**: ea87ae4 is now d4d1bf5 on the branch (F3); the reviewed code is unchanged, only `s19-local/S17-01.jpg` was dropped.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | FAIL    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Plan Adherence is FAIL for one major drift (F2: the NAFNet + gamma arm cannot pass `tally.py`, so the Phase 3 NAFNet core gate cannot be computed) plus a missing Phase 7 check (F8). No finding is CRITICAL: every defect found fails closed or is caught by `tally.py` before a gate verdict. None lets a call exceed the cap or opens the holdout.

What holds, verified: cap admission is one `fcntl.flock`-guarded read–sum–check–append with fsync (`run-candidate.py:203-210`, `:158-162`). Reservations without a result stay counted. Bounds are recomputed and defensible: gpt-std 2336×1552 → $0.20, large → $0.41, NAFNet → $0.24/$0.28/$0.26, 14 slots at $3.40 ≤ $4. `X-Fal-Store-IO: 0` is sent; keys never reach the ledger; there are no hidden HTTP retries. Every CLI, including the TypeScript ones through `s19.ts` `check-access`, calls the guard before reading a photo. The viewer writes only through `textContent`. All subprocess calls take argument arrays.

## Findings

### F1 — A missing API key permanently consumes the phase cap

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/s19/run-candidate.py:246
- **Detail**: `os.environ["OPENAI_API_KEY"]` (`:246`) / `["FAL_KEY"]` (`:255`) are read inside `call_provider`, after `admit()` has reserved the bound. The resulting `KeyError` is caught by the broad `except` at `:376-380` and logged as `UNKNOWN`, transient, "unknown result, potential cost: full reservation kept". The slot then retries after its back-off and ends `technical_failure`, and the run moves to the next slot. A run with a missing key reserves 2 × bound per slot without sending anything: 9 × $0.40 = $3.60 of the $4 Phase 3 cap for gpt-std. Because the ledger "cannot reset", only a numeric amendment recovers that cap. The plan classes this as an execution error ("malformed config/ledger/access is an execution error"), and the log misreports the state (lesson: "A check that cannot say what it found is a safety defect"). `test_budget.py` mocks `call_provider`, so the path is untested.
- **Fix**: Before the paid loop (beside `check_cap`), refuse with `refused: <VAR> is not set` when the config kind's key is absent, and add a test that asserts no `reserve` row is written.
- **Decision**: FIXED — Fix now (`require_key` before the paid loop, `run-candidate.py`; test `test_missing_key_refuses_before_any_reservation` fails with the fix removed); siblings: `scripts/s19/feasibility.py` n/a (spike record, frozen by the plan), no other paid caller (grep `os.environ` in `scripts/s19/`); reopened: none

### F2 — The NAFNet + Local gamma arm can never pass tally

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: scripts/s19/tally.py:173
- **Detail**: `tally.py:173` requires the rated candidate's `output_sha256` to equal the ledger slot's first valid output, which is the **raw** NAFNet output. The arm the plan rates in Phases 2–4 is NAFNet + Local gamma, a different file made by `local-arms.ts nafnet-gamma`. `compare-arms.html:666` exports `output_sha256: cand.sha256`, the hash of the file shown. `viewer-inputs.py:72` refuses a spec whose `candidate.output_sha256` differs from that file. So a NAFNet + gamma rating is either refused at build time or `Invalid` (exit 2) in tally. The Phase 3 NAFNet core gate ("NAFNet + gamma preferred over the control on ≥ 2 of 3") therefore cannot be computed. The fixtures pass only because they rate the raw ledger hash. Related: `local-arms.ts:243-251` picks the NAFNet output by `config_name === "nafnet"`, not by config hash, and never checks the file against the ledger's `output_sha256`.
- **Fix**: Model derived arms explicitly: the candidate carries `source_output_sha256` (the ledger's raw output) plus the `local-arms` JSON hash (arm, Auto record, parameters). Tally checks the source against the ledger and the shown file against that JSON. `local-arms.ts` selects the source by config hash and verifies its `output_sha256`. Add a fixture for a derived NAFNet + gamma rating against its control.
  - Strength: Keeps the "first valid result" join intact while making the rated derivative traceable to it.
  - Tradeoff: Touches `local-arms.ts`, `viewer-inputs.py`, `compare-arms.html`, `tally.py` and the fixtures; one new field in the export format.
  - Confidence: HIGH — the mismatch is visible in three lines; the arm JSON already records `output_sha256` (`local-arms.ts:175`).
  - Blind spot: Phase 4's curve arms need the same linkage; their config shape is not written yet.
- **Decision**: FIXED — Fix now (derived-arm link: `local-arms.ts` selects the NAFNet source by config hash (`--nafnet-config`, default `configs/nafnet.json`), verifies its file against the ledger's `output_sha256` and records `source` in `<id>.json`; `viewer-inputs.py` `derived_link` checks that record against the shown file and refuses `--source` files; `tally.py` `check_derived` ties the rated file to the slot's first valid result through the unchanged record and the same Auto record; `compare-arms.html` unchanged, since it already spreads the candidate block into its export; 2 tests, 5 refusal cases, failing with the fix removed); siblings: `local-arms.ts` NAFNet output selection by name fixed (it was the related defect), Phase 4 curve arms n/a (not written yet; they inherit the same `source` record), GPT arms n/a (rated raw); reopened: none

### F3 — The S17-01 derivative is published without its unresolved provenance gap

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: context/changes/cloud-model-comparison/references/README.md:63
- **Detail**: ea87ae4 commits `references/s19-local/S17-01.jpg`, a Local adaptation of S17-01, under the basis "every source is … CC BY-SA with the author in the table" (`README.md:83-85`). The repository records this source's rights as unresolved: `test-photos/s17-benchmark-v2.json` for S17-01 says "the existing attribution gap remains unresolved. No new rights verification is claimed", and `change.md:124` says the same. The S-17 record is explicit: "retaining an existing input does not resolve it or authorize new derivative publication" (`context/archive/2026-08-31-cloud-quality-below-local/photo-candidates.md:56`). AGENTS.md's evidence rule requires a basis for the right to publish, and provenance alone is not one. **ea87ae4 is not on any remote yet** (`git branch -r --contains ea87ae4` is empty), so this derivative is unpublished. A deletion commit on top would not change that: pushing the branch publishes ea87ae4's blob. The sibling `references/luminaclean-01-aurora-fjord-kirkjufell.jpg` (5018c81) has the same gap and is already on `origin/docs/cloud-model-comparison-spike`. It predates Phase 1 and is not counted here.
- **Fix A ⭐ Recommended**: Before any push, rewrite the unpushed commits so that `s19-local/S17-01.jpg` is never committed. Keep the file in `test-photos/private/s19/local/` and record the gap in the README row.
  - Strength: The only option that keeps an unverified-rights derivative out of a public history; the harness reads the private copy, so nothing functional changes.
  - Tradeoff: History rewrite of four unpushed commits. The 1.8 acceptance surface (`references/s19-local/`) then changes, so 1.8 must be reopened and re-confirmed; the SHAs recorded in Progress and the 1.9 evidence change too.
  - Confidence: HIGH — ea87ae4 is verifiably unpushed.
  - Blind spot: Whether the owner wants the same treatment for the already-pushed `luminaclean-01` (a separate decision; removing it from the public branch needs a force-push).
- **Fix B**: Resolve the gap first: confirm on Commons (or with the uploader or VRT) that the CC BY-SA grant is valid for Oliver Degener's photo, and record that basis per file in the README.
  - Strength: Keeps the published set complete and the 1.8 surface unchanged.
  - Tradeoff: Depends on an external answer; until it arrives the branch must not be pushed.
  - Confidence: LOW — S-17 already looked and left it unresolved.
  - Blind spot: There may be no authoritative answer available.
- **Decision**: FIXED — Fix A (`git filter-branch` over `ef80a97..HEAD`, backup `backup/s19-pre-f3`; ea87ae4 → d4d1bf5, 9e0bfa5 → ae39f70, d123229 → c556e3b, 4236167 → 067f37a; tree diff to the backup is exactly the dropped JPEG; README caveat uncommitted); siblings: `references/1.9-spike-smoke/` n/a (no S17-01 material, grep), `test-photos/private/s19/local/S17-01.jpg` n/a (private, byte-identical copy kept), `references/luminaclean-01-aurora-fjord-kirkjufell.jpg` tracked in F11 (PENDING); reopened: 1.8

### F4 — The slot state is not protected across the paid call

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/s19/run-candidate.py:388
- **Detail**: Two paths spend money on a result that the evidence then rejects; neither can exceed the cap.
  1. **Crash after a paid response.** `actual_cost` (`:390`), `mkdir` and `write_bytes` (`:391-395`) run after the `try`. `usage.get("output_tokens_details", {})` returns `None` when the key is present but null, so `.get` raises `AttributeError` at `:116`. Any exception ends the run before the output bytes are written and before a `result` row is appended. The paid image is lost, the attempt counts as in flight, and `--resume` treats it as transient and pays again.
  2. **Same-slot race.** Slot state is read outside the lock (`:337-344`), and `admit()` checks only the phase total, not "this slot is done or in flight". `in_flight` is computed (`:198`) but never used. Two processes on the same config send the same slot twice, and `tally.py:124` then marks the slot Invalid for good.
- **Fix**: Write the output bytes immediately after the response, wrap the cost step and file I/O so a `result` row is always appended (cost unknown, reservation kept), and re-check `slot_state` inside `admit()`'s lock, refusing when the slot is ok, terminal, in flight or out of attempts.
- **Decision**: FIXED — Fix now (paid bytes saved first and a result row always written via `record_response`, a non-transient `unknown` on a local failure that stops the run; `actual_cost` reads null usage blocks; a per-slot non-blocking `slot_lock` instead of an in-flight refusal, because the ledger cannot tell a crashed attempt from a running one and the OS releases the lock on a crash; three tests, each failing with its fix removed); siblings: `admit()` n/a (the cap path was already one guarded write), `local-arms.ts` NAFNet source selection tracked in F2 (PENDING); reopened: none

### F5 — The runner trusts the series file's size, bound and input hash

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/s19/run-candidate.py:333
- **Detail**: `run_slot` takes `request_size` and `cost_bound_usd` from the series slot, never recomputes them with `request_size()` / `cost_bound()`, and keys the slot by the current sidecar's hash (`meta["sha256"]`, `:334`) without comparing it to the series' frozen `input_sha256`. Re-prepared inputs (for example after a Pillow upgrade) would be sent and paid for under a new key that `tally.py` later rejects as "missing". The plan freezes "each input's requested size … in the series manifest before calls" and requires a defensible bound. A series edited by hand would carry an unchecked bound.
- **Fix**: In `run_slot`, before `admit()`, refuse unless the sidecar hash equals `spec["input_sha256"]` and the recomputed size and bound equal the series values.
- **Decision**: FIXED — Fix now (`check_slot_frozen`: input hash, recomputed size and recomputed bound must equal the series before admission; accepts all 14 real Phase 3 slots; the fixture series now derive sizes and bounds the way `make-series.py` does; test fails with the fix removed); siblings: dry run n/a (reserves nothing), `make-series.py` n/a (it is the derivation the check repeats); reopened: none

### F6 — Tally accepts any reference that declares itself Local

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/s19/tally.py:175
- **Detail**: For `kind == "local"` the reference is checked only for its declared kind. `reference.sha256` is exported but unused, so a historical source-file download or a `local-equiv` control labelled `local` would be accepted in a gate. The plan says historical files "do not satisfy this gate-input contract" and that controls "can never occupy the real-Local reference slot".
- **Fix**: For gate modes, require `reference.sha256` to equal the gate baseline's hash (`test-photos/private/s19/local/<id>.jpg`, or the hash recorded in its Auto record or in the series). Add a fixture where a control labelled `local` is Invalid.
- **Decision**: FIXED — Fix now (`tally.py` gate modes require `reference.sha256` to equal `local/<id>.jpg`, or `validation-local/<id>.jpg` for validation; `--diagnostic` exempt for Phase 2's historical downloads; test covers a historical file, a control labelled local and a missing baseline); siblings: control references n/a (already bound by input and Auto hashes); reopened: none

### F7 — `viewer-inputs.py` opens arbitrary paths behind an id-only guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/s19/viewer-inputs.py:62
- **Detail**: `require_access` checks the spec's photo ids. `describe()` then hashes and opens with PIL whatever `original` and arm `path` say (`:44-55`, `:72`, `:79`). Nothing ties them to that id's manifest entry or refuses validation locations, so one copy-paste slip in a tuning spec reads a validation photo and writes its path into a tuning manifest. That contradicts the docstring (`:15-16`) and the plan ("Generated manifests must not enumerate validation image paths in tuning mode"). Sibling: `local-arms.ts:150,225-227` `--source <png>` decodes an arbitrary path the same way.
- **Fix**: Require `original` to resolve to the manifest path for its id. Resolve each arm path (`realpath`) and refuse validation sources, `validation-local/`, validation inputs and run outputs of validation ids. Apply the same check to `local-arms.ts --source`.
- **Decision**: FIXED — Fix now (`protocol.check_paths` plus a `check-paths` CLI, metadata only: refuses validation sources, `validation-local/` and any path component named after a validation id; `viewer-inputs.py` binds `original` to the id's manifest file and checks every arm and record path; `local-arms.ts --source` goes through `guardPaths`; tests assert the refusal before any file error); siblings: `local-arms.ts --source` fixed, `baseline.ts` n/a (reads only `local/<id>` paths it derives from guarded ids), `run-candidate.py` n/a (paths come from guarded sidecars); reopened: none

### F8 — Phase 7 bindings are incomplete

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/s19/tally.py:261
- **Detail**: Each gap fails closed or is caught later, but together they leave the one-shot validation less bound than the plan states:
  - The validation gate (`tally.py:261-302`) never compares the config with the S19-FREEZE record or the release, although the plan says "Validation requires … the frozen hash".
  - The release records `series_sha256` (`protocol.py:352`), but neither the runner nor tally compares it after `open-validation`, and the runner does not re-run `check-freeze`.
  - The approval's `vendor` is compared only with the release, which copied it from the approval (`protocol.py:340-343`), never with the config's `vendor`. The config hash still binds the real config.
  - `inputs.py:193` adds tuning ids to `--check --validation --all-validation`, which `require_access` then refuses, so the Phase 7 `--check` cannot run without listing ids.
- **Fix**: Add the four checks (freeze hash in the validation gate; release `series_sha256` plus `check-freeze` in the runner's validation path; approval vendor equals config vendor; `--check` selection follows `--all-validation`), each with a synthetic test, before Phase 6. They can be queued now as a follow-up.
- **Decision**: FIXED — Fix now (four checks: `tally.py` validation gate requires the S19-FREEZE record and its series hash; the runner's validation path re-checks the release's `series_sha256` and runs `check-freeze`; `check_vendor` binds the approval's vendor to the config in `require_access` and `open_validation`; `inputs.py --check --all-validation` no longer adds tuning ids; each check's test fails with the fix removed). The `inputs.py` change moved its pinned hash, so at the owner's choice the three configs were re-pinned (78d393de… → 10c7610c…) and `series/phase3.json` regenerated with `make-series.py`: config hashes gpt-std df67f7ae… → e053a848…, gpt-large 28e25290… → 2ab95f80…, nafnet 9482f385… → b491e544…; slots identical apart from those hashes; all three dry runs exit 0, 14 slots $3.40 ≤ $4; no document cited the old hashes; siblings: `protocol.py open-validation` vendor check fixed together with `require_access`; reopened: none

### F9 — The viewer randomises sides within a pair, not the order of arms

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/cloud-model-comparison/references/compare-arms.html:357
- **Detail**: The plan asks for "N arms in a random order drawn once per photo". The code draws A/B per pair (`:462-473`), but pairs are listed in spec order (`:357-363`), so "pair 1" is always the same candidate type across photos, and position can identify the arm before reveal.
- **Fix**: Shuffle the pair order once per photo with the same seeded draw and store the order in the export.
- **Decision**: FIXED — Fix now (`compare-arms.html` draws each photo's pair order once by Fisher–Yates, keeps it in the same localStorage state as the A/B draw and records `blind_order.pair_position` in the export; README updated; headless check on the spike-smoke manifest: 4 distinct orders in 12 fresh sessions, stable across reload, no page errors); siblings: `compare.html` and `compare-bread.html` n/a (one pair per photo, nothing to reorder); reopened: 1.9 (its smoke script assumes the old fixed order and needs updating before re-verification)

### F10 — Several tests are weaker than their success criteria

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/s19/tests/test_protocol.py:217
- **Detail**: Four gaps:
  - The `check-scope` test asserts `assertIn(r, (0, 1))`, which cannot fail.
  - Criterion 1.2 says every CLI refuses "even with a matching hash and validation flag but absent/declined consent", but the per-CLI tests (`:33-87`) run only without `--validation`; the flag + hash + no-consent case runs only through `protocol.py check-access`. The shared `require_access` keeps the real risk low.
  - 4:4:4 chroma (`subsampling=0`) is set but never asserted in `test_inputs.py`.
  - The F1 path is untested.
- **Fix**: Assert the expected exit of `check-scope` on a fixture tree with and without a disallowed change, run the flag + matching hash + no-consent case per CLI, assert 4:4:4 on a prepared fixture, and add the F1 test.
- **Decision**: FIXED — Fix now (the `check-scope` test now asserts exit 0/1 by changed paths and runs a git-level case on a temporary repository: committed, staged and untracked; a new per-CLI test sends the validation flag plus a matching release without consent through all five CLIs; a new test asserts 4:4:4 and q95 on both prepared targets; each fails with its target behaviour removed: 14, 2 and 3 failures); siblings: F1's untested path was covered by F1's own test; reopened: none

### F11 — The already-public `luminaclean-01` has the same S17-01 rights gap

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: context/changes/cloud-model-comparison/references/luminaclean-01-aurora-fjord-kirkjufell.jpg
- **Detail**: Linked from F3. The historical Local download of S17-01 (commit 5018c81, before Phase 1) is published under CC BY-SA 4.0 with the same unresolved author/uploader gap (`README.md:18`). Unlike F3's file it is already on `origin/docs/cloud-model-comparison-spike`, so removing it from public history needs a force-push of that branch; deleting it in a new commit only stops it reaching `master`. Its role is Phase 2 diagnostics, and a private copy can serve that role.
- **Fix A ⭐ Recommended**: Delete it in a new commit (keeping a private copy under `test-photos/private/`), add the same caveat to its README row, and point Phase 2 at the private copy; leave the remote branch history as is.
  - Strength: It never reaches `master`, and the branch is deleted after merge; no force-push.
  - Tradeoff: The blob stays reachable on the remote branch until that branch is deleted.
  - Confidence: MED — depends on the branch being deleted after the merge.
  - Blind spot: Whether anyone cloned or forked the branch already.
- **Fix B**: Also rewrite the remote branch (`filter-branch` from 5018c81, then force-push it).
  - Strength: Removes it from every ref the repository serves.
  - Tradeoff: Force-push of a public branch, and a rewrite back to 5018c81 changes the SHAs of the spike and plan commits, which earlier evidence cites.
  - Confidence: MED — GitHub can still serve a removed blob by SHA until garbage collection or support removal.
  - Blind spot: The cached or forked copies.
- **Decision**: FIXED — Fix A (file deleted from the working tree, uncommitted; private copy `test-photos/private/s19-historical-local/`, sha256 identical; `compare.html` and `compare-bread.html` read S17-01 from there; README withdrawal note); siblings: `test-photos/licensed/01-aurora-fjord-kirkjufell.jpg` n/a (an input, admitted by the test-photo rule through `fetch.sh`), no other tracked S17-01 image (`git ls-files`); reopened: none

## Triage summary (2026-10-31)

| Decision                    | Findings                            |
| --------------------------- | ----------------------------------- |
| Fixed, Fix A                | F3, F11                             |
| Fixed, Fix now              | F1, F2, F4, F5, F6, F7, F8, F9, F10 |
| Skipped / accepted / lesson | none                                |

- **Reopened Manual rows**: 1.8 (F3 changed `references/s19-local/`), 1.9 (F9 changed `compare-arms.html`).
- **History rewritten**: ea87ae4 → d4d1bf5, 9e0bfa5 → ae39f70, d123229 → c556e3b, 4236167 → 067f37a (F3). The old commits survive only in the local `backup/s19-pre-f3` branch and `refs/original/`.
- **Config hashes changed** (F8, before any paid call): gpt-std e053a848…, gpt-large 2ab95f80…, nafnet b491e544…; `series/phase3.json` regenerated, 14 slots at $3.40 unchanged.
- **Verification after triage**: 70 unit tests pass (56 at the head, 14 added); each new test failed with its fix removed; `npm run typecheck`, `eslint scripts/s19/` (0 errors) and the repo-wide `prettier --check .` exit 0; the three Phase 3 dry runs exit 0; `inputs.py --check` reproduces all 8 tuning inputs; `local-arms.ts local-equiv --compare-local S17-04` unchanged (mean |Δ| 0.499).
- **Uncommitted**: every triage edit is carried for the owner's commit, together with the deletion of `references/luminaclean-01-aurora-fjord-kirkjufell.jpg`.

## Review Notes

- **Bookkeeping in diff**: context/changes/cloud-model-comparison/plan.md, context/changes/cloud-model-comparison/change.md, context/foundation/roadmap.md
- **Automated checks at ea87ae4** (each exit status from its own run, output in files):
  - 1.1 `inputs.py --all && --check`: exit 0. Eight prepared inputs reproducible, sRGB, orientation applied; NAFNet downscales for S17-04/05/06/07/21.
  - 1.2 `test_protocol.py`: 12 tests, OK.
  - 1.3 dry runs for gpt-std, gpt-large and nafnet: exit 0. 9 + 2 + 3 slots; whole series $3.40 within the $4 cap, $0.00 committed.
  - 1.4 `local-arms.ts local-equiv --compare-local` on all eight photos: exit 0. Mean |Δ| 0.50–2.52, p99 |Δ| 3–21 (0–255).
  - 1.5 `test_tally.py`: 24 tests, OK.
  - 1.6 `npm run typecheck`: exit 0. The first run in the fresh checkout failed with `TS2307 astro:*`, because a new checkout has no generated `.astro/` types; with them copied it passes. This is not a Phase 1 defect.
  - 1.7 `prettier --check` on the change folder: exit 0.
  - 1.10 `test_inputs.py`: 8 tests, OK.
  - 1.11 `test_budget.py`: 12 tests, OK.
  - 1.12 `baseline.ts --check-auto --all`: exit 0. All eight records labelled "recomputed", one Chrome 156 session `f2814060`.
  - 1.1 and 1.4 re-derived their outputs into the shared `test-photos/private/s19/`.
- **Manual acceptance**: 1.8 is `current` (accepted at d123229). 1.13 is pending: its parameters are recorded as "recomputed", not "observed applied", as the owner decision says. 1.9 is `[x]` with no acceptance revision, so the script reports it as a legacy mark. Its own text says the headless check at ea87ae4 was delegated and is "not personal owner manual acceptance", so it counts as pending acceptance, not confirmed.
- **Scope**: `scripts/s19/make-series.py` and `scripts/s19/s19.ts` are not named in the plan. They are helpers that implement planned contracts (series manifest generation; the shared TypeScript route to the guard) and are not scope creep. The `s19-local/` publication was an owner request (README), apart from F3.
- **Mutation check**: skipped. Phase 1 changes no application code; no `test-plan.md` §2 risk maps to `scripts/s19/`, and the configured Stryker scope is the TypeScript under `src/lib/**`.
- **Lessons**: 35 of 39 `lessons.md` entries apply to impl-review. The strongest priors were "A guard metric that only exists on success" (attempt counting, which holds), "An admission gate that counts a set and then writes must be ONE guarded write" (the cap holds, but the per-slot state does not: F4), and "A check that cannot say what it found" (F1).
- **Not raised as findings** (judged acceptable or too minor):
  - `INVALID` outputs are retried as transient (`run-candidate.py:396`). This is consistent with the plan's definition of a technically valid result (format and size), since it is not a quality reroll.
  - `actual_cost` ignores output text tokens.
  - The fal output GET ignores its HTTP status.
  - The approval parser skips, rather than rejects, lines not starting with `- S19-`. This fails closed for approvals, but a malformed decline would be ignored.
  - `close` passes when the roadmap has no S-19 row.
  - `baseline.ts`'s 127.0.0.1 server checks neither Origin nor Host.
  - `--check-auto` requires one user agent but not one `session_id`.
  - The `.auto.json` records publish the browser version and session UUIDs.
  - The configs' `implementation` field pins only `inputs.py`, not `run-candidate.py`.
