import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cancelCloudJobResponse } from "@/lib/services/cancel.handler";
import { STRINGS } from "@/lib/enhance-strings";

/**
 * Hermetic route-boundary tests for the user-initiated hard-cancel
 * (change `cloud-job-cancel`, Phase 1). A stub admin client lets us drive the
 * cheap, infra-free part of the contract — the auth gate, body validation, and
 * the service-error → 500 mapping — without `astro:env/server` (Lesson #4) or a
 * live database. Mirrors the hermetic layer of `cloud-create-job.handler.test.ts`.
 *
 * The LOAD-BEARING guarantees — that the flip is owner-scoped (a client-supplied
 * foreign `jobId` mutates nothing) and that a matched flip persists
 * `failed`/`error_code:"canceled"` + deletes the source — are deliberately NOT
 * asserted here: a stub can't prove the `.eq("user_id")` guard (it would stay
 * green even against an id-only helper). Those live against a real local Supabase
 * in `tests/jobs.rls.test.ts` ("POST /api/enhance/cloud/cancel — cross-user IDOR
 * + flip"), the same place the sibling `/timeout` route proves its IDOR guard.
 */

type ResponseBody = Partial<{ error: { code: string; message: string }; canceled: boolean; status: unknown }>;

async function readBody(res: Response): Promise<ResponseBody> {
  return (await res.json()) as ResponseBody;
}

function jsonRequest(body: unknown): Request {
  return new Request("https://example.test/api/enhance/cloud/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Raw (already-serialized) body so we can send a non-JSON payload. */
function rawRequest(body: string): Request {
  return new Request("https://example.test/api/enhance/cloud/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

/**
 * Stub admin client. The owner-scoped guarded UPDATE
 * (`from(...).update(...).eq(...).eq(...).in(...).select(...)`) resolves
 * (thenable) to `{ data: [], error: updateError }` — the hermetic tests here
 * never need a matched row, they only exercise the reject paths and the
 * error → 500 mapping. `from` and `storage...remove` are spies so we can assert
 * the reject paths never touch the DB or storage.
 */
function makeStubAdmin(updateError: { message: string } | null = null) {
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const resolved = { data: [] as { id: string; source_path: string }[], error: updateError };

  const builder: Record<string, unknown> = {};
  for (const method of ["update", "select", "eq", "in"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (onFulfilled: (v: typeof resolved) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(resolved).then(onFulfilled, onRejected);

  const from = vi.fn(() => builder);
  const admin = { from, storage: { from: vi.fn(() => ({ remove })) } };

  return { admin: admin as unknown as SupabaseClient, from, remove };
}

const USER = { id: "11111111-1111-1111-1111-111111111111" };
const JOB_ID = "22222222-2222-4222-8222-222222222222";

describe("cancelCloudJobResponse — auth gate", () => {
  it("rejects an anonymous request with 401 and the exact contract, before any DB touch", async () => {
    const { admin, from, remove } = makeStubAdmin();

    const res = await cancelCloudJobResponse({
      user: null,
      request: jsonRequest({ jobId: JOB_ID }),
      admin,
      edge: null,
    });

    expect(res.status).toBe(401);
    const body = await readBody(res);
    expect(body).toEqual({ error: { code: "unauthorized", message: "Sign in to use Cloud AI." } });
    expect("status" in body).toBe(false);
    // An anonymous caller never reaches the row or its source.
    expect(from).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("cancelCloudJobResponse — body validation", () => {
  it("rejects a non-JSON body with 400 invalid_body, before any DB touch", async () => {
    const { admin, from } = makeStubAdmin();

    const res = await cancelCloudJobResponse({ user: USER, request: rawRequest("not json"), admin, edge: null });

    expect(res.status).toBe(400);
    expect((await readBody(res)).error?.code).toBe("invalid_body");
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a missing jobId with 400 invalid_body", async () => {
    const { admin, from } = makeStubAdmin();

    const res = await cancelCloudJobResponse({ user: USER, request: jsonRequest({}), admin, edge: null });

    expect(res.status).toBe(400);
    expect((await readBody(res)).error?.code).toBe("invalid_body");
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid jobId with 400 invalid_body", async () => {
    const { admin } = makeStubAdmin();

    const res = await cancelCloudJobResponse({
      user: USER,
      request: jsonRequest({ jobId: "nope" }),
      admin,
      edge: null,
    });

    expect(res.status).toBe(400);
    expect((await readBody(res)).error?.code).toBe("invalid_body");
  });
});

describe("cancelCloudJobResponse — service error mapping", () => {
  it("maps an unexpected update error to 500 internal_error (no source delete)", async () => {
    const { admin, remove } = makeStubAdmin({ message: "db exploded" });

    const res = await cancelCloudJobResponse({
      user: USER,
      request: jsonRequest({ jobId: JOB_ID }),
      admin,
      edge: null,
    });

    expect(res.status).toBe(500);
    expect((await readBody(res)).error?.code).toBe("internal_error");
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("cancelCloudJobResponse — canceled copy", () => {
  it("uses the canonical row-level cancel message", () => {
    expect(STRINGS.cloudErrors.canceled).toContain("canceled");
  });
});
