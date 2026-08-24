/**
 * Sentry privacy scrub for the Deno Edge runtime.
 *
 * This MIRRORS `src/lib/observability/sentry-scrub.ts`. The duplication is
 * deliberate — the historical reason given was that the Deno runtime "cannot
 * import app `src/` across runtimes", which is not strictly true (index.ts does
 * import `src/lib/services/*.ts` by relative path), but the two inits pass
 * different Sentry `Event` types, so the copies are kept separate.
 *
 * The real hazard is DRIFT: two hand-maintained privacy filters whose only
 * protection was a "keep the two in sync" comment. Extracting this from
 * `index.ts` (which is not importable — `Sentry.init()` + `Deno.serve()` at
 * module top level) makes it reachable by `deno test`, and
 * `sentry-scrub.test.ts` now asserts OUTPUT PARITY against the app copy on a
 * battery of inputs. The comment is now a gate.
 *
 * Pure and side-effect-free: no Sentry import, no env reads. The event is typed
 * structurally so this module never depends on an SDK's Event shape.
 */

/** Mirrors MAX_DETAIL_CHARS in src/lib/observability/sentry-scrub.ts. */
export const MAX_ERROR_DETAIL_CHARS = 300;

const SCRUB_EMAIL_RE = /[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g;
const SCRUB_TOKEN_RES: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._-]+/g,
  /\bwhsec_[A-Za-z0-9/+_=-]+/g,
  /\br8_[A-Za-z0-9]+/g,
  /\bsbp?_[A-Za-z0-9]{16,}/g,
  /\beyJ[A-Za-z0-9._-]{20,}/g,
];
const SCRUB_URL_QUERY_RE = /(https?:\/\/[^\s"'?]+)\?[^\s"'<>]*/g;
const SCRUB_SENSITIVE_KEY_RE = /^(authorization|cookie|set-cookie|x-.*-key|.*token.*|.*secret.*|email|apikey)$/i;

export function scrubRedactString(input: string): string {
  let out = input.replace(SCRUB_URL_QUERY_RE, "$1?[redacted]");
  for (const re of SCRUB_TOKEN_RES) out = out.replace(re, "[redacted-token]");
  out = out.replace(SCRUB_EMAIL_RE, "[email]");
  if (out.length > MAX_ERROR_DETAIL_CHARS) out = out.slice(0, MAX_ERROR_DETAIL_CHARS) + "…[truncated]";
  return out;
}

export function scrubRedactDeep(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth-limited]";
  if (typeof value === "string") return scrubRedactString(value);
  if (Array.isArray(value)) return value.map((v) => scrubRedactDeep(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SCRUB_SENSITIVE_KEY_RE.test(k) ? "[redacted]" : scrubRedactDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Scrub an event IN PLACE and return it (the shape Sentry's `beforeSend` and
 * `beforeSendTransaction` hooks expect). Generic over the event type so the
 * caller's SDK `Event` flows through unchanged.
 */
export function scrubSentryEvent<T extends object>(event: T): T {
  const e = event as Record<string, unknown>;
  if (typeof e.message === "string") e.message = scrubRedactString(e.message);
  const exception = e.exception as { values?: { value?: unknown }[] } | undefined;
  if (exception?.values) {
    for (const ex of exception.values) if (typeof ex.value === "string") ex.value = scrubRedactString(ex.value);
  }
  const req = e.request as Record<string, unknown> | undefined;
  if (req) {
    if (typeof req.url === "string") req.url = req.url.replace(SCRUB_URL_QUERY_RE, "$1?[redacted]").split("?")[0];
    if (req.query_string != null) req.query_string = "[redacted]";
    if (req.cookies != null) req.cookies = "[redacted]";
    if (req.headers && typeof req.headers === "object") req.headers = scrubRedactDeep(req.headers);
    if (req.data != null) req.data = scrubRedactDeep(req.data);
  }
  const user = e.user as Record<string, unknown> | undefined;
  if (user) {
    user.ip_address = null;
    delete user.email;
  }
  const spans = e.spans as { description?: unknown; data?: unknown }[] | undefined;
  if (spans) {
    for (const s of spans) {
      if (typeof s.description === "string") s.description = scrubRedactString(s.description);
      if (s.data != null) s.data = scrubRedactDeep(s.data);
    }
  }
  const contexts = e.contexts as { trace?: { data?: unknown } } | undefined;
  if (contexts?.trace?.data) {
    contexts.trace.data = scrubRedactDeep(contexts.trace.data) as Record<string, unknown>;
  }
  const breadcrumbs = e.breadcrumbs as { message?: unknown; data?: unknown }[] | undefined;
  if (breadcrumbs) {
    for (const crumb of breadcrumbs) {
      if (typeof crumb.message === "string") crumb.message = scrubRedactString(crumb.message);
      if (crumb.data != null) crumb.data = scrubRedactDeep(crumb.data);
    }
  }
  if (e.extra != null) e.extra = scrubRedactDeep(e.extra);
  return event;
}
