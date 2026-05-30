/**
 * One-off ops utility: generate a password-recovery link WITHOUT sending email.
 *
 * Why this exists: the built-in Supabase email sender is rate-capped (~2-4/hr),
 * and our /api/auth/reset-password endpoint deliberately swallows send errors
 * (anti-enumeration), so a throttled send shows generic success but delivers no
 * mail. This script calls the Admin API `generateLink({ type: 'recovery' })`,
 * which mints the recovery `hashed_token` directly — no email, no rate cap — and
 * assembles the exact URL our /auth/confirm route consumes.
 *
 * Bonus: an admin-generated `hashed_token` is a plain OTP hash (not a `pkce_`
 * token), so the resulting link works in ANY browser — it sidesteps the
 * same-browser PKCE code-verifier constraint that the emailed link has.
 *
 * SECURITY: this uses the service-role key (RLS bypass) and prints a live,
 * one-time recovery token to stdout. Run it locally, use the link promptly,
 * and don't paste the output anywhere shared. The link is single-use and
 * expires per the project's OTP expiry (1h). Note it also lingers in your
 * shell history and terminal scrollback — clear them if the machine is shared.
 *
 * Usage (PowerShell, pointing at the PROD project):
 *   $env:SUPABASE_URL="https://<project-ref>.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<prod service-role key>"
 *   npx tsx scripts/generate-recovery-link.ts user@example.com
 *
 * Optional: override the app origin the link points at (defaults to prod):
 *   $env:APP_ORIGIN="http://127.0.0.1:4321"   # e.g. to test against local dev
 */
/* eslint-disable no-console -- CLI ops utility: stdout/stderr is its interface */
import { createAdminClient } from "../src/lib/supabase-admin";

const DEFAULT_APP_ORIGIN = "https://lumina-clean-ai.pmiller-software.workers.dev";

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  fail("Missing email argument.\n  Usage: npx tsx scripts/generate-recovery-link.ts <email>");
}

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  fail(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (use the PROD project's values to test against the deployed app).",
  );
}

// Strip any trailing slash so the assembled path is always single-slash.
const appOrigin = (process.env.APP_ORIGIN ?? DEFAULT_APP_ORIGIN).replace(/\/+$/, "");

const admin = createAdminClient({ url, serviceRoleKey });

const { data, error } = await admin.auth.admin.generateLink({
  type: "recovery",
  email,
});

if (error) {
  fail(`generateLink failed: ${error.message} (does a user with this email exist in the project?)`);
}

const hashedToken = data.properties.hashed_token;
if (!hashedToken) {
  fail(`No hashed_token in response. Raw properties: ${JSON.stringify(data.properties)}`);
}

const confirmUrl = `${appOrigin}/auth/confirm?token_hash=${hashedToken}&type=recovery&next=/auth/reset-password`;

console.log("\n✓ Recovery link generated (no email sent).");
console.log(`  email:      ${email}`);
console.log(`  app origin: ${appOrigin}`);
console.log(`  expires:    per project OTP expiry (default 1h), single-use\n`);
console.log("Open this link in a browser to reach the set-new-password form:\n");
console.log(confirmUrl);
console.log("");
