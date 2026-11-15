<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: S-20 Step 1 (1a: NLM) — Classical Denoise vs No-Denoise Control

- **Plan**: context/changes/cloud-classical-denoise/plan.md
- **Scope**: Phase 3 (phases 0–6)
- **Session**: fresh
- **Base**: 422ed562fec31ebf2c1f140b63132ba10e793884 (Progress — previous phase's commit)
- **Head**: b83a7c4ede49054a9cb3c8659210036c70958b69
- **Worktree**: included(context/changes/cloud-classical-denoise/plan.md) — bookkeeping only (Progress SHA suffixes for 3.1/3.2); excluded temp_steps.md (outside scope)
- **Checks ran at**: b83a7c4 (current HEAD)
- **Manual acceptance**: 0 of 1 confirmed — pending: 3.3
- **Date**: 2026-11-05
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 4 observations
- **Triage**: 2026-11-06 — all 8 FIXED (uncommitted, carried); 3.3 awaits the owner's re-check

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Gate copies are written NLM-first, so file mtimes reveal the NLM side

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/s20/blind.py:373-375
- **Detail**: `key_sources` is a dict literal evaluated in the order `original`, `nlm_side`, `ref_side`, so `write_copy` always writes the NLM copy before the reference. On a synthetic gate build the NLM file had the older mtime in 6 of 6 pairs (two independent probes). Chrome's `file://` folder listing and `ls -l --full-time` show it. This is an identity channel the plan can remove [F2]. The pilot is not affected: it writes `kontrola` and then X/Y/Z in label order (`:357`).
- **Fix**: Write the copies in fixed name order (`original`, `A`, `B`), and `os.utime` every file in `tmp` to one constant before the `os.rename`. Add a test that mtimes and write order do not correlate with the sides.
- **Decision**: FIXED — Fix now (2026-11-06): gate writes original, A, B whatever the NLM side; every file in the set gets `FILE_TIME_NS` before the rename; `DrawTest.test_write_order_and_mtimes_carry_no_side` forces NLM to A and to B (fails on the old code: `p01-B` before `p01-A`); test_blind 20/20 OK. Siblings: pilot mode n/a for order (writes kontrola, then labels in sorted order), covered by the same mtime normalisation; no other writer of presentation files (grep `write_copy`). Reopened: none.

### F2 — PNG file size reveals the NLM side and orders the pilot strengths

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/s20/blind.py:72 (`COMPRESS_LEVEL = 6`), :315
- **Detail**: The plan asks only for "a fixed `compress_level`", and the code follows it to the letter. But the smoother NLM output deflates much better: in a synthetic gate probe the NLM file was 45–46 KB, against 65 KB for Local and 77 KB for the control, in every pair. In the pilot, size would rank X/Y/Z by `k`. F2's goal is "no identity channel the plan can remove", and this one can be removed. The plan's human control ("open only through the viewer") covers it only if the rater never lists the folder.
- **Fix A ⭐ Recommended**: Use `compress_level=0` (stored deflate), so a file's size depends only on its dimensions. Add a test that all images of an item have equal sizes.
  - Strength: Removes the channel structurally instead of relying on the rater's discipline. It is a one-line change plus one test.
  - Tradeoff: About 45–75 MB per 15–25 MP file, so roughly 2.4 GB for `pilot-1` and 2.9 GB for `gate-1` in `test-photos/private/s20/`. Each pane loads more slowly in the viewer.
  - Confidence: MED. Stored deflate is size-deterministic, but the size with Pillow's filter choice at level 0 has not been measured.
  - Blind spot: How browser decode time and memory behave with three 60 MB PNGs per pair.
- **Fix B**: Keep level 6 and record file size, together with mtime, as an accepted limit under "What We're NOT Doing", next to the recognition limit. Each seal file then states explicitly that the folder is never listed.
  - Strength: No disk or load-time cost, and it fits the plan's existing human-control model.
  - Tradeoff: The channel stays one `ls -l` away, and blinding rests on discipline alone.
  - Confidence: HIGH that it is cheap. Its strength depends on the owner's own behaviour.
  - Blind spot: Any tool that shows sizes by default, such as a file manager or a browser download bar.
- **Decision**: FIXED — Fix A (2026-11-06): `COMPRESS_LEVEL = 0`; `PresentationTest.test_every_image_of_an_item_has_the_same_size` in both modes (fails at level 6: pilot i01 X 38227, Y 60840, Z 45616, kontrola 77399 bytes); plan § Phase 3 item 1 names level 0 and the shared mtime; test_blind 21/21 OK. Siblings: `write_copy` is the only writer of rater-facing images (n/a elsewhere); the viewer loads them unchanged. Disk cost (~2.4–2.9 GB per real set) accepted with the fix. Reopened: none.

### F3 — Every click rebuilds the panes and resets the 1:1 scroll, so flip at 100% is unusable (owner-reported, blocks 3.3)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: context/changes/cloud-classical-denoise/references/compare-s20.html:762-799 (`render`), :660 (`footer`), :792-806 (`go`/`show`)
- **Detail**: The owner reported this; it is not accepted at 3.3. Confirmed: `render()` calls `main.replaceChildren()` (`:769`) and `footer()` calls `f.replaceChildren()` (`:660`), so every pane, `<img>` and control is recreated. It is called by the pilot choice (669), quality (682), fidelity level (693), draw toggle (704), chip ✕ (726), crop pointerup (586), `go` (796), `show` (803), the mode/zoom/bright buttons (808-811) and the keys Z/J/Esc (823/826/829). Each new `.pane.zoom` starts scrolled to 0,0. `show()` rebuilds the single flip pane, so every flip (1–5, Space) at 1:1 jumps to the top-left, and the same detail cannot be compared. Focus also falls to `body`. Partly refuted: the flip _side_ (`flipShow`/`flipPrev`, `:468-469`) does survive `render()`. Only `go()` resets `flipShow`, by design, and it leaves `flipPrev` stale, so Space after navigating may show an unexpected pane. The archived page rebuilt panes too (`compare-arms.html:492`, `509`), but its rating controls were static. The plan lists "synced 1:1 zoom" and flip as **kept** features, so in practice this is a regression of a kept feature.
- **Fix A ⭐ Recommended**: Split rendering. Rebuild panes only when the item, mode, zoom or bright changes. In flip mode, swap `img.src` and the label inside the existing pane. Rating, fidelity and chip clicks re-render only the footer (toggling `.on`) and the dots. Reset `flipPrev` in `go()`.
  - Strength: Fixes the cause: scroll, focus and an in-progress drag all survive, and it matches the archived page's static controls.
  - Tradeoff: A larger edit to the viewer, and 3.3 must be re-checked afterwards.
  - Confidence: HIGH. The rebuild path and its callers are fully enumerated above.
  - Blind spot: The synced-scroll handler (`syncScroll`) must be attached once per pane set, not per render.
- **Fix B**: Keep `render()` as it is, but save `scrollLeft`/`scrollTop` (as a fraction of the scroll extent) before `replaceChildren` and restore them after the new images load.
  - Strength: A small, local change.
  - Tradeoff: Restoring after an image loads causes a visible jump on large images and still loses focus. It patches the symptom.
  - Confidence: MED. It depends on load timing for 20 MP images.
  - Blind spot: How flip behaves when the next image is not yet decoded.
- **Decision**: FIXED — Fix A (2026-11-06): `renderPanes()` rebuilds only on item/mode/zoom/bright, keeping the 1:1 scroll across a mode or bright switch on the same item; the flip pane stacks every image of the item and `show()` toggles `hidden` + the label in place (instant, no reload); zoomed images get an explicit W×H box; ratings, fidelity, draw toggle, chip ✕, crop end and Esc call `update()` (controls, dots, crop overlays only); `go()` resets `flipPrev`. Verified headless (Playwright, synthetic sets from `blind_fixture.py publish`, scratchpad script `viewer-scroll.cjs`): 20/20 checks pass — scroll (120,90) survives flip keys, Space, quality/fidelity/draw/Esc, choice click, side mode and bright; the next item starts at 0,0; no page errors. The same script on the committed viewer fails 12 checks (scroll back to 0,0). Prettier clean. Siblings: archived `compare-arms.html` n/a (immutable archive); F4's drag defect is narrowed (crop end no longer detaches the image) but stays tracked in F4. Reopened: none (3.3 and 4.3 were pending, not accepted). 3.3 needs the owner's re-check.

### F4 — A key press during a crop drag records a bogus crop, possibly on the wrong pair, and can poison saved state

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: context/changes/cloud-classical-denoise/references/compare-s20.html:559-590
- **Detail**: The `pointermove` and `pointerup` listeners are added on `window` and nothing cancels them. If a key calls `render()` or `go()` mid-drag (Esc, ←/→, Z, J, 1–5, Space), the old `<img>` is detached but `up` still runs. `geometry()` then reads a zero rect, so `s = 0` and `toSource` returns ±Infinity. The crop clamps to an edge, or comes out NaN at the left edge, and it is pushed into `ans()` of the **current** item, which after an arrow key is another pair. Esc ("przerwij kadr") records a crop instead of aborting. A NaN crop is saved as `null`. On the next load `validCrop` fails and the whole state is discarded as corrupt, so every answer is lost. This directly threatens the gate's evidence, because fidelity crops are binding.
- **Fix**: Keep a drag token. `render()`, `go()` and Esc remove both listeners and drop the drag without pushing. Use `setPointerCapture`, and run `validCrop` before any push. This lands naturally with F3 Fix A.
- **Decision**: FIXED — Fix now (2026-11-06): a `drag` token whose `cancel` removes both listeners and the live box; `renderPanes()` (item, mode, zoom, bright), `show()` (flip) and Esc cancel it; the crop is pushed only into the answer of the item the drag started on, and only if `validCrop` accepts it (no `setPointerCapture`: window listeners plus cancellation cover it). Verified headless (scratchpad `viewer-drag.cjs`, synthetic gate set): 10/10 pass — →, flip and Esc mid-drag record nothing, no live box remains, a normal drag stores one integer crop inside 640×427, state survives a reload. On the committed viewer the same script fails 7: → mid-drag put an edge-clamped 449×371 crop on **p02**, Esc recorded a crop. F3's scroll script still 20/20. Prettier clean. Siblings: none (the only pointer-drag handler is `attachDrawing`). Reopened: none.

### F5 — `committed_bind` lets a missing bind field pass as `None == None`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/s20/blind.py:127-128
- **Detail**: `implementation_sha256` and `opencv_version` are read with `fields.get(...)`. A bind line missing either one would yield `None`, and an NLM record also lacking that field would then pass the provenance check. Today's committed bind has all three fields, so nothing passes wrongly now.
- **Fix**: Require all three fields to be present, non-empty strings, and raise `Blocked("calibration not committed", …)` otherwise. Add one test.
- **Decision**: FIXED — Fix now (2026-11-06): `committed_bind` refuses (`calibration not committed`) a bind line without a non-empty `implementation_sha256`, `config_sha256` or `opencv_version` (`BIND_FIELDS`, also used by the provenance comparison); `test_a_bind_line_missing_a_field_is_refused` strips each field in turn (mutant without the check: fails). Siblings: `nlm.py`'s own bind reader n/a here (Phase 2 scope; it writes the bind, and its render check compares all three explicitly per the phase-2 review); `pilot.py`/`gate.py` do not exist yet (Phase 4 should reuse `committed_bind`). Reopened: none.

### F6 — A bad `--set` exits 3, not the usage code 2, and the regex accepts a trailing newline

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: scripts/s20/blind.py:324-325
- **Detail**: `Blocked("usage", …)` goes through the CLI boundary and exits 3. The module docstring and every s19/s20 sibling use 2 for usage. `SET_ID.match` with a `$`-anchored pattern also accepts `"pilot-1\n"`.
- **Fix**: Validate `--set` with an argparse `type=` that uses `SET_ID.fullmatch`, so a bad value gets exit 2 from argparse.
- **Decision**: FIXED — Fix now (2026-11-06): `--set` is validated by argparse `type=set_id_arg` with `SET_ID.fullmatch` (exit 2, `must match …` on stderr); `build()` keeps a `fullmatch` check as defence; docstring updated. `test_a_bad_set_id_is_a_usage_error` adds `"pilot-1\n"` (mutant without `type=`: 5 failures). Siblings: none in s20 (`nlm.py` takes no set id). Reopened: none.

### F7 — The BLOCKED line states what happened but not the way out

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: scripts/s20/blind.py:436-437
- **Detail**: The sanitized line gives state and subject (`set: <reason> (photo …)`), but the way out ("pick a new `--set`", "commit the calibration", "re-render the arm") exists only in the private log. The lesson "A check that cannot say what it found is a safety defect" requires state, subject and way out, and `nlm.py:28` follows it.
- **Fix**: Map each reason class to one fixed way-out string and print it. A constant per class leaks nothing.
- **Decision**: FIXED — Fix now (2026-11-06): `WAY_OUT` maps each of the ten reason classes to one fixed sentence, printed as `Way out: …` on the BLOCKED line (constants only: no arm, `k` or private path); the `blocked()` helper and the set-exists test assert it, and `test_every_reason_class_has_one_way_out` scans `blind.py` so a new reason without a way out fails (mutant without the print: 13 failures). Siblings: `pilot.py`/`gate.py` (Phase 4) must follow the same shape — noted, not yet code. Reopened: none.

### F8 — Two small build-time races: set-id reuse at rename, and `write_copy` re-opening an unguarded path

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/s20/blind.py:328 → :393; :306-309
- **Detail**: (1) The `final.exists()` check runs minutes before `os.rename(tmp, final)`. On Linux, `rename` onto an existing **empty** directory succeeds, so "a set id is never reused" has a TOCTOU gap. A SIGKILL also leaves `.<set_id>-XXXX` (with its key) behind; the viewer cannot load it, and nothing cleans it up. (2) `write_copy` re-opens `src["_abs"]` without a second `check_paths`. If a symlink were swapped after verification, its target's bytes would be hashed before the refusal. Both are low risk on a single-user machine.
- **Fix**: Re-check `final` right before the rename, or use `renameat2(RENAME_NOREPLACE)` via `os.link`-style semantics. Keep the resolved realpath from verification and open that in `write_copy`.
- **Decision**: FIXED — Fix now (2026-11-06): (1) `os.path.lexists(final)` is re-checked right before `os.rename`, refusing `set exists` and leaving a directory that appeared untouched; (2) `source()` keeps the realpath the guard passed and `write_copy` re-runs `check_paths` on it before hashing. Tests `test_a_set_dir_that_appears_during_the_build_is_not_replaced` and `test_every_copy_re_guards_the_realpath_it_opens` (each mutant fails). The leftover `.<set_id>-XXXX` after a SIGKILL is not cleaned automatically (accepted: unloadable, id stays free). Siblings: no other writer renames into `private/s20/`. Reopened: none.

## Review Notes

- **Bookkeeping in diff**: context/changes/cloud-classical-denoise/change.md, context/changes/cloud-classical-denoise/plan.md, context/changes/cloud-classical-denoise/evaluations/step1-calibration.md, context/changes/cloud-classical-denoise/reviews/impl-review-phase-2-422ed56.md
- `scripts/s20/nlm.py` (1 line, dropping the OpenCV thread count from the calibration record) is the phase-2 review's F3 fix, which landed in the p3 commit. It matches that review's decision and the re-calibrated bind (`ab27728f…` equals the current `nlm.py` sha256).
- Automated checks (run at b83a7c4):
  - 3.1 `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s20/tests -p 'test_blind.py'`: exit 0, 19 tests OK.
  - 3.2 `npx prettier --check …/compare-s20.html`: exit 0, "All matched files use Prettier code style!".
  - Also run: the full s20 suite, exit 0, 57 tests; the S-19 suite, exit 0.
- The owner's defect report on 3.3 is recorded as F3. 3.3 stays pending until the viewer fixes land and the owner re-checks.
- Deferred to Phase 4 by plan, not findings:
  - Gate mode does not enforce 8 photos / 16 pairs; the tests use 3.
  - `S20_REPO` can redirect the freeze read while the key records `FROZEN_REL`; the step-8 precondition should refuse it outside tests.
  - Local's JPEG is bound by dimensions only; the plan's gate binds it to its private baseline hash.
  - The viewer does not recompute `set_digest`.
- Owner's call, not a finding: the key (`.key-do-not-open.json`) sits in the set folder the browser can list. Chrome's `file://` listing shows dotfiles. This follows the plan's contract.
- Extra key fields (`comparison`, `calibration_bind`, `freeze`, per-source `record`/`record_sha256`) go beyond the contract, but only on the private key side. They are harmless.
- Mutation check skipped: the touched code is Python/HTML under `scripts/s20/` and `context/`, outside the Stryker/Vitest scope (`src/lib/**`), and it touches no `test-plan.md` risk.
- Lessons: 35 of 39 ledger entries applied (Applies to names impl-review or all). The one that bore on findings is "A check that cannot say what it found…" (F7).
- A drift-review probe left a synthetic fixture directory at `/tmp/tmpk0_zvtg5`; removing it was not permitted in this session.
- Triage verification (2026-11-06): s20 suite 63/63 OK, S-19 suite 85/85 OK, viewer prettier clean; headless viewer scripts (scratchpad `viewer-scroll.cjs` 20/20, `viewer-drag.cjs` 10/10) on synthetic sets `synthetic-{pilot,gate}-20261106t201817` in `test-photos/private/s20/` (built after the F1/F2 fixes; usable for the 3.3 re-check, delete when done).
