import { useEffect, useState } from "react";
import { REALTIME_SUBSCRIBE_STATES, type RealtimeChannel } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase-browser";
import { loadCloudResult } from "@/lib/services/cloud-result.client";
import { maybePostprocessCloudResult } from "@/lib/services/cloud-result-postprocess.client";
import { CHROMA_POSTPASS_ENABLED } from "@/lib/engines/chroma-denoise";
import { deriveDownloadName } from "@/lib/engines/image-helpers";
import type { PhotoJob, PhotoJobStatus } from "@/types";
import {
  deriveCloudPhase,
  deriveDisplayError,
  isTerminalStatus,
  shouldArmProcessingBudget,
  shouldFailAfterQueuedReRead,
  type CloudJobPhase,
} from "./cloud-job-decisions";

// `CloudJobPhase` + the decision predicates now live in `cloud-job-decisions.ts`
// (pure, Node-unit-testable — test-plan §2 Risk #6). Re-exported so existing
// `import { CloudJobPhase } from "@/components/hooks/useCloudJob"` consumers stay valid.
export type { CloudJobPhase };

export interface CloudJobState {
  /** Coarse phase: `idle` before submit, then `processing` → `succeeded`/`failed`. */
  phase: CloudJobPhase;
  /** Live job status pushed via Realtime; `null` until the first event arrives. */
  status: PhotoJobStatus | null;
  /**
   * True once the wait has run long enough to look like a cold model boot
   * (Phase-0: ~2 min typical, >300s under load). Drives a reassurance line so a long
   * spinner doesn't read as "stuck"; warm runs (~5s) never trip it.
   */
  coldStartHint: boolean;
  /** Signed read URL for the result object, set once `succeeded` and loaded. */
  afterUrl: string | null;
  /** Result bytes for `DownloadButton`; set alongside `afterUrl`. */
  resultBlob: Blob | null;
  /** Intrinsic result dimensions for `BeforeAfterSlider`; set alongside `afterUrl`. */
  resultWidth: number | null;
  resultHeight: number | null;
  /** Suggested download filename (derived from the source name + result mime). */
  downloadName: string | null;
  /** User-facing error for a failed pipeline, a load failure, or a timeout; else `null`. */
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
  /** Original upload filename, for the download name; `null` falls back to a generic. */
  sourceFileName: string | null;
}

/** The subset of the `jobs` row this hook reads off the pushed UPDATE payload. */
type JobUpdateRow = Pick<PhotoJob, "status" | "result_path" | "error_message">;

/** Short TTL for the result read URL; re-minted on demand if it ever expires. */
const RESULT_URL_TTL_SECONDS = 300;
/**
 * Two-phase watchdog budgets (Phase-0 cold-start finding: a scaled-to-zero Bread
 * model boots in ~118–135s, then predicts in ~3s; warm is ~4s end-to-end).
 *
 * A single fixed timeout can't win — short enough to fail genuine stalls fast
 * also false-fails every cold boot. So we split on the `processing` transition,
 * which is the proof the pipeline engaged:
 *  - QUEUED→PROCESSING must be quick; if the row never reaches `processing` the
 *    webhook never fired / the flag is off / `/start` died — fail fast.
 *  - Once `processing`, Replicate has the job and a cold boot is "slow but
 *    working", so allow a much longer budget (ceiling + predict + callback +
 *    result fetch) before declaring a stall. Cold boots >300s were observed
 *    under platform load, so the budget is 300s (5 min) — above that tail with
 *    margin.
 *
 * This `processing` budget is a UX-patience timeout (fail a truly-stuck job to a
 * clear retry), deliberately DECOUPLED from — and shorter than — the Edge
 * Function's 3600s source signed-URL TTL (`SOURCE_URL_TTL_SECONDS`). The TTL is
 * sized generously so the source URL is never the failure cause; this watchdog
 * is a separate concern and must not be "aligned" to it.
 *
 * Exported so `tests/cloud-timings.test.ts` can assert the design invariants
 * (reassurance before fail; two-phase ordering; cold-boot floor).
 */
export const QUEUED_WATCHDOG_MS = 30_000;
export const PROCESSING_WATCHDOG_MS = 300_000;
/** Show the cold-start reassurance line if still waiting after this. */
export const SLOW_HINT_MS = 25_000;
const TIMEOUT_ENDPOINT = "/api/enhance/cloud/timeout";

const RESULT_LOAD_MESSAGE = "The enhanced result couldn't be loaded. Please try again.";

/**
 * Subscribes the browser to its own `jobs` row, drives it from the live status
 * the async pipeline pushes (S-04), and on `succeeded` mints a signed read URL
 * for the result + decodes it into the render-ready bundle the before/after
 * slider and download button need.
 *
 * One subscription per `jobId`: the effect (re)subscribes when a non-null
 * `jobId` appears and tears down on unmount, on Start-over (`jobId → null` via
 * `useCloudSubmit.reset()`), and on any auth/config change — clearing the live
 * state so one job's status never crosses into the next.
 *
 * A two-phase watchdog backstops the async fire-and-forget enqueue (lesson:
 * pg_net/webhook stalls leave the row pending forever) while tolerating Bread's
 * cold-start (Phase-0: ~135s boot). A short budget covers `queued → processing`
 * (if the row never engages, fail fast); a long one covers `processing →
 * terminal` (a cold boot is slow but working). On expiry the browser POSTs
 * `/api/enhance/cloud/timeout`, which flips the still-pending row to `failed`
 * via an owner-scoped guarded update (a Replicate success that already landed is
 * left untouched). The user sees the timeout error only when their own
 * subscription hasn't delivered a terminal event first.
 *
 * A one-shot catch-up read after subscribing folds in any transition that
 * landed BEFORE the subscription was live (the channel only delivers future
 * events): without it a missed `processing` would let the queued watchdog
 * false-fail a cold boot, and a missed terminal would never render.
 *
 * Anonymous visitors (no `accessToken`) never subscribe: the Local engine is
 * their path and the RLS-scoped channel would deliver nothing anyway.
 */
export function useCloudJob({ url, anonKey, accessToken, jobId, sourceFileName }: UseCloudJobArgs): CloudJobState {
  const [status, setStatus] = useState<PhotoJobStatus | null>(null);
  const [resultPath, setResultPath] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{ afterUrl: string; blob: Blob; width: number; height: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [coldStartHint, setColdStartHint] = useState(false);

  // Subscribe + watchdog. Re-runs on any input change; the cleanup resets all
  // live state so a stale status/result never bleeds into the next job.
  useEffect(() => {
    if (!jobId || !url || !anonKey || !accessToken) {
      return;
    }

    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    let terminal = false;
    let sawProcessing = false;
    // One holder so the helper closures can read/clear timers without a
    // use-before-define forward reference (and without `let` reassignment):
    // `queued` (phase-1), `hint` (cold-start affordance), `processing` (phase-2).
    const timers: {
      queued?: ReturnType<typeof setTimeout>;
      hint?: ReturnType<typeof setTimeout>;
      processing?: ReturnType<typeof setTimeout>;
    } = {};
    // Aborts the in-flight timeout POST on teardown so a Start-over/unmount
    // doesn't leave an untracked request running (the route is idempotent, so
    // the abort is just hygiene, not correctness).
    const abort = new AbortController();
    const client = createBrowserClient(url, anonKey, accessToken);

    const failByTimeout = () => {
      if (cancelled || terminal) return;
      // Genuinely stuck — fail the still-pending row server-side (owner-scoped,
      // idempotent) and surface the timeout locally.
      setTimedOut(true);
      void fetch(TIMEOUT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
        signal: abort.signal,
      }).catch(() => {
        // Best-effort: the user already sees the timeout; a failed/aborted POST
        // just leaves the row pending for an operator sweep.
      });
    };

    const clearTimers = () => {
      if (timers.queued) clearTimeout(timers.queued);
      if (timers.hint) clearTimeout(timers.hint);
      if (timers.processing) clearTimeout(timers.processing);
    };

    // Fold a status snapshot (catch-up read or pushed event) into state + the
    // watchdog. Idempotent + monotonic: the `terminal` guard stops a late event
    // reviving a closed job; `sawProcessing` arms the long budget exactly once.
    const applyStatus = (next: PhotoJobStatus, nextResultPath: string | null, nextError: string | null) => {
      if (cancelled || terminal) return;
      if (shouldArmProcessingBudget(next, sawProcessing)) {
        sawProcessing = true;
        if (timers.queued) clearTimeout(timers.queued); // pipeline engaged — swap to the cold-boot budget
        timers.processing = setTimeout(failByTimeout, PROCESSING_WATCHDOG_MS);
      }
      if (isTerminalStatus(next)) {
        terminal = true;
        clearTimers();
        setColdStartHint(false);
      }
      setStatus(next);
      setResultPath(nextResultPath);
      setErrorMessage(nextError);
    };

    // Authoritative one-shot read of the row, folded in via applyStatus. Used
    // for the post-SUBSCRIBED catch-up and the queued-deadline re-check. RLS
    // (`jobs_select_own`) scopes it to this user via the JWT bearer.
    const syncFromRead = () =>
      client
        .from("jobs")
        .select("status, result_path, error_message")
        .eq("id", jobId)
        .maybeSingle()
        .then((res) => {
          const row = (res as { data: JobUpdateRow | null }).data;
          if (row) applyStatus(row.status, row.result_path, row.error_message);
          return row ? row.status : null;
        });

    // Queued-deadline handler — do NOT blindly fail. The `queued → processing`
    // event can be missed in the subscribe gap (and the channel never replays
    // it), so a blind fail would kill a cold boot that genuinely reached
    // `processing`. Re-read authoritatively: only a row STILL `queued` is a
    // real stall (webhook never fired / flag off / `/start` died); a row that
    // has advanced is folded in (arming the long budget, or rendering/failing).
    const onQueuedDeadline = () => {
      if (cancelled || terminal || sawProcessing) return;
      void syncFromRead().then((current) => {
        if (cancelled || terminal || sawProcessing) return;
        if (shouldFailAfterQueuedReRead(current)) failByTimeout();
      });
    };

    // Phase 1 of the watchdog: the row must leave `queued` quickly (re-checked).
    timers.queued = setTimeout(onQueuedDeadline, QUEUED_WATCHDOG_MS);
    // Progressive reassurance: a cold first-run after idle can take a few minutes.
    timers.hint = setTimeout(() => {
      if (cancelled || terminal) return;
      setColdStartHint(true);
    }, SLOW_HINT_MS);

    // Lesson #3: the Realtime WebSocket authenticates separately from REST —
    // `setAuth(jwt)` must resolve BEFORE `.subscribe()`, or the RLS-scoped
    // UPDATE is silently dropped (connects as anon, `auth.uid()` is null).
    void client.realtime
      .setAuth(accessToken)
      .then(() => {
        if (cancelled) return;
        channel = client
          .channel(`job-${jobId}`)
          .on<JobUpdateRow>(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${jobId}` },
            (payload) => {
              applyStatus(payload.new.status, payload.new.result_path, payload.new.error_message);
            },
          )
          .subscribe((subStatus) => {
            // Catch-up read once the channel is live: the subscription delivers
            // only future events, but the row may already have advanced before
            // now. (Re)reading on every SUBSCRIBED also re-syncs after a reconnect.
            if (subStatus !== REALTIME_SUBSCRIBE_STATES.SUBSCRIBED || cancelled) return;
            void syncFromRead();
          });
      })
      .catch((err: unknown) => {
        // A rejected setAuth (or a throw while wiring the channel) means the
        // subscription never establishes; the watchdog still fails the job, but
        // surface the real cause so it isn't misread as a generic timeout.
        // eslint-disable-next-line no-console
        console.warn("useCloudJob: realtime setAuth/subscribe failed:", err instanceof Error ? err.message : err);
      });

    return () => {
      cancelled = true;
      clearTimers();
      abort.abort(); // cancel any in-flight timeout POST
      // Reset live state so a stale status/result never bleeds into the next job.
      setStatus(null);
      setResultPath(null);
      setErrorMessage(null);
      setResult(null);
      setLoadError(null);
      setTimedOut(false);
      setColdStartHint(false);
      // Tear down the channel AND this run's client socket. `unsubscribe()`
      // alone leaves the WebSocket open (heartbeating) until GC, so every
      // Start-over/resubmit would orphan a socket; `removeChannel` +
      // `realtime.disconnect()` releases both. `disconnect()` is also called
      // unconditionally to cover teardown before `setAuth` resolved (channel
      // never assigned, but the socket may already be connecting).
      if (channel) {
        void client.removeChannel(channel);
      }
      void client.realtime.disconnect();
    };
  }, [url, anonKey, accessToken, jobId]);

  // On `succeeded`, mint a signed read URL for the result and load it into the
  // render-ready bundle (dimensions + Blob). Separate effect so it reacts to
  // the pushed status without re-opening the subscription.
  useEffect(() => {
    if (status !== "succeeded" || !resultPath || !url || !anonKey || !accessToken) {
      return;
    }
    let cancelled = false;
    // Tracks the object URL minted for a processed (chroma post-pass) Blob so it
    // can be revoked on teardown. Stays null when the pass is disabled or falls
    // back — the raw signed URL is never an object URL and must never be revoked.
    let processedObjectUrl: string | null = null;
    const client = createBrowserClient(url, anonKey, accessToken);
    // A `.then` chain (not an async IIFE) so the `cancelled` guard reads as a
    // genuine post-unmount check — TS widens a captured `let` referenced from a
    // deferred callback, mirroring the subscribe effect above.
    void client.storage
      .from("photos")
      .createSignedUrl(resultPath, RESULT_URL_TTL_SECONDS)
      .then(({ data, error }) => {
        if (error) {
          throw new Error(error.message);
        }
        const afterUrl = data.signedUrl;
        return loadCloudResult(afterUrl).then((loaded) => ({ afterUrl, loaded }));
      })
      .then(({ afterUrl, loaded }) => {
        // Guard before the async pass: a job/input change between the fetch and
        // here must not publish a stale result.
        if (cancelled) return;
        // Chroma post-pass (default-OFF). On success the processed JPEG feeds
        // BOTH slider and download via one managed object URL; disabled or any
        // fallback retains the raw signed URL + raw Blob byte-for-byte.
        return maybePostprocessCloudResult({
          enabled: CHROMA_POSTPASS_ENABLED,
          blob: loaded.blob,
          width: loaded.width,
          height: loaded.height,
        }).then((outcome) => {
          // Guard again after the async pass for the same stale-job reason.
          if (cancelled) return;
          if (outcome.fallbackReason) {
            // Quality degradation, not result loss: the raw result still renders.
            // Scrub-safe (no URL/PII) — only flag, dimensions, or error message.
            // eslint-disable-next-line no-console
            console.warn("useCloudJob: chroma post-pass fell back to raw result:", outcome.fallbackReason);
          }
          let displayUrl = afterUrl;
          if (outcome.processed) {
            processedObjectUrl = URL.createObjectURL(outcome.blob);
            displayUrl = processedObjectUrl;
          }
          setResult({ afterUrl: displayUrl, blob: outcome.blob, width: loaded.width, height: loaded.height });
        });
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(RESULT_LOAD_MESSAGE);
      });
    return () => {
      cancelled = true;
      // Revoke only the generated object URL (never the signed URL). This is the
      // sole revoke site: correct because a job/input change re-runs this effect
      // and React runs THIS cleanup (revoking the prior URL) before the next run
      // mints a new one — so each minted URL is revoked exactly once, with no
      // same-job replace window (there's no `await` between createObjectURL and
      // setResult above). If a future refactor decouples minting from this
      // effect's lifecycle, switch to a `urlsRef` revoke-prior pattern (cf.
      // `useLocalEnhance`) instead of relying on cleanup ordering.
      if (processedObjectUrl) URL.revokeObjectURL(processedObjectUrl);
    };
  }, [status, resultPath, url, anonKey, accessToken]);

  // `succeeded` always wins (even if a timeout watchdog also fired in a rare
  // race): a real result must render, never a stale timeout. While the result
  // URL is still loading, stay in `processing`.
  const phase = deriveCloudPhase({ jobId, status, hasResult: result !== null, timedOut, loadError });

  // A row-level `failed` (incl. the timeout route's own write) carries the
  // authoritative message; the client `TIMEOUT_MESSAGE` only covers the gap
  // before that write lands. The two timeout strings are identical, so there's
  // no flicker between them.
  const displayError = deriveDisplayError({ phase, status, timedOut, loadError, errorMessage });

  return {
    phase,
    status,
    coldStartHint: coldStartHint && phase === "processing",
    afterUrl: result?.afterUrl ?? null,
    resultBlob: result?.blob ?? null,
    resultWidth: result?.width ?? null,
    resultHeight: result?.height ?? null,
    downloadName: result ? deriveDownloadName(sourceFileName ?? "photo", result.blob.type) : null,
    errorMessage: displayError,
  };
}
