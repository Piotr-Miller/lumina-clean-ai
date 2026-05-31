---
change_id: gated-cloud-upload
title: "Gated engine toggle + Cloud AI submission"
status: implementing
created: 2026-05-31
updated: 2026-05-31
review_round: 1
---

## Notes

Roadmap entry **S-03** (`context/foundation/roadmap.md:105-117`). Prerequisites **F-01** (photo-jobs-data-and-storage) + **S-01** (local-engine-enhance-flow), both done and archived. Parallel with S-02 (done).

**Outcome:** a user can switch the engine toggle to Cloud AI (anonymous visitors are prompted to sign in, never silently denied), and a signed-in user can submit the loaded photo for cloud processing — the source is uploaded to the private `photos` bucket and a `queued` job row is created. Delivers PRD **US-01; FR-005, FR-006, FR-007** and the NFR "source not publicly readable."

**Slice boundary (confirmed for this research):** strictly S-03 — engine toggle, sign-in gating, signed upload, job-row creation. Stop at the `queued` row. The Replicate pipeline + Realtime result push is S-04 (`cloud-ai-realtime-result`).

Internal research: `research.md` (plan-ready deep dive, 2026-05-31).
