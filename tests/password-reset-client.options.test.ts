/**
 * password-reset-client.options.test.ts — pins the one property that makes
 * cross-device password reset work (FR-015).
 *
 * The bug this guards: `@supabase/ssr`'s `createServerClient` hardcodes
 * `flowType: "pkce"`, which binds the emailed recovery token to the browser
 * that requested it — open the mail on a phone and `/auth/confirm` fails.
 * The send leg therefore uses plain supabase-js under the IMPLICIT flow, which
 * mints a device-portable OTP hash.
 *
 * A regression here is silent and expensive: the reset still "works" for
 * anyone testing in one browser, and only fails for the real-world case of
 * requesting on a laptop and reading mail on a handset. Nothing else in the
 * suite would catch it, so the value is asserted directly.
 */
import { describe, it, expect } from "vitest";
import { PASSWORD_RESET_CLIENT_OPTIONS } from "@/lib/services/password-reset-client.options";

describe("PASSWORD_RESET_CLIENT_OPTIONS", () => {
  it("uses the implicit flow so the emailed link verifies on ANY device", () => {
    expect(PASSWORD_RESET_CLIENT_OPTIONS.auth.flowType).toBe("implicit");
  });

  // Not merely "not pkce" as an incidental: PKCE is the exact value the SSR
  // client forces and the exact cause of the cross-device failure, so it gets
  // its own explicit guard.
  it("is never pkce — that is the value that broke cross-device reset", () => {
    expect(PASSWORD_RESET_CLIENT_OPTIONS.auth.flowType).not.toBe("pkce");
  });

  it("holds no session: this server-side client must not persist or refresh", () => {
    expect(PASSWORD_RESET_CLIENT_OPTIONS.auth.persistSession).toBe(false);
    expect(PASSWORD_RESET_CLIENT_OPTIONS.auth.autoRefreshToken).toBe(false);
  });

  it("stays env-free so it is assertable without astro:env", () => {
    // The import above would already have thrown under Vitest if this module
    // pulled `astro:env/server` (the reason reset-password.handler.ts exists as
    // a separate env-free core). Reaching this line IS the assertion.
    expect(PASSWORD_RESET_CLIENT_OPTIONS).toBeDefined();
  });
});
