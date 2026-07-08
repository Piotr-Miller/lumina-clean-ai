// Idle-session policy for the app-level inactivity logout (change
// `session-idle-timeout`). The Supabase dashboard equivalent (Auth → Sessions →
// inactivity timeout) is a Pro-plan feature and the org is on Free, so
// enforcement lives in `src/middleware.ts`, driven by this module.
//
// Pure module by design: no `astro:*` imports, so Vitest's Node environment
// can import it directly (see lessons.md — server-only modules that tests
// import must not drag in Astro virtual modules).

/**
 * Idle window: a session with no server-visible activity for this long is
 * signed out on its next request. Deliberately strict (user decision,
 * 2026-07-08); tune here only — not env-configurable by design.
 */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * httpOnly cookie holding the last-activity time as an epoch-milliseconds
 * decimal string. Set/refreshed by the middleware on every authenticated
 * request; deleted on anonymous requests (which is what makes a stale cookie
 * surviving into a fresh session structurally impossible — the signin POST
 * itself passes through the middleware as anon).
 */
export const ACTIVITY_COOKIE = "lc-last-activity";

/**
 * Notice surfaced via the signin page's existing `?error=` plumbing when an
 * idle-expired session hits a protected route.
 */
export const IDLE_SIGNOUT_MESSAGE = "You were signed out after 30 minutes of inactivity. Please sign in again.";

export type IdleAction = "noop" | "cleanup" | "start" | "refresh" | "expire";

/** Strict epoch-ms shape: digits only — rejects empty, signs, decimals, garbage. */
const EPOCH_MS_RE = /^\d+$/;

/**
 * The whole idle policy as one pure decision (see the decision table in
 * `context/changes/session-idle-timeout/plan.md`):
 *
 * - anon without cookie → `noop`; anon with cookie → `cleanup`
 * - authed with a missing/malformed/future-dated cookie → `start` (fresh window)
 * - authed within the window → `refresh` (slide window)
 * - authed at/past the window → `expire`
 *
 * A future-dated timestamp maps to `start`, not `refresh` — resetting to "now"
 * keeps the window honest without special-casing clock edits or tampering.
 * Boundary: exactly `IDLE_TIMEOUT_MS` elapsed counts as expired.
 */
export function decideIdleAction(hasUser: boolean, cookieValue: string | undefined, nowMs: number): IdleAction {
  if (!hasUser) {
    return cookieValue === undefined ? "noop" : "cleanup";
  }
  if (cookieValue === undefined || !EPOCH_MS_RE.test(cookieValue)) {
    return "start";
  }
  const lastActivityMs = Number(cookieValue);
  if (lastActivityMs > nowMs) {
    return "start";
  }
  return nowMs - lastActivityMs >= IDLE_TIMEOUT_MS ? "expire" : "refresh";
}
