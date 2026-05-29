---
change_id: local-engine-enhance-flow
title: "Local (Canvas) engine: upload → enhance → compare → download"
status: impl_reviewed
created: 2026-05-28
updated: 2026-05-29
review_round: 0
archived_at: null
---

## Notes

Roadmap entry S-01. The first user-visible slice and the **shared UI shell** reused by the Cloud path (S-03/S-04). An anonymous visitor uploads a low-light JPG/PNG, runs a deliberately-naive client-side Canvas enhancement (gamma correction + native Gaussian blur), compares against the original via a before/after slider, and downloads the result — entirely in-browser, no network round-trip after page load. Delivers PRD US-02 and FR-001, FR-005, FR-008, FR-011, FR-012, plus the NFR "Local result visible within ~2s on a 12MP photo, mobile-portrait usable."

Plan: `plan.md` (brief: `plan-brief.md`). Three phases — (1) engine seam + processing logic, (2) reusable UI shell components, (3) orchestration + home-page integration.

### Key planning decisions

- **Placement**: replace the starter `Welcome` hero on `/` with the tool under a slim value-prop header (anonymous-acquisition funnel; friction-minimal).
- **Engine seam now, toggle later**: introduce a light `ImageEngine` interface with Local as the only concrete impl. The Local/Cloud toggle + sign-in gating (FR-006/FR-007) are **S-03 scope**, explicitly out of this slice.
- **Standalone reusable components**: `<ImageUploader>`, `<BeforeAfterSlider>`, `<DownloadButton>` built independently so S-03 reuses them by swapping the result source.
- **Processing**: native `ctx.filter` blur + 256-entry gamma LUT, full resolution, main thread (Web Worker is an MVP non-goal). Spinner with a pre-pass macrotask yield so it paints before the blocking pixel pass.
- **HEIC**: detect-and-reject with a friendly convert message (PRD OQ#1 safe default).
- **Download**: preserve source format (JPG→JPG, PNG→PNG).
- **Validation**: mirror F-01's 25 MB + format constraints, plus a max-pixel-dimension guard against mobile OOM.
- **Testing**: Vitest unit tests on pure helpers (validation, gamma LUT, filename); Canvas render + slider verified manually (full testing strategy is a Module-3 topic).
