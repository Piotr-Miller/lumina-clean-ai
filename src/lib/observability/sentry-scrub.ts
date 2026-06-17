import type { Event } from "@sentry/core";

/**
 * Shared Sentry privacy scrub (the privacy seam — Phase 3 of sentry-integration).
 *
 * Applied in BOTH `beforeSend` (error/message events) AND `beforeSendTransaction`
 * (span/trace events) in every app runtime init (server entry + client). `beforeSend`
 * does not see transaction events, so spans need their own hook or signed URLs in
 * spans bypass the scrub. The Deno Edge init mirrors this logic (it cannot import
 * app `src/` across runtimes) — keep the two in sync.
 *
 * What it removes, across the event body, request envelope, spans, breadcrumbs,
 * `extra`, and `contexts`:
 *  - signed Supabase Storage URL query/signature (`source.*`/`result.*` tokens),
 *  - emails,
 *  - bearer / provider tokens (`Bearer …`, `whsec_…`, `r8_…`, `access_token=…`),
 *  - `request.headers` cookie/authorization, `request.query_string`,
 *  - `user.ip_address` (Sentry server-side backfills this from the envelope origin
 *    even with `sendDefaultPii: false` — Phase 1 finding; null it explicitly),
 * and bounds long strings to MAX_DETAIL_CHARS (mirrors enhance/index.ts).
 *
 * Pure + env-free (no `astro:env/server` import — Lesson #4) so it is safe to
 * unit-test in a Vitest Node environment.
 */

// Mirrors MAX_ERROR_DETAIL_CHARS in supabase/functions/enhance/index.ts.
export const MAX_DETAIL_CHARS = 300;

const EMAIL_RE = /[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g;
// Provider/bearer tokens we never want in events. `whsec_` (Replicate/svix webhook
// secret), `r8_` (Replicate API token), `Bearer <token>`, `sb_*`/`sbp_*` (Supabase),
// `eyJ…` (JWT). Conservative: match the token run, not surrounding text.
const TOKEN_RES: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._-]+/g,
  /\bwhsec_[A-Za-z0-9/+_=-]+/g,
  /\br8_[A-Za-z0-9]+/g,
  /\bsbp?_[A-Za-z0-9]{16,}/g,
  /\beyJ[A-Za-z0-9._-]{20,}/g,
];
// A URL with a query string — strip the query (signed-URL token/signature lives
// there). Keeps the path so the event is still diagnostically useful.
const URL_QUERY_RE = /(https?:\/\/[^\s"'?]+)\?[^\s"'<>]*/g;
// Sensitive request/header/cookie keys whose VALUE must be dropped wholesale.
const SENSITIVE_KEY_RE = /^(authorization|cookie|set-cookie|x-.*-key|.*token.*|.*secret.*|email|apikey)$/i;

/** Redact sensitive substrings from a single string and bound its length. */
export function redactString(input: string): string {
  let out = input.replace(URL_QUERY_RE, "$1?[redacted]");
  for (const re of TOKEN_RES) out = out.replace(re, "[redacted-token]");
  out = out.replace(EMAIL_RE, "[email]");
  if (out.length > MAX_DETAIL_CHARS) out = out.slice(0, MAX_DETAIL_CHARS) + "…[truncated]";
  return out;
}

/**
 * Recursively redact string values in an arbitrary structure (extra, span data,
 * breadcrumb data, contexts). Drops the VALUE of sensitive keys entirely; redacts
 * other strings. Bounded depth so a cyclic/huge object can't hang the hook.
 */
function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth-limited]";
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY_RE.test(k) ? "[redacted]" : redactDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Redact a headers-like record: drop sensitive header values, redact the rest. */
function redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SENSITIVE_KEY_RE.test(k) ? "[redacted]" : typeof v === "string" ? redactString(v) : v;
  }
  return out;
}

/**
 * Scrub a Sentry event (error OR transaction) in place and return it. Reused by
 * both `beforeSend` and `beforeSendTransaction`.
 */
export function scrubEvent<T extends Event>(event: T): T {
  // Message + exception values.
  if (typeof event.message === "string") event.message = redactString(event.message);
  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (typeof ex.value === "string") ex.value = redactString(ex.value);
    }
  }

  // Request envelope. Cast to a loose record — Sentry types some of these fields
  // narrowly (e.g. `cookies`), but the scrub replaces them with redaction markers.
  if (event.request) {
    const req = event.request as Record<string, unknown>;
    if (typeof req.url === "string") req.url = req.url.replace(URL_QUERY_RE, "$1?[redacted]").split("?")[0];
    if (req.query_string != null) req.query_string = "[redacted]";
    if (req.cookies != null) req.cookies = "[redacted]";
    if (req.headers && typeof req.headers === "object") {
      req.headers = redactHeaders(req.headers as Record<string, unknown>);
    }
    if (req.data != null) req.data = redactDeep(req.data);
  }

  // User — null the IP (Sentry backfills it from the envelope origin even with
  // sendDefaultPii:false — Phase 1 finding) and drop email.
  if (event.user) {
    event.user.ip_address = null;
    if ("email" in event.user) delete (event.user as Record<string, unknown>).email;
  }

  // Spans (transaction events): description + data carry full signed URLs.
  if (event.spans) {
    for (const span of event.spans) {
      const s = span as unknown as { description?: unknown; data?: unknown };
      if (typeof s.description === "string") s.description = redactString(s.description);
      if (s.data != null) s.data = redactDeep(s.data);
    }
  }
  // The root transaction's own span data (contexts.trace.data).
  if (event.contexts?.trace?.data) {
    event.contexts.trace.data = redactDeep(event.contexts.trace.data) as Record<string, unknown>;
  }

  // Breadcrumbs — fetch/xhr crumbs keep full URLs in data.url; console crumbs can
  // carry an email or raw error.message.
  if (event.breadcrumbs) {
    for (const crumb of event.breadcrumbs) {
      if (typeof crumb.message === "string") crumb.message = redactString(crumb.message);
      if (crumb.data != null) crumb.data = redactDeep(crumb.data) as typeof crumb.data;
    }
  }

  // Free-form extra + remaining contexts.
  if (event.extra) event.extra = redactDeep(event.extra) as typeof event.extra;

  return event;
}
