/**
 * cloud-upload-orientation.spec.ts
 *
 * Phase 2 of `cloud-exif-orientation`: prove in a real browser that an
 * EXIF-oriented JPEG reaches Cloud AI upright. Bread ignores the orientation
 * tag, so the client redraws a tag-2–8 photo before upload
 * (`cloud-upload.client.ts` → `redrawUprightJpeg`). The unit tests stub that
 * redraw; this spec observes the REAL signed-upload PUT and checks its bytes —
 * the model input — for display-orientation pixels and no orientation tag.
 * There is no test-plan §2 risk row for this; the spec is headed by its change
 * and phase, as `chroma-postpass-on.spec.ts` is.
 * seed: tests/e2e/seed.spec.ts
 *
 * Stub boundary: nothing is mocked. The PUT passes through a route that only
 * reads its body and continues it unmodified to the real local Storage, and
 * the spec stops once it has landed — the pipeline after the upload is not this
 * spec's concern, so no fixture server and no served function are needed (the
 * port-8787 single-spec rule in RULES.md is untouched). With the DB webhook
 * unwired (the local/CI default) the row simply stays `queued` until cleanup.
 *
 * Fixtures: `tests/e2e/fixtures/orient-{6,2}.jpg` — synthetic 96 × 64 stored
 * JPEGs with one red block in the stored top-left corner (README there). Under
 * tag 6 the display is 64 × 96 with the block top-right; under tag 2 it stays
 * 96 × 64 with the block mirrored to the top-right. Uploaded as stored, both
 * keep the block top-left — which is what this spec must catch.
 *
 * The admin (service-role) client is used ONLY for cleanup.
 */
import { test, expect, type Page, type Request } from "@playwright/test";
import { readFileSync } from "node:fs";
import { detectOrientation, type OrientationDetection } from "../../src/lib/engines/exif-orientation";
import { adminClient as sharedAdminClient } from "./helpers/env";
import { expectOkResponse } from "./helpers/expect-response";
import { stripApp1Segments } from "./helpers/jpeg-exif";

const RUN_ID = `e2e-orient-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Path segment of a Supabase signed upload URL (`createSignedUploadUrl`). */
const SIGNED_UPLOAD_PATH = "/storage/v1/object/upload/sign/";

/** How long the PUT of a sub-kilobyte fixture may take to settle, in the test and in cleanup. */
const UPLOAD_SETTLE_MS = 10_000;

/** Pixel inset of the corner samples: the centre of a 24 px corner block. */
const SAMPLE_INSET = 12;

type Corner = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

/** Upright layout of both fixtures: the block sits top-right, everything else is background. */
const UPRIGHT_CORNERS: Record<Corner, string> = {
  topLeft: "background",
  topRight: "block",
  bottomLeft: "background",
  bottomRight: "background",
};

const FIXTURES = [
  {
    tag: 6,
    path: "tests/e2e/fixtures/orient-6.jpg",
    transform: "rotated 90° clockwise",
    display: { width: 64, height: 96 },
  },
  {
    tag: 2,
    path: "tests/e2e/fixtures/orient-2.jpg",
    transform: "mirrored left to right",
    display: { width: 96, height: 64 },
  },
];

function adminClient() {
  return sharedAdminClient("cloud-upload-orientation.spec.ts");
}

type UploadOutcome = { kind: "finished" } | { kind: "failed"; errorText: string };

interface UploadTracker {
  /** The first PUT to a signed upload URL, once the page has sent it. */
  request: () => Request | null;
  /** That PUT's body as it left the page, or null if none was readable. */
  body: () => Buffer | null;
  /** Settles when that PUT finishes or fails. Never rejects, so cleanup can always await it. */
  settled: Promise<UploadOutcome>;
}

/**
 * Track the page's signed-upload PUT through to its completion or failure, and
 * keep its body. The body is read in a pass-through route, which continues the
 * request unmodified to the real Storage: Chromium's request events expose a
 * File/Blob body only intermittently, so `waitForRequest` alone cannot see it
 * (owner decision 2026-10-25, plan Phase 2).
 */
async function trackSignedUpload(page: Page): Promise<UploadTracker> {
  let put: Request | null = null;
  let body: Buffer | null = null;
  let settle: (outcome: UploadOutcome) => void = () => undefined;
  const settled = new Promise<UploadOutcome>((resolve) => {
    settle = resolve;
  });
  await page.route(`**${SIGNED_UPLOAD_PATH}**`, async (route) => {
    const r = route.request();
    if (!put && r.method() === "PUT") {
      put = r;
      body = r.postDataBuffer();
    }
    await route.continue();
  });
  page.on("requestfinished", (r) => {
    if (r === put) settle({ kind: "finished" });
  });
  page.on("requestfailed", (r) => {
    if (r === put) settle({ kind: "failed", errorText: r.failure()?.errorText ?? "no error text" });
  });
  return { request: () => put, body: () => body, settled };
}

/** Resolve with `promise`, or with "timeout" once `ms` elapse — a bounded wait on a condition. */
async function within<T>(promise: Promise<T>, ms: number): Promise<T | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      resolve("timeout");
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** What the PUT body says about orientation, worded so a failed assertion names what it found. */
function describeOrientation(detection: OrientationDetection): string {
  if (detection.kind === "none") return "no orientation tag";
  if (detection.kind === "unreadable") return `unreadable Exif (${detection.reason})`;
  return detection.value === 1 ? "no orientation tag" : `orientation tag ${String(detection.value)}`;
}

function classifyPixel([r, g, b]: number[]): string {
  if (r > 170 && g < 90 && b < 90) return "block";
  if ([r, g, b].every((c) => Math.abs(c - 128) <= 40)) return "background";
  return `unexpected rgb(${String(r)}, ${String(g)}, ${String(b)})`;
}

/**
 * Decode JPEG bytes in the browser with their Exif removed, so the result is
 * the bytes' own pixel layout, whatever orientation tag they carried.
 */
async function decodeStoredLayout(page: Page, jpeg: Uint8Array) {
  const decoded = await page.evaluate(
    async ({ base64, inset }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
      const { width, height } = bitmap;
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");
      ctx.drawImage(bitmap, 0, 0);
      const at = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
      return {
        width,
        height,
        corners: {
          topLeft: at(inset, inset),
          topRight: at(width - inset, inset),
          bottomLeft: at(inset, height - inset),
          bottomRight: at(width - inset, height - inset),
        },
      };
    },
    { base64: Buffer.from(stripApp1Segments(jpeg)).toString("base64"), inset: SAMPLE_INSET },
  );
  const corners = Object.fromEntries(
    Object.entries(decoded.corners).map(([corner, rgb]) => [corner, classifyPixel(rgb)]),
  ) as Record<Corner, string>;
  return { width: decoded.width, height: decoded.height, corners };
}

test.describe("Phase 2: an EXIF-oriented JPEG reaches Cloud AI upright and untagged", () => {
  let jobId: string | null = null;
  let upload: UploadTracker | null = null;

  // Cleanup — delete exactly what this test created: the captured job row and
  // its storage prefix. A PUT still in flight could land after the delete and
  // leave an orphaned source object, so wait for it to settle first; if it
  // does not within the budget, close the page, which cancels its requests.
  test.afterEach(async ({ page }) => {
    if (upload?.request() && (await within(upload.settled, UPLOAD_SETTLE_MS)) === "timeout") {
      await page.close();
    }
    upload = null;
    if (jobId) {
      const admin = adminClient();
      const { data: row } = await admin
        .from("jobs")
        .select("user_id")
        .eq("id", jobId)
        .maybeSingle<{ user_id: string }>();
      if (row) {
        const prefix = `${row.user_id}/${jobId}`;
        const { data: objects } = await admin.storage.from("photos").list(prefix);
        if (objects && objects.length > 0) {
          await admin.storage.from("photos").remove(objects.map((o) => `${prefix}/${o.name}`));
        }
        await admin.from("jobs").delete().eq("id", jobId);
      }
      jobId = null;
    }
  });

  for (const fixture of FIXTURES) {
    test(`signed-in upload of a tag-${String(fixture.tag)} JPEG → Cloud AI → the uploaded bytes are ${fixture.transform} upright and carry no orientation tag`, async ({
      page,
    }) => {
      // Hard-fail the env guard before any data exists (cleanup needs it).
      adminClient();

      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Fix your night photos" })).toBeVisible();

      // Retry the upload until the hydrated island reacts — state, not time.
      const jpgBytes = readFileSync(fixture.path);
      await expect(async () => {
        await page.getByLabel("Upload an image").setInputFiles({
          name: `${RUN_ID}-tag${String(fixture.tag)}.jpg`,
          mimeType: "image/jpeg",
          buffer: jpgBytes,
        });
        await expect(page.getByRole("button", { name: "Enhance" })).toBeVisible({ timeout: 1500 });
      }).toPass({ timeout: 15_000 });

      await page.getByRole("group", { name: "Processing engine" }).getByRole("button", { name: "Cloud AI" }).click();

      // Arm both observations BEFORE clicking: the create-job jobId is the
      // cleanup key, and the PUT follows it too quickly to arm afterwards.
      upload = await trackSignedUpload(page);
      const createJobResponse = page.waitForResponse(
        (r) => r.url().includes("/api/enhance/cloud/create-job") && r.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Process with Cloud AI" }).click();
      const createJob = await createJobResponse;
      await expectOkResponse(createJob, "create-job");
      jobId = ((await createJob.json()) as { jobId: string }).jobId;

      // The upload must actually land: a failed or hanging PUT fails the test.
      const outcome = await within(upload.settled, UPLOAD_SETTLE_MS);
      if (outcome === "timeout") {
        throw new Error(`signed-upload PUT for job ${jobId} did not settle within ${String(UPLOAD_SETTLE_MS)} ms`);
      }
      if (outcome.kind === "failed") {
        throw new Error(`signed-upload PUT for job ${jobId} failed at the network layer: ${outcome.errorText}`);
      }
      const put = upload.request();
      if (!put) throw new Error(`no signed-upload PUT was observed for job ${jobId}`);
      const putResponse = await put.response();
      if (!putResponse) throw new Error(`signed-upload PUT for job ${jobId} finished without a response`);
      await expectOkResponse(putResponse, "signed-upload PUT");
      // The URL carries the upload token, so the correlation check never prints it.
      expect(put.url().includes(`/${jobId}/source.jpg`), `the observed PUT targets job ${jobId}'s source`).toBe(true);

      const body = upload.body();
      if (!body) throw new Error(`signed-upload PUT for job ${jobId} exposed no request body to observe`);

      // The model input: no orientation tag for Bread to ignore, and the display
      // layout in the pixels themselves. Soft, so a failure reports all three —
      // the tag and the pixels are independent guards, and each must be seen.
      expect.soft(describeOrientation(detectOrientation(body))).toBe("no orientation tag");
      const layout = await decodeStoredLayout(page, body);
      expect.soft({ width: layout.width, height: layout.height }).toEqual(fixture.display);
      expect.soft(layout.corners).toEqual(UPRIGHT_CORNERS);
    });
  }
});
