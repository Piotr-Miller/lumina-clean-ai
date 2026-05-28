/**
 * F-01 end-to-end smoke. Run via `npx tsx scripts/f01-smoke.ts` after
 * `npx supabase start` and the three env-var exports documented in
 * `tests/README.md`. Exits 0 on success, 1 on failure.
 *
 * What this proves beyond the Vitest suite:
 *   1. The full createPhotoJob -> client PUT -> markJobSucceeded chain
 *      works against a real client (browser-style fetch), not just
 *      supabase-js method calls.
 *   2. Supabase Realtime delivers the row UPDATE to a subscriber
 *      authenticated under the user's JWT, with RLS scoping the
 *      delivered rows to the owner. This is the load-bearing guarantee
 *      S-04 will rely on; the test suite asserts the storage/DB state
 *      but NOT the Realtime push channel.
 *   3. The on-success retention contract holds end-to-end (source object
 *      gone from Storage after markJobSucceeded).
 */

import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
  type RealtimePostgresUpdatePayload,
} from "@supabase/supabase-js";
import { supabaseAdmin as admin } from "../tests/env";
import { createTestUser, deleteTestUser, type TestUser } from "../tests/helpers/test-users";
import { createPhotoJob, markJobSucceeded } from "@/lib/services/photo-job.service";

const PHOTOS_BUCKET = "photos";
const SUBSCRIBE_TIMEOUT_MS = 5_000;
const REALTIME_EVENT_TIMEOUT_MS = 10_000;

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(msg);
}

function tinyJpegPayload(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x00, 0xff, 0xd9,
  ]);
}

interface RealtimeWatcher {
  channel: RealtimeChannel;
  subscribed: Promise<void>;
  firstUpdate: Promise<RealtimePostgresUpdatePayload<{ status: string; result_path: string | null }>>;
}

function watchJobUpdates(client: TestUser["client"], userId: string): RealtimeWatcher {
  let resolveUpdate!: (payload: RealtimePostgresUpdatePayload<{ status: string; result_path: string | null }>) => void;
  let rejectUpdate!: (err: Error) => void;
  const firstUpdate = new Promise<RealtimePostgresUpdatePayload<{ status: string; result_path: string | null }>>(
    (res, rej) => {
      resolveUpdate = res;
      rejectUpdate = rej;
    },
  );

  const channel = client
    .channel(`smoke-${userId}-${crypto.randomUUID()}`)
    .on<{ status: string; result_path: string | null }>(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "jobs",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        resolveUpdate(payload);
      },
    );

  const subscribed = new Promise<void>((res, rej) => {
    const timer = setTimeout(() => {
      rej(new Error(`Realtime SUBSCRIBE timed out after ${SUBSCRIBE_TIMEOUT_MS}ms`));
    }, SUBSCRIBE_TIMEOUT_MS);
    channel.subscribe((status, err) => {
      if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
        clearTimeout(timer);
        res();
      } else {
        // Remaining REALTIME_SUBSCRIBE_STATES values (CHANNEL_ERROR,
        // TIMED_OUT, CLOSED) are all terminal failure states from a
        // subscribe attempt — surface as one rejection.
        clearTimeout(timer);
        const reason = err?.message ?? status;
        rej(new Error(`Realtime subscribe failed: ${reason}`));
        rejectUpdate(new Error(`Realtime subscribe failed: ${reason}`));
      }
    });
  });

  // Arm a timeout on firstUpdate so a missing event aborts the script
  // rather than hanging forever.
  const updateTimeout = setTimeout(() => {
    rejectUpdate(new Error(`Realtime UPDATE event not received within ${REALTIME_EVENT_TIMEOUT_MS}ms`));
  }, REALTIME_EVENT_TIMEOUT_MS);
  void firstUpdate.finally(() => {
    clearTimeout(updateTimeout);
  });

  return { channel, subscribed, firstUpdate };
}

async function main(): Promise<void> {
  let user: TestUser | null = null;

  try {
    log("→ creating test user");
    user = await createTestUser("smoke");
    log(`  user.id=${user.id}`);

    log("→ createPhotoJob");
    const job = await createPhotoJob(admin, {
      userId: user.id,
      fileExtension: "jpg",
      mimeType: "image/jpeg",
    });
    log(`  job.id=${job.jobId} sourcePath=${job.sourcePath}`);

    log("→ PUT source via signed URL");
    const put = await fetch(job.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: tinyJpegPayload() as BodyInit,
    });
    if (put.status < 200 || put.status >= 300) {
      throw new Error(`signed-URL PUT failed: HTTP ${put.status}`);
    }
    log(`  upload HTTP ${put.status}`);

    log("→ subscribing Realtime under user JWT");
    const watcher = watchJobUpdates(user.client, user.id);
    await watcher.subscribed;
    log("  SUBSCRIBED");

    log("→ markJobSucceeded (admin) — should trigger a Realtime UPDATE");
    const resultPath = `${user.id}/${job.jobId}/result.jpg`;
    const markStart = Date.now();
    await markJobSucceeded(admin, {
      jobId: job.jobId,
      resultPath,
      replicatePredictionId: "smoke-prediction",
    });

    const payload = await watcher.firstUpdate;
    const latencyMs = Date.now() - markStart;
    log(`  Realtime event received in ${latencyMs}ms; status=${payload.new.status}`);
    if (payload.new.status !== "succeeded") {
      throw new Error(`expected status=succeeded, got ${payload.new.status}`);
    }
    if (payload.new.result_path !== resultPath) {
      throw new Error(`expected result_path=${resultPath}, got ${payload.new.result_path ?? "null"}`);
    }

    log("→ verifying source object was deleted");
    const { data: files } = await admin.storage.from(PHOTOS_BUCKET).list(`${user.id}/${job.jobId}`);
    const sourceStillThere = files?.some((f) => f.name === "source.jpg") ?? false;
    if (sourceStillThere) {
      throw new Error("source object still present in Storage after markJobSucceeded");
    }
    log("  source object gone ✓");

    await watcher.channel.unsubscribe();

    log("");
    log(`OK ✓ end-to-end smoke passed (Realtime latency ${latencyMs}ms)`);
    process.exit(0);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("");
    log(`FAIL ✗ ${msg}`);
    process.exit(1);
  } finally {
    if (user) {
      try {
        await deleteTestUser(user.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`(teardown warning) deleteTestUser failed: ${msg}`);
      }
    }
  }
}

void main();
