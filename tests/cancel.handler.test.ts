import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cancelCloudJobResponse } from "@/lib/services/cancel.handler";
import { STRINGS } from "@/lib/enhance-strings";

/**
 * Hermetic route-boundary tests for the user-initiated hard-cancel
 * (change `cloud-job-cancel`, Phase 1 — the DB-flip + source-cleanup half).
 *
 * Mirrors `tests/cloud-create-job.handler.test.ts`: a stub admin client lets us
 * drive the owner-scoped guarded flip to a controlled outcome and spy on the
 * source delete, without `astro:env/server` (Lesson #4) and without real infra.
 * The signal here is the route wiring — auth gate, body validation, the
 * `{ canceled }` contract, and that the source is deleted ONLY on a confirmed
 * flip. The SQL owner-scoping itself (that user_id/status actually filter the
 * UPDATE) is covered against live Supabase in tests/jobs.rls.test.ts +
 * tests/photo-job.service.test.ts, so it is not re-asserted here.
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
 * Build a stub admin client for the owner-scoped cancel flip.
 *
 * `from(table).update(...).eq(...).eq(...).in(...).select(...)` resolves
 * (thenable) to `{ data: updatedRows, error }` — `updatedRows: []` models "no
 * row matched" (wrong owner / already terminal → the guard is a no-op).
 * `storage.from("photos").remove(...)` is a spy so we can assert the source
 * delete fires only on a confirmed flip. `from` is exposed so an anonymous
 * request can be asserted to never touch the DB.
 */
function makeStubAdmin(
  updatedRows: { id: string; source_path: string }[],
  updateError: { message: string } | null = null,
) {
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const resolved = { data: updatedRows, error: updateError };

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
const SOURCE_PATH = `${USER.id}/${JOB_ID}/source.jpg`;

describe("cancelCloudJobResponse — auth gate", () => {
  it("rejects an anonymous request with 401 and the exact contract, before any DB touch", async () => {
    const { admin, from, remove } = makeStubAdmin([]);

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
  it("rejects a non-JSON body with 400 invalid_body", async () => {
    const { admin, from } = makeStubAdmin([]);

    const res = await cancelCloudJobResponse({ user: USER, request: rawRequest("not json"), admin, edge: null });

    expect(res.status).toBe(400);
    expect((await readBody(res)).error?.code).toBe("invalid_body");
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a missing jobId with 400 invalid_body", async () => {
    const { admin, from } = makeStubAdmin([]);

    const res = await cancelCloudJobResponse({ user: USER, request: jsonRequest({}), admin, edge: null });

    expect(res.status).toBe(400);
    expect((await readBody(res)).error?.code).toBe("invalid_body");
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid jobId with 400 invalid_body", async () => {
    const { admin } = makeStubAdmin([]);

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

describe("cancelCloudJobResponse — the flip", () => {
  it("flips a matched in-flight job to canceled and deletes its source (200 { canceled: true })", async () => {
    const { admin, remove } = makeStubAdmin([{ id: JOB_ID, source_path: SOURCE_PATH }]);

    const res = await cancelCloudJobResponse({
      user: USER,
      request: jsonRequest({ jobId: JOB_ID }),
      admin,
      edge: null,
    });

    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body).toEqual({ canceled: true });
    expect("status" in body).toBe(false);
    // Source deleted on the confirmed flip.
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith([SOURCE_PATH]);
  });

  it("is a no-op when the guard matches no row (wrong owner / already terminal): 200 { canceled: false }, no source delete", async () => {
    const { admin, remove } = makeStubAdmin([]); // empty = no matching queued/processing row for this owner

    const res = await cancelCloudJobResponse({
      user: USER,
      request: jsonRequest({ jobId: JOB_ID }),
      admin,
      edge: null,
    });

    expect(res.status).toBe(200);
    expect(await readBody(res)).toEqual({ canceled: false });
    expect(remove).not.toHaveBeenCalled();
  });

  it("returns 500 internal_error when the update errors (no source delete)", async () => {
    const { admin, remove } = makeStubAdmin([], { message: "db exploded" });

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
