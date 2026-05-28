import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin, supabaseAnonKey, supabaseUrl } from "../env";

export interface TestUser {
  id: string;
  email: string;
  password: string;
  jwt: string;
  /** Supabase client authenticated as this user (RLS applies). */
  client: SupabaseClient;
}

/**
 * Create a test user via the admin client's user-management surface
 * (`auth.admin.createUser` with `email_confirm: true` to skip the
 * email-confirmation flow), then sign them in via `signInWithPassword` to
 * obtain a JWT. Returns the user, JWT, and a user-scoped client.
 */
export async function createTestUser(emailPrefix = "test"): Promise<TestUser> {
  const uniq = crypto.randomUUID();
  const email = `${emailPrefix}-${uniq}@example.com`;
  const password = `pwd-${uniq}`;

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) {
    throw new Error(`createTestUser: createUser failed: ${createError.message}`);
  }

  const signinClient = createSupabaseClient(supabaseUrl, supabaseAnonKey);
  const { data: session, error: signinError } = await signinClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signinError) {
    throw new Error(`createTestUser: signInWithPassword failed: ${signinError.message}`);
  }

  const jwt = session.session.access_token;
  const client = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  // HTTP header auth above is sufficient for REST (PostgREST reads the
  // Authorization header), but the Realtime WebSocket connection has its
  // own auth channel and would otherwise connect as anon — making RLS see
  // `auth.uid() = null` and silently dropping every UPDATE/DELETE event
  // for this user. setAuth attaches the JWT to the Realtime client too.
  await client.realtime.setAuth(jwt);

  return { id: created.user.id, email, password, jwt, client };
}

/**
 * Tear down a test user: first list and remove any photos/{userId}/...
 * Storage objects (FK ON DELETE CASCADE drops jobs rows automatically, but
 * Storage is not FK-cascaded by user deletion — without this step source
 * objects would accumulate across runs). Then delete the auth row.
 */
export async function deleteTestUser(userId: string): Promise<void> {
  // Two-level walk: photos/{userId}/{jobId}/{filename}. The schema only ever
  // produces source.{ext} and result.{ext} under each jobId, so two levels
  // is sufficient.
  const { data: jobDirs, error: dirListError } = await supabaseAdmin.storage
    .from("photos")
    .list(userId, { limit: 1000 });
  if (dirListError) {
    // eslint-disable-next-line no-console
    console.warn(
      `deleteTestUser: failed to list photos/${userId}/: ${dirListError.message} — objects may leak across runs`,
    );
  }
  const allPaths: string[] = [];
  for (const dir of jobDirs ?? []) {
    const { data: files, error: fileListError } = await supabaseAdmin.storage
      .from("photos")
      .list(`${userId}/${dir.name}`, { limit: 1000 });
    if (fileListError) {
      // eslint-disable-next-line no-console
      console.warn(
        `deleteTestUser: failed to list photos/${userId}/${dir.name}/: ${fileListError.message} — objects may leak across runs`,
      );
      continue;
    }
    for (const file of files) {
      allPaths.push(`${userId}/${dir.name}/${file.name}`);
    }
  }
  if (allPaths.length) {
    await supabaseAdmin.storage.from("photos").remove(allPaths);
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    // Best-effort: a failed user delete shouldn't fail the test suite.
    // eslint-disable-next-line no-console
    console.warn(`deleteTestUser: failed to delete user ${userId}: ${error.message}`);
  }
}
