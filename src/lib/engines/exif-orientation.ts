/**
 * JPEG EXIF orientation detection for the Cloud upload path.
 *
 * Bread ignores the IFD0 orientation tag, so a phone photo stored sideways
 * (tag 6/8) or mirrored (2/4/5/7) comes back in its stored layout. The submit
 * path uses this to decide whether a file needs an upright redraw before it is
 * uploaded (`cloud-upload.client.ts`).
 *
 * DOM-free so it is unit-tested under vitest's `node` environment
 * (`tests/exif-orientation.test.ts`). One segment walker serves both entry
 * points: {@link detectOrientation} over bytes already in memory, and
 * {@link readOrientation} over a `Blob` through bounded slices — it reads
 * marker headers and the first Exif APP1 segment only, never unrelated
 * payloads or compressed image data.
 */

/** Outcome of an orientation probe. `unreadable` means the metadata was malformed, not absent. */
export type OrientationDetection =
  { kind: "none" } | { kind: "orientation"; value: number } | { kind: "unreadable"; reason: string };

/** True only for the tag values that need a redraw: 2–8 (1 is upright; 0 and 9+ are invalid). */
export function isOriented(detection: OrientationDetection): boolean {
  return detection.kind === "orientation" && detection.value >= 2 && detection.value <= 8;
}

const ORIENTATION_TAG = 0x0112;
const TYPE_SHORT = 3;
const TYPE_LONG = 4;
/** `Exif\0\0` — the APP1 identifier that precedes the TIFF header. */
const EXIF_ID = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
/** Marker (2) + length (2) + identifier (6): enough to classify any segment. */
const SEGMENT_HEADER_BYTES = 4 + EXIF_ID.length;

interface ByteRange {
  offset: number;
  length: number;
}

/**
 * Parse an Exif APP1 payload (the bytes after `Exif\0\0`, starting at the TIFF
 * header) for IFD0's orientation. IFD1 is ignored: its orientation belongs to
 * the embedded thumbnail.
 */
function parseTiffOrientation(tiff: Uint8Array): OrientationDetection {
  if (tiff.length < 8) return { kind: "unreadable", reason: "TIFF header truncated" };
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const order = view.getUint16(0);
  if (order !== 0x4949 && order !== 0x4d4d) return { kind: "unreadable", reason: "unknown TIFF byte order" };
  const le = order === 0x4949;
  if (view.getUint16(2, le) !== 42) return { kind: "unreadable", reason: "bad TIFF magic" };

  const ifd0 = view.getUint32(4, le);
  if (ifd0 < 8 || ifd0 + 2 > tiff.length) return { kind: "unreadable", reason: "IFD0 offset out of range" };
  const count = view.getUint16(ifd0, le);
  if (ifd0 + 2 + count * 12 > tiff.length) return { kind: "unreadable", reason: "IFD0 entries truncated" };

  for (let i = 0; i < count; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (view.getUint16(entry, le) !== ORIENTATION_TAG) continue;
    const type = view.getUint16(entry + 2, le);
    if (type === TYPE_SHORT) return { kind: "orientation", value: view.getUint16(entry + 8, le) };
    if (type === TYPE_LONG) return { kind: "orientation", value: view.getUint32(entry + 8, le) };
    return { kind: "unreadable", reason: `orientation tag has field type ${type}` };
  }
  return { kind: "none" };
}

function startsWithExifId(bytes: Uint8Array, at: number): boolean {
  return EXIF_ID.every((b, i) => bytes[at + i] === b);
}

/**
 * Walk JPEG segment headers from SOI until the first Exif APP1, SOS or EOI.
 * Yields each byte range it needs and receives those bytes back, so the same
 * traversal runs over an in-memory buffer or a `Blob`. Every range is clamped
 * to `size`; lengths are checked against it and every step moves forward, so a
 * malformed or truncated chain ends as `unreadable`, never as confirmed absence.
 */
function* walkJpeg(size: number): Generator<ByteRange, OrientationDetection, Uint8Array> {
  if (size < 2) return { kind: "none" };
  const soi = yield { offset: 0, length: 2 };
  if (soi[0] !== 0xff || soi[1] !== 0xd8) return { kind: "none" };

  let pos = 2;
  while (pos < size) {
    const header = yield { offset: pos, length: Math.min(SEGMENT_HEADER_BYTES, size - pos) };
    if (header[0] !== 0xff) return { kind: "unreadable", reason: `no marker at offset ${pos}` };
    if (header.length < 2) break;
    const marker = header[1];
    if (marker === 0xff) {
      pos += 1; // fill byte before a marker
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return { kind: "none" }; // EOI / SOS: no Exif before image data
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2; // standalone marker, no length
      continue;
    }
    if (marker === 0xd8) return { kind: "unreadable", reason: `unexpected SOI at offset ${pos}` };
    if (header.length < 4) break;

    const length = (header[2] << 8) | header[3];
    if (length < 2) return { kind: "unreadable", reason: `invalid segment length at offset ${pos}` };
    const end = pos + 2 + length;
    if (end > size) return { kind: "unreadable", reason: `segment at offset ${pos} runs past the end of the file` };

    const isExif =
      marker === 0xe1 &&
      length >= 2 + EXIF_ID.length &&
      header.length === SEGMENT_HEADER_BYTES &&
      startsWithExifId(header, 4);
    if (isExif) {
      const tiffStart = pos + SEGMENT_HEADER_BYTES;
      return parseTiffOrientation(yield { offset: tiffStart, length: end - tiffStart });
    }
    pos = end;
  }
  return { kind: "unreadable", reason: "file ended before the image data" };
}

/** Detect the IFD0 orientation of JPEG bytes already in memory. A non-JPEG is `none`. */
export function detectOrientation(bytes: ArrayBuffer | Uint8Array): OrientationDetection {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const walker = walkJpeg(data.length);
  let step = walker.next();
  while (!step.done) {
    step = walker.next(data.subarray(step.value.offset, step.value.offset + step.value.length));
  }
  return step.value;
}

/**
 * Detect the IFD0 orientation of a JPEG `Blob` without loading it: only marker
 * headers and the first Exif APP1 segment are read, so Exif is found however
 * much metadata precedes it. A non-JPEG is `none`.
 */
export async function readOrientation(file: Blob): Promise<OrientationDetection> {
  const walker = walkJpeg(file.size);
  let step = walker.next();
  while (!step.done) {
    const { offset, length } = step.value;
    const bytes = new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
    step = walker.next(bytes);
  }
  return step.value;
}
