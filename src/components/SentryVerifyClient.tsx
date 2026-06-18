import { useEffect, useState } from "react";

/**
 * TEMPORARY — follow-up 3.7 CLIENT source-map verification (sentry-prod-sourcemaps).
 *
 * Throws a real app-code error from a hydrated React island so the captured event
 * carries a genuine `SentryVerifyClient.tsx` frame (unlike a console-thrown error,
 * whose stack is only `<anonymous>` + the SDK wrapper). The synchronous throw lives
 * in the effect — a `setTimeout` throw would lose the app frame.
 *
 * REMOVE with the route in Phase 4. See context/changes/sentry-prod-sourcemaps/plan.md.
 */
export default function SentryVerifyClient({ ts }: { ts: number }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (armed) throw new Error(`sentry-verify CLIENT test ${ts}`);
  }, [armed, ts]);

  return (
    <button
      type="button"
      onClick={() => {
        setArmed(true);
      }}
    >
      sentry-verify: click to throw a real client error (case=client)
    </button>
  );
}
