/**
 * Shared paths and record shapes for the S-17 harness scripts (`scripts/s17/`).
 * Everything the harness writes lives under `test-photos/private/`, which is
 * gitignored — inputs are licensed, outputs are not publishable by default.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { BreadParams, LocalParams, LumaStats } from "../../src/lib/engines/types";

export const REPO = resolve(import.meta.dirname, "../..");
export const MANIFEST = join(REPO, "test-photos/s17-benchmark.json");
export const HARNESS_DIR = join(REPO, "test-photos/private/s17/harness");

export interface ManifestEntry {
  id: string;
  path: string;
  split: "tuning" | "validation";
  sha256: string;
  exif_orientation: number | null;
  diagnostic_content_roi: [number, number, number, number];
}

/** Written by `decode-inputs.py` as `<id>.meta.json`. */
export interface HarnessMeta {
  id: string;
  split: ManifestEntry["split"];
  path: string;
  input_sha256: string;
  stored_dimensions: [number, number];
  oriented_dimensions: [number, number];
  sample_dimensions: [number, number];
  exif_orientation: number | null;
  icc_profile: string | null;
  icc_converted_to_srgb: boolean;
  filter: string;
}

/** Written by `auto-values.ts` as `<id>.auto.json`. */
export interface AutoValues {
  id: string;
  input_sha256: string;
  sample_dimensions: [number, number];
  filter: string;
  stats: LumaStats;
  local: LocalParams;
  cloud: BreadParams;
}

export function readManifest(): ManifestEntry[] {
  return (JSON.parse(readFileSync(MANIFEST, "utf8")) as { entries: ManifestEntry[] }).entries;
}
