<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Adaptive Enhancement Parameters (S-12) — Phase 1

- **Plan**: context/changes/adaptive-enhancement-parameters/plan.md (Phase 1 scope)
- **Mode**: Deep
- **Date**: 2026-06-28
- **Verdict**: REVISE → **SOUND after fixes** (all 5 findings fixed in plan, 2026-06-28)
- **Findings**: 1 critical, 3 warnings, 1 observation

## Verdicts

| Dimension             | Verdict              |
| --------------------- | -------------------- |
| End-State Alignment   | PASS                 |
| Lean Execution        | PASS                 |
| Architectural Fitness | PASS (1 observation) |
| Blind Spots           | WARNING              |
| Plan Completeness     | FAIL                 |

## Grounding

Paths 4/4 ✓ (`src/lib/engines/types.ts` exists; parents of new `auto-params.ts`, `auto-params.client.ts`, `tests/auto-params.test.ts` exist). Symbols ✓ (`buildGammaLut` at `image-helpers.ts:64`; `ctx.filter` blur at `local-engine.ts:42`). vitest `environment: "node"` ✓ (vitest.config.ts:7). brief↔plan consistent ✓. **Exception:** repro/ fixtures are before/after composites, not source frames (see F2). No JS image decoder in package.json (no sharp/jimp/canvas/jpeg-js/pngjs) — confirms F1.

## Findings

### F1 — The 8–12 image oracle cannot run in the Node unit gate as written

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §4 (Oracle fixtures) + Success Criterion 1.3
- **Detail**: Criterion 1.3 is an automated gate but vitest runs `environment: "node"` (no DOM/canvas). The plan computes stats "via the same downscale path" (canvas/getImageData — DOM-only) or "with the Node canvas/PIL parity used in `repro_local.py`" — but `repro_local.py` is Python/PIL and can't run in vitest, and there is no JS image decoder in package.json. Existing pixel tests (chroma-denoise) hand-build synthetic `Uint8ClampedArray`; none decodes a JPG. As written, the JPG→pixels step has no available mechanism in the gate.
- **Fix**: Decouple decoding from the gate. Precompute each oracle image's `LumaStats` offline (one-off script) and commit them as JSON fixtures (e.g. `tests/fixtures/auto-params/*.json`); the unit test feeds those into `recommendParams` for range assertions. Test `computeLumaStats` separately on hand-built synthetic buffers (chroma-denoise pattern). Note explicitly that `computeLumaStats`↔`sampleImageLuma` parity is verified manually (Phase 2), not in the oracle.
  - Strength: Zero new deps; matches the repo's pure-buffer test idiom; deterministic gate.
  - Tradeoff: Oracle exercises `recommendParams` only — the real image→stats path isn't covered by an automated test.
  - Confidence: HIGH — confirmed no decoder dep and node-only env.
  - Blind spot: Fixture regeneration step needs a documented home (scripts/ entry or command).
- **Decision**: FIXED (Fix in plan)

### F2 — Oracle fixtures point at before/after composites, not source frames

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §4 ("Extend the existing 4 repro/ images")
- **Detail**: The 4 files in `repro/` are `*.local-ba.jpg` — side-by-side before/after montages, not source photos. Computing luma stats over a composite mixes the already-enhanced half into the histogram, so Auto would analyze the wrong pixels. repro-findings.md itself flags `Sunset-Exposure-Example` as "a composite exposure-tutorial montage, not a single photo — directional only." The analyzer needs raw single-image sources, which aren't in `repro/`.
- **Fix**: Source the oracle from the raw originals (the inputs `repro_local.py` read), not the `.local-ba.jpg` composites; commit those (or their precomputed stats per F1). Drop the Sunset montage as a single-image fixture — keep it directional only.
- **Decision**: FIXED (Fix in plan) — raw originals as analyzer input; `.local-ba.jpg` = visual evidence only; Sunset montage = directional, not a fixture

### F3 — "gamma non-increasing as input mean increases" isn't a property the formula guarantees

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §4 / Testing Strategy ("gamma monotonic-decreasing in mean")
- **Detail**: `gamma = log(max(p50,0.03)) / log(target_median)` is monotonic in **p50**, not mean. The plan asserts monotonicity in **mean** (mean ≠ p50). The highlight guards (`gamma*=0.80` if p95>0.85; `gamma=min(g,1.10)` if clipRatio>0.005) further break ordering: two real images can have increasing mean while a guard fires on one and not the other. Asserting cross-image monotonicity over real photos will flake or fail on a correct implementation.
- **Fix**: Assert gamma monotonicity against p50 on a synthetic stats sweep with guards held off. For the real-image oracle, assert coarse class membership instead (bright → gamma ∈ [1.0, ~1.15]; very-dark → ~[1.5, 1.8]).
- **Decision**: FIXED (Fix in plan) — synthetic p50 sweep with guards held below threshold; real-image oracle asserts coarse class ranges only

### F4 — recommendParams union return forces narrowing at every call site

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 §1 (recommendParams signature)
- **Detail**: `recommendParams(stats, engine): LocalParams | BreadParams` returns a union keyed by a runtime string; Phase 2/3 call sites will need casts or narrowing to get a concrete shape.
- **Fix**: Add function overloads (`engine:"local"→LocalParams`, `engine:"cloud"→BreadParams`) so callers narrow without casting.
- **Decision**: FIXED (Fix in plan) — overloads on one `recommendParams`; split into recommendLocal/recommendCloud only if the impls diverge later

### F5 — Blur secondary add-on underspecified for a pure, unit-tested module

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §1 (Local blur contract)
- **Detail**: Blur is "conservative darkness-band add-on (small; e.g. ≤0.4 unless very dark) plus a tiny bump when gamma is high" — no concrete piecewise. The test "very-dark → higher blur" needs a fixed deterministic expectation this prose can't pin down.
- **Fix**: Specify the exact piecewise (bands + bump + ceiling) so the test has a fixed expected value; keep the conservative ≤ ~0.4 ceiling off the dark band per the user directive.
- **Decision**: FIXED (Fix in plan) — bands bright≤0.1 / moderate 0.2 / dark 0.35–0.4 / very-dark 0.6; +0.1 when gamma≥1.6; Auto clamp 0.0–0.7 (slider range stays 0.0–2.0)
