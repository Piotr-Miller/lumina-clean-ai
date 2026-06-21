import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  claimJobForProcessing,
  createSignedReadUrl,
  deleteJobResult,
  deleteJobSource,
  getJobById,
  markJobFailed,
  markJobSucceeded,
  markPendingJobFailedForOwner,
  recordJobPrediction,
  sweepAbandonedSourcesGlobally,
  sweepStalePendingJobsForOwner,
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
    isFilters: [] as [string, unknown][],
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
    is(col: string, val: unknown) {
      calls.isFilters.push([col, val]);
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

function makeAdmin(result: { data?: unknown; error?: unknown }, storageResult: { error?: unknown } = { error: null }) {
  const { builder, calls } = makeQueryBuilder(result);
  // Records every storage.remove([...]) call so delete-on-flip is assertable.
  const removed: string[][] = [];
  const admin = {
    from: () => builder,
    storage: {
      from: () => ({
        remove: (paths: string[]) => {
          removed.push(paths);
          return Promise.resolve(storageResult);
        },
      }),
    },
  } as unknown as SupabaseClient;
  return { admin, calls, removed };
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

describe("claimJobForProcessing", () => {
  it("atomically claims only a queued row and returns it", async () => {
    const row = { id: "job-1", user_id: "u-1", status: "processing", source_path: "u-1/job-1/source.jpg" };
    const { admin, calls } = makeAdmin({ data: row, error: null });
    expect(await claimJobForProcessing(admin, "job-1")).toEqual(row);
    expect(calls.updatePayload).toEqual({ status: "processing" });
    expect(calls.eqs).toEqual([
      ["id", "job-1"],
      ["status", "queued"],
    ]);
    expect(calls.selectCols).toBe("*");
  });

  it("returns null when another invocation already claimed the row", async () => {
    const { admin } = makeAdmin({ data: null, error: null });
    expect(await claimJobForProcessing(admin, "job-1")).toBeNull();
  });

  it("throws when the claim errors", async () => {
    const { admin } = makeAdmin({ data: null, error: { message: "nope" } });
    await expect(claimJobForProcessing(admin, "job-1")).rejects.toThrow(/nope/);
  });
});

describe("recordJobPrediction", () => {
  it("stores prediction metadata once on the claimed processing row", async () => {
    const { admin, calls } = makeAdmin({ data: { id: "job-1" }, error: null });
    expect(
      await recordJobPrediction(admin, {
        jobId: "job-1",
        replicatePredictionId: "pred-9",
        modelVersion: "model-abc",
      }),
    ).toBe(true);
    expect(calls.updatePayload).toEqual({
      replicate_prediction_id: "pred-9",
      model_version: "model-abc",
    });
    expect(calls.updatePayload).not.toHaveProperty("updated_at");
    expect(calls.eqs).toEqual([
      ["id", "job-1"],
      ["status", "processing"],
    ]);
    expect(calls.isFilters).toEqual([
      ["replicate_prediction_id", null],
      ["model_version", null],
    ]);
    expect(calls.selectCols).toBe("id");
  });

  it("returns false when the row was terminalized or metadata was already recorded", async () => {
    const { admin } = makeAdmin({ data: null, error: null });
    expect(
      await recordJobPrediction(admin, {
        jobId: "job-1",
        replicatePredictionId: "pred-9",
        modelVersion: "model-abc",
      }),
    ).toBe(false);
  });

  it("throws when the metadata update errors", async () => {
    const { admin } = makeAdmin({ data: null, error: { message: "nope" } });
    await expect(
      recordJobPrediction(admin, {
        jobId: "job-1",
        replicatePredictionId: "pred-9",
        modelVersion: "model-abc",
      }),
    ).rejects.toThrow(/nope/);
  });
});

describe("markJobFailed", () => {
  it("flips a pending row → failed, deletes the source, returns true (status-guarded)", async () => {
    const { admin, calls, removed } = makeAdmin({
      data: [{ id: "job-1", source_path: "u-1/job-1/source.jpg" }],
      error: null,
    });
    const flipped = await markJobFailed(admin, {
      jobId: "job-1",
      errorCode: "replicate_failed",
      errorMessage: "bad output",
    });
    expect(flipped).toBe(true);
    const payload = calls.updatePayload as Record<string, unknown>;
    expect(payload.status).toBe("failed");
    expect(payload.error_code).toBe("replicate_failed");
    expect(payload.error_message).toBe("bad output");
    expect(typeof payload.completed_at).toBe("string");
    expect(payload).not.toHaveProperty("updated_at");
    expect(calls.eqs).toContainEqual(["id", "job-1"]);
    expect(calls.inFilter).toEqual(["status", ["queued", "processing"]]);
    expect(calls.selectCols).toBe("id, source_path");
    expect(removed).toEqual([["u-1/job-1/source.jpg"]]);
  });

  it("returns false and skips the delete when no row flips (already terminal)", async () => {
    const { admin, removed } = makeAdmin({ data: [], error: null });
    const flipped = await markJobFailed(admin, { jobId: "job-1", errorCode: "x", errorMessage: "y" });
    expect(flipped).toBe(false);
    expect(removed).toEqual([]);
  });

  it("throws when the update errors", async () => {
    const { admin } = makeAdmin({ data: null, error: { message: "fail" } });
    await expect(markJobFailed(admin, { jobId: "job-1", errorCode: "x", errorMessage: "y" })).rejects.toThrow(/fail/);
  });
});

describe("markJobSucceeded", () => {
  it("flips a processing row → succeeded, deletes the source, returns true (F9 guard)", async () => {
    const { admin, calls, removed } = makeAdmin({ data: [{ source_path: "u-1/job-1/source.jpg" }], error: null });
    const flipped = await markJobSucceeded(admin, {
      jobId: "job-1",
      resultPath: "u-1/job-1/result.jpg",
      replicatePredictionId: "pred-9",
    });
    expect(flipped).toBe(true);
    const payload = calls.updatePayload as Record<string, unknown>;
    expect(payload.status).toBe("succeeded");
    expect(payload.result_path).toBe("u-1/job-1/result.jpg");
    expect(payload.replicate_prediction_id).toBe("pred-9");
    expect(payload).not.toHaveProperty("model_version");
    expect(typeof payload.completed_at).toBe("string");
    expect(calls.eqs).toContainEqual(["id", "job-1"]);
    expect(calls.eqs).toContainEqual(["status", "processing"]);
    expect(calls.selectCols).toBe("source_path");
    expect(removed).toEqual([["u-1/job-1/source.jpg"]]);
  });

  it("returns false and skips the delete when the row isn't processing (lost race)", async () => {
    const { admin, removed } = makeAdmin({ data: [], error: null });
    const flipped = await markJobSucceeded(admin, { jobId: "job-1", resultPath: "u-1/job-1/result.jpg" });
    expect(flipped).toBe(false);
    expect(removed).toEqual([]);
  });

  it("throws when the update errors", async () => {
    const { admin } = makeAdmin({ data: null, error: { message: "boom" } });
    await expect(markJobSucceeded(admin, { jobId: "job-1", resultPath: "r" })).rejects.toThrow(/boom/);
  });
});

describe("deleteJobSource / deleteJobResult", () => {
  it("remove the given path and never throw on a storage error", async () => {
    const { admin, removed } = makeAdmin({ error: null });
    await deleteJobSource(admin, "u-1/j/source.jpg");
    await deleteJobResult(admin, "u-1/j/result.jpg");
    expect(removed).toEqual([["u-1/j/source.jpg"], ["u-1/j/result.jpg"]]);

    const { admin: failing } = makeAdmin({ error: null }, { error: { message: "gone" } });
    await expect(deleteJobSource(failing, "p")).resolves.toBeUndefined();
  });
});

describe("markPendingJobFailedForOwner", () => {
  it("flips a pending row, deletes the source, returns true (owner- + status-guarded)", async () => {
    const { admin, calls, removed } = makeAdmin({
      data: [{ id: "job-1", source_path: "u-1/job-1/source.jpg" }],
      error: null,
    });
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
    expect(calls.selectCols).toBe("id, source_path");
    expect(removed).toEqual([["u-1/job-1/source.jpg"]]);
  });

  it("returns false and skips the delete when no row was affected (already terminal)", async () => {
    const { admin, removed } = makeAdmin({ data: [], error: null });
    const flipped = await markPendingJobFailedForOwner(admin, {
      jobId: "job-1",
      userId: "u-1",
      errorCode: "timeout",
      errorMessage: "late",
    });
    expect(flipped).toBe(false);
    expect(removed).toEqual([]);
  });

  it("throws when the update errors", async () => {
    const { admin } = makeAdmin({ data: null, error: { message: "denied" } });
    await expect(
      markPendingJobFailedForOwner(admin, { jobId: "j", userId: "u", errorCode: "t", errorMessage: "m" }),
    ).rejects.toThrow(/denied/);
  });
});

describe("sweepStalePendingJobsForOwner", () => {
  /**
   * Sweep-specific admin stub: the helper runs a SELECT chain
   * (`.select().eq().in().lt().order().limit()`) then a separate UPDATE chain
   * (`.update().eq().in().in().select()`), each resolving to a DIFFERENT result,
   * plus one batched `storage.remove(paths)`. The SELECT chain terminates by
   * awaiting `.limit()`; the UPDATE chain terminates by awaiting the builder
   * after its trailing `.select()` (thenable → updateResult). A `phase` flag
   * routes `.select()` to the right recorder.
   */
  function makeSweepAdmin(opts: {
    selectResult: { data?: unknown; error?: unknown };
    updateResult?: { data?: unknown; error?: unknown };
    removeResult?: { error?: unknown };
  }) {
    const calls = {
      selectCols: undefined as unknown,
      updateSelectCols: undefined as unknown,
      updatePayload: undefined as unknown,
      eqs: [] as [string, unknown][],
      ins: [] as [string, unknown[]][],
      lt: undefined as [string, unknown] | undefined,
      order: undefined as [string, unknown] | undefined,
      limit: undefined as unknown,
    };
    const removed: string[][] = [];
    let phase: "select" | "update" = "select";

    const builder: Record<string, unknown> = {
      select(cols: unknown) {
        if (phase === "select") calls.selectCols = cols;
        else calls.updateSelectCols = cols;
        return builder;
      },
      update(payload: unknown) {
        phase = "update";
        calls.updatePayload = payload;
        return builder;
      },
      eq(col: string, val: unknown) {
        calls.eqs.push([col, val]);
        return builder;
      },
      in(col: string, vals: unknown[]) {
        calls.ins.push([col, vals]);
        return builder;
      },
      lt(col: string, val: unknown) {
        calls.lt = [col, val];
        return builder;
      },
      order(col: string, cfg: unknown) {
        calls.order = [col, cfg];
        return builder;
      },
      // Terminates the SELECT chain — resolve the select-phase result.
      limit(n: unknown) {
        calls.limit = n;
        return Promise.resolve(opts.selectResult);
      },
      // Terminates the UPDATE chain — `await builder` after the trailing
      // `.select("source_path")` resolves the update-phase result.
      then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
        return Promise.resolve(opts.updateResult ?? { data: [], error: null }).then(onF, onR);
      },
    };
    const admin = {
      from: () => builder,
      storage: {
        from: () => ({
          remove: (paths: string[]) => {
            removed.push(paths);
            return Promise.resolve(opts.removeResult ?? { error: null });
          },
        }),
      },
    } as unknown as SupabaseClient;
    return { admin, calls, removed };
  }

  it("selects the owner's stale non-terminal rows, flips them, batch-deletes sources", async () => {
    const { admin, calls, removed } = makeSweepAdmin({
      selectResult: {
        data: [
          { id: "j-1", source_path: "u-1/j-1/source.jpg" },
          { id: "j-2", source_path: "u-1/j-2/source.png" },
        ],
        error: null,
      },
      updateResult: {
        data: [{ source_path: "u-1/j-1/source.jpg" }, { source_path: "u-1/j-2/source.png" }],
        error: null,
      },
    });

    const swept = await sweepStalePendingJobsForOwner(admin, "u-1");
    expect(swept).toBe(2);

    // Owner- + status-scoped select, oldest-first, bounded.
    expect(calls.selectCols).toBe("id, source_path");
    expect(calls.eqs).toContainEqual(["user_id", "u-1"]);
    expect(calls.ins).toContainEqual(["status", ["queued", "processing"]]);
    expect(calls.lt?.[0]).toBe("created_at");
    expect(calls.order).toEqual(["created_at", { ascending: true }]);
    expect(calls.limit).toBe(100);

    // Guarded flip → failed/abandoned for exactly the selected ids.
    const payload = calls.updatePayload as Record<string, unknown>;
    expect(payload.status).toBe("failed");
    expect(payload.error_code).toBe("abandoned");
    expect(typeof payload.error_message).toBe("string");
    expect(typeof payload.completed_at).toBe("string");
    expect(calls.ins).toContainEqual(["id", ["j-1", "j-2"]]);
    expect(calls.updateSelectCols).toBe("source_path");

    // SINGLE batched remove of all flipped sources (not a per-row loop).
    expect(removed).toEqual([["u-1/j-1/source.jpg", "u-1/j-2/source.png"]]);
  });

  it("is a no-op (no update, no remove, returns 0) when nothing is stale", async () => {
    const { admin, calls, removed } = makeSweepAdmin({ selectResult: { data: [], error: null } });
    const swept = await sweepStalePendingJobsForOwner(admin, "u-1");
    expect(swept).toBe(0);
    expect(calls.updatePayload).toBeUndefined();
    expect(removed).toEqual([]);
  });

  it("respects the max bound (limit + count) and never exceeds it", async () => {
    const rows = [
      { id: "j-1", source_path: "u-1/j-1/source.jpg" },
      { id: "j-2", source_path: "u-1/j-2/source.jpg" },
    ];
    const { admin, calls } = makeSweepAdmin({
      selectResult: { data: rows, error: null },
      updateResult: { data: rows.map((r) => ({ source_path: r.source_path })), error: null },
    });
    const swept = await sweepStalePendingJobsForOwner(admin, "u-1", { max: 2 });
    expect(calls.limit).toBe(2);
    expect(swept).toBe(2);
  });

  it("honours a custom staleMs threshold and is owner-scoped on the flip", async () => {
    const { admin, calls } = makeSweepAdmin({
      selectResult: { data: [{ id: "j-9", source_path: "u-2/j-9/source.jpg" }], error: null },
      updateResult: { data: [{ source_path: "u-2/j-9/source.jpg" }], error: null },
    });
    await sweepStalePendingJobsForOwner(admin, "u-2", { staleMs: 1000 });
    // The flip carries the owner guard AND the still-non-terminal status guard.
    expect(calls.eqs).toContainEqual(["user_id", "u-2"]);
    expect(calls.ins).toContainEqual(["status", ["queued", "processing"]]);
    expect(calls.lt?.[0]).toBe("created_at");
  });

  it("never throws and returns 0 when the select errors (best-effort)", async () => {
    const { admin, removed } = makeSweepAdmin({ selectResult: { data: null, error: { message: "db down" } } });
    await expect(sweepStalePendingJobsForOwner(admin, "u-1")).resolves.toBe(0);
    expect(removed).toEqual([]);
  });
});

describe("sweepAbandonedSourcesGlobally", () => {
  /**
   * Reaper-specific admin stub. The fn runs two independent passes:
   *  1. a flip chain `.from().update().in().lt().select()` (terminated by awaiting
   *     `.select()`, resolving to `flipResult`),
   *  2. an `admin.rpc("stale_source_object_paths", params)` returning `rpcResult`,
   *     then a single `admin.storage.from().remove(paths)`.
   * Records the flip payload/filters, the RPC name+params, and every remove() call.
   */
  function makeReaperAdmin(opts: {
    flipResult?: { data?: unknown; error?: unknown };
    rpcResult?: { data?: unknown; error?: unknown };
    removeResult?: { error?: unknown };
  }) {
    const calls = {
      updatePayload: undefined as unknown,
      selectCols: undefined as unknown,
      ins: [] as [string, unknown[]][],
      lt: undefined as [string, unknown] | undefined,
      rpcName: undefined as unknown,
      rpcParams: undefined as Record<string, unknown> | undefined,
    };
    const removed: string[][] = [];
    const builder: Record<string, unknown> = {
      update(payload: unknown) {
        calls.updatePayload = payload;
        return builder;
      },
      in(col: string, vals: unknown[]) {
        calls.ins.push([col, vals]);
        return builder;
      },
      lt(col: string, val: unknown) {
        calls.lt = [col, val];
        return builder;
      },
      // Terminates the flip chain — `await ...select("id")` resolves flipResult.
      select(cols: unknown) {
        calls.selectCols = cols;
        return Promise.resolve(opts.flipResult ?? { data: [], error: null });
      },
    };
    const admin = {
      from: () => builder,
      rpc: (name: string, params: Record<string, unknown>) => {
        calls.rpcName = name;
        calls.rpcParams = params;
        return Promise.resolve(opts.rpcResult ?? { data: [], error: null });
      },
      storage: {
        from: () => ({
          remove: (paths: string[]) => {
            removed.push(paths);
            return Promise.resolve(opts.removeResult ?? { error: null });
          },
        }),
      },
    } as unknown as SupabaseClient;
    return { admin, calls, removed };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("flips stale non-terminal rows AND batch-deletes the RPC's stale source paths", async () => {
    const { admin, calls, removed } = makeReaperAdmin({
      flipResult: { data: [{ id: "j-1" }, { id: "j-2" }], error: null },
      rpcResult: { data: [{ name: "u-1/j-1/source.jpg" }, { name: "u-2/j-9/source.png" }], error: null },
    });

    const result = await sweepAbandonedSourcesGlobally(admin);
    expect(result).toEqual({ flipped: 2, deleted: 2 });

    // Pass 1 — global (NO user_id filter), status- + age-guarded flip → abandoned.
    const payload = calls.updatePayload as Record<string, unknown>;
    expect(payload.status).toBe("failed");
    expect(payload.error_code).toBe("abandoned");
    expect(typeof payload.error_message).toBe("string");
    expect(typeof payload.completed_at).toBe("string");
    expect(calls.ins).toContainEqual(["status", ["queued", "processing"]]);
    expect(calls.lt?.[0]).toBe("created_at");
    expect(calls.selectCols).toBe("id");

    // Pass 2 — RPC drives a SINGLE batched remove of all stale source paths.
    expect(calls.rpcName).toBe("stale_source_object_paths");
    expect(removed).toEqual([["u-1/j-1/source.jpg", "u-2/j-9/source.png"]]);
  });

  it("is a no-op (no remove, zero counts) when nothing is stale", async () => {
    const { admin, removed } = makeReaperAdmin({
      flipResult: { data: [], error: null },
      rpcResult: { data: [], error: null },
    });
    const result = await sweepAbandonedSourcesGlobally(admin);
    expect(result).toEqual({ flipped: 0, deleted: 0 });
    expect(removed).toEqual([]);
  });

  it("passes retentionMs/staleMs/max through to the RPC params and bound", async () => {
    const { admin, calls } = makeReaperAdmin({
      flipResult: { data: [], error: null },
      rpcResult: { data: [], error: null },
    });
    const before = Date.now();
    await sweepAbandonedSourcesGlobally(admin, { retentionMs: 5000, staleMs: 2000, max: 7 });
    expect(calls.rpcParams).toEqual({ older_than_seconds: 5, max_rows: 7 });

    // The flip threshold must be `now - staleMs` (the PAST), never the future — a
    // `Date.now() - staleMs` → `+`/`*`/`/` regression would reap live in-flight
    // jobs (or none). Pin direction + magnitude (≈ staleMs ago, generous CI slack).
    expect(calls.lt?.[0]).toBe("created_at");
    const threshold = new Date(calls.lt?.[1] as string).getTime();
    expect(Math.abs(before - threshold - 2000)).toBeLessThan(1000);
  });

  it("the delete pass still runs when the flip pass errors (never throws)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { admin, removed } = makeReaperAdmin({
      flipResult: { data: null, error: { message: "flip boom" } },
      rpcResult: { data: [{ name: "u-1/j-1/source.jpg" }], error: null },
    });
    const result = await sweepAbandonedSourcesGlobally(admin);
    // Flip failed → 0 flipped, but the NFR-critical delete pass still reaped.
    expect(result).toEqual({ flipped: 0, deleted: 1 });
    expect(removed).toEqual([["u-1/j-1/source.jpg"]]);
    expect(warn).toHaveBeenCalled();
  });

  it("never throws and reports deleted:0 when the RPC errors", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { admin, removed } = makeReaperAdmin({
      flipResult: { data: [{ id: "j-1" }], error: null },
      rpcResult: { data: null, error: { message: "rpc down" } },
    });
    const result = await sweepAbandonedSourcesGlobally(admin);
    expect(result).toEqual({ flipped: 1, deleted: 0 });
    expect(removed).toEqual([]);
  });

  it("reports deleted:0 and never throws when the batched remove errors", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { admin } = makeReaperAdmin({
      flipResult: { data: [], error: null },
      rpcResult: { data: [{ name: "u-1/j-1/source.jpg" }], error: null },
      removeResult: { error: { message: "storage gone" } },
    });
    const result = await sweepAbandonedSourcesGlobally(admin);
    expect(result).toEqual({ flipped: 0, deleted: 0 });
  });

  it("warns (no silent cap) when the stale source set hits the max bound", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const names = [{ name: "u/a/source.jpg" }, { name: "u/b/source.jpg" }];
    const { admin } = makeReaperAdmin({
      flipResult: { data: [], error: null },
      rpcResult: { data: names, error: null },
    });
    const result = await sweepAbandonedSourcesGlobally(admin, { max: 2 });
    expect(result.deleted).toBe(2);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/hit the 2-object cap/));
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
