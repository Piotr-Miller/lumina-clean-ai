/**
 * jpeg-exif.ts — strip a JPEG's Exif so a browser decodes its STORED layout.
 *
 * Why: a browser applies the EXIF orientation tag whenever it decodes a JPEG,
 * so decoding a captured upload as-is would show the same upright pixels
 * whether or not the app redrew it — the tag would hide the defect the spec
 * exists to catch. Dropping every APP1 segment leaves nothing to apply, so
 * the decoded pixels are the bytes' own layout on any browser version.
 *
 * Strict by design: anything it cannot walk throws with the offset, rather
 * than returning bytes that might still carry a tag.
 */

/** Return `bytes` without its APP1 (Exif/XMP) segments; image data is kept verbatim. */
export function stripApp1Segments(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error(`stripApp1Segments: not a JPEG — first bytes are ${String(bytes[0])}, ${String(bytes[1])}`);
  }
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let pos = 2;
  for (;;) {
    if (pos + 4 > bytes.length) throw new Error(`stripApp1Segments: file ended at offset ${String(pos)} before SOS`);
    if (bytes[pos] !== 0xff) throw new Error(`stripApp1Segments: no marker at offset ${String(pos)}`);
    if (bytes[pos + 1] === 0xda) break; // SOS: from here on it is image data
    const length = (bytes[pos + 2] << 8) | bytes[pos + 3];
    const end = pos + 2 + length;
    if (length < 2 || end > bytes.length) {
      throw new Error(`stripApp1Segments: invalid segment length ${String(length)} at offset ${String(pos)}`);
    }
    if (bytes[pos + 1] !== 0xe1) kept.push(bytes.subarray(pos, end));
    pos = end;
  }
  kept.push(bytes.subarray(pos));
  return Buffer.concat(kept);
}
