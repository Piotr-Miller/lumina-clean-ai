import { describe, it, expect } from "vitest";
import type { Event } from "@sentry/core";
import { scrubEvent, redactString, MAX_DETAIL_CHARS } from "@/lib/observability/sentry-scrub";

const SIGNED_URL =
  "https://abc.supabase.co/storage/v1/object/sign/photos/uid/jid/result.jpg?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.signedpayload&extra=1";

describe("redactString", () => {
  it("strips a signed Storage URL's query (keeps the path)", () => {
    const out = redactString(`failed to fetch ${SIGNED_URL}`);
    expect(out).toContain("/storage/v1/object/sign/photos/uid/jid/result.jpg");
    expect(out).toContain("?[redacted]");
    expect(out).not.toContain("token=");
    expect(out).not.toContain("signedpayload");
  });

  it("redacts emails", () => {
    expect(redactString("user alice@example.com not found")).toBe("user [email] not found");
  });

  it("redacts bearer + provider tokens", () => {
    expect(redactString("Authorization: Bearer r8_supersecrettoken")).not.toContain("r8_supersecrettoken");
    expect(redactString("whsec_40abcDEF/xyz=")).toContain("[redacted-token]");
    expect(redactString("r8_ABCdef123")).toContain("[redacted-token]");
  });

  it("truncates over the bound", () => {
    const long = "x".repeat(MAX_DETAIL_CHARS + 50);
    const out = redactString(long);
    expect(out.length).toBeLessThanOrEqual(MAX_DETAIL_CHARS + "…[truncated]".length);
    expect(out.endsWith("…[truncated]")).toBe(true);
  });

  it("is a no-op on a clean string", () => {
    expect(redactString("plain diagnostic message")).toBe("plain diagnostic message");
  });
});

describe("scrubEvent — error events", () => {
  it("redacts message + exception value", () => {
    const event: Event = {
      message: `boom for bob@example.com at ${SIGNED_URL}`,
      exception: { values: [{ type: "Error", value: `signing ${SIGNED_URL}` }] },
    };
    const out = scrubEvent(event);
    expect(out.message).not.toContain("bob@example.com");
    expect(out.message).not.toContain("token=");
    expect(out.exception?.values?.[0].value).not.toContain("signedpayload");
  });

  it("scrubs the request envelope (url, query_string, headers, cookies)", () => {
    // `cookies` as a raw string mirrors what the server RequestData integration
    // can attach; Sentry types it narrowly, so build the event loosely.
    const event = {
      request: {
        url: SIGNED_URL,
        query_string: "token=secret&x=1",
        cookies: "sb-access-token=abc",
        headers: { cookie: "sb-access-token=abc", Authorization: "Bearer r8_xyz", "User-Agent": "curl/8" },
        data: { note: `see ${SIGNED_URL}` },
      },
    } as unknown as Event;
    const out = scrubEvent(event);
    expect(out.request?.url).not.toContain("token=");
    expect(out.request?.query_string).toBe("[redacted]");
    expect(out.request?.cookies).toBe("[redacted]");
    expect((out.request?.headers as Record<string, string>).cookie).toBe("[redacted]");
    expect((out.request?.headers as Record<string, string>).Authorization).toBe("[redacted]");
    expect((out.request?.headers as Record<string, string>)["User-Agent"]).toBe("curl/8");
    expect(JSON.stringify(out.request?.data)).not.toContain("token=");
  });

  it("nulls user.ip_address and drops user.email", () => {
    const event: Event = { user: { id: "u1", ip_address: "83.29.92.25", email: "a@b.com" } };
    const out = scrubEvent(event);
    expect(out.user?.ip_address).toBeNull();
    expect("email" in (out.user as object)).toBe(false);
    expect(out.user?.id).toBe("u1");
  });

  it("redacts nested URLs/emails in extra + breadcrumbs", () => {
    const event: Event = {
      extra: { detail: `download ${SIGNED_URL}`, nested: { who: "carol@example.com" } },
      breadcrumbs: [
        { message: `fetch ${SIGNED_URL}` },
        { category: "fetch", data: { url: SIGNED_URL, method: "GET" } },
      ],
    };
    const out = scrubEvent(event);
    expect(JSON.stringify(out.extra)).not.toContain("token=");
    expect(JSON.stringify(out.extra)).not.toContain("carol@example.com");
    expect(out.breadcrumbs?.[0].message).not.toContain("token=");
    expect(JSON.stringify(out.breadcrumbs?.[1].data)).not.toContain("signedpayload");
  });
});

describe("scrubEvent — transaction/span events", () => {
  it("redacts span description + data (the signed result.* fetch span)", () => {
    const event = {
      type: "transaction",
      spans: [{ description: `GET ${SIGNED_URL}`, data: { "http.url": SIGNED_URL } }],
      contexts: { trace: { data: { "http.url": SIGNED_URL } } },
    } as unknown as Event;
    const out = scrubEvent(event);
    const span = out.spans?.[0] as unknown as { description: string; data: Record<string, string> };
    expect(span.description).not.toContain("token=");
    expect(span.data["http.url"]).not.toContain("signedpayload");
    expect(JSON.stringify(out.contexts?.trace?.data)).not.toContain("token=");
  });
});

describe("scrubEvent — robustness", () => {
  it("is a no-op on an already-clean event and tolerates missing fields", () => {
    const clean: Event = { message: "clean", level: "info" };
    expect(scrubEvent(clean).message).toBe("clean");
    expect(() => scrubEvent({})).not.toThrow();
  });
});
