/**
 * Best-effort client trigger for the cloud-job hard-cancel (change
 * `cloud-job-cancel`).
 *
 * Fire-and-forget by design: the workspace resets to the fresh upload screen
 * optimistically the instant the user clicks cancel, so there is no UI waiting on
 * this POST. A failed/aborted request just leaves the row to the server-side
 * guard + the retention reaper (source cleanup) and the prediction to
 * self-complete as an orphan — the user already moved on. Mirrors the watchdog
 * `/timeout` POST in `useCloudJob`.
 */
const CANCEL_ENDPOINT = "/api/enhance/cloud/cancel";

export function cancelCloudJob(jobId: string): void {
  void fetch(CANCEL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId }),
  }).catch(() => {
    // Best-effort: the UI has already reset; the reaper backstops source cleanup.
  });
}
