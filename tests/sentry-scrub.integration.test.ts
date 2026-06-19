import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as Sentry from "@sentry/astro";
import { scrubEvent } from "@/lib/observability/sentry-scrub";

/**
 * Integration test for follow-up 3.10 (archived sentry-integration review).
 *
 * The sibling unit test (`sentry-scrub.test.ts`) proves `scrubEvent` redacts a
 * HAND-BUILT span event. The open question was the *wiring*: does a span produced
 * by the REAL SDK pipeline actually carry the signed `result.*` URL in the fields
 * the scrub targets (`span.description` + `span.data["http.url"]`), and does
 * `beforeSendTransaction` see it before the event is sent?
 *
 * This test answers that by mirroring `sentry.client.config.ts`'s transaction
 * wiring (`beforeSendTransaction: (e) => scrubEvent(e)`) against a real
 * `Sentry.init` + `startSpan`, capturing the event in the hook and dropping it
 * (`return null`) so nothing leaves the process — no DSN traffic, no transport.
 *
 * Residual gap (live-only, not testable offline): that the *deployed* browser
 * bundle auto-creates this fetch span and fires the hook. `@sentry/astro` resolves
 * to its server build under Node, so `browserTracingIntegration` (which governs
 * auto-instrumentation) is absent here — but the span→event serialization and the
 * `beforeSendTransaction` hook are core SDK, identical across builds. Confirm the
 * deployed wiring once on a real sampled cloud job (see memory: sentry-prod-followups).
 */

// A realistic signed result URL — token + signature live in the query string,
// exactly what the client result-fetch span would otherwise leak to Sentry.
const SIGNED_URL =
  "https://abc.supabase.co/storage/v1/object/sign/photos/uid/jid/result.jpg?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.signedpayload&download=1";

describe("sentry client wiring — beforeSendTransaction redacts a real fetch span (3.10)", () => {
  let captured: ReturnType<typeof scrubEvent> | null = null;

  beforeAll(() => {
    Sentry.init({
      dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
      tracesSampleRate: 1,
      // Same wiring as sentry.client.config.ts; capture the scrubbed event and
      // drop it so the test never emits anything.
      beforeSendTransaction: (event) => {
        captured = scrubEvent(event);
        return null;
      },
    });
  });

  afterAll(async () => {
    await Sentry.close(0);
  });

  it("strips the signed-URL token from the http.client span before send", async () => {
    // Reproduce the span shape `browserTracingIntegration` records for
    // `fetch(result.*)`: an http.client child span whose name is `GET <url>` and
    // whose `http.url` attribute is the full signed URL.
    Sentry.startSpan({ name: "result-load", op: "pageload" }, () => {
      Sentry.startSpan({ name: `GET ${SIGNED_URL}`, op: "http.client", attributes: { "http.url": SIGNED_URL } }, () => {
        /* span body — the fetch itself isn't needed; we assert on the recorded span */
      });
    });
    await Sentry.flush(2000);

    expect(captured).not.toBeNull();
    if (captured === null) throw new Error("beforeSendTransaction did not capture a transaction");
    const event = captured;

    const span = event.spans?.find((s) => typeof s.description === "string" && s.description.startsWith("GET "));
    expect(span).toBeTruthy();

    // Description: query stripped to ?[redacted], no raw token.
    expect(span?.description).toContain("?[redacted]");
    expect(span?.description).not.toContain("token=");
    // Span data: the http.url attribute is redacted too.
    expect(JSON.stringify(span?.data)).not.toContain("signedpayload");
    // The leak-bearing fields of the outgoing transaction carry no signature.
    // (Stringify only these plain fields — the live event object holds circular
    // SDK internals, e.g. a Timeout, that can't be JSON-serialized wholesale.)
    expect(JSON.stringify(event.spans)).not.toContain("signedpayload");
    expect(JSON.stringify(event.contexts?.trace?.data ?? null)).not.toContain("signedpayload");
  });
});
