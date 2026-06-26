/**
 * Phase-1 real-Bread A/B driver (chroma-postpass-enable, closes S-11 F3).
 *
 * For each input night JPG: call the pinned Bread model directly via the Replicate
 * API (no local stack / tunnel needed), save the real Bread output, run the REAL
 * `denoiseChroma` post-pass on it, and print objective metrics (maxΔY luminance
 * safety, shadow chroma-noise reduction, highlight leak). The decisive VISUAL
 * judgment (chroma reduction / no bleeding / no luminance softening) is then done
 * by loading the saved `*-bread.*` into `ab-harness/index.html`.
 *
 * Bread returns PNG (RGB); inputs may be JPG. Both are sniffed by magic bytes.
 * A `*-bread.*` already present is reused (no re-spend on Replicate credit).
 *
 * Usage (from repo root):
 *   npm i --no-save jpeg-js pngjs
 *   REPLICATE_API_TOKEN=$(grep '^REPLICATE_API_TOKEN=' supabase/functions/.env | cut -d= -f2-) \
 *     npx tsx context/changes/chroma-postpass-enable/bread-ab.ts <out-dir> <img1.jpg> [img2.jpg ...]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { decode as jpegDecode } from "jpeg-js";
import { PNG } from "pngjs";
import { denoiseChroma, DEFAULT_CHROMA_PARAMS } from "../../../src/lib/engines/chroma-denoise.ts";
import { BREAD_VERSION, BREAD_GAMMA, BREAD_STRENGTH } from "../../../src/lib/services/bread.ts";

const TOKEN = process.env.REPLICATE_API_TOKEN;
if (!TOKEN) throw new Error("REPLICATE_API_TOKEN env is required (read it from supabase/functions/.env).");

const [outDir, ...inputs] = process.argv.slice(2);
if (!outDir || inputs.length === 0) throw new Error("usage: bread-ab.ts <out-dir> <img1.jpg> [img2.jpg ...]");

const isPng = (b: Buffer) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
function decodeAny(buf: Buffer): { width: number; height: number; data: Uint8Array } {
  if (isPng(buf)) {
    const p = PNG.sync.read(buf); // always RGBA
    return { width: p.width, height: p.height, data: p.data };
  }
  const d = jpegDecode(buf, { formatAsRGBA: true, maxMemoryUsageInMB: 2048 });
  return { width: d.width, height: d.height, data: d.data };
}

const yOf = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const cbOf = (r: number, g: number, b: number) => -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
const crOf = (r: number, g: number, b: number) => 0.5 * r - 0.418688 * g - 0.081312 * b + 128;
const std = (xs: number[]) => {
  if (!xs.length) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

type ChromaBandStats = {
  label: string;
  minY: number;
  maxY: number;
  deltaSum: number;
  n: number;
  cbBefore: number[];
  crBefore: number[];
  cbAfter: number[];
  crAfter: number[];
};

function createBand(label: string, minY: number, maxY: number): ChromaBandStats {
  return {
    label,
    minY,
    maxY,
    deltaSum: 0,
    n: 0,
    cbBefore: [],
    crBefore: [],
    cbAfter: [],
    crAfter: [],
  };
}

function bandSummary(band: ChromaBandStats, totalPixels: number) {
  const cbRed = band.cbBefore.length ? (1 - std(band.cbAfter) / (std(band.cbBefore) || 1)) * 100 : 0;
  const crRed = band.crBefore.length ? (1 - std(band.crAfter) / (std(band.crBefore) || 1)) * 100 : 0;
  return {
    pixelPct: (100 * band.n) / totalPixels,
    cbRed,
    crRed,
    meanDelta: band.n ? band.deltaSum / band.n : 0,
  };
}

// Retry on HTTP 429, honoring Replicate's `retry-after` (low credit → ~1 req/min burst).
async function fetchRetry(url: string, opts: RequestInit, tries = 6): Promise<Response> {
  for (let i = 0; ; i++) {
    const res = await fetch(url, opts);
    if (res.status !== 429 || i >= tries) return res;
    const ra = Number(res.headers.get("retry-after")) || 6;
    console.log(`   429 throttled — retrying in ${ra + 1}s (${i + 1}/${tries})`);
    await new Promise((r) => setTimeout(r, (ra + 1) * 1000));
  }
}

async function breadPredict(dataUri: string): Promise<string> {
  const create = await fetchRetry("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      version: BREAD_VERSION,
      input: { image: dataUri, gamma: BREAD_GAMMA, strength: BREAD_STRENGTH },
    }),
  });
  if (!create.ok) throw new Error(`predictions.create ${create.status}: ${await create.text()}`);
  let pred = (await create.json()) as { id: string; status: string; output?: unknown; error?: unknown };
  const t0 = Date.now();
  while (!["succeeded", "failed", "canceled"].includes(pred.status)) {
    if (Date.now() - t0 > 600_000) throw new Error(`timeout waiting for prediction ${pred.id}`);
    await new Promise((r) => setTimeout(r, 3000));
    const poll = await fetchRetry(`https://api.replicate.com/v1/predictions/${pred.id}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    pred = (await poll.json()) as typeof pred;
  }
  if (pred.status !== "succeeded") throw new Error(`prediction ${pred.status}: ${JSON.stringify(pred.error)}`);
  const out = pred.output;
  const url = Array.isArray(out) ? String(out[0]) : String(out);
  if (!url.startsWith("http")) throw new Error(`unexpected output: ${JSON.stringify(out)}`);
  return url;
}

for (const inPath of inputs) {
  const name = inPath.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
  console.log(`\n>> ${name}`);
  let breadBuf: Buffer;
  const existingPng = `${outDir}/${name}-bread.png`;
  const existingJpg = `${outDir}/${name}-bread.jpg`;
  if (existsSync(existingPng)) {
    breadBuf = readFileSync(existingPng);
    console.log(`   reused ${existingPng} (no Replicate call)`);
  } else if (existsSync(existingJpg)) {
    breadBuf = readFileSync(existingJpg);
    console.log(`   reused ${existingJpg} (no Replicate call)`);
  } else {
    const srcB64 = readFileSync(inPath).toString("base64");
    const outUrl = await breadPredict(`data:image/jpeg;base64,${srcB64}`);
    breadBuf = Buffer.from(await (await fetch(outUrl)).arrayBuffer());
    const ext = isPng(breadBuf) ? "png" : "jpg";
    writeFileSync(`${outDir}/${name}-bread.${ext}`, breadBuf);
    console.log(`   bread output saved: ${name}-bread.${ext}`);
  }

  const dec = decodeAny(breadBuf);
  const mp = (dec.width * dec.height) / 1e6;
  const before = new Uint8ClampedArray(dec.data.length);
  before.set(dec.data);
  const after = new Uint8ClampedArray(dec.data.length);
  after.set(dec.data);
  denoiseChroma(after, dec.width, dec.height, DEFAULT_CHROMA_PARAMS);

  let maxDY = 0,
    hiLeak = 0;
  const bands = [
    createBand("deep shadows (Y<64)", Number.NEGATIVE_INFINITY, 64),
    createBand("mid shadows (Y 64-128)", 64, 128),
  ];
  for (let i = 0; i < before.length; i += 4) {
    const yB = yOf(before[i], before[i + 1], before[i + 2]);
    const yA = yOf(after[i], after[i + 1], after[i + 2]);
    maxDY = Math.max(maxDY, Math.abs(yB - yA));
    const dC =
      Math.abs(cbOf(after[i], after[i + 1], after[i + 2]) - cbOf(before[i], before[i + 1], before[i + 2])) +
      Math.abs(crOf(after[i], after[i + 1], after[i + 2]) - crOf(before[i], before[i + 1], before[i + 2]));
    for (const band of bands) {
      if (yB >= band.minY && yB < band.maxY) {
        band.cbBefore.push(cbOf(before[i], before[i + 1], before[i + 2]));
        band.crBefore.push(crOf(before[i], before[i + 1], before[i + 2]));
        band.cbAfter.push(cbOf(after[i], after[i + 1], after[i + 2]));
        band.crAfter.push(crOf(after[i], after[i + 1], after[i + 2]));
        band.deltaSum += dC;
        band.n++;
      }
    }
    if (yB > 200) hiLeak = Math.max(hiLeak, dC);
  }
  const totalPixels = before.length / 4;

  // Write the post-pass result as PNG for reference (force opaque first).
  const op = new Uint8Array(after.length);
  op.set(after);
  for (let i = 3; i < op.length; i += 4) op[i] = 255;
  const png = new PNG({ width: dec.width, height: dec.height });
  png.data = Buffer.from(op.buffer, op.byteOffset, op.length);
  writeFileSync(`${outDir}/${name}-postpass.png`, PNG.sync.write(png));

  console.log(`   size: ${dec.width}x${dec.height} (${mp.toFixed(2)} MP)`);
  console.log(`   maxDeltaY (luminance safety, want ~0): ${maxDY.toFixed(2)}`);
  for (const band of bands) {
    const summary = bandSummary(band, totalPixels);
    console.log(
      `   ${band.label}: ${summary.pixelPct.toFixed(1)}% px; chroma stddev reduction Cb ${summary.cbRed.toFixed(1)}%  Cr ${summary.crRed.toFixed(1)}%; mean |dChroma| ${summary.meanDelta.toFixed(2)}`,
    );
  }
  console.log(`   highlight leak (Y>200, want ~0): ${hiLeak.toFixed(2)}`);
}
console.log(
  "\nDone. Visual: open ab-harness/index.html, load each *-bread.png, inspect diff + 100% loupe over flat shadows.",
);
