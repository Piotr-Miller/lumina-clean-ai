/**
 * Cross-device password-reset smoke against the LOCAL Supabase stack.
 *
 * Proves — or disproves — the FR-015 claim end-to-end without a second device:
 * send a recovery mail with each client configuration, read the REAL email out
 * of Mailpit, inspect the emitted `token_hash`, then verify it from a FRESH
 * SSR client whose cookie jar is empty. An empty jar is precisely what "another
 * device" means for PKCE, and a fresh `createServerClient` per request is
 * exactly what `/auth/confirm` builds.
 *
 * Why it exists: the emailed token is the whole mechanism of change
 * `cross-device-password-reset`, and it cannot be inspected any other way —
 * local Supabase mail never leaves Mailpit. It also carries the CONTROL arm
 * (arm D) that measures the pre-fix behaviour, which is what caught the stale
 * premise recorded in the archive.
 *
 * LOCAL ONLY. Hard-fails on a non-local SUPABASE_URL: it creates and deletes
 * users with the service-role key, which must never point at a real project.
 *
 * Usage (with `npx supabase start` running):
 *   npx tsx scripts/local-reset-smoke.ts
 * Env (all default to the standard local stack):
 *   SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, MAILPIT_URL
 */
/* eslint-disable no-console -- CLI ops utility: stdout is its interface */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { PASSWORD_RESET_CLIENT_OPTIONS } from "../src/lib/services/password-reset-client.options";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.SUPABASE_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

// Same guard as tests/e2e/helpers/env.ts: this script mutates users, so a
// misconfigured env must stop it rather than reach a real project.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL)) {
  console.error(`\n✖ refusing to run against non-local SUPABASE_URL: ${URL}\n`);
  process.exit(1);
}
if (!ANON || !SERVICE) {
  console.error("\n✖ set SUPABASE_KEY and SUPABASE_SERVICE_ROLE_KEY (see `npx supabase status`).\n");
  process.exit(1);
}

const STAMP = Date.now();
const EMAIL_A = `reset-smoke-a-${STAMP}@e2e.local`;
const EMAIL_B = `reset-smoke-b-${STAMP}@e2e.local`;
const PASSWORD = `Pw!reset-smoke-${STAMP}`;

const log = (...a: unknown[]) => {
  console.log(...a);
};

const clearMail = () => fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });

/** Newest Mailpit message's `token_hash`, polled until the mail lands. */
async function latestTokenHash(): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const list = (await (await fetch(`${MAILPIT}/api/v1/messages`)).json()) as { messages?: { ID: string }[] };
    const id = list.messages?.[0]?.ID;
    if (id) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as { Text?: string; HTML?: string };
      const match = /token_hash=([^&\s"'<>]+)/.exec(`${msg.Text ?? ""}\n${msg.HTML ?? ""}`);
      if (match) return decodeURIComponent(match[1]);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("no recovery email arrived in Mailpit within 20s");
}

/** A fresh SSR client with an EMPTY cookie jar — one request's worth, like /auth/confirm. */
function ssrClient() {
  const jar = new Map<string, string>();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (list) => {
        list.forEach(({ name, value }) => jar.set(name, value));
      },
    },
  });
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

async function makeUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(`createUser(${email}) failed: ${error.message}`);
  return data.user.id;
}

// Separate users per arm: Supabase enforces a per-email resend interval, so
// reusing one address makes the second send fail on rate-limit, not on merit.
const userA = await makeUser(EMAIL_A);
const userB = await makeUser(EMAIL_B);

try {
  log("\nA. SSR client (createServerClient — the pre-fix send path)");
  await clearMail();
  const a = await ssrClient().auth.resetPasswordForEmail(EMAIL_A);
  if (a.error) throw new Error(`SSR send failed: ${a.error.message}`);
  const tokenA = await latestTokenHash();
  log(`   token: ${tokenA.slice(0, 24)}…`);
  check("SSR emits a pkce_ (device-bound) token", tokenA.startsWith("pkce_"));

  log("\nB. Plain supabase-js + PASSWORD_RESET_CLIENT_OPTIONS (the shipped fix)");
  await clearMail();
  const b = await createClient(URL, ANON, PASSWORD_RESET_CLIENT_OPTIONS).auth.resetPasswordForEmail(EMAIL_B);
  if (b.error) throw new Error(`fixed send failed: ${b.error.message}`);
  const tokenB = await latestTokenHash();
  log(`   token: ${tokenB.slice(0, 24)}…`);
  check("the fix emits a NON-pkce (portable) token", !tokenB.startsWith("pkce_"));

  log("\nC. Verify the fix's token from a FRESH SSR client (≙ another device)");
  const v = await ssrClient().auth.verifyOtp({ token_hash: tokenB, type: "recovery" });
  check("verifyOtp returns no error", !v.error, v.error?.message ?? "");
  check("a usable recovery session is returned", !!v.data.session);
  check("the session belongs to the requesting user", v.data.user?.email === EMAIL_B);

  // CONTROL — measures the PRE-FIX behaviour. The archived S-06 note claimed a
  // pkce_ token fails verifyOtp on another device; this arm is what tells us
  // whether that is still true on the running stack. Reported, never asserted:
  // its job is to measure, and a hard assertion here would encode a belief.
  log("\nD. CONTROL — verify the pre-fix pkce_ token from a fresh SSR client");
  const cv = await ssrClient().auth.verifyOtp({ token_hash: tokenA, type: "recovery" });
  log(`   error:   ${cv.error?.message ?? "(none)"}`);
  log(`   user:    ${cv.data.user?.email ?? "(none)"}`);
  log(`   session: ${cv.data.session ? "PRESENT" : "(none)"}`);
  log(
    cv.error || !cv.data.session
      ? "   → pre-fix token is NOT usable cross-device: the archived diagnosis still holds."
      : "   → pre-fix token IS usable cross-device on this stack: the archived diagnosis is STALE.",
  );
} finally {
  await admin.auth.admin.deleteUser(userA);
  await admin.auth.admin.deleteUser(userB);
  log("\ncleaned up test users");
}

log(failures === 0 ? "\n✓ all assertions passed\n" : `\n✖ ${failures} assertion(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
