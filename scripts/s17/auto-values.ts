/**
 * S-17 offline Auto values — second half of the harness.
 *
 * Reads the RGBA buffers `scripts/s17/decode-inputs.py` wrote and runs the APP'S
 * OWN `computeLumaStats` and `recommendParams` on them (imported from
 * `src/lib/engines/auto-params.ts`, never re-implemented), for both engines.
 * Writes one `<id>.auto.json` per photo next to the buffers: input sha256, the
 * sample geometry, the full `LumaStats` and the Local and Cloud recommendations.
 *
 *   npx tsx scripts/s17/auto-values.ts                  # every decoded id in the dir
 *   npx tsx scripts/s17/auto-values.ts S17-01 S17-04    # named ids
 *   HARNESS_DIR=<dir> npx tsx scripts/s17/auto-values.ts
 *
 * These are a cross-check, not the tuning input. The tuning source is the app's
 * `sampleImageLuma` measured in desktop Chrome 154, stored in
 * `desktop-chrome-154.stats.json` (plan Phase 1 decision, revised 2026-09-27).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { computeLumaStats, recommendParams } from "../../src/lib/engines/auto-params";
import { HARNESS_DIR, type AutoValues, type HarnessMeta } from "./harness";

function main(): void {
  const dir = process.env.HARNESS_DIR ?? HARNESS_DIR;
  const requested = process.argv.slice(2);
  const ids =
    requested.length > 0
      ? requested
      : readdirSync(dir)
          .filter((f) => f.endsWith(".meta.json"))
          .map((f) => f.replace(/\.meta\.json$/, ""))
          .sort();
  if (ids.length === 0) {
    console.error(`no decoded inputs in ${dir}: run python3 scripts/s17/decode-inputs.py first.`);
    process.exit(1);
  }

  for (const id of ids) {
    const meta = JSON.parse(readFileSync(join(dir, `${id}.meta.json`), "utf8")) as HarnessMeta;
    const pixels = new Uint8ClampedArray(readFileSync(join(dir, `${id}.rgba`)));
    const [w, h] = meta.sample_dimensions;
    if (pixels.length !== w * h * 4) {
      console.error(
        `${id}: ${String(pixels.length)} bytes, expected ${String(w * h * 4)} for ${String(w)}x${String(h)} RGBA.`,
      );
      process.exit(1);
    }
    const stats = computeLumaStats(pixels);
    const values: AutoValues = {
      id,
      input_sha256: meta.input_sha256,
      sample_dimensions: meta.sample_dimensions,
      filter: meta.filter,
      stats,
      local: recommendParams(stats, "local"),
      cloud: recommendParams(stats, "cloud"),
    };
    writeFileSync(join(dir, `${id}.auto.json`), `${JSON.stringify(values, null, 2)}\n`);
    const { cloud, local } = values;
    console.log(
      `${id}  p50 ${stats.p50.toFixed(3)}  cloud γ ${cloud.gamma.toFixed(2)} s ${cloud.strength.toFixed(3)}  local γ ${local.gamma.toFixed(2)} blur ${local.blur.toFixed(2)}`,
    );
  }
}

main();
