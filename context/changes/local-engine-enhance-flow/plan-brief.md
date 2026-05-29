# Local Engine Enhance Flow (S-01) — Plan Brief

> Full plan: `context/changes/local-engine-enhance-flow/plan.md`

## What & Why

LuminaClean's first user-visible slice and the **shared UI shell** the cloud path (S-03/S-04) reuses. An anonymous visitor uploads a low-light JPG/PNG, runs a deliberately-naive client-side Canvas enhancement (gamma + Gaussian blur), compares before/after with a slider, and downloads — entirely in-browser. It's the anonymous-acquisition funnel and the lowest-risk slice; it touches none of F-01's Supabase/cloud machinery.

## Starting Point

The app has zero product UI: `/` renders a starter `Welcome` hero, only `Button` is installed from shadcn, and there's no `hooks/` directory. F-01 (private storage + jobs table with RLS) is shipped but server/cloud-only — this slice reuses only its validation *constants* (JPG/PNG, 25 MB), not its code.

## Desired End State

Visiting `/` lands on the tool under a slim value-prop header. Upload → Enhance (sub-2s, spinner) → drag the before/after slider → download in the source format. HEIC is politely rejected; oversize/wrong-type files show inline errors. Uploader, slider, and download are standalone components S-03 reuses by swapping only the result source.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Placement | Replace the home page | Friction-minimal funnel; PRD persona wants the fix "in seconds." |
| Engine abstraction | Light `ImageEngine` seam, Local-only | S-03 plugs Cloud in without reworking orchestration; toggle/gating stay S-03 scope. |
| Component structure | Standalone reusable pieces | "Build the shell once" — S-03/S-04 reuse uploader/slider/download verbatim. |
| Canvas processing | Native blur + gamma LUT, full-res, main thread | GPU-backed blur + one linear LUT pass realistically meets 2s/12MP; Web Worker is an MVP non-goal. |
| HEIC | Detect-and-reject | Roadmap safe default; browser-native decode is unreliable. |
| Download format | Preserve source format | Matches expectation + FR-012 full-quality intent. |
| Validation | Mirror F-01 + max-dimension guard | Identical behavior when S-03 reuses the uploader; dimension guard prevents mobile OOM. |
| Loading UX | Spinner + pre-pass macrotask yield | Without the yield the spinner never paints before the blocking pixel pass. |
| Testing | Unit-test pure helpers + manual visual | Canvas isn't reliable in jsdom; full testing strategy is a Module-3 topic. |

## Scope

**In scope:** anonymous upload (JPG/PNG, ≤25 MB, dimension-guarded); client-side gamma+blur enhancement; before/after slider; download in source format; engine seam; home-page replacement.

**Out of scope:** engine toggle UI + Cloud option + sign-in gating (S-03); any Supabase/API/auth; Web Worker/WASM/advanced denoise; HEIC decoding; tunable parameters; history/persistence.

## Architecture / Approach

Three bottom-up layers. **(1) Logic:** `src/lib/engines/` — `ImageEngine` interface, pure helpers (validation, gamma LUT, filename), Local Canvas pipeline. **(2) Components:** `src/components/enhance/` — `ImageUploader`, `BeforeAfterSlider`, `DownloadButton`, standalone and prop-driven. **(3) Orchestration:** `useLocalEnhance` hook (`src/components/hooks/`) + `EnhanceWorkspace` container, hydrated `client:load` from a replaced `src/pages/index.astro`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Engine seam & logic | Interface, pure helpers, Local pipeline + unit tests | Gamma/blur reads as "blurrier" not "less noisy" (intentional; needs visual check) |
| 2. UI shell components | Uploader, before/after slider, download button | Slider accessibility/responsiveness at mobile portrait |
| 3. Orchestration & page | Hook + workspace + home-page swap; loading UX | Main-thread freeze on 12MP without the spinner-paint yield |

**Prerequisites:** none (zero dependencies — parallel with F-01/S-02).
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- Naive gamma+blur must read as a *visible improvement*, not just blur — verified manually on a representative night photo (FR-008 is intentionally rough).
- Full-res main-thread processing is assumed to meet the ~2s/12MP NFR; the dimension guard backstops pathological inputs. Measure on a real 12MP photo during Phase 3.
- iPhone-default HEIC users must convert before upload (accepted v1 tradeoff).

## Success Criteria (Summary)

- Anonymous visitor enhances a night JPG/PNG and sees a visibly brighter, less-noisy result via the slider within ~2s, with no network round-trip after load.
- Result downloads at full resolution in the source format.
- The flow is usable at mobile-portrait width; the uploader/slider/download components are reusable by the cloud path.
