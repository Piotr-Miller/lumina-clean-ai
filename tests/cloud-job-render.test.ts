import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCloudResult } from "@/lib/services/cloud-result.client";

/**
 * Stub `globalThis.Image` with a fake whose `src` setter asynchronously fires
 * `onload` (with the configured intrinsic dimensions) or `onerror`. Mirrors how
 * `useLocalEnhance`'s decode path is exercised — the Node test env has no DOM.
 */
function stubImage(opts: { width?: number; height?: number; fail?: boolean }) {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 0;
    naturalHeight = 0;
    set src(_value: string) {
      setTimeout(() => {
        if (opts.fail) {
          this.onerror?.();
          return;
        }
        this.naturalWidth = opts.width ?? 0;
        this.naturalHeight = opts.height ?? 0;
        this.onload?.();
      }, 0);
    }
  }
  vi.stubGlobal("Image", FakeImage);
}

function okImageResponse(): Response {
  return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }), {
    status: 200,
    headers: { "Content-Type": "image/jpeg" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadCloudResult", () => {
  it("returns decoded dimensions + the fetched blob for a good URL", async () => {
    stubImage({ width: 1920, height: 1080 });
    const fetchMock = vi.fn().mockResolvedValue(okImageResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadCloudResult("https://signed/result.jpg");

    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.type).toBe("image/jpeg");
    expect(fetchMock).toHaveBeenCalledWith("https://signed/result.jpg");
  });

  it("rejects when the result fetch is non-OK", async () => {
    stubImage({ width: 100, height: 100 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    await expect(loadCloudResult("https://signed/missing.jpg")).rejects.toThrow(/Result fetch failed \(404\)/);
  });

  it("rejects when the image fails to decode", async () => {
    stubImage({ fail: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okImageResponse()));

    await expect(loadCloudResult("https://signed/corrupt.jpg")).rejects.toThrow(/failed to decode/);
  });
});
