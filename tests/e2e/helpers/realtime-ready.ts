/**
 * Realtime readiness probe + warmup for the E2E specs.
 *
 * Local Supabase Realtime STOPS its tenant after a few idle minutes ("Stop
 * tenant … because of no connected users") and the next join triggers a
 * multi-second cold re-initialization (replication slot, partitions). A
 * `postgres_changes` event that commits INSIDE that warmup window is silently
 * dropped — observed 2026-06-12: a stubbed-pipeline run whose `succeeded`
 * UPDATE landed during tenant init left the UI on the spinner, with no
 * client-side recovery until the 300 s processing watchdog (far outside any
 * spec budget). A fresh CI stack is ALWAYS cold, so without this the
 * north-star spec would flake on exactly its first CI run.
 *
 * Subscribing a throwaway channel and waiting for SUBSCRIBED both VALIDATES
 * the precondition (Realtime reachable — hard-fail loudly otherwise, the
 * tests/env.ts convention) and WARMS the tenant, which is in-contract: the PR
 * gate deliberately targets the WARM/stubbed pipeline (plan §Overview).
 *
 * Self-contained: builds and fully disposes its own client; callers' clients
 * are untouched. Setup-only — never part of an assertion.
 */
import { createClient, REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";

export async function ensureRealtimeReady(opts: {
  url: string;
  /** Service-role key (setup-only usage, same as the admin client). */
  key: string;
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const client = createClient(opts.url, opts.key);
  // `jobs` is in the supabase_realtime publication — binding to it exercises
  // the same WAL pipeline the app's job subscription uses.
  const channel = client
    .channel(`e2e-realtime-warmup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jobs" }, () => {
      /* warmup only — events are irrelevant */
    });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `ensureRealtimeReady: Realtime not SUBSCRIBED after ${String(timeoutMs)}ms — ` +
              "is the local stack healthy? (npx supabase status)",
          ),
        );
      }, timeoutMs);
      channel.subscribe((status, err) => {
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          clearTimeout(timer);
          resolve();
        } else if (
          status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
          status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
        ) {
          clearTimeout(timer);
          reject(new Error(`ensureRealtimeReady: warmup channel ${status}${err ? `: ${err.message}` : ""}`));
        }
      });
    });
  } finally {
    await client.removeChannel(channel);
    void client.realtime.disconnect();
  }
}
