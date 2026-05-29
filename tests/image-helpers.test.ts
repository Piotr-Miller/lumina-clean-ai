import { describe, expect, it } from "vitest";
import { buildGammaLut, deriveDownloadName, MAX_FILE_BYTES, validateImageFile } from "@/lib/engines/image-helpers";

function makeFile(name: string, type: string, bytes = 8): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("validateImageFile", () => {
  it("accepts a JPG within limits", () => {
    expect(validateImageFile(makeFile("night.jpg", "image/jpeg"))).toEqual({ ok: true });
  });

  it("accepts a PNG within limits", () => {
    expect(validateImageFile(makeFile("shot.png", "image/png"))).toEqual({ ok: true });
  });

  it("rejects HEIC with a friendly convert message", () => {
    const result = validateImageFile(makeFile("IMG_0001.heic", "image/heic"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unsupported_type");
      expect(result.message).toMatch(/HEIC/);
    }
  });

  it("rejects a non-image type", () => {
    const result = validateImageFile(makeFile("notes.txt", "text/plain"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unsupported_type");
    }
  });

  it("rejects a file over the byte limit", () => {
    const result = validateImageFile(makeFile("huge.jpg", "image/jpeg", MAX_FILE_BYTES + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("file_too_large");
    }
  });
});

describe("buildGammaLut", () => {
  it("returns 256 clamped entries with fixed endpoints", () => {
    const lut = buildGammaLut(1.5);
    expect(lut).toHaveLength(256);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(255);
  });

  it("is monotonically non-decreasing", () => {
    const lut = buildGammaLut(1.5);
    for (let i = 1; i < lut.length; i++) {
      expect(lut[i]).toBeGreaterThanOrEqual(lut[i - 1]);
    }
  });

  it("brightens midtones when gamma > 1", () => {
    const lut = buildGammaLut(1.5);
    expect(lut[128]).toBeGreaterThan(128);
  });
});

describe("deriveDownloadName", () => {
  it("keeps the base and uses the MIME-derived extension", () => {
    expect(deriveDownloadName("IMG_1234.jpg", "image/jpeg")).toBe("luminaclean-IMG_1234.jpg");
    expect(deriveDownloadName("screenshot.PNG", "image/png")).toBe("luminaclean-screenshot.png");
  });

  it("lets the output MIME drive the extension over the original", () => {
    expect(deriveDownloadName("photo.png", "image/jpeg")).toBe("luminaclean-photo.jpg");
  });

  it("sanitizes odd original names", () => {
    expect(deriveDownloadName("my night pic!.jpeg", "image/jpeg")).toBe("luminaclean-my-night-pic.jpg");
  });

  it("handles a name with no extension", () => {
    expect(deriveDownloadName("vacation", "image/png")).toBe("luminaclean-vacation.png");
  });
});
