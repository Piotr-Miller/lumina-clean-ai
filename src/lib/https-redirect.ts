// Pure, dependency-free (no astro:env imports) so Vitest can import it
// directly — see lessons.md "Server-only service-role clients live in their
// own module".

export const CANONICAL_HOST = "luminacleanai.com";

/**
 * 301 target for plain-HTTP requests to the canonical production host, or
 * null when no redirect applies. Scoped to the exact prod hostname so local
 * dev and CI E2E (http://localhost:4321 on wrangler dev) are untouched.
 * Closes the http://-duplicate half of the GSC "alternate page with proper
 * canonical tag" reports (the workers.dev half is closed by
 * `workers_dev: false` in wrangler.jsonc).
 */
export function httpsRedirectTarget(url: URL): string | null {
  if (url.protocol !== "http:" || url.hostname !== CANONICAL_HOST) return null;
  const target = new URL(url);
  target.protocol = "https:";
  return target.toString();
}
