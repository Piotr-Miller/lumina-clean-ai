import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resetPasswordResponse,
  SEND_FAILURE_MESSAGE,
  INVALID_REQUEST_MESSAGE,
} from "@/lib/services/reset-password.handler";

const SENT_PATH = "/auth/forgot-password?sent=1";
const ERROR_PREFIX = "/auth/forgot-password?error=";

/** A real form POST the way the browser submits the forgot-password form. */
function formRequest(email: string): Request {
  return new Request("http://localhost/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email }),
  });
}

/** A body that is NOT a parseable form, so `request.formData()` throws. */
function malformedRequest(): Request {
  return new Request("http://localhost/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ not a form }",
  });
}

/** Stub supabase whose resetPasswordForEmail resolves with the given `error`. */
function stubSupabase(error: { message: string } | null) {
  const resetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error });
  return {
    client: { auth: { resetPasswordForEmail } } as unknown as SupabaseClient,
    resetPasswordForEmail,
  };
}

describe("resetPasswordResponse — redirect-path decision", () => {
  it("(a) clean send → ?sent=1", async () => {
    const { client } = stubSupabase(null);
    const path = await resetPasswordResponse({ supabase: client, request: formRequest("user@example.com") });
    expect(path).toBe(SENT_PATH);
  });

  it("(b) send error → neutral ?error= and never leaks error.message", async () => {
    const secret = "email rate limit exceeded — internal-token-XYZ";
    const { client } = stubSupabase({ message: secret });
    const path = await resetPasswordResponse({ supabase: client, request: formRequest("user@example.com") });

    expect(path.startsWith(ERROR_PREFIX)).toBe(true);
    expect(path).toBe(`${ERROR_PREFIX}${encodeURIComponent(SEND_FAILURE_MESSAGE)}`);
    // No-leakage: neither the raw message nor any distinctive fragment of it appears.
    expect(path).not.toContain("rate limit");
    expect(path).not.toContain("internal-token-XYZ");
    expect(decodeURIComponent(path)).not.toContain(secret);
  });

  it("(c) supabase not configured → same neutral ?error=, send is never attempted", async () => {
    const { resetPasswordForEmail } = stubSupabase(null);
    const path = await resetPasswordResponse({ supabase: null, request: formRequest("user@example.com") });
    expect(path).toBe(`${ERROR_PREFIX}${encodeURIComponent(SEND_FAILURE_MESSAGE)}`);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("(d) returned path is independent of the email argument", async () => {
    // Proves path-mapping + that the address never reaches the URL. Does NOT prove
    // enumeration safety end-to-end — that rests on Supabase returning no error for
    // unknown emails (a documented assumption) + the no-message-leak guarantee above.
    const success = stubSupabase(null);
    const p1 = await resetPasswordResponse({ supabase: success.client, request: formRequest("alice@example.com") });
    const p2 = await resetPasswordResponse({
      supabase: success.client,
      request: formRequest("does-not-exist@example.com"),
    });
    expect(p1).toBe(p2);

    const failure = stubSupabase({ message: "boom" });
    const e1 = await resetPasswordResponse({ supabase: failure.client, request: formRequest("alice@example.com") });
    const e2 = await resetPasswordResponse({
      supabase: failure.client,
      request: formRequest("does-not-exist@example.com"),
    });
    expect(e1).toBe(e2);
  });

  it("(e) malformed (non-form) body → invalid-request ?error=, send never attempted", async () => {
    const { client, resetPasswordForEmail } = stubSupabase(null);
    const path = await resetPasswordResponse({ supabase: client, request: malformedRequest() });
    expect(path).toBe(`${ERROR_PREFIX}${encodeURIComponent(INVALID_REQUEST_MESSAGE)}`);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });
});
