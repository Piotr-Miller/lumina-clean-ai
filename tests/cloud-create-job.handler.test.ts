import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCloudJobResponse } from "@/lib/services/cloud-create-job.handler";

/** Parsed response body: either the error envelope or the success payload (plus a guard against a leaked `status`). */
type ResponseBody = Partial<{
  error: { code: string; message: string };
  jobId: string;
  uploadUrl: string;
  uploadToken: string;
  sourcePath: string;
  status: unknown;
}>;

async function readBody(res: Response): Promise<ResponseBody> {
  return (await res.json()) as ResponseBody;
}

/**
 * Hermetic route-boundary tests for the S-05 global daily cap (PRD FR-014).
 *
 * The NEW signal here is the route wiring: that `createCloudJobResponse`
 * rejects an over-cap submission at the boundary with HTTP 429 + the exact
 * contract, and — load-bearing — does so BEFORE any insert / signed-URL work.
 * The count predicate itself (`countCloudJobsToday`) and the pure decision
 * (`isOverDailyCap`) are already covered against live Supabase in
 * tests/jobs.rls.test.ts and as a unit in tests/photo-job.service.test.ts, so
 * they are not re-asserted here. A stub admin client lets us drive the count to
 * a controlled `N` and spy on the side-effects, without `astro:env/server`
 * (Lesson #4) and without real infra.
 */

const VALID_BODY = { fileExtension: "jpg", mimeType: "image/jpeg" } as const;
const CAP_MESSAGE = "The daily Cloud AI limit has been reached. Please try again tomorrow.";

function jsonRequest(body: unknown): Request {
  return new Request("https://example.test/api/enhance/cloud/create-job", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Build a stub admin client.
 *
 * `from(table)` returns one chainable, thenable query builder shared by every
 * call in the handler. Awaiting it resolves to `{ data: [], count, error: null }`:
 * the sweep destructures `{ data }` (empty → no-op, returns 0) and the cap count
 * destructures `{ count }` — both read the same resolved object. `insert` and
 * `storage.from().createSignedUploadUrl` are spies so a test can assert they are
 * (or are not) invoked.
 */
function makeStubAdmin(count: number) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const createSignedUploadUrl = vi
    .fn()
    .mockResolvedValue({ data: { signedUrl: "https://signed.test/upload", token: "tok-123" }, error: null });

  const resolved = { data: [] as unknown[], count, error: null };
  const builder: Record<string, unknown> = { insert };
  for (const method of ["select", "eq", "in", "lt", "gte", "or", "order", "limit"]) {
    builder[method] = vi.fn(() => builder);
  }
  // Thenable: `await admin.from(...).select(...)...` resolves to `resolved`.
  builder.then = (onFulfilled: (v: typeof resolved) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(resolved).then(onFulfilled, onRejected);

  const admin = {
    from: vi.fn(() => builder),
    storage: { from: vi.fn(() => ({ createSignedUploadUrl })) },
  };

  return { admin: admin as unknown as SupabaseClient, insert, createSignedUploadUrl };
}

const USER = { id: "11111111-1111-1111-1111-111111111111" };

describe("createCloudJobResponse — global daily-cap route boundary", () => {
  it("rejects an over-cap submission with 429 and the exact contract, before any insert or signed URL", async () => {
    const cap = 3;
    const { admin, insert, createSignedUploadUrl } = makeStubAdmin(cap); // N === cap → over

    const res = await createCloudJobResponse({ user: USER, request: jsonRequest(VALID_BODY), admin, cap });

    expect(res.status).toBe(429);
    const body = await readBody(res);
    expect(body).toEqual({ error: { code: "daily_cap_reached", message: CAP_MESSAGE } });
    // CLAUDE.md envelope: no `status` field leaks into the body.
    expect("status" in body).toBe(false);
    // Reject-BEFORE-insert: the load-bearing ordering. A status-only assertion
    // would still pass against an insert-then-check reordering that leaks a row
    // and a signed URL; these not-called assertions are what catch it.
    expect(insert).not.toHaveBeenCalled();
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects when the count is above the cap (N = cap + 1) with 429", async () => {
    const cap = 3;
    const { admin, insert, createSignedUploadUrl } = makeStubAdmin(cap + 1);

    const res = await createCloudJobResponse({ user: USER, request: jsonRequest(VALID_BODY), admin, cap });

    expect(res.status).toBe(429);
    expect(insert).not.toHaveBeenCalled();
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("lets the last slot below the cap proceed (N = cap - 1) with 200 and mints the job", async () => {
    const cap = 3;
    const { admin, insert, createSignedUploadUrl } = makeStubAdmin(cap - 1);

    const res = await createCloudJobResponse({ user: USER, request: jsonRequest(VALID_BODY), admin, cap });

    expect(res.status).toBe(200);
    const body = await readBody(res);
    // CreatePhotoJobResponse shape.
    expect(typeof body.jobId).toBe("string");
    expect(body.uploadUrl).toBe("https://signed.test/upload");
    expect(body.uploadToken).toBe("tok-123");
    expect(body.sourcePath).toContain(`${USER.id}/`);
    expect(createSignedUploadUrl).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("rejects the first request when the cap is 0 (operator kill-switch)", async () => {
    const cap = 0;
    const { admin, insert, createSignedUploadUrl } = makeStubAdmin(0); // N = 0, cap = 0 → over

    const res = await createCloudJobResponse({ user: USER, request: jsonRequest(VALID_BODY), admin, cap });

    expect(res.status).toBe(429);
    const body = await readBody(res);
    expect(body.error?.code).toBe("daily_cap_reached");
    expect(insert).not.toHaveBeenCalled();
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });
});

/**
 * Hermetic route-boundary test for the cloud-AI auth gate (Risk #2: an
 * unauthorized request must not reach Cloud AI processing).
 *
 * The NEW signal is the same shape as the cap test above, one step earlier in
 * the sequence: an anonymous request (`user: null`) is rejected with 401 at the
 * boundary BEFORE any insert / signed-URL side-effect — so a missing session can
 * never mint a signed upload URL or create a job row. The full-stack 401 is
 * already covered by the slow E2E (tests/e2e/seed.spec.ts); this pins the gate
 * at the cheap hermetic layer. `cap`/`count` are irrelevant — the auth guard is
 * the handler's first statement, before the cap check ever runs.
 */
describe("createCloudJobResponse — anonymous auth gate (Risk #2)", () => {
  it("rejects an anonymous request with 401 and the exact contract, before any insert or signed URL", async () => {
    const { admin, insert, createSignedUploadUrl } = makeStubAdmin(0);

    const res = await createCloudJobResponse({ user: null, request: jsonRequest(VALID_BODY), admin, cap: 3 });

    expect(res.status).toBe(401);
    const body = await readBody(res);
    expect(body).toEqual({ error: { code: "unauthorized", message: "Sign in to use Cloud AI." } });
    // CLAUDE.md envelope: no `status` field leaks into the body.
    expect("status" in body).toBe(false);
    // Reject-BEFORE-side-effects: an anonymous caller never reaches storage or
    // the DB. A status-only assertion would miss a gate placed after the work;
    // these not-called assertions are what catch it.
    expect(insert).not.toHaveBeenCalled();
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });
});
