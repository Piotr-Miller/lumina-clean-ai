import { describe, expect, it, vi } from "vitest";
import {
  forceOpaque,
  maybePostprocessCloudResult,
  type CloudResultProcessor,
} from "@/lib/services/cloud-result-postprocess.client";
import { MAX_CHROMA_POSTPASS_PIXELS } from "@/lib/engines/chroma-denoise";

const rawBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
const processedBlob = new Blob([new Uint8Array([9, 9, 9, 9])], { type: "image/jpeg" });

describe("maybePostprocessCloudResult", () => {
  it("flag-off returns the original Blob and never invokes the processor", async () => {
    const processor = vi.fn<CloudResultProcessor>().mockResolvedValue(processedBlob);

    const outcome = await maybePostprocessCloudResult({
      enabled: false,
      blob: rawBlob,
      width: 100,
      height: 100,
      processor,
    });

    expect(outcome.blob).toBe(rawBlob);
    expect(outcome.processed).toBe(false);
    expect(outcome.fallbackReason).toBeNull();
    expect(processor).not.toHaveBeenCalled();
  });

  it("over the 12 MP guard returns the raw Blob without invoking the processor", async () => {
    const processor = vi.fn<CloudResultProcessor>().mockResolvedValue(processedBlob);
    // 4000×3001 = 12,004,000 px > 12 MP cap.
    const width = 4000;
    const height = 3001;
    expect(width * height).toBeGreaterThan(MAX_CHROMA_POSTPASS_PIXELS);

    const outcome = await maybePostprocessCloudResult({
      enabled: true,
      blob: rawBlob,
      width,
      height,
      processor,
    });

    expect(outcome.blob).toBe(rawBlob);
    expect(outcome.processed).toBe(false);
    expect(outcome.fallbackReason).toMatch(/guard/);
    expect(processor).not.toHaveBeenCalled();
  });

  it("enabled + in-bounds returns the processor's JPEG", async () => {
    const processor = vi.fn<CloudResultProcessor>().mockResolvedValue(processedBlob);

    const outcome = await maybePostprocessCloudResult({
      enabled: true,
      blob: rawBlob,
      width: 1920,
      height: 1080,
      processor,
    });

    expect(outcome.blob).toBe(processedBlob);
    expect(outcome.processed).toBe(true);
    expect(outcome.fallbackReason).toBeNull();
    expect(processor).toHaveBeenCalledWith(rawBlob, 1920, 1080);
  });

  it("a processor failure falls back to the raw Blob with a scrub-safe reason", async () => {
    const processor = vi.fn<CloudResultProcessor>().mockRejectedValue(new Error("decode boom"));

    const outcome = await maybePostprocessCloudResult({
      enabled: true,
      blob: rawBlob,
      width: 800,
      height: 600,
      processor,
    });

    expect(outcome.blob).toBe(rawBlob);
    expect(outcome.processed).toBe(false);
    expect(outcome.fallbackReason).toMatch(/decode boom/);
    expect(processor).toHaveBeenCalledOnce();
  });
});

describe("forceOpaque", () => {
  it("sets every alpha byte to 255 and leaves R/G/B untouched", () => {
    // 3 pixels with varied (incl. translucent + opaque) alpha.
    const data = new Uint8ClampedArray([10, 20, 30, 0, 40, 50, 60, 128, 70, 80, 90, 255]);

    forceOpaque(data);

    expect(Array.from(data)).toEqual([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255]);
  });
});
