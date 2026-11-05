<!-- PLAN-REVIEW-REPORT -->

# Plan Review: S-20 step 1a — NLM

- **Plan**: `context/changes/cloud-classical-denoise/plan.md`
- **Brief**: `context/changes/cloud-classical-denoise/plan-brief.md`
- **Mode**: Deep
- **Date**: 2026-11-05
- **Plan sha256**: `f78abf2a66e3457cb646f2ceb8ec9e20760f8d7685f34b21d482d37da336cc54`
- **Scope**: Entire uncommitted plan, checked against the working-tree owner decisions of 2026-11-03 and 2026-11-05 and the actual S-19 code. First review; no previous report existed.
- **Verdict**: **RETHINK — repair the experiment's evidence protocol before implementation.** The owner-decided experiment and numeric decision rules are retained; this verdict concerns the protocol and its verification.
- **Findings**: 5 critical, 5 warnings, 0 observations.
- **Write boundary**: This report only. No plan, brief, lifecycle stamp, carry record, other working-tree file, index or archive was changed. No paid calls, installation, rendering or validation-photo access.

## Verdicts

| Dimension              | Verdict |
| ---------------------- | ------- |
| Requirement Definition | PASS    |
| End-State Alignment    | FAIL    |
| Lean Execution         | PASS    |
| Architectural Fitness  | WARNING |
| Blind Spots            | FAIL    |
| Plan Completeness      | FAIL    |

## Grounding

The eight domain definitions reproduce the binding decisions; the technical guarantees require the fixes below. The brief agrees with the plan's intended scope, including its protocol weaknesses. Existing modification targets and harness symbols exist. Proposed S-20 tools, configs, tests, viewer and evaluation artifacts are absent as expected and must have their directories created. The missing historical `context/changes/cloud-model-comparison/` is accurately documented and is not a new modification target. One archive-image premise is false (F4). There is no `docs/reference/contract-surfaces.md`.

Lessons selection: **29 of 39 entries** name plan-review or have no exclusion under the skill's selection rule; their full blocks were read. The applicable evidence-premise and informative-guard lessons directly reinforce F1, F3 and F4. The pointer-update lesson cited by the plan was also considered. One bounded read-only analysis delegate checked the protocol, blinding and holdout claims; its conclusions were checked against the source in this session.

### Commands and Automated criteria

There are **18 Automated criteria**. All currently executable, local, free, read-only commands were checked; future render/build/tally mutations were not run. `-B` suppressed Python bytecode writes; `TMPDIR=/tmp` was used for tsx-driven tests. ESLint used the installed dependency via `npx --no-install`, avoiding package download.

| Row | Command / criterion                                                                                             | Recorded planning status                                  | Review result                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 0.1 | `python3 -I -c "import cv2, numpy; print(cv2.__version__)"`                                                     | exit 1                                                    | **exit 1**, `ModuleNotFoundError: cv2`; matches                                            |
| 0.2 | `python3 -B scripts/s19/protocol.py check-access --ids S17-01 S17-02 S17-03 S17-04 S17-05 S17-06 S17-07 S17-21` | exit 0, but only S17-03 previously checked                | **exit 0**, all eight allowed; claimed outcome now checked for the actual list             |
| 1.1 | `python3 -B -m unittest discover -s scripts/s20/tests -p 'test_nlm.py'`                                         | needs Phase 1 output                                      | Not executable yet: test directory absent                                                  |
| 1.2 | JSON parse and `len(c['k']) == 3`                                                                               | needs Phase 1 output                                      | Not executable yet: config absent; also only checks length, not the specified values/order |
| 2.1 | `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s20/tests -p 'test_arms.py'`                            | needs Phase 2 output                                      | Not executable yet: tests absent                                                           |
| 2.2 | `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s19/tests`                                              | 29/29 tally tests exit 0; full command not rerun          | **exit 0, 85 tests**, 43.546 s; the recorded subset is not this command (F5)               |
| 2.3 | `npm run typecheck`                                                                                             | exit 0                                                    | **exit 0**                                                                                 |
| 2.4 | `npx eslint scripts/s19/local-arms.ts scripts/s19/s19.ts`                                                       | exit 0                                                    | **exit 0**, four existing `no-console` warnings                                            |
| 3.1 | `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s20/tests -p 'test_blind.py'`                           | needs Phase 3 output                                      | Not executable yet: tests absent                                                           |
| 3.2 | Prettier check of `references/compare-s20.html`                                                                 | needs Phase 3 output                                      | Not executable yet: viewer absent                                                          |
| 4.1 | `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s20/tests`                                              | needs Phase 4 output                                      | Not executable yet: tests absent                                                           |
| 5.1 | `nlm.py --all --config scripts/s20/configs/nlm-grid.json`                                                       | writes                                                    | Skipped: real render and artifact writes                                                   |
| 5.2 | `local-arms.ts control-full --all` and `nlm-gamma --all --nlm-k <k>`                                            | writes                                                    | Skipped: real renders/writes; new arms absent                                              |
| 5.3 | `blind.py pilot --set pilot-1`                                                                                  | writes                                                    | Skipped: builder writes and is absent                                                      |
| 5.4 | `pilot.py --set pilot-1 --export .../pilot-ratings.json`                                                        | needs Phase 5 rating                                      | Skipped: code/evidence absent; also writes freeze/result                                   |
| 6.1 | `blind.py gate --set gate-1`                                                                                    | needs Phase 5 output                                      | Skipped: code/evidence absent; builder writes                                              |
| 6.2 | `gate.py --set gate-1 --export .../gate-ratings.json`                                                           | needs Phase 6 rating                                      | Skipped: code/evidence absent; gate writes reports                                         |
| 6.3 | `grep -n -E 'NIE rozpoczęte                                                                                     | not started' temp_steps.md context/foundation/roadmap.md` | needs Phase 6 output                                                                       | **exit 0**, matches unrelated roadmap line 285; assertion is inverted and unscoped (F5) |

The separately cited `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s19/tests -k tally` also passed: **exit 0, 29 tests**. Test messages mentioning paid responses or disk failures came from synthetic fake-provider tests; no provider was called (`test_budget.py:1-5,50-72`). Fixtures override manifest/private/change paths (`fixtures.py:95-145`), including synthetic validation IDs unrelated to real holdout bytes.

The read-only acceptance-state script exited 0 and reported all ten Manual progress rows pending. A separate body/progress count check found the Phase 2 mismatch in F5; acceptance-state is not a general plan-format validator.

### Measured tuning-only premises

Before opening or hashing images, the review called `require_access` for the explicit eight tuning IDs and `check_paths` for each concrete common/Local/archive path. No photo-directory enumeration was used.

| ID     | Common and real Local dimensions | Prepared NAFNet dimensions | Private Local vs archived JPEG     |
| ------ | -------------------------------- | -------------------------- | ---------------------------------- |
| S17-01 | 3840 × 2560                      | 3840 × 2560                | Archived JPEG intentionally absent |
| S17-02 | 3840 × 2221                      | 3840 × 2221                | Identical                          |
| S17-03 | 3840 × 2560                      | 3840 × 2560                | Identical                          |
| S17-04 | 4032 × 3024                      | 3968 × 2976                | Identical                          |
| S17-05 | 3072 × 4080                      | 2976 × 3968                | Identical                          |
| S17-06 | 4284 × 5712                      | 2976 × 3968                | Identical                          |
| S17-07 | 5145 × 3431                      | 3968 × 2640                | Identical                          |
| S17-21 | 6016 × 4000                      | 3968 × 2624                | Identical                          |

All eight common-file hashes match their sidecars and Auto records' `common_sha256`. All eight real Local downloads are **JPEG**. The proposed new arms are PNG. Dimensions confirm the need for `control-full`; equal dimensions alone do not prove equal decoded samples or matching Auto provenance (F9).

## Findings

### F1 — Hash consistency does not enforce pre-registration order

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Plan lines 126–145, Phase 1 renderer, Phase 3 builder, Phase 4 pilot, Phases 5–6
- **Detail**:
  The plan promises grid → pilot-key commitment → pilot → freeze commitment → gate-key commitment → gate. Its specified checks verify content consistency, not that ordering. `nlm.py` has no committed-grid/rule precondition; `pilot.py` has no committed pilot-key precondition; `blind.py gate` requires only a frozen file and matching pilot hashes. A frozen file containing a different `k` can still name the genuine pilot export/key hashes unless the selection is recomputed. No contract defines which commit supplies a commitment, requires it to be an ancestor, or binds the executable estimator, mapping, vote/gate rules and gamma dependencies to that revision. A late commitment after viewing outputs can therefore satisfy the specified final checks. Existing `protocol.require_access` checks splits, not S-20 chronology (`protocol.py:305-350`); the plan explicitly does not reuse S-19's freeze path.

  Phase 0 also renders before Phases 1–4, contrary to “all rules ... before any output is rendered.” Its unviewed timing probe can be a stated exception, but cannot silently count as following that guarantee.

- **Fix**: Define transition preconditions using explicit committed Git objects and ancestor order, scoped cleanliness checks, immutable set IDs, and exact rule/dependency/config/output bindings. Require pilot tally to verify its prior seal and gate construction to recompute the selected `k` from the sealed valid pilot before accepting the committed freeze. Reject a changed grid, rules, key, manifest or selected render; test each out-of-order invocation. Treat “owner has not opened the files” as an explicit human control: Git history cannot prove absence of earlier viewing.
  - Strength: Makes ordinary ordering mistakes and post-result substitutions detectable without changing the owner-decided vote or gate.
  - Tradeoff: Adds a small S-20-specific evidence-state contract and synthetic Git-history tests.
  - Confidence: HIGH — the proposed schemas/preconditions do not encode these transitions.
  - Blind spot: No local protocol can establish that an operator never viewed an otherwise accessible file.
- **Decision**: FIXED — owner accepted 2026-11-05; plan revised: committed-and-clean preconditions + ancestor order + recompute k from the sealed pilot (owner choice); order table in plan § Implementation Approach, `scripts/s20/evidence.py`, Phase 0 probe declared as an exception.

### F2 — Byte copies expose identities outside the sealed key

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Plan lines 133–135, 346–355, 394–395
- **Detail**:
  Every blind image must be an unchanged byte copy under a `…png` path. Real Local is a JPEG (`tally.py:150-153`, independently checked above); both new arms are PNG (`plan.md:298-299`). File signatures, metadata and size reveal the Local side despite an anonymous filename, and consequently reveal NLM in that pair. The same NLM output appears in both pairs for a photo: matching bytes identifies the common arm as NLM without opening the key. Matching against the pilot identifies it again; the pilot also shows a labelled control that reappears in the gate. Removing hashes from the manifest does not remove these fingerprints. Padding files alone cannot conceal identical decoded pixels across the paired design.
- **Fix**: Specify the blinding threat model and a separate presentation-artifact contract: uniform lossless encoding and metadata policy, anonymous names, a size/linkage policy, source-byte hashes kept privately, and verified decoded-pixel bindings for presentation copies. Separate rater-facing data from keys and decoded pilot reports; explicitly address cross-pair/pilot linkage in presentation and inspection procedures. Test JPEG/PNG signatures, metadata, repeated payloads and source-fingerprint matching, not just manifest strings. State the remaining recognition limit of repeated visible content; do not claim that renaming or re-encoding makes it impossible.
  - Strength: Removes deterministic identity channels while preserving the owner's required comparisons and source provenance.
  - Tradeoff: Revises the byte-identical-copy criterion; strong resistance to pixel matching conflicts with showing the same candidate in both required pairs.
  - Confidence: HIGH — the existing files' formats and the repeated-source construction establish the leak.
  - Blind spot: The owner-required repeated-image design cannot guarantee anonymity against an operator comparing all decoded images. This is a limitation of the guarantee, not a request to replace the binding design.
- **Decision**: FIXED — owner accepted 2026-11-05; plan revised: presentation copies re-encoded from decoded pixels (PNG, no metadata), pixel-bound in the key; viewer-only human control; repeated-content recognition stated as a limit.

### F3 — The ID guard does not guard the image paths being read

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 0 probes; Phase 1 `nlm.py`; Phases 2–4 record, copy and hash reads
- **Detail**:
  Phase 1 specifies only `protocol.require_access` before reading an input (`plan.md:227-231`); Phase 3 names a validation-ID refusal test, and pilot/gate verification adds further image hash reads without an access-order contract. `require_access` validates claimed IDs only (`protocol.py:317-330`). A tuning ID can still name a holdout file through a sidecar, nested record, key path or symlink. Verifying a hash already reads the forbidden bytes. The existing `check_paths` explicitly addresses this distinction and resolves symlinks (`protocol.py:353-382`); `viewer-inputs.py:86-100` calls both guards before `describe` hashes/opens files (`:44-53`). That pattern is not specified for the new paths.
- **Fix**: Require tuning-ID checks plus `check_paths(..., validation=False)` / TS `guardPaths` on every concrete resolved image path before hashing, copying, metadata opening or decoding, including nested records, original references and the Phase 0 probe. Add synthetic read traps for a tuning ID whose path or symlink targets a synthetic holdout; assert no byte read occurs. Do not add a validation-release option to S-20 step 1a.
- **Decision**: FIXED — owner accepted 2026-11-05; plan revised: `require_access` + `check_paths`/`guardPaths` on every resolved path before any read; read-trap tests in every new tool.

### F4 — Phase 0 requires an archived JPEG deliberately withheld from publication

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 0, premise check 3 (`plan.md:173`) and failure policy (`:180-181`)
- **Detail**:
  The check requires all eight private Local JPEGs to match archived copies. `references/s19-local/S17-01.jpg` does not exist. This is deliberate, not corruption: the archive's `references/README.md:80-100` says seven JPEGs were published and S17-01 remained private because its author/uploader rights gap was unresolved; only its Auto record was published. The archive's `change.md:96-106` records its removal. Thus the proposed premise check cannot pass as written, although all eight private Local files exist and their dimensions match. The working-tree change's reuse description also claims eight archived baseline images; the archive's own per-file record is more precise.
- **Fix**: Check the seven published JPEGs against their archived copies; bind S17-01 to the established private baseline hash and its Auto/source record separately. Record its intentionally private status as an expected condition. Do not publish that JPEG, recreate it in the archive, or edit the immutable archive to satisfy this plan.
- **Decision**: FIXED — owner accepted 2026-11-05; plan revised: seven archived JPEGs compared; S17-01 bound to its private hash and archived Auto record; absence recorded as expected.

### F5 — The Progress contract and two Automated checks are malformed

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 Success Criteria (`plan.md:321,325-327`); Phase 6 Automated criterion (`:607`); Progress
- **Detail**:
  The skill's mandatory criterion↔Progress contract fails: Phase 2 has one Manual Verification bullet, “none beyond Phase 5's renders,” but no corresponding Manual row. All other per-phase criterion/row counts match; exactly one bottom `## Progress` exists and no checkboxes occur in phase bodies. This is a mechanical contract violation, not an additional human task.

  The recorded 29-test outcome under the full S-19 discovery command is a different command's result. The full command now passes **85 tests**, while `-k tally` passes 29. The short-TMPDIR full run is feasible and safe against synthetic fixtures.

  Phase 6's positive `grep` exits **0 when stale text exists** and **1 when none exists**, the reverse of a passing “No stale pointer” check. It is also not scoped to S-20: running it now returns an unrelated deliberate hold at `roadmap.md:285`. An honest S-20 update would not make this a correct gate.

- **Fix**: Remove Phase 2's empty Manual Verification placeholder section; record results against their exact commands; replace the pointer criterion with a scoped assertion that exits 0 only when S-20's relevant sections contain no stale status. Preserve grep/read errors as failures. Strengthen the JSON grid criterion to assert the actual pre-registered values, not only their count.
- **Decision**: FIXED — owner accepted 2026-11-05; plan revised: empty Phase 2 Manual removed; statuses tied to exact commands (85 tests); scoped, non-inverted pointer check; grid check asserts values.

### F6 — The manifest hashes itself and simultaneously forbids its digest

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 3 manifest/key/export contracts (`plan.md:352-361,381-386,394`)
- **Detail**:
  The key binds `manifest_sha256`, the viewer echoes it, and line 385 embeds that digest in the manifest itself. A literal hash of the final file cannot be computed by inserting its own hash. Meanwhile the manifest contract and test forbid hashes altogether. No canonical payload/exclusion rule resolves this. S-19 does not establish such a convention: `viewer-inputs.py:120-121` hashes the separate benchmark manifest, not its generated viewer manifest. An implementer must invent which bytes the supposed evidence hash actually authenticates.
- **Fix**: Name benchmark and blind-set hashes distinctly. Define canonical serialized payload bytes excluding the digest field, or hash an immutable separate payload and put its digest in an envelope. Specify exactly what the key, viewer, export and gate compare; allow that one set digest in the otherwise anonymous manifest, with a test for payload tampering and canonicalization.
- **Decision**: FIXED — owner accepted 2026-11-05; plan revised: set digest = sha256 of canonical payload excluding `set_digest`; the only hash in the manifest.

### F7 — Persisted state and uncertain re-export have no immutable-set contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 viewer persistence/export; Phase 6 BLOCKED loop; Testing Strategy
- **Detail**:
  “localStorage keeping the state” (`plan.md:377`) does not specify a namespace, schema validation or behavior when `gate-1` is rebuilt. Old ratings for `p01` can be exported with a new manifest's current digest and pass structural checks despite having been made on different pixels/sides. The inherited viewer keys storage by series/benchmark/name (`compare-arms.html:349-364`), stores identity-bearing `candIs` and arm-derived pair IDs, and translates sides into candidate/reference during export (`:647-693`). The proposed anonymous export is correct, but these inherited paths must be explicitly removed and checked on reload, not merely hidden on screen.

  The BLOCKED-first rule correctly blocks reference-side uncertainty too. However, tests cover a report in isolation, not reload → resolve → re-export. Raw path-bearing hash exceptions or a decoded diagnostic written before discovering uncertainty can still defeat the stated report rule.

- **Fix**: Bind persisted ratings to a versioned immutable set fingerprint, kind and anonymous IDs; validate restored state and refuse stale/rebuilt-set reuse. Keep identity mappings out of browser state and both export formats. Add a synthetic viewer round trip: rate, reload, gate BLOCKED, edit the unresolved rating, re-export, verify unchanged pairing/config and preserved other ratings. Include corrupt-storage, changed-set and binding-error cases; check stdout, stderr and report artifacts for identity/path leaks before a terminal verdict.
  - Strength: Tests the actual path through which a blinded rating is resumed and accepted.
  - Tradeoff: Needs focused browser verification for an offline tool; it need not become an app E2E framework.
  - Confidence: HIGH — persistence and restore semantics are currently unspecified, and the inherited identity fields are concrete.
  - Blind spot: A browser test cannot establish subjective recognition resistance (F2).
- **Decision**: FIXED — owner accepted 2026-11-05; plan revised: storage keyed `s20:<kind>:<set_digest>`, identity-free, validated on load; manual round-trip check; leak scans of all outputs.

### F8 — The grid's luma-noise rationale does not transfer to OpenCV's Lab implementation

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 grid and NLM contract (`plan.md:215-239`); brief's grid justification
- **Detail**:
  The Immerkær kernel/formula is a coherent estimator for additive Gaussian noise in the scalar plane being measured. Its known failure on thin texture matters here: the paper itself notes that thin lines in highly textured regions are perceived as noise. That needs a stated synthetic tolerance/texture construction rather than a promise of recovering the injected sigma on unspecified texture. See [Immerkær's paper](https://doi.org/10.1006/cviu.1996.0060).

  The 7/21 windows are supported defaults. The claimed weights 0.14/0.41/0.61, however, assume sigma and patch distance inhabit the same space. Here sigma is estimated in BT.601 encoded-RGB luma, while the selected CPU function filters 8-bit Lab L and AB separately. Its 4.13.0 implementation specifically uses `COLOR_LBGR2Lab` and `COLOR_Lab2LBGR`, accepts 8-bit 3/4-channel input, and returns the same type. Equal numeric h/hColor values therefore do not establish equal noise-relative filtering in those channels. See [OpenCV denoising docs](https://docs.opencv.org/4.13.0/d1/d79/group__photo__denoise.html) and [versioned implementation, lines 168–207](https://github.com/opencv/opencv/blob/4.13.0/modules/photo/src/denoising.cpp#L168-L207).

  The **inference** is that the probability-like grid justification is not established for this pipeline. It is not evidence that these three empirical strengths cannot work. Merely saying BGR↔RGB is explicit leaves the encoded/linear convention, Lab quantization, signed estimator arithmetic and conversion-only changes untested. The prepared common input is explicitly encoded sRGB (`inputs.py:6-9,85-100`), so an unnoticed conversion or RGB channel swap changes the tested operation.

- **Fix**: Keep the owner-required pre-render freeze, but describe the grid as a bounded empirical hypothesis unless its calibration is demonstrated on synthetic data through the actual pinned OpenCV path. Specify dtype/range/channel order and conversion conventions; test asymmetric colors, dark ramps, clipping, flat/texture noise, positive finite sigma/h and a conversion-only round trip. Freeze and record these choices before real rendering. Do not retune from the real gate afterward.
  - Strength: Preserves the bounded NLM-first trial and makes its result interpretable.
  - Tradeoff: Synthetic calibration may expose a need to revise the proposed grid before registration.
  - Confidence: HIGH for the unit mismatch and API behavior; actual image impact is unmeasured because OpenCV is absent.
  - Blind spot: Synthetic white noise does not reproduce correlated, processed camera/JPEG noise; record that limitation.
- **Decision**: FIXED — owner accepted 2026-11-05; plan revised: σ̂_L / σ̂_ab estimated in the filter's own `COLOR_LBGR2Lab` space (owner choice); synthetic calibration through the real OpenCV path before the freeze.

### F9 — Matching input hashes does not bind the same decoded pixels, Auto record and LUT

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 arm contract/tests; Phase 4 source-binding validation
- **Detail**:
  Extending the existing renderer is a sound choice: it uses `buildGammaLut`, sigma 0 is an identity blur, and both outputs can share its PNG writer (`local-arms.ts:88-90,116-133,265-295`). The plan correctly avoids recalculating Auto from denoised pixels. However, today's Auto check proves that each record is internally consistent with its own saved stats and common hash; it does not pin that record across two render invocations (`:122-133`). The emitted record retains only common hash, session ID and provenance for Auto (`:285`), not the Auto-file or LUT hash. A changed but internally consistent Auto record between arm runs can produce different gamma with the same common input. “Every binding verifies” does not explicitly compare these paired values.

  Also, `control-full` decodes JPEG through sharp's sRGB path (`:78-85`), while NLM's decoder is unspecified beyond BGR/RGB. Equal JPEG file hashes do not establish identical decoded RGB arrays across different decoders/color policies. The proposed tests check each LUT application independently, not equivalence before the denoiser. This is an unproven match, not a measured decoder discrepancy.

- **Fix**: Bind both arm records and the gate to the exact same Auto-file hash, gamma/LUT hash, common decoded-pixel hash, dimensions and frozen implementation dependencies; reject a mismatch across the paired records. Specify one common decode/pixel handoff or prove sample equality. Add a synthetic identity-denoiser test producing pixel-identical control/full outputs, plus a between-runs Auto mutation test. Document the actual OpenCV conversion as part of the NLM treatment (F8), separately from accidental decoder drift.
  - Strength: Directly tests the claim that the denoising treatment is the only changed variable.
  - Tradeoff: Adds small provenance fields and potentially a lossless shared decoded-input artifact.
  - Confidence: HIGH for the missing cross-arm binding; decoder difference remains a risk to test, not an observed failure.
  - Blind spot: Real Local remains a browser JPEG with its native blur/encoding; it is intentionally a diagnostic reference, not this matched quality control.
- **Decision**: FIXED — owner accepted 2026-11-05; plan revised: single sharp decode shared by both arms; records bind decoded-pixel, Auto-file and LUT hashes, compared across arms; identity-denoiser test.

### F10 — The promised committed reproduction lacks committed keys and records

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Desired End State (`plan.md:93-94`); key placement (`:354-355`); Phases 5–6 evidence lists
- **Detail**:
  Reproduction is promised from the “committed export, key and records.” Keys are written only under gitignored `test-photos/private/s20/<set>/.key-do-not-open.json` (confirmed with `git check-ignore`); phases 5–6 commit a key's hash, not its contents or a declared post-verdict copy. Arm/NLM records are private too. The gate additionally re-reads blind/source files. Thus a checkout does not contain the advertised inputs, and there is no declared post-verdict audit bundle or distinction between metadata-only audit and full private-byte verification. S17-01 also prevents assuming all baseline JPEGs can be made public (F4).
- **Fix**: Specify post-terminal-verdict publication paths for the keys and required non-image records/manifests, their hash links, and the exact private image prerequisites for full reproduction. Keep them unavailable to the rater while BLOCKED. Alternatively narrow the claim explicitly to reproduction on the retained private workspace, with its required inventory. Do not publish image bytes to repair a missing metadata contract.
- **Decision**: FIXED — owner accepted 2026-11-05; plan revised: reproduction claim narrowed; post-verdict audit bundle of keys, manifests and records (no images) plus private inventory; `gate.py --audit`.

## Independent degenerate walkthrough

This uses newly constructed votes/ratings, not just the plan's examples. S-20 code does not exist yet: outcomes below are what the plan specifies, with the relevant current S-19 behavior identified separately.

| Constructed evidence                                                                                      | Required result / assessment                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Six control wins (a mix of slight/clear), one control loss, one tie; no disallowed NLM fidelity           | PASS. Two remaining photos need not be ties; losses on quality are allowed within the ≥6/8 rule.                                                                                                                             |
| Five control wins, three ties; all eight Local pairs prefer NLM                                           | FAIL. Local quality is diagnostic and cannot supply the sixth control win.                                                                                                                                                   |
| Eight control ties, no fidelity loss                                                                      | FAIL, not PASS for “no harm.”                                                                                                                                                                                                |
| Six control wins; one photo has NLM `minor` against control and substantiated `significant` against Local | FAIL. A loss found in only the second pair counts; the lower rating does not cancel it.                                                                                                                                      |
| Eight control wins; reference side has substantiated severe loss; every NLM side has `none`               | PASS. Reference loss is diagnostic; the original, not preserving reference artifacts, determines NLM fidelity.                                                                                                               |
| Otherwise passing data; one reference side is `uncertain`                                                 | BLOCKED first. Do not reveal whether the uncertain side is the candidate. Resolve against the original on the same set, then re-export (F7).                                                                                 |
| One `significant` NLM rating has a reason but no crop, despite enough wins                                | BLOCKED, not FAIL based on unsubstantiated evidence.                                                                                                                                                                         |
| Sixteen export rows, but one pair repeats and another is missing                                          | BLOCKED. Count rows and semantic comparisons independently. Current S-19 rejects both duplicate rating IDs and duplicate comparisons (`tally.py:211-216,252-255`); the new gate must not silently deduplicate.               |
| Sixteen unique pair IDs, but the key maps two to the same photo/reference comparison                      | BLOCKED. Expected coverage must be independently derived as exactly eight IDs × two reference kinds, not accepted because key and export agree with one another.                                                             |
| Legacy S-19 export has preference but no per-side fidelity; unknown/null level; missing side              | BLOCKED schema error. Existing tally reads its own preference/flags, not the new S-20 fidelity contract. No implicit `none` default.                                                                                         |
| Pilot totals k=1.0:2, k=1.5:2, k=2.0:1, none:3                                                            | Select k=1.0: tie between leaders resolves to weaker k.                                                                                                                                                                      |
| Pilot totals k=1.0:0, k=1.5:0, k=2.0:1, none:7                                                            | Select k=2.0. `none` is abstention, not a competing majority or automatic STOP.                                                                                                                                              |
| Eight pilot `none` choices                                                                                | STOP, no gate/finalist. Any old frozen file must be unusable for this attempt; the order/attempt contract needs F1.                                                                                                          |
| Seven pilot choices plus one duplicate item/photo, or an invalid label                                    | BLOCKED, not deduplicated to a partial vote or treated as `none`. Plan decides validity correctly; add explicit duplicate/invalid tests beyond the named missing-photo case.                                                 |
| Crop at x=width−1,y=height−1,w=h=1                                                                        | Valid boundary if source-pixel coordinates use a declared half-open rectangle convention. Zero/negative size, nonfinite values and overflow must BLOCK; define rounding/integer policy and coordinate mapping from any pane. |
| Flat synthetic image has sigma=0, so every mapped h=0                                                     | The plan refuses rendering. That is a technical refusal, not eight `none` votes; record it separately, with no stale freeze reuse. Do not invent epsilon tuning after real outputs.                                          |

The arithmetic quality/fidelity/vote rules faithfully reflect the two owner-decision sections. The failures concern evidence authenticity, blinding, enforcement and verification. A significant/severe claim's truth remains a human judgment against the original; schema/crop validation cannot establish that truth automatically.

## Blast radius and limits

`s19.ts` is also imported by `baseline.ts`; adding a valued flag changes shared parsing, so its existing tests must remain green. `local-arms.ts` is a CLI with existing callers in the curve, historical and protocol tests and bindings consumed by `viewer-inputs.py`/`tally.py`. Reuse those record/guard conventions while preserving old arms; do not relax tally's paid-slot invariants. A separate S-20 gate/viewer fits the owner decision and avoids archive writes. No production code, Supabase change or model API is needed for this step.

OpenCV was not installed or executed, so no runtime NLM quality, determinism or performance claim is verified here. Versioned upstream source establishes API/color-space behavior; proposed renderer behavior remains a contract to implement and test. The owner-decided eight-photo pilot/gate and later holdout sequence are binding. **No owner decision is challenged by this review.** Recognition of repeated visible content is a separately stated limitation of the promised blinding guarantee (F2), not a proposal to change the gate or open the holdout.

## Re-review 2 (2026-11-05)

- **Mode**: Deep
- **Scope**: Whole rewritten plan and brief. The plan hash changed from round 1, which has no recorded post-triage hash or traceable `edited:` entries. All F1–F10 were rechecked against the owner's accepted fixes.
- **Plan sha256**: `3a1e8d90fd09677d5af8fe2141939697f48b5964a3325aa82d77f9ecbc138be2`
- **Brief sha256**: `f82553c58c1f57488ef5cfbbd516a530d969dcaf3606216432856e73a1f37d31`
- **Verdict**: **REVISE — targeted protocol and calibration corrections remain.** The selected committed-and-clean/ancestor approach and OpenCV-space estimator remain binding; neither needs replacing.
- **Findings**: 1 critical, 3 warnings, 0 observations. F11–F13 are residual gaps in accepted fixes; **F14 is a new defect introduced by the rewrite**.
- **Closes**: F2, F3, F4, F6, F9, F10.
- **Partially closes**: F1, F5, F7, F8. No earlier finding is wholly OPEN.
- **Write boundary**: Appended only this round. Earlier report bytes, plan, brief, change.md, roadmap.md, temp_steps.md, index and carry records were left untouched. No commits, paid calls, installations or real-photo reads. Synthetic probes used memory or automatically removed temporary directories; the actual validation split was never accessed.

### Verdicts

| Dimension              | Verdict |
| ---------------------- | ------- |
| Requirement Definition | PASS    |
| End-State Alignment    | FAIL    |
| Lean Execution         | PASS    |
| Architectural Fitness  | PASS    |
| Blind Spots            | WARNING |
| Plan Completeness      | WARNING |

### F1–F10 closure check

Line references in this round refer to the reviewed rewrite of `plan.md`, not round 1's version.

| Earlier finding                         | Status      | Plan lines and assessment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 — pre-registration order             | **PARTIAL** | **96, 147–162, 332–337, 522–547, 598–601.** Seals, cleanliness, strict seal-before-ratings ancestry and recomputing `k` are now specified, and the Phase 0 probe is an explicit exception (208–216). However, ancestry checks the seal's oldest addition rather than whether the current seal existed before the ratings. The render prerequisite checks only part of the code the table says must be committed. See F11. This assessment accepts the owner's chosen mechanism and does not require full Git-object binding. |
| F2 — identity-bearing byte copies       | **CLOSED**  | **139–162, 408–417, 429–433, 470–478.** Uniform RGB PNG presentation copies replace JPEG/PNG byte copies, with anonymous paths, stripped metadata and privately held source/pixel bindings. Viewer-only inspection is a stated human control; repeated-content recognition is expressly outside the guarantee. This is closure under that threat model, not resistance to an operator matching pixels or compressed file sizes outside the viewer.                                                                           |
| F3 — unguarded resolved paths           | **CLOSED**  | **169–174, 255–256, 279–280, 334–335, 425, 479.** The contract now applies both ID and concrete-path guards before image or image-bearing-record reads, including nested paths and the Phase 0 probe. Synthetic read traps are required. `protocol.py:353–382` supplies the intended symlink-aware check; no validation-release mode is added.                                                                                                                                                                               |
| F4 — absent archived S17-01 JPEG        | **CLOSED**  | **46–50, 200–206.** Seven published JPEGs are compared, while S17-01 remains private and is bound separately to its private hash and archived Auto record. Its absence is expected. No archive repair or publication is proposed. This round did not reopen any photos to repeat round 1's measurements.                                                                                                                                                                                                                     |
| F5 — malformed Progress and checks      | **PARTIAL** | **287–290, 383–389, 726, 777–864.** All seven phase headings and all criterion/Progress counts now match; the suite status is the exact 85-test command, and the config assertion checks actual values. The pointer command's exit polarity is corrected, but its line regex still misses the real multiline S-20 status field. See F13.                                                                                                                                                                                     |
| F6 — self-hashing manifest              | **CLOSED**  | **418–424, 459–461, 473–474.** Canonical UTF-8 JSON excludes `set_digest`; that digest alone is allowed in the manifest and is echoed by key/export. The circular file-hash contract is gone. Payload tampering and key-order canonicalization have explicit tests.                                                                                                                                                                                                                                                          |
| F7 — stale state and BLOCKED leaks      | **PARTIAL** | **93, 175–177, 450–462, 495–503, 528, 547, 555–568, 614–615, 700–701.** Immutable set IDs, versioned state keyed by digest, schema validation and same-set resolution now close the persistence defect. All output channels are named. However, “caught and re-raised” does not itself sanitize Python's chained stderr, and the named leak test covers uncertainty rather than the raw order/hash/guard exception paths. See F12.                                                                                           |
| F8 — estimator/filter space mismatch    | **PARTIAL** | **61–66, 311–324, 351–377.** Estimating float64 Immerkær responses on the filter's actual 8-bit `COLOR_LBGR2Lab` channels closes the units/conversion mismatch. The mapping and bounded-hypothesis limitation are explicit. Calibration still lacks an actual tolerance/texture construction and now promises a false ±1 conversion bound. See the new F14. The owner's Lab-space choice is retained.                                                                                                                        |
| F9 — unmatched decode/Auto/LUT          | **CLOSED**  | **246–264, 272–278, 311–312, 561–564.** One Sharp decode, RGB sample hashes, exact Auto-file/LUT hashes and cross-arm comparisons are explicit, with identity-denoiser and between-run Auto mutation tests. The PNG handoff is viable: a synthetic native OpenCV probe preserved Sharp's samples exactly, as detailed below. Remaining registration weaknesses are assessed under F1, within the owner's narrower binding choice.                                                                                            |
| F10 — unavailable reproduction evidence | **CLOSED**  | **100–115, 580–583, 655–656, 692, 702, 725.** Keys/manifests/records are published after PASS/FAIL, and the STOP branch publishes the pilot audit. Checkout-only verdict derivation is distinguished from private-byte verification, whose inventory is documented. No image-publication workaround is proposed. The audit implementation remains future work, rather than a claim it already runs.                                                                                                                          |

### Grounding and verification

**Lessons:** 29 of 39 entries apply under the skill's selection rule; their complete applicable blocks were read. The evidence-premise, informative-guard and failure-visibility lessons reinforce the checks below. One bounded read-only delegate checked ordering, leak paths and callers; its concrete conclusions were verified in this session. There is no `docs/reference/contract-surfaces.md`.

**Paths and symbols:** The two modification targets (`scripts/s19/local-arms.ts`, `scripts/s19/s19.ts`), existing guard helpers and four pointer files exist. New S-20 tools/configs/tests, viewer and evaluation directories are absent as expected; their existing ancestors permit creation. `baseline.ts` also consumes shared argument parsing; existing curve/historical/protocol tests exercise the arm CLI, and tally/viewer-inputs consume its records. No additional production caller was found. The brief matches the chosen scope and architecture, but its claim “F1–F10 all fixed” is premature; its Desired End State also needs the full plan's qualification that BLOCKED has no decoded table.

**Progress:** Exactly one bottom `## Progress`; phase headings match 0–6; Automated criterion/row counts are **2/4/3/2/1/5/4**, Manual counts **2/0/1/2/1/2/3**, with no body checkboxes. The acceptance-state script exits 0 and reports all 11 Manual rows pending. Future Manual surfaces are files the plan creates or existing pointer files. No acceptance was recorded or changed.

| Executable recorded command                                                                                     | Re-review result                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `python3 -I -c "import cv2, numpy; print(cv2.__version__)"`                                                     | **exit 1**, `ModuleNotFoundError: cv2`; matches the recorded missing-binding prerequisite.                                          |
| `python3 -B scripts/s19/protocol.py check-access --ids S17-01 S17-02 S17-03 S17-04 S17-05 S17-06 S17-07 S17-21` | **exit 0**, those eight IDs allowed; metadata only.                                                                                 |
| `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s19/tests`                                              | **exit 0**, **85 tests**, 48.846 s. Fake providers and temporary synthetic manifests/photos; no paid call or actual holdout access. |
| `npm run typecheck`                                                                                             | **exit 0**, matches.                                                                                                                |
| `npx --no-install eslint scripts/s19/local-arms.ts scripts/s19/s19.ts`                                          | **exit 0**, four existing `no-console` warnings, matches; local installed ESLint, no download.                                      |

The remaining Automated commands name future S-20 files/evidence or explicitly write outputs, so were not run. Their `not run:` reasons are present. The final pointer command was tested by an in-memory counterexample, not by changing the actual roadmap. All tsx-driven tests used `TMPDIR=/tmp`.

#### Order table: what can be checked at each moment

| Order / named actor                         | Checkability at that point                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1, commit Phase 1–4 code/config/calibration | A human Git action, possible after synthetic calibration. No tool presently named enforces the complete prerequisite list: step 2's list is smaller.                                                                                                                                                                                                                                            |
| 2, `nlm.py`                                 | Current tracked/clean checks are possible before rendering. The plan must include the rest of the rule/arm/helper code it claims is committed. `--calibrate` must be explicitly dispatched before the real-render prerequisite, since it produces the prerequisite calibration record; this is a bootstrap clarification, not a reason to weaken real-render checks.                            |
| 3, `blind.py pilot`                         | **Checkable.** 24 NLM records plus 32 arm records is correct: 8 control-full + 24 nlm-gamma. Their private files need verification, not Git tracking.                                                                                                                                                                                                                                           |
| 4–5, owner seals then rates/commits         | **Human control.** A tool cannot prove the viewer was not opened early. The seal and ratings will both be available for a later history check.                                                                                                                                                                                                                                                  |
| 6, `pilot.py`                               | Both committed files exist now, so strict seal-before-ratings ancestry is checkable. A same-commit seal and rating must fail. The chosen oldest-addition implementation nevertheless accepts a replaced seal (F11).                                                                                                                                                                             |
| 7, commit result/freeze                     | Possible after selection. STOP creates no new freeze; no prior freeze may supply a finalist when the current sealed pilot yields STOP. Recomputing the pilot must enforce that.                                                                                                                                                                                                                 |
| 8, `blind.py gate`                          | **Checkable:** committed/clean freeze, valid sealed pilot, key digest and recomputed `k` can be verified before building. A history comparison against the not-yet-committed gate seal is not checkable here: enforce predecessor checks now and the strict freeze-before-gate-seal relation after that seal is committed. The current table omits that explicit wiring and freeze cleanliness. |
| 9–11, gate seal then rating/commit          | Same human boundary as 4–5.                                                                                                                                                                                                                                                                                                                                                                     |
| 12, `gate.py`                               | Both seals/ratings and the freeze exist in history, so the full chain can now be checked, followed by bindings and BLOCKED-first classification. No decoded report/audit bundle may escape before classification.                                                                                                                                                                               |

#### Shared decode: PNG does preserve the samples

The replacement handoff removes the independent JPEG-decoder premise. OpenCV 4.13's PNG reader swaps RGB to BGR for color reads; it does not apply a gamma transform in this path. This supports the proposed channel reversal and raw-RGB hash check. [Pinned PNG decoder](https://github.com/opencv/opencv/blob/4.13.0/modules/imgcodecs/src/grfmt_png.cpp#L540-L593).

An additional **synthetic, in-memory** probe used installed Sharp **0.34.5 / libvips 8.17.3** and the already-installed native **OpenCV 4.13.0** libraries (`opencv-core-4.13.0-11.fc45.x86_64`). A 257×19 RGB array used channels `(x+13y)%256`, `(7x+y)%256`, `(3x+29y)%256`; Sharp encoded it using the existing raw-RGB `.png()` pattern. Original raw bytes, Sharp's PNG reread and OpenCV's decoded BGR reversed to RGB were **identical**, with RGB sha256 `5683361e3580459961b03e5bb693fb38423f0fbf5be02ca9e7c8f683923996a4`.

Because the Python binding is absent, the probe called native `imdecode(..., IMREAD_COLOR)` via ctypes, not `cv2.imread`. Both reach the same PNG reader; the latter's file-I/O wrapper was verified in the [pinned loader source](https://github.com/opencv/opencv/blob/4.13.0/modules/imgcodecs/src/loadsave.cpp#L558-L595). The synthetic PNG had no ICC/EXIF; its ancillary `pHYs` chunk affects resolution metadata, not samples. Thus this is measured support for the handoff, **not** a claim that the future real-photo renderer or Python binding was run. Retain the plan's runtime hash equality check and add this cross-decoder case to its synthetic tests.

#### Lab: correct path, incorrect round-trip premise

The pinned CPU implementation converts `CV_8UC3` BGR with `COLOR_LBGR2Lab`, splits L from AB, denoises each with its respective strength, then converts with `COLOR_Lab2LBGR`. The revised estimator uses precisely those quantized channels before casting to float64 for signed convolution. **Do not linearize the sRGB input separately or substitute `COLOR_BGR2Lab`: that would stop matching the selected filter.** [OpenCV 4.13 implementation](https://github.com/opencv/opencv/blob/4.13.0/modules/photo/src/denoising.cpp#L159-L195).

The native 4.13 conversion probe described in F14 independently falsifies the new ±1 bound. No actual NLM render, timing measurement, noise-recovery calibration or real-photo quality claim was made in this round.

### Findings

### F11 — First-addition ancestry accepts a seal replaced after rating

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: `plan.md:96,147–158,332–337,522–527,598–601`; residual F1
- **Detail**:
  `require_committed_clean` checks today's bytes, while `first_commit(path)` takes the oldest addition commit. A synthetic temporary Git repository reproduced this history: add seal → commit ratings → replace seal and commit it. The tree is clean; the seal's oldest addition strictly precedes ratings; both specified checks pass. The **replacement** seal was nevertheless introduced after rating. A digest/key commitment can consequently be retrofitted without breaking the planned gate.

  The table also claims Phase 1–4 code is committed before rendering, but step 2 checks only grid, `nlm.py` and calibration, omitting the arm/helper/pilot/gate rules. Step 8 names a committed freeze without explicitly requiring it clean or enforcing the complete predecessor chain. The order table above distinguishes checks possible at build time from those requiring a later committed dependent record.

  This is a defect in implementing the owner's selected committed-and-clean/ancestor mechanism, **not** a request to bind all execution to historical Git objects.

- **Fix**: Keep committed-and-clean checks; make each existing set's seal immutable in history, or verify that the revision introducing its current contents strictly predates dependent evidence. Enumerate and check all agreed rule/code/config prerequisites for real rendering; verify the valid sealed pilot and clean freeze at gate construction, then the complete predecessor chain once the gate seal/ratings are committed. Explicitly exempt synthetic calibration from its own generated-record prerequisite. Add seal-replacement, same-commit, dirty-freeze, uncommitted-rule and stale-STOP-freeze tests alongside the current cases.
  - Strength: Closes the demonstrated bypass within the owner's chosen mechanism.
  - Tradeoff: Requires explicit transition-specific history rules and a few more synthetic Git cases.
  - Confidence: HIGH — the specified oldest-addition test passed the reproduced counterexample.
  - Blind spot: Early human viewing remains outside Git's evidence, exactly as the plan acknowledges.
- **Decision**: FIXED — 2026-11-05, within the owner's F1/F8 choices; plan revised: write-once seals and freeze (exactly one commit), strict ancestry to every dependent commit, explicit `RULE_FILES`, the full chain checked by `gate.py`, STOP refuses any freeze, rebase-only merge rule; bypass, same-commit, dirty-freeze, uncommitted-rule and stale-STOP tests.

### F12 — Re-raising a sanitized exception does not sanitize stderr

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: `plan.md:175–177,528,547,555–568,614–615`; residual F7
- **Detail**:
  The new global rule says every exception is “caught and re-raised” as an anonymous reason. Python's ordinary re-raise of a replacement exception retains the original exception context. A synthetic subprocess raising a path-bearing error and replacing it with `pair p04: hash_mismatch` still emitted the original private NLM path to stderr. A sanitized final message therefore does not enforce this rule by itself.

  Existing reused helpers supply the raw material: `protocol.py:381–382` includes the original path in guard errors; `s19.ts:74–99` carries subprocess stderr into `Refused`. The new helper is expressly required to include filenames and commit commands (`plan.md:528`). Such internal diagnostics are acceptable **if contained**. Their presence alone is not proof of a leak, but the plan needs a non-rethrowing CLI boundary; the explicit leak test at 614–615 exercises uncertainty rather than these failure branches. Nothing is implemented yet, so this is a specified error-handling/test gap, not a claim that an existing S-20 CLI has leaked.

- **Fix**: Specify one CLI boundary that catches and serializes BLOCKED to anonymous, trusted set IDs plus reason classes, exits 3, and emits neither chained traceback nor raw helper/subprocess diagnostics. Keep rich internal errors private. Run actual CLI-subprocess leak scans across stdout, stderr and every report/audit/temp artifact for order, schema, key/hash, missing-file and path-guard failures as well as uncertainty; verify that no decoded artifact is emitted before the verdict is terminal. If a native decoder is used in those branches, contain its direct stderr too, rather than relying solely on Python exceptions.
- **Decision**: FIXED — 2026-11-05, within the owner's F1/F8 choices; plan revised: one non-re-raising CLI boundary per tool, captured subprocess and native output, private log, trusted ids only; subprocess leak scans for every BLOCKED branch.

### F13 — The replacement pointer check still skips the S-20 status field

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: `plan.md:704–726`; residual F5
- **Detail**:
  The corrected command now handles grep's 0/1/error exits properly, but its regex requires the change ID or `S-20` on the **same line** as stale wording. In the actual roadmap, the S-20 heading is line 347, the change ID is line 351, and the status is line 360. An in-memory counterexample replacing only that status with `- **Status:** not started` was not matched. The check can therefore pass while the named body Status pointer remains stale. It also does not assert the promised verdict link exists in each named pointer.
- **Fix**: Select the exact S-20 heading block, Backlog Handoff row and temp_steps “Teraz” block before inspecting their statuses; assert each designated pointer has the verdict link and reject its old wording within those boundaries. Preserve read/parser errors as failures and test a stale status on a separate line from its heading/ID. Keep unrelated parked items out of scope.
- **Decision**: FIXED — 2026-11-05, within the owner's F1/F8 choices; plan revised: block-scoped `scripts/s20/pointers.py` (exit 0/1/2) requiring the verdict link; separate-line stale-status test.

### F14 — Calibration adds a false ±1 bound for 8-bit Lab conversion

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: `plan.md:351–361,370`; **NEW in the rewrite**, related to F8
- **Detail**:
  The calibration now requires that `COLOR_LBGR2Lab` → `COLOR_Lab2LBGR` “alone stays within ±1.” The actual pinned 8-bit conversion does not guarantee this. Using the already-installed native OpenCV 4.13.0 `cvCvtColor` with conversion codes 74/78, a synthetic BGR grid with each channel in `range(0,256,7)` (50,653 colors) produced a maximum absolute channel change of **4**, with **16,706 channels changing by more than 1**. One concrete example is **BGR (35,98,238) → Lab (191,151,172) → BGR (35,98,234)**. The enum values were verified against the [4.13 header](https://github.com/opencv/opencv/blob/4.13.0/modules/imgproc/include/opencv2/imgproc.hpp#L574-L579).

  A correct implementation can fail this new calibration, inviting an unnecessary grid change or an unplanned substitution of float/other Lab conversion to make it pass. That would change the agreed treatment. The calibration also still says “a stated tolerance” and “textured images” without choosing the tolerance, noise-construction procedure or texture fixture; those were already part of F8's accepted fix and should be settled before the calibration is interpreted.

- **Fix**: Preserve the exact 8-bit OpenCV treatment. Measure and record conversion-only error on specified synthetic fixtures, with fixture-specific expectations that include the counterexample, instead of asserting a universal ±1 bound. Define the synthetic noise injection space, seeded flat/texture construction and numeric recovery tolerances before running the calibration; separate estimator recovery from unavoidable conversion quantization and from texture bias. Describe `exp(−2σ²/h²)` as an idealized reference, rather than the measured weight of every real patch.
- **Decision**: FIXED — 2026-11-05, within the owner's F1/F8 choices; plan revised: ±1 bound removed; conversion error measured and recorded with the pinned counterexample; seeded flat and texture fixtures, injection space and tolerances fixed before calibration.

### Independent degenerate walkthrough of the rewrite

The rating/vote edge cases from round 1 remain decided and are now explicitly covered by the proposed tests (`plan.md:595–615`). The following additional cases were derived independently for the new evidence mechanism; no real image was needed.

| Constructed case                                                                | Outcome under the rewritten contract                                                                                                                   |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Seal and ratings first appear in one commit                                     | Strict ordering should refuse; `is-ancestor` alone would accept equality, so retain the separate strictness condition.                                 |
| Seal added before ratings, then changed and committed after them                | **Incorrectly accepted** by oldest-addition ancestry plus current cleanliness; reproduced, F11.                                                        |
| Current pilot is eight `none` choices, but a previous attempt's freeze exists   | Recomputed current pilot must yield STOP and no finalist; the gate builder must refuse, never accept the old file just because it is committed.        |
| Equal pilot leaders plus abstentions                                            | Existing weaker-strength tie rule remains binding; recomputation must use the sealed current key/export, not a previously generated result file.       |
| Freeze exists but has uncommitted content changes                               | “Committed” alone is insufficient; the named gate-build prerequisite must invoke the clean check too (F11).                                            |
| Malformed key/file fails before a trustworthy pair mapping exists               | BLOCKED must use a generic anonymous reason or an ID from the trusted set, never echo a path or an arbitrary ID supplied by the malformed input (F12). |
| An order/hash exception is replaced by a safe anonymous exception               | Python's default chained stderr still contains the first exception; reproduced, F12.                                                                   |
| S-20 heading remains intact but its separate Status line is stale               | The new regex misses it; reproduced in memory, F13.                                                                                                    |
| Asymmetric synthetic color with no denoising, only the specified Lab round trip | Quantization can exceed ±1; the actual conversion must not be “fixed” to satisfy the new false premise (F14).                                          |

The six CLOSED assessments concern plan contracts, not completion of future S-20 tests. **F1 and F8's owner choices, all numeric gate/vote rules, the tuning-only boundary and the no-paid-call boundary are unchanged by this review.** No triage edits were authorized in this round; F11–F14 remain pending for the owner/plan author.

## Re-review 3 (2026-11-05)

- **Mode**: Deep, confirming round
- **Scope**: F11–F14 fixes and defects introduced by those edits only, as explicitly requested. The hash differs from Re-review 2; the owner's narrower scope overrides the skill's default whole-plan fallback. F1–F10 were not independently reopened.
- **Plan sha256**: `3817d6542ca770e9b51893b0e9113d90ffd720b5b1b7cce987fdd4cf42354161`
- **Brief sha256**: `bbee656c290a4a79c3e39d19b0408f27b602173a7507cc877d2b073b2c941ffc`
- **Verdict**: **REVISE — F11 and F14 close; two small contradictions introduced by the F12/F13 edits remain.** The chosen evidence mechanism and Lab-space treatment stand.
- **Findings**: 0 critical, 2 warnings, 0 observations.
- **Closes**: F11, F14.
- **Partially closes**: F12, F13. None of F11–F14 is wholly OPEN.
- **Write boundary**: Only this round appended. No earlier report byte, plan, brief, lifecycle file, pointer, index or carry record changed. No repository commit, staging, revert, installation, paid call or real-photo read. Temporary Git repositories used synthetic text only and were removed. The only real benchmark access check named S17-01…07 and S17-21; no actual validation photo was accessed.

### Verdicts within this scope

| Dimension              | Verdict |
| ---------------------- | ------- |
| Requirement Definition | PASS    |
| End-State Alignment    | WARNING |
| Lean Execution         | PASS    |
| Architectural Fitness  | PASS    |
| Blind Spots            | WARNING |
| Plan Completeness      | WARNING |

### F11–F14 confirmation

Line references below refer to the current 925-line plan.

| Finding                                                  | Status      | Plan lines and assessment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F11 — replaced seal and incomplete prerequisites         | **CLOSED**  | **97, 150–159, 343–344, 548–557, 647–655.** Exactly one history commit is allowed for each seal/freeze; it must strictly precede every dependent commit. Today's cleanliness is still required. The original replacement counterexample is rejected, and legitimate gate-rating corrections remain accepted, as measured below. `RULE_FILES` now includes all agreed tool/config/arm/helper/calibration prerequisites; synthetic calibration is exempt. Gate construction requires the current sealed pilot, a clean write-once freeze and recomputed `k`, with STOP refusing any freeze; gate tally requires the complete chain. Rebase-only merging is explicit at **161–164**. |
| F12 — chained stderr and other BLOCKED leaks             | **PARTIAL** | **178–188, 668–676.** The original leak gap is closed at the specification level: a single non-rethrowing CLI boundary, captured subprocess/native output, private rich diagnostics and trusted anonymous IDs are explicit. CLI leak tests now cover order, schema, key/hash, missing-file, guard, malformed-ID and uncertainty branches. However, the new test at **675–676** forbids any report after BLOCKED, contradicting the promised BLOCKED report at **101–106, 617–619**. See F16; this is introduced by the F12 edit, not a demand to expose decoded data.                                                                                                             |
| F13 — multiline status pointer skipped                   | **PARTIAL** | **623–638, 787.** A dedicated block-aware checker replaces the line regex, requires verdict links and preserves stale/read/parse exit distinctions. A separate-line stale-status test is specified. But **628** ends the last S-20 H3 section only at the next H3, so it crosses the actual H2 boundary and inspects unrelated statuses. The new checker can therefore fail on a correctly updated S-20. Reproduced below; see F15.                                                                                                                                                                                                                                               |
| F14 — false conversion bound and unspecified calibration | **CLOSED**  | **362–384.** The universal ±1 bound is removed. The conversion grid, maximum error/count measurement and known asymmetric counterexample are fixed, and conversion measurements cannot fail calibration. Seed, dimensions, Lab-channel noise injection, sigma values, flat/texture constructions and numeric recovery tolerances are now chosen before calibration; the weight formula is explicitly idealised. This closes the plan defect without changing the agreed OpenCV conversion. Actual calibration remains future work because Python `cv2` is absent; no noise-recovery or real-image quality result is claimed.                                                      |

### F11 counterexample and BLOCKED re-export replay

An inline Python probe created isolated repositories under `/tmp`, disabled their hooks/signing, and used actual Git history queries. It modelled the specified checks with `git log --format=%H --follow -- <seal>`, exactly one returned seal commit, current tracked/clean files, and strict `merge-base --is-ancestor` against **every** `git log --format=%H -- <dependent>` commit. A dependent history had to be nonempty. The old check was also run as a negative control. These are executable checks of the proposed contract, **not tests of an implemented `evidence.py`**, which does not exist yet.

| Synthetic history                                                                                         | Measured result                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seal added → ratings committed → seal replaced and committed; clean tree                                  | Old oldest-addition check **accepts**. New write-once check **rejects**: the seal has two commits. The replacement cannot borrow the original seal's date.                                                                                                                        |
| Pilot seal → pilot ratings → freeze → gate seal → gate ratings containing `uncertain`                     | The history precondition **accepts**; the uncertainty would separately make the gate BLOCKED. Each write-once node has one commit and all required edges are strict.                                                                                                              |
| Same chain → corrected gate export committed → another corrected export committed, retaining the same set | **Accepts** with three gate-rating commits and one gate-seal commit. All three dependent commits descend strictly from the unchanged seal. Write-once applies to the seal/freeze, not to the ratings. This preserves **761–763**'s resolve → re-export → commit → rerun workflow. |
| Valid chain, then uncommitted freeze change                                                               | **Rejects** on cleanliness.                                                                                                                                                                                                                                                       |
| Seal and first ratings added in the same commit                                                           | **Rejects** on strictness despite Git considering a commit its own ancestor.                                                                                                                                                                                                      |
| Ratings committed before the seal, then re-exported after the seal                                        | **Rejects** because the earlier dependent commit fails ancestry. Checking only the latest export would incorrectly accept this case.                                                                                                                                              |
| Valid seal/rating history replayed with `git rebase --force-rebase --root`                                | **Accepts** after replay; no stored SHA is required.                                                                                                                                                                                                                              |

All probe assertions passed (exit 0). No real key, export, photo, freeze or repository history was modified. This confirms normal linear/rebase-history behavior within the owner's selected mechanism; it does not prove that a human never viewed files early, which remains the explicit human control.

### Grounding and verification

The full plan and brief were read. **29 of 39 lessons** apply under the skill's selection rule; their complete blocks were read. The informative-guard and stale-pointer lessons inform F15/F16. There is no `docs/reference/contract-surfaces.md`. The narrowly scoped verification was done in this session; no broad delegated codebase pass was needed.

Existing modification targets and guard helpers resolve. S-20 tools/tests/configs, including the new `pointers.py`, are future files, absent as expected. `protocol.py:353–382` and `s19.ts:74–99` confirm the path-bearing internal diagnostics that the new CLI boundary must contain. The brief agrees with write-once ordering and explicitly promises anonymous BLOCKED output; it does not settle the new no-report contradiction.

Mechanical Progress checks pass: one bottom `## Progress`, matching phase names 0–6, no body checkboxes, Automated counts **2/4/3/2/1/5/4**, Manual counts **2/0/1/2/1/2/3**. The acceptance-state script exits 0 and reports all **11** Manual rows pending. No acceptance was recorded or changed.

| Executable recorded command                                                                                     | Result this round                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `python3 -I -c "import cv2, numpy; print(cv2.__version__)"`                                                     | **exit 1**, `ModuleNotFoundError: cv2`; matches the recorded prerequisite.                                                                                                            |
| `python3 -B scripts/s19/protocol.py check-access --ids S17-01 S17-02 S17-03 S17-04 S17-05 S17-06 S17-07 S17-21` | **exit 0**, exactly those eight allowed; metadata only.                                                                                                                               |
| `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s19/tests`                                              | **exit 0**, **85 tests**, 44.503 s. Fake providers and generated temporary fixtures; no paid call or actual holdout read. One existing unclosed-file ResourceWarning was non-failing. |
| `npm run typecheck`                                                                                             | **exit 0**, matches.                                                                                                                                                                  |
| `npx --no-install eslint scripts/s19/local-arms.ts scripts/s19/s19.ts`                                          | **exit 0**, four existing `no-console` warnings; no dependency download.                                                                                                              |

Remaining commands require future S-20 code/evidence or write real outputs and were not run. In particular, neither the future CLI leak suite nor OpenCV calibration was presented as executed. All tsx-driven tests used `TMPDIR=/tmp`.

### Findings

### F15 — New S-20 block selector crosses a higher-level heading

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: `plan.md:625–638,787`; introduced by the F13 fix
- **Detail**:
  The selector is explicitly “the `### S-20` section ... up to the next `###` heading.” S-20 is the final H3 before **`## Backlog Handoff`** (`roadmap.md:362`). The next H3 occurs only at **429**. Consequently the specified block includes unrelated Backlog rows, status semantics and Parked material. S-15's deliberately retained **`on hold`** at **379**, and **`status:proposed`** in the semantics at **395**, fail the forbidden-word test.

  An in-memory copy replaced only S-20's separate Status line with a verdict link. The literal next-H3 selector still found `on hold` and `proposed` and modelled exit **1**. Ending at the next heading of level **1–3** selected only S-20 and modelled exit **0**. Replacing the separate Status line with `not started` while retaining its verdict link correctly failed that bounded check. All assertions passed; the actual roadmap was untouched. This newly specified boundary would block Phase 6 even after its intended pointers were updated, or encourage changes to unrelated parked work.

- **Fix**: End the S-20 H3 section at the next heading of equal **or higher** level, or EOF. Add the actual last-H3 → H2 Backlog layout as a positive fixture: S-20 updated with its verdict link must pass while S-15 remains `on hold`. Retain the separate-line stale-status negative test.
- **Decision**: FIXED — 2026-11-05; plan revised: the S-20 block ends at the next heading of equal or higher level or EOF; positive fixture with the real H3→H2 layout (S-15 keeps `on hold`).

### F16 — New leak assertion forbids the promised anonymous BLOCKED report

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: `plan.md:674–676` versus `101–106,598,617–619`; introduced by the F12 fix
- **Detail**:
  The Desired End State requires `step1-gate.json` and `step1-gate.md` with PASS, FAIL **or BLOCKED**. The gate contract names those report paths and requires the report to state its verdict, subject and way out; BLOCKED content is anonymous IDs and reason classes. The new leak test instead asserts that **“no report or audit file exists after a BLOCKED run.”** An implementation that emits the promised sanitized BLOCKED files fails that assertion; one that passes by emitting no report misses the promised file outputs. The global rule at **187–188**, which forbids **decoded** reports before a terminal verdict, does not require this broader prohibition. The brief also explicitly distinguishes an anonymous BLOCKED result from a decoded PASS/FAIL table.

  This is a specification contradiction introduced by the new test, independent of the now-correct non-rethrowing CLI boundary. No existing S-20 CLI was run or alleged to leak.

- **Fix**: Allow and assert the two sanitized BLOCKED reports, containing only trusted anonymous IDs/reason classes and the declared verdict/way-out text. Scan those files with stdout/stderr; assert that no **decoded** report, key, audit bundle or identity-bearing temporary artifact is emitted. Keep rich diagnostics confined to the explicitly private log. This preserves the promised BLOCKED artifact without weakening the leak test.
- **Decision**: FIXED — 2026-11-05; plan revised: sanitized BLOCKED reports must exist and are scanned; only decoded reports, key copies, audit bundles and identity-bearing temp files are forbidden.

No plan triage was requested or performed. F15/F16 are the only new findings, both caused by F11–F14 edits. The experiment, numeric vote/gate rules, owner-selected mechanisms and tuning-only/free boundary remain unchanged.
