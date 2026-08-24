/**
 * Side-effect-free core of the source READ-URL signing retry.
 *
 * Extracted from `index.ts` for the same reason as `replicate-create.ts`: that
 * module runs `Sentry.init()` + `Deno.serve()` at top level and exports
 * nothing, so nothing in it is reachable by `deno test` (change
 * `edge-function-test-harness`).
 *
 * The signer and the sleep are injected — otherwise testing the retry means a
 * live Storage client and really waiting out ~4.5s of backoff.
 */

/**
 * Kickoff-race backstop: the DB webhook fires `/start` on the `queued` INSERT,
 * but the client PUTs the source object only AFTER create-job returns. When the
 * function is warm, `/start` can run before the upload lands and
 * `createSignedReadUrl` 404s ("Object not found"). Retry a bounded number of
 * times to absorb that race; ~4.5s total, well inside pg_net's fire-and-forget
 * window. Any non-404 signing error fails fast.
 */
export const SOURCE_SIGN_MAX_ATTEMPTS = 6;
export const SOURCE_SIGN_RETRY_DELAY_MS = 750;

/**
 * A "not found" signing failure means the client's source upload hasn't landed
 * yet (the kickoff race). Distinguish it from real errors so ONLY the race is
 * retried — a permission or configuration failure must surface immediately
 * rather than after six sleeps.
 */
export function isObjectNotFound(err: unknown): boolean {
  return err instanceof Error && /object not found/i.test(err.message);
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface SignSourceOptions {
  /** Injected in tests so the retry does not really wait out the backoff. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Sign the source READ URL, retrying ONLY while the object is still missing.
 *
 * `sign` is the caller's bound signing call (production: `createSignedReadUrl`
 * against the admin client with the configured TTL), so this module stays free
 * of Supabase-client construction and is testable with a plain stub.
 *
 * The LAST error is rethrown, never a synthesized one, so the caller's failure
 * classification still sees the real message.
 */
export async function signSourceWithRetry(
  sign: () => Promise<string>,
  options: SignSourceOptions = {},
): Promise<string> {
  const sleep = options.sleep ?? defaultSleep;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= SOURCE_SIGN_MAX_ATTEMPTS; attempt++) {
    try {
      return await sign();
    } catch (err) {
      lastErr = err;
      if (!isObjectNotFound(err) || attempt === SOURCE_SIGN_MAX_ATTEMPTS) break;
      await sleep(SOURCE_SIGN_RETRY_DELAY_MS);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
