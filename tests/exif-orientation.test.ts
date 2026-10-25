import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  detectOrientation,
  isOriented,
  readOrientation,
  type OrientationDetection,
} from "@/lib/engines/exif-orientation";
import {
  app2,
  concat,
  exifApp1,
  jfifApp0,
  jpegBytes,
  MARKER,
  MAX_SEGMENT_PAYLOAD,
  orientedJpegBytes,
  SCAN_BYTES,
  segment,
  tiff,
  type Bytes,
} from "./helpers/jpeg-bytes";

/** Both entry points must agree on every input; returns the shared verdict. */
async function detectBoth(bytes: Bytes): Promise<OrientationDetection> {
  const sync = detectOrientation(bytes);
  const fromBlob = await readOrientation(new Blob([bytes]));
  expect(fromBlob).toEqual(sync);
  return sync;
}

/** A Blob that records every `slice` range and fails the test on a whole-file read. */
function trackedBlob(bytes: Bytes) {
  const blob = new Blob([bytes]);
  const reads: [number, number][] = [];
  const slice = blob.slice.bind(blob);
  vi.spyOn(blob, "slice").mockImplementation((start, end, type) => {
    reads.push([start ?? 0, end ?? blob.size]);
    return slice(start, end, type);
  });
  const wholeRead = vi.spyOn(blob, "arrayBuffer");
  const bytesRead = () => reads.reduce((n, [s, e]) => n + (e - s), 0);
  return { blob, reads, wholeRead, bytesRead };
}

/** Byte offset where the scan data starts: after SOS's own segment, before the fake scan and EOI. */
function scanStart(bytes: Bytes): number {
  return bytes.length - 2 - SCAN_BYTES;
}

/** A licensed photo read from disk (not copied into the repo), as ArrayBuffer-backed bytes. */
function photo(path: string): Bytes {
  return new Uint8Array(readFileSync(path));
}

const S17_06 = "test-photos/licensed/06-phone-rain-galaxys24ultra.jpg";
const STAIRCASE = "test-photos/licensed/18-staircase.jpg";

describe("isOriented", () => {
  it("is true only for tag values 2–8", () => {
    const verdicts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((value) => isOriented({ kind: "orientation", value }));
    expect(verdicts).toEqual([false, false, true, true, true, true, true, true, true, false]);
  });

  it("is false for none and unreadable", () => {
    expect(isOriented({ kind: "none" })).toBe(false);
    expect(isOriented({ kind: "unreadable", reason: "x" })).toBe(false);
  });
});

describe("detectOrientation / readOrientation", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])("reads IFD0 orientation %i", async (value) => {
    expect(await detectBoth(orientedJpegBytes(value))).toEqual({ kind: "orientation", value });
  });

  it.each([0, 9])("reports the invalid value %i as read, and not oriented", async (value) => {
    const detection = await detectBoth(orientedJpegBytes(value));
    expect(detection).toEqual({ kind: "orientation", value });
    expect(isOriented(detection)).toBe(false);
  });

  it.each([
    ["big-endian (MM)", false],
    ["little-endian (II)", true],
  ])("parses a %s TIFF header", async (_label, littleEndian) => {
    const bytes = jpegBytes(exifApp1(tiff({ littleEndian, orientation: 6 })));
    expect(await detectBoth(bytes)).toEqual({ kind: "orientation", value: 6 });
  });

  it("reads a LONG-typed orientation entry", async () => {
    const bytes = jpegBytes(exifApp1(tiff({ littleEndian: true, orientation: 8, orientationType: 4 })));
    expect(await detectBoth(bytes)).toEqual({ kind: "orientation", value: 8 });
  });

  it("finds Exif after a JFIF APP0", async () => {
    const bytes = jpegBytes(jfifApp0(), exifApp1(tiff({ orientation: 5 })));
    expect(await detectBoth(bytes)).toEqual({ kind: "orientation", value: 5 });
  });

  it("ignores an orientation tag that only appears in IFD1 (the thumbnail)", async () => {
    const bytes = jpegBytes(exifApp1(tiff({ ifd1Orientation: 6 })));
    expect(await detectBoth(bytes)).toEqual({ kind: "none" });
  });

  it("reads IFD0 when IFD1 disagrees", async () => {
    const bytes = jpegBytes(exifApp1(tiff({ orientation: 1, ifd1Orientation: 6 })));
    expect(await detectBoth(bytes)).toEqual({ kind: "orientation", value: 1 });
  });

  it("is none for a JPEG with no APP1", async () => {
    expect(await detectBoth(jpegBytes(jfifApp0(), segment(MARKER.DQT, new Uint8Array(65))))).toEqual({
      kind: "none",
    });
  });

  it("skips a non-Exif APP1 (XMP) and keeps looking", async () => {
    const xmp = segment(MARKER.APP1, new TextEncoder().encode("http://ns.adobe.com/xap/1.0/\0<x/>"));
    expect(await detectBoth(jpegBytes(xmp, exifApp1(tiff({ orientation: 3 }))))).toEqual({
      kind: "orientation",
      value: 3,
    });
  });

  it("is unreadable for an APP1 truncated by the end of the file", async () => {
    const whole = orientedJpegBytes(6);
    const cut = whole.subarray(0, 2 + 4 + 6 + 10); // SOI + APP1 header + Exif id + part of the TIFF
    expect(await detectBoth(cut)).toMatchObject({ kind: "unreadable" });
  });

  it("is unreadable when IFD0's entries run past the end of the APP1", async () => {
    const full = tiff({ orientation: 6 });
    const bytes = jpegBytes(exifApp1(full.subarray(0, full.length - 10)));
    expect(await detectBoth(bytes)).toEqual({ kind: "unreadable", reason: "IFD0 entries truncated" });
  });

  it("is unreadable for an unknown TIFF byte order", async () => {
    const bad = tiff({ orientation: 6 });
    bad.set([0x41, 0x42], 0);
    expect(await detectBoth(jpegBytes(exifApp1(bad)))).toEqual({
      kind: "unreadable",
      reason: "unknown TIFF byte order",
    });
  });

  it("is unreadable when the IFD0 offset points outside the segment", async () => {
    const bad = tiff({ orientation: 6 });
    new DataView(bad.buffer).setUint32(4, 0xffff);
    expect(await detectBoth(jpegBytes(exifApp1(bad)))).toEqual({
      kind: "unreadable",
      reason: "IFD0 offset out of range",
    });
  });

  it("is none for a non-JPEG", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(await detectBoth(png)).toEqual({ kind: "none" });
    expect(await detectBoth(new Uint8Array([1, 2, 3]))).toEqual({ kind: "none" });
    expect(await detectBoth(new Uint8Array(0))).toEqual({ kind: "none" });
  });

  it("accepts an ArrayBuffer", () => {
    const { buffer } = orientedJpegBytes(7);
    expect(detectOrientation(buffer)).toEqual({ kind: "orientation", value: 7 });
  });
});

describe("real phone headers (read from disk, not copied)", () => {
  it("S17-06 (Galaxy S24 Ultra) carries orientation 6 → oriented", async () => {
    const file = photo(S17_06);
    const header = detectOrientation(file.subarray(0, 64 * 1024));
    expect(header).toEqual({ kind: "orientation", value: 6 });
    expect(isOriented(header)).toBe(true);

    const { blob, wholeRead, bytesRead } = trackedBlob(file);
    expect(await readOrientation(blob)).toEqual({ kind: "orientation", value: 6 });
    expect(wholeRead).not.toHaveBeenCalled();
    expect(bytesRead()).toBeLessThan(64 * 1024); // the 4 MB file: only the Exif segment and headers
  });

  it("18-staircase carries the invalid value 0 → not oriented", async () => {
    const file = photo(STAIRCASE);
    const header = detectOrientation(file.subarray(0, 64 * 1024));
    expect(header).toEqual({ kind: "orientation", value: 0 });
    expect(isOriented(header)).toBe(false);
    expect(await readOrientation(new Blob([file]))).toEqual(header);
  });
});

describe("readOrientation bounded traversal", () => {
  it("finds Exif after five maximum-length APP2 segments (beyond 256 KiB) without reading them", async () => {
    const padding = Array.from({ length: 5 }, () => app2(MAX_SEGMENT_PAYLOAD));
    const exif = exifApp1(tiff({ orientation: 6 }));
    const bytes = jpegBytes(...padding, exif);
    const exifOffset = 2 + padding.reduce((n, p) => n + p.length, 0);
    expect(exifOffset).toBeGreaterThan(256 * 1024);

    const { blob, reads, wholeRead, bytesRead } = trackedBlob(bytes);
    expect(await readOrientation(blob)).toEqual({ kind: "orientation", value: 6 });
    expect(wholeRead).not.toHaveBeenCalled();
    // SOI + five 10-byte segment headers + the Exif segment itself.
    expect(bytesRead()).toBe(2 + 5 * 10 + exif.length);
    // No read lands inside an APP2 payload past its header.
    let at = 2;
    for (const p of padding) {
      const payloadStart = at + 10;
      const payloadEnd = at + p.length;
      expect(reads.filter(([s, e]) => s < payloadEnd && e > payloadStart)).toEqual([]);
      at = payloadEnd;
    }
  });

  it("walks a long metadata chain without Exif to SOS and returns none, never reading the scan", async () => {
    const chain = [jfifApp0(), ...Array.from({ length: 6 }, () => app2(MAX_SEGMENT_PAYLOAD))];
    const bytes = jpegBytes(...chain);
    const { blob, reads, wholeRead } = trackedBlob(bytes);
    expect(await readOrientation(blob)).toEqual({ kind: "none" });
    expect(wholeRead).not.toHaveBeenCalled();
    expect(Math.max(...reads.map(([, e]) => e))).toBeLessThanOrEqual(scanStart(bytes));
  });

  it("is unreadable when a segment declares a length below 2", async () => {
    const bad = new Uint8Array([0xff, MARKER.APP2, 0x00, 0x01]);
    expect(await detectBoth(jpegBytes(bad))).toEqual({
      kind: "unreadable",
      reason: "invalid segment length at offset 2",
    });
  });

  it("is unreadable when a segment runs past the end of the file", async () => {
    const bytes = concat(new Uint8Array([0xff, 0xd8]), app2(1000)).subarray(0, 500);
    expect(await detectBoth(bytes)).toEqual({
      kind: "unreadable",
      reason: "segment at offset 2 runs past the end of the file",
    });
  });

  it("is unreadable when no marker follows a segment", async () => {
    const bytes = jpegBytes(jfifApp0(), new Uint8Array([0x00, 0x11, 0x22]));
    const garbageAt = 2 + jfifApp0().length;
    expect(await detectBoth(bytes)).toEqual({ kind: "unreadable", reason: `no marker at offset ${garbageAt}` });
  });

  it("is unreadable when the metadata chain ends before SOS or EOI", async () => {
    const bytes = concat(new Uint8Array([0xff, 0xd8]), jfifApp0(), app2(100));
    expect(await detectBoth(bytes)).toEqual({ kind: "unreadable", reason: "file ended before the image data" });
  });

  it("is none at EOI", async () => {
    expect(await detectBoth(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toEqual({ kind: "none" });
  });

  it("skips fill bytes before a marker", async () => {
    const bytes = jpegBytes(new Uint8Array([0xff, 0xff]), exifApp1(tiff({ orientation: 2 })));
    expect(await detectBoth(bytes)).toEqual({ kind: "orientation", value: 2 });
  });
});
