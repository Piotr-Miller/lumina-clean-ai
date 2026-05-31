import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSignedReadUrl,
  getJobById,
  markJobFailed,
  markJobProcessing,
  markPendingJobFailedForOwner,
} from "@/lib/services/photo-job.service";

/**
 * Chainable query-builder stub mirroring the supabase-js fluent surface the
 * helpers use (`.update().eq().in().select()`, `.select().eq().maybeSingle()`).
 * Records the terminal `update` payload and the filter calls for assertion,
 * and resolves (thenable + `maybeSingle`) to a configured `{ data, error }`.
 */
function makeQueryBuilder(result: { data?: unknown; error?: unknown }) {
  const calls = {
    updatePayload: undefined as unknown,
    selectCols: undefined as unknown,
    eqs: [] as [string, unknown][],
    inFilter: undefined as [string, unknown[]] | undefined,
  };
  const builder = {
    update(payload: unknown) {
      calls.updatePayload = payload;
      return builder;
    },
    select(cols: unknown) {
      calls.selectCols = cols;
      return builder;
    },
    eq(col: string, val: unknown) {
      calls.eqs.push([col, val]);
      return builder;
    },
    in(col: string, vals: unknown[]) {
      calls.inFilter = [col, vals];
      return builder;
    },
    maybeSingle() {
      return Promise.resolve(result);
    },
    then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
      return Promise.resolve(result).then(onF, onR);
    },
  };
  return { builder, calls };
}

function makeAdmin(result: { data?: unknown; error?: unknown }) {
  const { builder, calls } = makeQueryBuilder(result);
  const admin = { from: () => builder } as unknown as SupabaseClient;
  return { admin, calls };
}

describe("getJobById", () => {
  it("returns the row when found", async () => {
    const row = { id: "job-1", user_id: "u-1", status: "queued", source_path: "u-1/job-1/source.jpg" };
    const { admin, calls } = makeAdmin({ data: row, error: null });
    const result = await getJobById(admin, "job-1");
    expect(result).toEqual(row);
    expect(calls.selectCols).toBe("*");
    expect(calls.eqs).toContainEqual(["id", "job-1"]);
  });

  it("returns null when no row matches", async () => {
    const { admin } = makeAdmin({ data: null, error: null });
    expect(await getJobById(admin, "missing")).toBeNull();
  });

  it("throws when the read errors", async () => {
    const { admin } = makeAdmin({ data: null, error: { message: "boom" } });
    await expect(getJobById(admin, "job-1")).rejects.toThrow(/boom/);
  });
});

describe("markJobProcessing", () => {
  it("sets status processing + stores the prediction id, scoped by id", async () => {
    const { admin, calls } = makeAdmin({ error: null });
    await markJobProcessing(admin, { jobId: "job-1", replicatePredictionId: "pred-9" });
    expect(calls.updatePayload).toEqual({ status: "processing", replicate_prediction_id: "pred-9" });
    expect(calls.eqs).toEqual([["id", "job-1"]]);
  });

  it("nulls the prediction id when omitted and never sets updated_at", async () => {
    const { admin, calls } = makeAdmin({ error: null });
    await markJobProcessing(admin, { jobId: "job-1" });
    expect(calls.updatePayload).toEqual({ status: "processing", replicate_prediction_id: null });
    expect(calls.updatePayload).not.toHaveProperty("updated_at");
  });

  it("throws when the update errors", async () => {
    const { admin } = makeAdmin({ error: { message: "nope" } });
    await expect(markJobProcessing(admin, { jobId: "job-1" })).rejects.toThrow(/nope/);
  });
});

describe("markJobFailed", () => {
  it("sets failed + error fields + completed_at, scoped by id", async () => {
    const { admin, calls } = makeAdmin({ error: null });
    await markJobFailed(admin, { jobId: "job-1", errorCode: "replicate_failed", errorMessage: "bad output" });
    const payload = calls.updatePayload as Record<string, unknown>;
    expect(payload.status).toBe("failed");
    expect(payload.error_code).toBe("replicate_failed");
    expect(payload.error_message).toBe("bad output");
    expect(typeof payload.completed_at).toBe("string");
    expect(payload).not.toHaveProperty("updated_at");
    expect(calls.eqs).toEqual([["id", "job-1"]]);
  });

  it("throws when the update errors", async () => {
    const { admin } = makeAdmin({ error: { message: "fail" } });
    await expect(markJobFailed(admin, { jobId: "job-1", errorCode: "x", errorMessage: "y" })).rejects.toThrow(/fail/);
  });
});

describe("markPendingJobFailedForOwner", () => {
  it("flips a pending row and returns true (owner- + status-guarded)", async () => {
    const { admin, calls } = makeAdmin({ data: [{ id: "job-1" }], error: null });
    const flipped = await markPendingJobFailedForOwner(admin, {
      jobId: "job-1",
      userId: "u-1",
      errorCode: "timeout",
      errorMessage: "no result in time",
    });
    expect(flipped).toBe(true);
    const payload = calls.updatePayload as Record<string, unknown>;
    expect(payload.status).toBe("failed");
    expect(payload.error_code).toBe("timeout");
    expect(typeof payload.completed_at).toBe("string");
    expect(calls.eqs).toContainEqual(["id", "job-1"]);
    expect(calls.eqs).toContainEqual(["user_id", "u-1"]);
    expect(calls.inFilter).toEqual(["status", ["queued", "processing"]]);
    expect(calls.selectCols).toBe("id");
  });

  it("returns false when no row was affected (already terminal)", async () => {
    const { admin } = makeAdmin({ data: [], error: null });
    const flipped = await markPendingJobFailedForOwner(admin, {
      jobId: "job-1",
      userId: "u-1",
      errorCode: "timeout",
      errorMessage: "late",
    });
    expect(flipped).toBe(false);
  });

  it("throws when the update errors", async () => {
    const { admin } = makeAdmin({ data: null, error: { message: "denied" } });
    await expect(
      markPendingJobFailedForOwner(admin, { jobId: "j", userId: "u", errorCode: "t", errorMessage: "m" }),
    ).rejects.toThrow(/denied/);
  });
});

describe("createSignedReadUrl", () => {
  function makeStorageAdmin(result: { data?: unknown; error?: unknown }) {
    const calls = { path: undefined as unknown, expires: undefined as unknown };
    const admin = {
      storage: {
        from: () => ({
          createSignedUrl: (path: string, expires: number) => {
            calls.path = path;
            calls.expires = expires;
            return Promise.resolve(result);
          },
        }),
      },
    } as unknown as SupabaseClient;
    return { admin, calls };
  }

  it("returns the signed URL", async () => {
    const { admin, calls } = makeStorageAdmin({ data: { signedUrl: "https://signed/x" }, error: null });
    const url = await createSignedReadUrl(admin, "u-1/job-1/source.jpg", 300);
    expect(url).toBe("https://signed/x");
    expect(calls.path).toBe("u-1/job-1/source.jpg");
    expect(calls.expires).toBe(300);
  });

  it("throws when signing errors", async () => {
    const { admin } = makeStorageAdmin({ data: null, error: { message: "no access" } });
    await expect(createSignedReadUrl(admin, "p", 60)).rejects.toThrow(/no access/);
  });
});
