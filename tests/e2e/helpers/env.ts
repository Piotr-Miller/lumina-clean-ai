/**
 * env.ts — the ONE place the E2E suite builds its service-role admin client.
 *
 * Why a guard and not just a helper: the suite creates a deterministic,
 * committed-password account (auth.setup.ts) and runs admin deletes in every
 * cleanup. Pointed at a remote project, it would do all of that remotely.
 * "Local stack only" used to be documentation; this makes it code — the
 * client refuses any SUPABASE_URL whose host is not loopback, unless the
 * operator opts in explicitly for an intentional remote run.
 */
import { createClient } from "@supabase/supabase-js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Validated env for the local stack. `caller` names the spec in the error so
 * a failed precondition reads as that file's setup error (hard-fail loudly,
 * never silently skip — tests/env.ts convention).
 */
export function supabaseEnv(caller: string): { url: string; serviceRole: string } {
  const url = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error(`${caller} needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (local stack — see tests/README.md).`);
  }
  const { hostname } = new URL(url);
  if (!LOCAL_HOSTS.has(hostname) && process.env.E2E_ALLOW_REMOTE_SUPABASE !== "1") {
    throw new Error(
      `${caller}: SUPABASE_URL points at "${hostname}" — the E2E suite creates accounts and runs ` +
        "service-role deletes, so it only runs against the local stack (localhost/127.0.0.1). " +
        "Set E2E_ALLOW_REMOTE_SUPABASE=1 only for an intentional remote run.",
    );
  }
  return { url, serviceRole };
}

// Inferred return type, matching the integration suite's idiom (jobs.rls.test.ts).
export function adminClient(caller: string) {
  const { url, serviceRole } = supabaseEnv(caller);
  return createClient(url, serviceRole);
}
