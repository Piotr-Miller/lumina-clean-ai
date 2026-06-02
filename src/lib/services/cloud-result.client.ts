/**
 * Browser-side adapter turning a signed result URL into the two things the
 * before/after slider + download button need: intrinsic pixel dimensions and a
 * `Blob`.
 *
 * The cloud result arrives as a URL (not a `Blob` like the Local engine), and
 * carries no width/height — `BeforeAfterSlider` requires both, and
 * `DownloadButton` requires a `Blob`. This module bridges that gap with the
 * same `new Image()` decode pattern `useLocalEnhance` uses for the Local path.
 *
 * Kept free of any `astro:env`/supabase import so it loads + unit-tests under
 * the Vitest Node environment (mocked `fetch`/`Image`) — see
 * `tests/cloud-job-render.test.ts`. The signed-URL minting (which needs a
 * supabase client) stays in `useCloudJob`; this adapter only consumes the URL.
 */

export interface CloudResult {
  /** Intrinsic pixel width of the decoded result (slider aspect-ratio). */
  width: number;
  /** Intrinsic pixel height of the decoded result. */
  height: number;
  /** The result bytes, for `DownloadButton`. */
  blob: Blob;
}

/** Decode a URL into its intrinsic dimensions via a transient `<img>` (rejects on bad data). */
function decodeDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      reject(new Error("Result image failed to decode."));
    };
    img.src = url;
  });
}

/**
 * Load a signed result URL into a render-ready bundle: decode its dimensions
 * and fetch its bytes as a `Blob`, in parallel. Throws if the fetch is non-OK
 * or the image fails to decode — the caller maps that to a user-facing error.
 */
export async function loadCloudResult(afterUrl: string): Promise<CloudResult> {
  const [dimensions, blob] = await Promise.all([
    decodeDimensions(afterUrl),
    fetch(afterUrl).then((res) => {
      if (!res.ok) {
        throw new Error(`Result fetch failed (${String(res.status)}).`);
      }
      return res.blob();
    }),
  ]);
  return { width: dimensions.width, height: dimensions.height, blob };
}
