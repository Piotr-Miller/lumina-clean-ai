/**
 * Synthetic JPEG byte builders for the EXIF orientation tests. They produce
 * the segment chain only — SOI, metadata segments, SOS with a few bytes of fake
 * scan data, EOI — which is all the detector reads; nothing here decodes.
 */

/** Bytes backed by a plain `ArrayBuffer`, so they are a valid `BlobPart`. */
export type Bytes = Uint8Array<ArrayBuffer>;

export const MARKER = {
  APP0: 0xe0,
  APP1: 0xe1,
  APP2: 0xe2,
  DQT: 0xdb,
  SOS: 0xda,
} as const;

/** Largest payload a segment can carry: the 16-bit length counts itself. */
export const MAX_SEGMENT_PAYLOAD = 0xffff - 2;

export function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A length-prefixed segment: `FF <marker> <len hi> <len lo> <payload>`. */
export function segment(marker: number, payload: Bytes): Bytes {
  const length = payload.length + 2;
  return concat(new Uint8Array([0xff, marker, length >> 8, length & 0xff]), payload);
}

interface TiffOptions {
  littleEndian?: boolean;
  /** IFD0 orientation value; omitted → no orientation entry in IFD0. */
  orientation?: number;
  /** Field type of the orientation entry (3 = SHORT, 4 = LONG). */
  orientationType?: number;
  /** Component count; non-singleton values build malformed orientation entries. */
  orientationCount?: number;
  /** Orientation tag placed in IFD1 (the thumbnail's IFD) instead. */
  ifd1Orientation?: number;
}

const ENTRY_BYTES = 12;

/** A TIFF structure (the bytes after `Exif\0\0`) with IFD0 and an optional IFD1. */
export function tiff({
  littleEndian = false,
  orientation,
  orientationType = 3,
  orientationCount = 1,
  ifd1Orientation,
}: TiffOptions): Bytes {
  // IFD0 carries an unrelated entry (ImageWidth) first, so the parser must scan past it.
  const ifd0Entries: [number, number, number][] = [[0x0100, 3, 640]];
  if (orientation !== undefined) ifd0Entries.push([0x0112, orientationType, orientation]);
  const ifd0Size = 2 + ifd0Entries.length * ENTRY_BYTES + 4;
  const ifd1Entries: [number, number, number][] = ifd1Orientation === undefined ? [] : [[0x0112, 3, ifd1Orientation]];
  const ifd1Size = ifd1Entries.length ? 2 + ifd1Entries.length * ENTRY_BYTES + 4 : 0;

  const bytes = new Uint8Array(8 + ifd0Size + ifd1Size);
  const view = new DataView(bytes.buffer);
  const le = littleEndian;
  view.setUint16(0, le ? 0x4949 : 0x4d4d);
  view.setUint16(2, 42, le);
  view.setUint32(4, 8, le);

  const writeIfd = (at: number, entries: [number, number, number][], next: number) => {
    view.setUint16(at, entries.length, le);
    entries.forEach(([tag, type, value], i) => {
      const e = at + 2 + i * ENTRY_BYTES;
      view.setUint16(e, tag, le);
      view.setUint16(e + 2, type, le);
      view.setUint32(e + 4, tag === 0x0112 ? orientationCount : 1, le);
      if (type === 4) view.setUint32(e + 8, value, le);
      else view.setUint16(e + 8, value, le);
    });
    view.setUint32(at + 2 + entries.length * ENTRY_BYTES, next, le);
  };
  writeIfd(8, ifd0Entries, ifd1Size ? 8 + ifd0Size : 0);
  if (ifd1Size) writeIfd(8 + ifd0Size, ifd1Entries, 0);
  return bytes;
}

const EXIF_ID = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);

/** An APP1 Exif segment wrapping `tiffBytes`. */
export function exifApp1(tiffBytes: Bytes): Bytes {
  return segment(MARKER.APP1, concat(EXIF_ID, tiffBytes));
}

/** A JFIF APP0 segment. */
export function jfifApp0(): Bytes {
  return segment(MARKER.APP0, new Uint8Array([0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0]));
}

/** An APP2 segment of `payloadBytes` filler bytes (ICC-profile-like padding). */
export function app2(payloadBytes: number): Bytes {
  return segment(MARKER.APP2, new Uint8Array(payloadBytes).fill(0x41));
}

/** Fake entropy-coded scan bytes; the detector must never read them. */
export const SCAN_BYTES = 4096;

/** SOI + `segments` + SOS + scan data + EOI. */
export function jpegBytes(...segments: Bytes[]): Bytes {
  const sos = segment(MARKER.SOS, new Uint8Array([1, 1, 0, 0, 0x3f, 0]));
  const scan = new Uint8Array(SCAN_BYTES).fill(0x55);
  return concat(new Uint8Array([0xff, 0xd8]), ...segments, sos, scan, new Uint8Array([0xff, 0xd9]));
}

/** A minimal Exif-tagged JPEG with IFD0 orientation `value`. */
export function orientedJpegBytes(value: number): Bytes {
  return jpegBytes(exifApp1(tiff({ orientation: value })));
}
