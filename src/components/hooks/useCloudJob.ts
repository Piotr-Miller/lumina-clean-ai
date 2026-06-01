import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { PhotoJob, PhotoJobStatus } from "@/types";

export interface CloudJobState {
  /** Live job status pushed via Realtime; `null` until the first event arrives. */
  status: PhotoJobStatus | null;
  resultPath: string | null;
  errorMessage: string | null;
}

export interface UseCloudJobArgs {
  /** Publishable Supabase URL; `null` when the SSR layer couldn't resolve it. */
  url: string | null;
  /** Publishable anon key (RLS-gated); `null` when unresolved. */
  anonKey: string | null;
  /** Short-lived user JWT; `null` for anonymous visitors (no subscription). */
  accessToken: string | null;
  /** The job to watch; `null` before submit and after Start-over (`reset()`). */
  jobId: string | null;
}

/** The subset of the `jobs` row this hook reads off the pushed UPDATE payload. */
type JobUpdateRow = Pick<PhotoJob, "status" | "result_path" | "error_message">;

/**
 * Subscribes the browser to its own `jobs` row and surfaces the live status the
 * async pipeline drives it through (S-04). One subscription per `jobId`: the
 * effect (re)subscribes when a non-null `jobId` appears and tears down on
 * unmount, on Start-over (`jobId → null` via `useCloudSubmit.reset()`), and on
 * any auth/config change — clearing the live state so one job's status never
 * crosses into the next.
 *
 * Anonymous visitors (no `accessToken`) never subscribe: the Local engine is
 * their path and the RLS-scoped channel would deliver nothing anyway.
 *
 * Phase 4 surfaces the raw status transitions only; Phase 5 layers the signed
 * result URL, the before/after render, and the timeout watchdog on top.
 */
export function useCloudJob({ url, anonKey, accessToken, jobId }: UseCloudJobArgs): CloudJobState {
  const [status, setStatus] = useState<PhotoJobStatus | null>(null);
  const [resultPath, setResultPath] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // No job yet, or missing the config/JWT to subscribe (e.g. anonymous).
    if (!jobId || !url || !anonKey || !accessToken) {
      return;
    }

    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    const client = createBrowserClient(url, anonKey);

    // Lesson #3: the Realtime WebSocket authenticates separately from REST —
    // `setAuth(jwt)` must resolve BEFORE `.subscribe()`, or the RLS-scoped
    // UPDATE is silently dropped (connects as anon, `auth.uid()` is null).
    void client.realtime.setAuth(accessToken).then(() => {
      if (cancelled) return;
      channel = client
        .channel(`job-${jobId}`)
        .on<JobUpdateRow>(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${jobId}` },
          (payload) => {
            setStatus(payload.new.status);
            setResultPath(payload.new.result_path);
            setErrorMessage(payload.new.error_message);
          },
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      // Reset live state so a stale status never bleeds into the next job.
      setStatus(null);
      setResultPath(null);
      setErrorMessage(null);
      if (channel) {
        void channel.unsubscribe();
      }
    };
  }, [url, anonKey, accessToken, jobId]);

  return { status, resultPath, errorMessage };
}
