/**
 * Phase-5 performance benchmark for the chroma-denoise pass (change
 * `bread-chroma-postpass`). Times the pure DOM-free `denoiseChroma` JS pass —
 * the plan's GO gate is "~12 MP within 2 s on the maintainer reference desktop"
 * (`plan.md` Performance Considerations). Canvas decode/encode is native and
 * benchmarked separately in-browser; this harness isolates the JavaScript pass,
 * which is the main-thread cost the budget guards.
 *
 * Run: `npx tsx scripts/benchmarks/chroma-denoise-bench.ts`
 *
 * Deterministic synthetic input (no Math.random) so numbers are reproducible:
 * a dark, chroma-noisy field — the worst case for this pass (max shadow weight,
 * so the gamut-scale + recombine branch runs hot on every pixel).
 */
/* eslint-disable no-console -- benchmark CLI: stdout is its interface */
import {
  denoiseChroma,
  DEFAULT_CHROMA_PARAMS,
  MAX_CHROMA_POSTPASS_PIXELS,
  type ChromaDenoiseParams,
} from "../../src/lib/engines/chroma-denoise.ts";

interface SizeCase {
  label: string;
  width: number;
  height: number;
}

const SIZES: SizeCase[] = [
  { label: "small  (1 MP, 1000×1000)", width: 1000, height: 1000 },
  { label: "typical(6 MP, 3000×2000)", width: 3000, height: 2000 },
  { label: "~12 MP (4000×3000)", width: 4000, height: 3000 },
];

const ITERATIONS = 7; // odd → clean median; first run is a discarded warmup.

/**
 * Fill an RGBA buffer with a deterministic dark, chroma-noisy field. Low luma
 * (so the shadow weight is high — worst case) with a per-pixel color jitter that
 * exercises the blur + gamut-scale path. Pure integer hash, no allocations.
 */
function fillDarkNoisy(data: Uint8ClampedArray, width: number, height: number): void {
  for (let p = 0, i = 0; p < width * height; p++, i += 4) {
    // Cheap deterministic hash → pseudo-noise in [0,63].
    const h = (p * 2654435761) >>> 0;
    const n = h & 0x3f;
    const base = 8 + (h % 24); // dark base 8..31
    data[i] = base + ((n * 7) & 0x1f); // R
    data[i + 1] = base + ((n * 13) & 0x1f); // G
    data[i + 2] = base + ((n * 19) & 0x1f); // B
    data[i + 3] = 255; // A
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length - 1) >> 1];
}

function benchSize(size: SizeCase, params: ChromaDenoiseParams): void {
  const { label, width, height } = size;
  const pixels = width * height;
  const data = new Uint8ClampedArray(pixels * 4);

  const samples: number[] = [];
  for (let run = 0; run < ITERATIONS; run++) {
    // Re-fill each run: the pass mutates in place, so a fresh field keeps every
    // iteration the same worst-case work (and defeats any accidental caching).
    fillDarkNoisy(data, width, height);
    const t0 = performance.now();
    denoiseChroma(data, width, height, params);
    const t1 = performance.now();
    if (run > 0) samples.push(t1 - t0); // drop warmup
  }

  const med = median(samples);
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const mpPerSec = pixels / 1_000_000 / (med / 1000);
  console.log(
    `${label.padEnd(26)}  median ${med.toFixed(1).padStart(7)} ms   ` +
      `min ${min.toFixed(1).padStart(7)} ms   max ${max.toFixed(1).padStart(7)} ms   ` +
      `(${mpPerSec.toFixed(1)} MP/s)`,
  );
}

function main(): void {
  console.log("chroma-denoise JS pass benchmark — reference desktop");
  console.log(`Node ${process.version} · ${process.platform}/${process.arch}`);
  console.log(`params: ${JSON.stringify(DEFAULT_CHROMA_PARAMS)} · iterations: ${ITERATIONS} (1 warmup dropped)\n`);

  for (const size of SIZES) {
    benchSize(size, DEFAULT_CHROMA_PARAMS);
  }

  // Sanity: the size guard rejects > 12 MP before allocating.
  const over = MAX_CHROMA_POSTPASS_PIXELS + 1;
  let guarded = false;
  try {
    denoiseChroma(new Uint8ClampedArray(over * 4), over, 1);
  } catch {
    guarded = true;
  }
  console.log(`\nsize guard (> 12 MP rejected): ${guarded ? "OK" : "FAIL"}`);
  console.log("\nGO gate: ~12 MP median ≤ 2000 ms.");
}

main();
