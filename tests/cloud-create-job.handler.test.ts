import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCloudJobResponse } from "@/lib/services/cloud-create-job.handler";
import { setObservabilityWarnCapture } from "@/lib/services/photo-job.service";

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
 * contract, and — load-bearing — does so BEFORE any admission / signed-URL work.
 * The count predicate itself (`countCloudJobsToday`) and the pure decision
 * (`isOverDailyCap`) are already covered against live Supabase in
 * tests/jobs.rls.test.ts and as a unit in tests/photo-job.service.test.ts, so
 * they are not re-asserted here. A stub admin client lets us drive the count to
 * a controlled `N` and spy on the side-effects, without `astro:env/server`
 * (Lesson #4) and without real infra.
 *
 * Since `atomic-cloud-daily-cap` the fast-path count is NOT the invariant — the
 * guarded write inside `createPhotoJob` is. The reject-before-work property these
 * tests pin is unchanged; only its observable moved from `insert` to `rpc`. The
 * separate case where the fast path admits and the guarded write then DECLINES
 * (the race loser) is the route-mapping proof at the bottom of this file.
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
 * destructures `{ count }` — both read the same resolved object.
 *
 * `rpc` is the admission seam: since `atomic-cloud-daily-cap`, `createPhotoJob`
 * creates the row through `admit_cloud_job` rather than `.insert()`, so the
 * "rejected before any write" assertions below spy on `rpc`, not on `insert`.
 * `admitted` drives its verdict (default `true` = the guarded write admits).
 * `storage.from().createSignedUploadUrl` stays a spy for the same reason.
 */
function makeStubAdmin(count: number, opts: { admitted?: boolean } = {}) {
  const rpc = vi.fn().mockResolvedValue({ data: opts.admitted ?? true, error: null });
  const createSignedUploadUrl = vi
    .fn()
    .mockResolvedValue({ data: { signedUrl: "https://signed.test/upload", token: "tok-123" }, error: null });

  const resolved = { data: [] as unknown[], count, error: null };
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "lt", "gte", "or", "order", "limit"]) {
    builder[method] = vi.fn(() => builder);
  }
  // Thenable: `await admin.from(...).select(...)...` resolves to `resolved`.
  builder.then = (onFulfilled: (v: typeof resolved) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(resolved).then(onFulfilled, onRejected);

  const admin = {
    from: vi.fn(() => builder),
    rpc,
    storage: { from: vi.fn(() => ({ createSignedUploadUrl })) },
  };

  return { admin: admin as unknown as SupabaseClient, rpc, createSignedUploadUrl };
}

const USER = { id: "11111111-1111-1111-1111-111111111111" };

describe("createCloudJobResponse — global daily-cap route boundary", () => {
  it("rejects an over-cap submission with 429 and the exact contract, before any admission or signed URL", async () => {
    const cap = 3;
    const { admin, rpc, createSignedUploadUrl } = makeStubAdmin(cap); // N === cap → over

    const res = await createCloudJobResponse({ user: USER, request: jsonRequest(VALID_BODY), admin, cap });

    expect(res.status).toBe(429);
    const body = await readBody(res);
    expect(body).toEqual({ error: { code: "daily_cap_reached", message: CAP_MESSAGE } });
    // CLAUDE.md envelope: no `status` field leaks into the body.
    expect("status" in body).toBe(false);
    // Reject-BEFORE-admission: the load-bearing ordering the fast path exists for.
    // A status-only assertion would still pass against an admit-then-check
    // reordering that mints a signed URL and burns a slot; these not-called
    // assertions are what catch it.
    expect(rpc).not.toHaveBeenCalled();
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects when the count is above the cap (N = cap + 1) with 429", async () => {
    const cap = 3;
    const { admin, rpc, createSignedUploadUrl } = makeStubAdmin(cap + 1);

    const res = await createCloudJobResponse({ user: USER, request: jsonRequest(VALID_BODY), admin, cap });

    expect(res.status).toBe(429);
    expect(rpc).not.toHaveBeenCalled();
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("lets the last slot below the cap proceed (N = cap - 1) with 200 and mints the job", async () => {
    const cap = 3;
    const { admin, rpc, createSignedUploadUrl } = makeStubAdmin(cap - 1);

    const res = await createCloudJobResponse({ user: USER, request: jsonRequest(VALID_BODY), admin, cap });

    expect(res.status).toBe(200);
    const body = await readBody(res);
    // CreatePhotoJobResponse shape.
    expect(typeof body.jobId).toBe("string");
    expect(body.uploadUrl).toBe("https://signed.test/upload");
    expect(body.uploadToken).toBe("tok-123");
    expect(body.sourcePath).toContain(`${USER.id}/`);
    expect(createSignedUploadUrl).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    // The env-resolved cap must reach the database gate, not stop at the fast
    // path — dropping it here is exactly the uncapped-admission bypass.
    expect(rpc).toHaveBeenCalledWith("admit_cloud_job", expect.objectContaining({ p_cap: cap }));
  });

  it("rejects the first request when the cap is 0 (operator kill-switch)", async () => {
    const cap = 0;
    const { admin, rpc, createSignedUploadUrl } = makeStubAdmin(0); // N = 0, cap = 0 → over

    const res = await createCloudJobResponse({ user: USER, request: jsonRequest(VALID_BODY), admin, cap });

    expect(res.status).toBe(429);
    const body = await readBody(res);
    expect(body.error?.code).toBe("daily_cap_reached");
    expect(rpc).not.toHaveBeenCalled();
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });
});

describe("createCloudJobResponse — S-12 Bread params reach the guarded write", () => {
  it("passes the body's gamma/strength through to the admission RPC", async () => {
    const cap = 3;
    const { admin, rpc } = makeStubAdmin(cap - 1); // under cap → proceeds to admission
    const body = { fileExtension: "jpg", mimeType: "image/jpeg", gamma: 1.1, strength: 0.05 } as const;

    const res = await createCloudJobResponse({ user: USER, request: jsonRequest(body), admin, cap });

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    // The row is written by `admit_cloud_job`, so these are RPC parameters now.
    // Asserting the old insert spy would pin a call that never happens again and
    // pass vacuously.
    expect(rpc).toHaveBeenCalledWith(
      "admit_cloud_job",
      expect.objectContaining({ p_user_id: USER.id, p_gamma: 1.1, p_strength: 0.05, p_cap: cap }),
    );
  });

  it("sends null gamma/strength when the body omits them (server falls back to defaults)", async () => {
    const cap = 3;
    const { admin, rpc } = makeStubAdmin(cap - 1);

    const res = await createCloudJobResponse({ user: USER, request: jsonRequest(VALID_BODY), admin, cap });

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("admit_cloud_job", expect.objectContaining({ p_gamma: null, p_strength: null }));
  });

  it("rejects an out-of-range strength (>0.2) with 400 before any admission", async () => {
    const { admin, rpc, createSignedUploadUrl } = makeStubAdmin(0);
    const body = { fileExtension: "jpg", mimeType: "image/jpeg", strength: 0.5 };

    const res = await createCloudJobResponse({ user: USER, request: jsonRequest(body), admin, cap: 3 });

    expect(res.status).toBe(400);
    const parsed = await readBody(res);
    expect(parsed.error?.code).toBe("invalid_body");
    expect(rpc).not.toHaveBeenCalled();
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });
});

/**
 * The ROUTE-MAPPING PROOF for FR-014: the fast path admits (`count = cap - 1`),
 * and the guarded write then declines — a race loser, or a request that straddled
 * UTC midnight between the Worker clock and the database clock.
 *
 * This is the only layer where that mapping can be pinned deterministically. The
 * warmed RPC-layer fan-out in tests/jobs.rls.test.ts is what proves the ATOMICITY
 * (only one of N concurrent admissions wins); this proves the loser is turned into the
 * byte-identical 429 the pre-check returns, and that the rejection is visible in
 * the LOCAL console rather than only in Sentry — `captureWarning` defaults to a
 * no-op, so a capture-only call would leave a developer with no signal at all.
 */
describe("createCloudJobResponse — guarded write declines after the fast path admits", () => {
  afterEach(() => {
    // The capture hook is module-level state on photo-job.service. Leaving it set
    // would leak this test's spy into every sibling test in the run.
    setObservabilityWarnCapture(() => undefined);
    vi.restoreAllMocks();
  });

  it("maps a declined admission onto the identical 429 and warns to console + Sentry", async () => {
    const cap = 3;
    // Fast path sees the last free slot and admits; the guarded write disagrees.
    const { admin, createSignedUploadUrl } = makeStubAdmin(cap - 1, { admitted: false });
    const captured: string[] = [];
    setObservabilityWarnCapture((msg) => captured.push(msg));
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const res = await createCloudJobResponse({ user: USER, request: jsonRequest(VALID_BODY), admin, cap });

    expect(res.status).toBe(429);
    const body = await readBody(res);
    // Byte-identical to the fast path's rejection — a race loser is rejected
    // exactly like any other over-cap request.
    expect(body).toEqual({ error: { code: "daily_cap_reached", message: CAP_MESSAGE } });
    expect("status" in body).toBe(false);

    // The signed URL WAS minted before the decline (mint-then-admit): an unused
    // one-shot token and no object, which costs nothing. Pinned so a future
    // reorder is a deliberate decision rather than an accident.
    expect(createSignedUploadUrl).toHaveBeenCalledTimes(1);

    // Both legs of the warn seam, naming the cap. Sentry-only would be invisible
    // locally; console-only would never reach production observability.
    const expected = `createPhotoJob: daily-cap guarded write rejected admission (cap=${cap})`;
    expect(captured).toContain(expected);
    expect(consoleWarn).toHaveBeenCalledWith(expected);
  });
});

/**
 * Hermetic route-boundary test for the cloud-AI auth gate (Risk #2: an
 * unauthorized request must not reach Cloud AI processing).
 *
 * The NEW signal is the same shape as the cap tests above, one step earlier in
 * the sequence: an anonymous request (`user: null`) is rejected with 401 at the
 * boundary BEFORE any admission / signed-URL side-effect — so a missing session
 * can never mint a signed upload URL or create a job row. The full-stack 401 is
 * already covered by the slow E2E (tests/e2e/seed.spec.ts); this pins the gate
 * at the cheap hermetic layer. `cap`/`count` are irrelevant — the auth guard is
 * the handler's first statement, before the cap check ever runs.
 */
describe("createCloudJobResponse — anonymous auth gate (Risk #2)", () => {
  it("rejects an anonymous request with 401 and the exact contract, before any admission or signed URL", async () => {
    const { admin, rpc, createSignedUploadUrl } = makeStubAdmin(0);

    const res = await createCloudJobResponse({ user: null, request: jsonRequest(VALID_BODY), admin, cap: 3 });

    expect(res.status).toBe(401);
    const body = await readBody(res);
    expect(body).toEqual({ error: { code: "unauthorized", message: "Sign in to use Cloud AI." } });
    // CLAUDE.md envelope: no `status` field leaks into the body.
    expect("status" in body).toBe(false);
    // Reject-BEFORE-side-effects: an anonymous caller never reaches storage or
    // the DB. A status-only assertion would miss a gate placed after the work;
    // these not-called assertions are what catch it.
    expect(rpc).not.toHaveBeenCalled();
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });
});
