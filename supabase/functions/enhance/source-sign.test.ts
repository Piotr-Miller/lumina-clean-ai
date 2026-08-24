/**
 * source-sign.test.ts — the kickoff-race retry policy.
 *
 * The race being absorbed: the DB webhook fires `/start` on the `queued`
 * INSERT, but the client PUTs the source object only AFTER create-job returns.
 * A warm `/start` can therefore run before the upload lands, and signing 404s.
 *
 * What must NOT happen is retrying anything else — a permission or config
 * failure has to surface immediately instead of after six sleeps, by which
 * point pg_net's fire-and-forget window may have closed.
 */
import { assertEquals, assertRejects } from "jsr:@std/assert@^1.0.8";
import {
  isObjectNotFound,
  signSourceWithRetry,
  SOURCE_SIGN_MAX_ATTEMPTS,
  SOURCE_SIGN_RETRY_DELAY_MS,
} from "./source-sign.ts";

const NOT_FOUND = () => new Error("Object not found");

/** Signer that throws the given errors in order, then resolves. */
function stubSigner(errors: (() => Error)[], url = "https://signed.example/source.jpg") {
  let calls = 0;
  return {
    calls: () => calls,
    sign: () => {
      const err = errors[calls];
      calls++;
      return err ? Promise.reject(err()) : Promise.resolve(url);
    },
  };
}

function recordingSleep() {
  const waits: number[] = [];
  return { waits, sleep: (ms: number) => (waits.push(ms), Promise.resolve()) };
}

Deno.test("signs on the first try without sleeping", async () => {
  const signer = stubSigner([]);
  const s = recordingSleep();
  assertEquals(await signSourceWithRetry(signer.sign, { sleep: s.sleep }), "https://signed.example/source.jpg");
  assertEquals(signer.calls(), 1);
  assertEquals(s.waits, []);
});

Deno.test("retries while the object is still missing, then succeeds", async () => {
  const signer = stubSigner([NOT_FOUND, NOT_FOUND]);
  const s = recordingSleep();
  assertEquals(await signSourceWithRetry(signer.sign, { sleep: s.sleep }), "https://signed.example/source.jpg");
  assertEquals(signer.calls(), 3);
  assertEquals(s.waits, [SOURCE_SIGN_RETRY_DELAY_MS, SOURCE_SIGN_RETRY_DELAY_MS]);
});

// The whole point of the narrow predicate: a real failure must not be masked
// by ~4.5s of retries.
Deno.test("a non-404 failure is NOT retried and surfaces immediately", async () => {
  const signer = stubSigner([() => new Error("permission denied")]);
  const s = recordingSleep();
  const err = await assertRejects(() => signSourceWithRetry(signer.sign, { sleep: s.sleep }), Error);
  assertEquals(err.message, "permission denied");
  assertEquals(signer.calls(), 1);
  assertEquals(s.waits, []);
});

Deno.test("retries are bounded and the LAST error is rethrown, not a synthesized one", async () => {
  const signer = stubSigner(Array.from({ length: SOURCE_SIGN_MAX_ATTEMPTS }, () => NOT_FOUND));
  const s = recordingSleep();
  const err = await assertRejects(() => signSourceWithRetry(signer.sign, { sleep: s.sleep }), Error);
  // The caller classifies failures off this message, so it must be the real one.
  assertEquals(err.message, "Object not found");
  assertEquals(signer.calls(), SOURCE_SIGN_MAX_ATTEMPTS);
  assertEquals(s.waits.length, SOURCE_SIGN_MAX_ATTEMPTS - 1);
});

Deno.test("a non-Error rejection is still surfaced as an Error", async () => {
  const sign = () => Promise.reject("just a string");
  const err = await assertRejects(() => signSourceWithRetry(sign, { sleep: () => Promise.resolve() }), Error);
  assertEquals(err.message, "just a string");
});

Deno.test("isObjectNotFound matches Supabase's wording case-insensitively, and nothing else", () => {
  assertEquals(isObjectNotFound(new Error("Object not found")), true);
  assertEquals(isObjectNotFound(new Error("object not found")), true);
  assertEquals(isObjectNotFound(new Error("The resource Object Not Found here")), true);
  assertEquals(isObjectNotFound(new Error("permission denied")), false);
  assertEquals(isObjectNotFound(new Error("not found")), false);
  assertEquals(isObjectNotFound("Object not found"), false);
  assertEquals(isObjectNotFound(null), false);
});
