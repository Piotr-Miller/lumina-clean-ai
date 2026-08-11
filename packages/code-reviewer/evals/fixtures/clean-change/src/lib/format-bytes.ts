/** Human-readable byte sizes for the upload panel. */

const UNITS = ["B", "kB", "MB", "GB"] as const;

/**
 * Formats a byte count for display, e.g. 1536 -> "1.5 kB".
 *
 * Base-10 units (1 kB = 1000 B) to match what the OS file browser shows the
 * user, rather than base-2 KiB.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < UNITS.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }
  const rounded = unitIndex === 0 ? String(value) : value.toFixed(1);
  return `${rounded} ${UNITS[unitIndex]}`;
}
