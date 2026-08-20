/**
 * expect-response.ts — enriched ok() assertion for HTTP responses in E2E specs.
 *
 * Why: signature 3 of change `e2e-webserver-boot-flake` (run 32341863646) —
 * `expect(signIn.ok()).toBe(true)` failed on CI and on its retry, and the whole
 * captured evidence was one word: `false`. Status, final URL, and body were all
 * discarded, so the failure could not name its layer (403 CSRF? 500 app? a
 * proxy-shaped empty reply?). This helper asserts the SAME condition and only
 * changes the failure OUTPUT: label + status + final URL + a bounded one-line
 * body snippet.
 *
 * Lazy by contract: on ok() === true it asserts with NO custom message and
 * reads NO body — success bodies are secret-bearing (create-job returns a
 * signed upload URL + token, photo-job.service.ts), and a custom message would
 * put them into step titles and the HTML report. The body is read and the
 * message built ONLY after ok() is false, when the body is an error payload.
 */
import { expect, type APIResponse } from "@playwright/test";

/**
 * Structural subset of the response types this helper accepts: `page.request.*`
 * yields an APIResponse, `page.waitForResponse()` a browser Response — both
 * satisfy exactly this pick, so one helper covers all six call sites.
 */
export type OkReadable = Pick<APIResponse, "ok" | "status" | "url" | "text">;

/** Snippet cap: keeps the failure message one readable console/annotation line. */
export const BODY_SNIPPET_MAX_LENGTH = 300;

/** Placeholder when text() rejects (stream gone, transport torn down). */
export const BODY_UNREADABLE = "<body unreadable>";

/** Placeholder when the body collapses to nothing — emptiness is itself a clue. */
export const BODY_EMPTY = "<empty body>";

/**
 * Pure formatter — the failure message's single source of truth, exported so
 * tests/expect-response-format.test.ts covers it hermetically (a green e2e run
 * never exercises this path). Collapses all whitespace runs to single spaces
 * and bounds the snippet so the message stays on one line.
 */
export function formatOkFailureMessage(input: { label: string; status: number; url: string; body: string }): string {
  const collapsed = input.body.replace(/\s+/g, " ").trim();
  const snippet =
    collapsed.length === 0
      ? BODY_EMPTY
      : collapsed.length > BODY_SNIPPET_MAX_LENGTH
        ? `${collapsed.slice(0, BODY_SNIPPET_MAX_LENGTH)}…`
        : collapsed;
  return `${input.label}: expected a 2xx response, got ${String(input.status)} from ${input.url} — body: ${snippet}`;
}

/**
 * Assert that `response.ok()` is true — the drop-in replacement for a bare
 * `expect(x.ok()).toBe(true)`. `label` names the operation ("signin",
 * "create-job") so a CI failure reads as that step's error.
 */
export async function expectOkResponse(response: OkReadable, label: string): Promise<void> {
  const ok = response.ok();
  if (ok) {
    expect(ok).toBe(true);
    return;
  }
  let body: string;
  try {
    body = await response.text();
  } catch {
    body = BODY_UNREADABLE;
  }
  expect(ok, formatOkFailureMessage({ label, status: response.status(), url: response.url(), body })).toBe(true);
}
