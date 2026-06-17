import { useEffect, useState } from "react";

/**
 * TEMPORARY — sentry-integration manual verification (3.7 client source maps).
 * Throws a real app-code error from a hydrated React island so the captured event
 * carries a genuine `SentryVerifyClient.tsx` frame (unlike a console-thrown error,
 * whose stack is only `<anonymous>` + the SDK wrapper). Revert with the route after
 * verification. See context/changes/sentry-integration/reviews/impl-review.md.
 */
export default function SentryVerifyClient({ ts }: { ts: number }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    // Throw on a tick after hydration so this is a real, uncaught client error
    // (React 19 reports it via window → Sentry's global handler captures it with
    // this component's frame). Synchronous throw, NOT setTimeout — a timer throw
    // would lose the app frame.
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
