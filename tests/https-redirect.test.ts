import { describe, expect, it } from "vitest";

import { CANONICAL_HOST, httpsRedirectTarget } from "@/lib/https-redirect";

describe("httpsRedirectTarget", () => {
  it("301-targets the https twin for plain-http prod URLs, preserving path and query", () => {
    expect(httpsRedirectTarget(new URL(`http://${CANONICAL_HOST}/guides/foo/?a=1`))).toBe(
      `https://${CANONICAL_HOST}/guides/foo/?a=1`,
    );
  });

  it("targets the https root for the http root", () => {
    expect(httpsRedirectTarget(new URL(`http://${CANONICAL_HOST}/`))).toBe(`https://${CANONICAL_HOST}/`);
  });

  it("leaves https prod traffic alone", () => {
    expect(httpsRedirectTarget(new URL(`https://${CANONICAL_HOST}/`))).toBeNull();
  });

  it("leaves localhost dev/E2E traffic alone (wrangler dev serves http)", () => {
    expect(httpsRedirectTarget(new URL("http://localhost:4321/"))).toBeNull();
    expect(httpsRedirectTarget(new URL("http://127.0.0.1:4321/enhance"))).toBeNull();
  });

  it("leaves other http hosts alone (only the canonical host redirects)", () => {
    expect(httpsRedirectTarget(new URL("http://lumina-clean-ai.pmiller-software.workers.dev/"))).toBeNull();
  });
});
