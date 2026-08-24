/**
 * sentry-scrub.test.ts — behaviour AND drift protection for the Edge Sentry scrub.
 *
 * The Edge scrub is a hand-maintained duplicate of
 * `src/lib/observability/sentry-scrub.ts`, and until now its only protection
 * was a "keep the two in sync" comment in both files. A comment cannot fail
 * CI: the app copy could gain a redaction (a new token prefix, say) and the
 * Edge copy would keep shipping the unredacted value to Sentry, silently, for
 * as long as nobody re-read both files side by side.
 *
 * So the parity suite below imports BOTH copies and asserts identical output on
 * a battery of sensitive payloads. Deno can import the app module directly (it
 * is pure, and its only import is type-only), the same way index.ts imports
 * `src/lib/services/*.ts`. That turns the instruction into a gate.
 */
import { assertEquals } from "jsr:@std/assert@^1.0.8";
import { MAX_ERROR_DETAIL_CHARS, scrubRedactDeep, scrubRedactString, scrubSentryEvent } from "./sentry-scrub.ts";
import {
  MAX_DETAIL_CHARS as APP_MAX_DETAIL_CHARS,
  scrubEvent as appScrubEvent,
} from "../../../src/lib/observability/sentry-scrub.ts";

const SIGNED_URL =
  "https://ref.supabase.co/storage/v1/object/sign/photos/source.jpg?token=eyJhbGciOiJIUzI1NiJ9.abcdefghijklmnop&sig=deadbeef";

/** Payloads chosen to exercise every redaction rule, not just the easy ones. */
const sensitivePayloads: { name: string; event: () => Record<string, unknown> }[] = [
  {
    name: "message with a signed URL",
    event: () => ({ message: `fetch failed for ${SIGNED_URL}` }),
  },
  {
    name: "message with an email",
    event: () => ({ message: "user person@example.com could not be found" }),
  },
  {
    name: "message with provider tokens",
    event: () => ({
      message: "Bearer abc.def-ghi and whsec_AAAA/BBBB= and r8_ZZZZ9999 and eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    }),
  },
  {
    name: "exception values",
    event: () => ({ exception: { values: [{ value: `boom ${SIGNED_URL}` }, { value: "me@example.com" }] } }),
  },
  {
    name: "request envelope with headers, cookies, query and body",
    event: () => ({
      request: {
        url: `${SIGNED_URL}`,
        query_string: "token=secret",
        cookies: "sb-access-token=abc",
        headers: { Authorization: "Bearer xyz", Cookie: "a=b", "X-Api-Key": "k", "User-Agent": "curl" },
        data: { email: "person@example.com", nested: { apikey: "zzz", note: `see ${SIGNED_URL}` } },
      },
    }),
  },
  {
    name: "user pii",
    event: () => ({ user: { id: "u1", email: "person@example.com", ip_address: "203.0.113.7" } }),
  },
  {
    name: "spans",
    event: () => ({ spans: [{ description: `GET ${SIGNED_URL}`, data: { email: "a@b.co" } }] }),
  },
  {
    name: "breadcrumbs",
    event: () => ({ breadcrumbs: [{ message: `hit ${SIGNED_URL}`, data: { secret: "s3cr3t" } }] }),
  },
  {
    name: "contexts.trace.data",
    event: () => ({ contexts: { trace: { data: { access_token: "abc", url: SIGNED_URL } } } }),
  },
  {
    name: "extra",
    event: () => ({ extra: { sourceUrl: SIGNED_URL, who: "person@example.com" } }),
  },
  {
    name: "an over-long string",
    event: () => ({ message: "x".repeat(MAX_ERROR_DETAIL_CHARS + 250) }),
  },
  {
    name: "a deeply nested structure",
    event: () => ({ extra: { a: { b: { c: { d: { e: { f: { g: "person@example.com" } } } } } } } }),
  },
  {
    name: "an event with nothing sensitive",
    event: () => ({ message: "plain text", extra: { count: 3, ok: true, nothing: null } }),
  },
];

// ---------------------------------------------------------------------------
// Parity with the app copy — the drift gate
// ---------------------------------------------------------------------------

Deno.test("the Edge scrub and the app scrub produce IDENTICAL output", async (t) => {
  for (const { name, event } of sensitivePayloads) {
    await t.step(name, () => {
      // Separate instances: both scrubs mutate in place.
      const edge = scrubSentryEvent(event());
      const app = appScrubEvent(event() as Parameters<typeof appScrubEvent>[0]);
      // Compared as plain data — the two SDKs' `Event` types differ
      // structurally, and it is the redacted VALUES that must match, not the
      // nominal types.
      assertEquals(edge, app as unknown as Record<string, unknown>, `Edge and app scrub diverged on: ${name}`);
    });
  }
});

Deno.test("the two copies agree on the truncation bound", () => {
  assertEquals(MAX_ERROR_DETAIL_CHARS, APP_MAX_DETAIL_CHARS);
});

// ---------------------------------------------------------------------------
// Behaviour — what must be redacted, asserted directly rather than by parity
// (parity alone would pass if BOTH copies stopped redacting).
// ---------------------------------------------------------------------------

Deno.test("a signed Storage URL keeps its path but loses the token query", () => {
  const out = scrubRedactString(`failed ${SIGNED_URL}`);
  assertEquals(out.includes("token="), false);
  assertEquals(out.includes("deadbeef"), false);
  assertEquals(out.includes("/storage/v1/object/sign/photos/source.jpg"), true);
});

Deno.test("provider tokens and emails are replaced", () => {
  assertEquals(scrubRedactString("Bearer abc.def").includes("abc.def"), false);
  assertEquals(scrubRedactString("r8_SECRET123").includes("r8_SECRET123"), false);
  assertEquals(scrubRedactString("whsec_AAAA=").includes("whsec_AAAA="), false);
  assertEquals(scrubRedactString("a@b.co"), "[email]");
});

Deno.test("long strings are bounded", () => {
  const out = scrubRedactString("x".repeat(MAX_ERROR_DETAIL_CHARS + 100));
  assertEquals(out.endsWith("…[truncated]"), true);
  assertEquals(out.length, MAX_ERROR_DETAIL_CHARS + "…[truncated]".length);
});

Deno.test("sensitive KEYS are dropped wholesale, whatever the value", () => {
  const out = scrubRedactDeep({ authorization: "x", cookie: "y", apikey: "z", note: "fine" }) as Record<
    string,
    unknown
  >;
  assertEquals(out.authorization, "[redacted]");
  assertEquals(out.cookie, "[redacted]");
  assertEquals(out.apikey, "[redacted]");
  assertEquals(out.note, "fine");
});

Deno.test("recursion is depth-bounded so a cyclic-ish structure cannot hang the hook", () => {
  const deep = { a: { b: { c: { d: { e: { f: { g: { h: "deep" } } } } } } } };
  assertEquals(JSON.stringify(scrubRedactDeep(deep)).includes("[depth-limited]"), true);
});

// user.ip_address is the subtle one: Sentry backfills it server-side from the
// envelope origin even with sendDefaultPii false, so it must be explicitly
// nulled rather than merely left unset.
Deno.test("user.ip_address is nulled and email removed", () => {
  const event = scrubSentryEvent({ user: { id: "u1", email: "a@b.co", ip_address: "203.0.113.7" } }) as {
    user: Record<string, unknown>;
  };
  assertEquals(event.user.ip_address, null);
  assertEquals("email" in event.user, false);
  assertEquals(event.user.id, "u1");
});
