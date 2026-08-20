/**
 * expect-response-format.test.ts — hermetic coverage of the E2E response-assert
 * helper's FAILURE path (tests/e2e/helpers/expect-response.ts).
 *
 * The helper's central deliverable is its failure output — the message that
 * must name a CI flake's layer (change `e2e-webserver-boot-flake`, sig 3) —
 * and a green e2e run never exercises it. Vitest owns it with structural fake
 * responses: no Playwright runtime, no network. The pass path's lazy-read
 * invariant (success bodies carry signed upload URLs — never read, never in a
 * message) is pinned here too.
 */
import { describe, expect, it } from "vitest";
import {
  BODY_EMPTY,
  BODY_SNIPPET_MAX_LENGTH,
  BODY_UNREADABLE,
  expectOkResponse,
  formatOkFailureMessage,
  type OkReadable,
} from "./e2e/helpers/expect-response";

const URL_UNDER_TEST = "http://localhost:4321/api/auth/signin";

/** Structural fake satisfying OkReadable, with a text() call counter. */
function fakeResponse(opts: { ok: boolean; status?: number; url?: string; body?: string; textRejects?: boolean }): {
  response: OkReadable;
  textCalls: () => number;
} {
  let calls = 0;
  return {
    response: {
      ok: () => opts.ok,
      status: () => opts.status ?? (opts.ok ? 200 : 500),
      url: () => opts.url ?? URL_UNDER_TEST,
      text: () => {
        calls += 1;
        return opts.textRejects ? Promise.reject(new Error("stream torn down")) : Promise.resolve(opts.body ?? "");
      },
    },
    textCalls: () => calls,
  };
}

/** Run the helper expecting its assertion to throw; return the thrown message. */
async function captureFailureMessage(response: OkReadable, label: string): Promise<string> {
  try {
    await expectOkResponse(response, label);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expectOkResponse passed on a non-ok response — the assertion under test never fired");
}

describe("formatOkFailureMessage", () => {
  it("carries the label, status, final URL, and body on one line", () => {
    const message = formatOkFailureMessage({
      label: "signin",
      status: 403,
      url: URL_UNDER_TEST,
      body: '{"error":{"code":"forbidden"}}',
    });
    expect(message).toBe(
      `signin: expected a 2xx response, got 403 from ${URL_UNDER_TEST} — body: {"error":{"code":"forbidden"}}`,
    );
  });

  it("collapses multi-line and repeated whitespace to single spaces", () => {
    const message = formatOkFailureMessage({
      label: "create-job",
      status: 500,
      url: URL_UNDER_TEST,
      body: "  <html>\r\n  <body>\n\tInternal   error\n</body>\n</html>  ",
    });
    expect(message).not.toMatch(/[\r\n\t]/);
    expect(message).toContain("body: <html> <body> Internal error </body> </html>");
  });

  it("truncates an over-length body at the cap with a truncation marker", () => {
    const body = "x".repeat(BODY_SNIPPET_MAX_LENGTH + 50);
    const message = formatOkFailureMessage({ label: "signin", status: 502, url: URL_UNDER_TEST, body });
    const snippet = message.slice(message.indexOf("body: ") + "body: ".length);
    expect(snippet).toBe(`${"x".repeat(BODY_SNIPPET_MAX_LENGTH)}…`);
  });

  it("keeps a body exactly at the cap untruncated", () => {
    const body = "x".repeat(BODY_SNIPPET_MAX_LENGTH);
    const message = formatOkFailureMessage({ label: "signin", status: 502, url: URL_UNDER_TEST, body });
    expect(message.endsWith(body)).toBe(true);
    expect(message).not.toContain("…");
  });

  it("renders an empty (or whitespace-only) body as the explicit empty placeholder", () => {
    for (const body of ["", "   \n\t  "]) {
      const message = formatOkFailureMessage({ label: "signin", status: 200, url: URL_UNDER_TEST, body });
      expect(message).toContain(`body: ${BODY_EMPTY}`);
    }
  });
});

describe("expectOkResponse", () => {
  it("passes on an ok response WITHOUT reading the body (success bodies are secret-bearing)", async () => {
    const { response, textCalls } = fakeResponse({ ok: true, body: '{"signedUrl":"https://…?token=SECRET"}' });
    await expectOkResponse(response, "create-job");
    expect(textCalls()).toBe(0);
  });

  it("fails on a non-ok response with label + status + final URL + body snippet", async () => {
    const { response } = fakeResponse({ ok: false, status: 403, body: '{"error":{"code":"forbidden"}}' });
    const message = await captureFailureMessage(response, "signin");
    expect(message).toContain(
      `signin: expected a 2xx response, got 403 from ${URL_UNDER_TEST} — body: {"error":{"code":"forbidden"}}`,
    );
  });

  it("falls back to the unreadable-body placeholder when text() rejects", async () => {
    const { response } = fakeResponse({ ok: false, status: 502, textRejects: true });
    const message = await captureFailureMessage(response, "signin");
    expect(message).toContain(`body: ${BODY_UNREADABLE}`);
  });
});
