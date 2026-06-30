---
change_id: enhance-ux-fixes
title: Enhance-flow UX fixes — refresh guard, cloud error messaging, fixed nav
status: impl_reviewed
created: 2026-06-29
updated: 2026-06-30
archived_at: null
---

## Notes

A small batch of post-MVP UX fixes/polish on the enhance flow (separate from S-12).
Locked scope (4 items; decisions made with the user):

1. **Refresh → default view** — add a `beforeunload` guard that warns the user
   when there's work in progress (uploaded photo / job in flight / ready result),
   so an accidental refresh doesn't silently drop everything. (We don't try to
   restore state — `File`/object-URLs can't survive a reload; the guard is the fix.)

2. **Replicate provider 429** — when Replicate itself returns 429 (provider
   rate-limit, NOT the create-job daily cap), the job fails with a generic error.
   Edge Function should detect the 429 and set a dedicated `error_code`
   (e.g. `provider_rate_limited`); the client maps it to a friendly message
   ("Cloud AI is busy right now — try again shortly, or use the Local engine").

3. **Dashboard hides on scroll** — the dashboard nav/header scrolls away; it
   should stay `fixed`/sticky. CSS/layout fix.

4. **RGBA input rejected by Bread** — a PNG with an alpha channel fails with the
   raw model error `Input size must have a shape of (*, 3, H, W). Got
torch.Size([1, 4, 96, 96])` (see [[bread-rejects-rgba-input]]). Show a friendly
   message **plus a button** ("Convert to RGB and try again") that flattens alpha
   → RGB (composite on white) client-side and re-submits the job. Reactive
   recovery, not proactive prevention (user's choice).

Out of scope here: **DE/PL localization** (#7) — that's a cross-cutting i18n
feature, tracked separately as its own slice, not lumped into these tweaks.

Branch: `feat/enhance-ux-fixes` (off master; master is PR-only).
