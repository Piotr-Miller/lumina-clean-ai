/**
 * S-19 free (non-paid) arms (plan Phase 1, item 2). Gamma comes from the app's own
 * `buildGammaLut` and the Auto values from the app's own `recommendParams`, never
 * re-implemented.
 *
 *   npx tsx scripts/s19/local-arms.ts <arm> <ids…> | --all  [--compare-local] [--source <png>]
 *       [--attempts <ledger.jsonl> --nafnet-config <config.json>]
 *
 * Arms (output: test-photos/private/s19/arms/<arm>/<id>.png plus <id>.json with parameters):
 *   local-equiv   common input → Gaussian blur σ = Auto blur px → Local gamma. An approximation
 *                 of Local for controls only; it never occupies the real-Local reference slot.
 *   control       NAFNet input (the shared downscale) → Local gamma, no denoise: NAFNet's control.
 *   nafnet-gamma  NAFNet output → Local gamma. The output is the first valid slot-1 result of the
 *                 NAFNet config whose hash `--nafnet-config` gives (default configs/nafnet.json)
 *                 for this photo's NAFNet input in attempts.jsonl, its file verified against the
 *                 ledger's output hash; the <id>.json record names that source so tally can tie
 *                 the rated file to the slot. --source (one id only, dimensions equal to the
 *                 NAFNet input) is recorded as a `file` source and cannot be rated in a gate.
 *   nafnet-curve  NAFNet output (as nafnet-gamma) → the Phase 4 exposure curve instead of gamma.
 *   blur-curve    common input → Gaussian blur σ = Auto blur px → the curve: Local's own denoising
 *                 with the curve, no NAFNet.
 *   control-curve NAFNet input → the curve, no denoise: nafnet-curve's matched control (same
 *                 input, Auto record and curve; owner decision 2026-11-02).
 *
 * S-20 step 1a (`cloud-classical-denoise`, plan Phase 1): one decode, then two arms that differ
 * only by the denoiser. Tuning photos only; every path passes the holdout path guard before it is
 * read.
 *   decoded       common input → sharp's raw sRGB RGB → lossless PNG with no ICC and no metadata,
 *                 test-photos/private/s20/decoded/<id>.png. Its record binds the common input's
 *                 hash to `pixels_sha256`, the sha256 of the raw RGB bytes, so every later step
 *                 starts from the same pixels whatever decoder it uses.
 *   control-full  the decoded PNG, verified against `pixels_sha256` → Local gamma, σ = 0, at full
 *                 resolution: nlm-gamma's matched control (the S-19 `control` starts from the
 *                 NAFNet input, downscaled on 5 of 8 tuning photos).
 *   nlm-gamma     --nlm-k <k>: nlm.py's render test-photos/private/s20/nlm/k<k>/<id>.png → Local
 *                 gamma. Its record must name this photo's decoded pixels, and the output's hash
 *                 and dimensions must match. Output arms/nlm-gamma/k<k>/<id>.png.
 *   wavelet-gamma --wavelet-k <k> (step 1b, plan Phase 9): nlm-gamma's path for wavelet.py's render
 *                 test-photos/private/s20/wavelet/k<k>/<id>.png, with the same checks. Output
 *                 arms/wavelet-gamma/k<k>/<id>.png.
 * The matched arms record `decoded_pixels_sha256`, `auto_file_sha256` (the Auto record file) and
 * `lut_sha256` (the 256-byte LUT), so a pair check can prove the two differ only by the denoiser.
 *
 * The curve (curve.ts) is Local's Auto gamma with a limited lift in dark tones and highlights, a
 * pure function of the Auto record's LumaStats and the constants in --curve-config (default
 * configs/curve.json); the record names that config's hash.
 *
 * --attempts (control and nafnet-gamma, tuning only) reads the NAFNet slot from another ledger:
 * Phase 2's historical index (`evaluations/phase2-attempts.jsonl`, written by historical.py),
 * whose reserve rows name the file the spike actually sent (`input_path`). Both arms then start
 * from that slot's input, verified against the ledger's hash, instead of the prepared NAFNet
 * input, and write under arms/<ledger name>/<arm>/ so a gate arm is never overwritten. The record
 * names the ledger; tally's gate modes still accept only the gate ledger's own outputs.
 *
 * Before rendering, every arm reads the full-precision Auto record for the photo's COMMON input
 * (`local/<id>.auto.json` from baseline.ts), checks its input hash against the prepared file and
 * recomputes `recommendParams` from its saved stats; a missing or mismatched record stops.
 *
 * --compare-local (local-equiv only) reports how far the approximation is from the real Local
 * download `local/<id>.jpg`: mean and 99th-percentile absolute difference per channel (0–255),
 * so the approximation is measured, not assumed.
 *
 * Decoding and encoding use sharp (bundled with Astro); the blur is our own separable Gaussian,
 * because sharp's blur refuses σ < 0.3 and Auto picks 0.05–0.7. Exit status: 0 rendered (and
 * measured); 1 refused or a check failed; 2 usage.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

import sharp from "sharp";

import { recommendParams } from "../../src/lib/engines/auto-params";
import { buildGammaLut } from "../../src/lib/engines/image-helpers";
import { buildCurveLut, type CurveConfig } from "./curve";
import {
  PRIVATE,
  PRIVATE_S20,
  REPO,
  Refused,
  guard,
  guardPaths,
  parseCommon,
  readSidecar,
  repoPath,
  sha256File,
  type AutoRecord,
} from "./s19";

const ARMS = [
  "local-equiv",
  "control",
  "nafnet-gamma",
  "nafnet-curve",
  "blur-curve",
  "control-curve",
  "decoded",
  "control-full",
  "nlm-gamma",
  "wavelet-gamma",
] as const;
type Arm = (typeof ARMS)[number];
const S20_ARMS: readonly Arm[] = ["decoded", "control-full", "nlm-gamma", "wavelet-gamma"];

interface Rgb {
  data: Uint8Array;
  width: number;
  height: number;
}

async function decode(path: string): Promise<Rgb> {
  const { data, info } = await sharp(path)
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw new Refused(`${path}: decoded to ${String(info.channels)} channels, expected 3`);
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

/** Separable Gaussian, σ in px, edges clamped; σ < 0.01 is the identity. */
export function gaussian(img: Rgb, sigma: number): Rgb {
  if (sigma < 0.01) return img;
  const r = Math.ceil(3 * sigma);
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const { width: w, height: h, data } = img;
  const tmp = new Float32Array(data.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let i = -r; i <= r; i++) acc += k[i + r] * data[(y * w + Math.min(w - 1, Math.max(0, x + i))) * 3 + c];
        tmp[(y * w + x) * 3 + c] = acc;
      }
  const out = new Uint8Array(data.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let i = -r; i <= r; i++) acc += k[i + r] * tmp[(Math.min(h - 1, Math.max(0, y + i)) * w + x) * 3 + c];
        out[(y * w + x) * 3 + c] = Math.min(255, Math.max(0, Math.round(acc)));
      }
  return { data: out, width: w, height: h };
}

function applyLut(img: Rgb, lut: ArrayLike<number>): Rgb {
  const out = new Uint8Array(img.data.length);
  for (let i = 0; i < img.data.length; i++) out[i] = lut[img.data[i]];
  return { ...img, data: out };
}

function autoRecord(id: string, validation: boolean): AutoRecord {
  const path = join(PRIVATE, validation ? "validation-local" : "local", `${id}.auto.json`);
  if (!existsSync(path))
    throw new Refused(`${id}: no Auto record at ${path}; capture it with baseline.ts --serve before rendering any arm`);
  const rec = JSON.parse(readFileSync(path, "utf8")) as AutoRecord;
  const side = readSidecar(id);
  if (rec.common_sha256 !== side.common.sha256 || sha256File(repoPath(side.common.path)) !== side.common.sha256)
    throw new Refused(`${id}: the Auto record's input hash does not match the prepared common file`);
  const again = recommendParams(rec.stats, "local");
  if (again.gamma !== rec.local.gamma || again.blur !== rec.local.blur)
    throw new Refused(`${id}: recomputed Auto ${JSON.stringify(again)} ≠ recorded ${JSON.stringify(rec.local)}`);
  return rec;
}

interface LedgerRow {
  event: string;
  attempt_id: string;
  status?: string;
  config_sha256?: string;
  config_name?: string;
  input_sha256?: string;
  input_path?: string;
  photo?: string;
  slot?: number;
  ordinal?: number;
  output_path?: string;
  output_sha256?: string;
}

interface Source {
  kind: "ledger" | "file";
  path: string;
  output_sha256: string;
  config_sha256?: string;
  attempt_id?: string;
  ledger?: string;
}

/** The gate ledger every paid runner writes; anything else is a historical index. */
const GATE_LEDGER = join(PRIVATE, "attempts.jsonl");

interface NafnetSlot {
  source: Source;
  input: { path: string; sha256: string };
}

/** The first valid slot-1 result of exactly this NAFNet config (by hash, never by name), with its
 * file verified against the hash the ledger recorded. In the gate ledger the slot must be for the
 * prepared NAFNet input (`gateInput`); a historical ledger names its input file, which is verified
 * against the recorded hash and becomes the arm's input. */
function nafnetSlot(
  id: string,
  configSha: string,
  path: string,
  gateInput?: { path: string; sha256: string },
): NafnetSlot {
  if (!existsSync(path))
    throw new Refused(`${id}: no attempts ledger at ${path}; run NAFNet (Phase 3) or pass --source`);
  const rows = readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as LedgerRow);
  const reserves = rows
    .filter((r) => r.event === "reserve" && r.config_sha256 === configSha && r.photo === id && r.slot === 1)
    .filter((r) => !gateInput || r.input_sha256 === gateInput.sha256)
    .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
  const results = new Map(rows.filter((r) => r.event === "result").map((r) => [r.attempt_id, r]));
  const reserve = reserves.find((r) => results.get(r.attempt_id)?.status === "ok");
  const ok = reserve && results.get(reserve.attempt_id);
  if (!reserve || !ok?.output_path || !ok.output_sha256)
    throw new Refused(
      `${id}: no valid slot-1 result of NAFNet config ${configSha.slice(0, 12)}… in ${path}` +
        (gateInput ? ` for input ${gateInput.sha256.slice(0, 12)}…` : ""),
    );
  const file = repoPath(ok.output_path);
  if (!existsSync(file) || sha256File(file) !== ok.output_sha256)
    throw new Refused(`${id}: ${ok.output_path} is missing or no longer the output the ledger recorded`);
  let input = gateInput;
  if (!input) {
    if (!reserve.input_path || !reserve.input_sha256)
      throw new Refused(`${id}: ${path} does not name the slot's input file (input_path); not a historical index`);
    const inputFile = repoPath(reserve.input_path);
    if (!existsSync(inputFile) || sha256File(inputFile) !== reserve.input_sha256)
      throw new Refused(`${id}: ${reserve.input_path} is missing or no longer the input the ledger recorded`);
    input = { path: inputFile, sha256: reserve.input_sha256 };
  }
  return {
    source: {
      kind: "ledger",
      path: file,
      output_sha256: ok.output_sha256,
      config_sha256: configSha,
      attempt_id: ok.attempt_id,
      ...(gateInput ? {} : { ledger: path }),
    },
    input,
  };
}

async function render(
  arm: Arm,
  id: string,
  validation: boolean,
  nafnetConfigSha: string,
  sourceFile?: string,
  ledger: string = GATE_LEDGER,
  curveConfig?: { cfg: CurveConfig; sha256: string },
): Promise<{ out: string; img: Rgb }> {
  const curved = arm.endsWith("-curve");
  if (curved && !curveConfig) throw new Refused(`${arm} needs a curve config`);
  const rec = autoRecord(id, validation);
  const side = readSidecar(id);
  let input: string;
  let source: Source | undefined;
  let sigma = 0;
  const historical = ledger !== GATE_LEDGER;
  const gateInput = { path: repoPath(side.nafnet.path), sha256: side.nafnet.sha256 };
  let nafnetInput = gateInput;
  if (arm === "local-equiv" || arm === "blur-curve") {
    input = repoPath(side.common.path);
    sigma = rec.local.blur;
  } else if (arm === "control" || arm === "control-curve") {
    if (historical) nafnetInput = nafnetSlot(id, nafnetConfigSha, ledger).input;
    else if (sha256File(gateInput.path) !== gateInput.sha256)
      throw new Refused(`${id}: NAFNet input differs from its sidecar`);
    input = nafnetInput.path;
  } else {
    if (sourceFile) source = { kind: "file", path: sourceFile, output_sha256: sha256File(sourceFile) };
    else {
      const slot = nafnetSlot(id, nafnetConfigSha, ledger, historical ? undefined : gateInput);
      source = slot.source;
      nafnetInput = slot.input;
    }
    input = source.path;
  }
  let img = await decode(input);
  if (arm === "nafnet-gamma" || arm === "nafnet-curve") {
    const meta = await sharp(nafnetInput.path).metadata();
    if (img.width !== meta.width || img.height !== meta.height)
      throw new Refused(
        `${id}: NAFNet output ${String(img.width)}×${String(img.height)} ≠ its input ${String(meta.width)}×${String(meta.height)}`,
      );
  }
  const lut =
    curved && curveConfig ? buildCurveLut(rec.local.gamma, rec.stats, curveConfig.cfg) : buildGammaLut(rec.local.gamma);
  img = applyLut(gaussian(img, sigma), lut);
  const dir = historical ? join(PRIVATE, "arms", basename(ledger, ".jsonl"), arm) : join(PRIVATE, "arms", arm);
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${id}.png`);
  await sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 3 } })
    .png()
    .toFile(out);
  writeFileSync(
    join(dir, `${id}.json`),
    `${JSON.stringify(
      {
        arm,
        id,
        input,
        input_sha256: sha256File(input),
        // nafnet-gamma only: the paid output this file was made from. `ledger` is the slot's
        // verified first valid result and may be rated in a gate; `file` (--source) may not.
        source: source ? { ...source, path: undefined, ledger: source.ledger && relative(REPO, source.ledger) } : null,
        auto_record: { common_sha256: rec.common_sha256, session_id: rec.session_id, provenance: "recomputed" },
        gamma: rec.local.gamma,
        tone:
          curved && curveConfig
            ? { kind: "curve", config_sha256: curveConfig.sha256, ...curveConfig.cfg }
            : { kind: "gamma" },
        blur_sigma_px: sigma,
        output_sha256: sha256File(out),
        dimensions: [img.width, img.height],
        implementation_sha256: sha256File(import.meta.filename),
        rendered_at: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  return { out, img };
}

// ---------------------------------------------------------------- S-20 step 1a: shared decode, matched arms

/** Written by the `decoded` arm as test-photos/private/s20/decoded/<id>.json. */
interface DecodedRecord {
  kind: "decoded";
  id: string;
  common: { path: string; sha256: string };
  common_sha256: string;
  pixels_sha256: string;
  output_sha256: string;
  dimensions: [number, number];
  decoder: { sharp: string; vips: string };
  implementation_sha256: string;
  rendered_at: string;
}

/** The fields of an nlm.py record (plan Phase 2) or a wavelet.py record (plan Phase 10) that the
 * denoised arm binds to. */
interface DenoiserRecord {
  id: string;
  k: number;
  decoded_record?: string;
  decoded_pixels_sha256: string;
  output_sha256: string;
  dimensions: [number, number];
  config_sha256: string;
}

/** A record parsed from disk: any field may be absent or null until it is checked. */
type Untrusted<T> = { [K in keyof T]?: T[K] | null };

function sha256Bytes(bytes: Uint8Array | Uint8ClampedArray): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Repo-relative when inside the repository, so a record can be published without a home path. */
function rel(path: string): string {
  const r = relative(REPO, path);
  return r.startsWith("..") || isAbsolute(r) ? path : r;
}

/** The grid's k as the one-decimal string used in directory names (`k1.5`), shared with nlm.py and
 * wavelet.py. */
export function formatK(raw: string, flag: "--nlm-k" | "--wavelet-k"): string {
  const k = Number(raw);
  if (!/^\d+(\.\d+)?$/.test(raw) || !Number.isFinite(k) || k <= 0 || Number(k.toFixed(1)) !== k)
    throw new Refused(
      `${flag} ${raw}: expected a positive number with at most one decimal, one of the grid's k values`,
    );
  return k.toFixed(1);
}

const decodedPaths = (id: string) => ({
  png: join(PRIVATE_S20, "decoded", `${id}.png`),
  record: join(PRIVATE_S20, "decoded", `${id}.json`),
});
/** The arms that apply Local's Auto gamma to a denoiser's render: one code path, one descriptor each.
 * `dir` is the render's folder under test-photos/private/s20/ and `kind` the record's `source.kind`,
 * both as trials.py's rows name them (`raw_dir`, `source_kind`). */
const DENOISED = {
  "nlm-gamma": { flag: "--nlm-k", dir: "nlm", kind: "nlm", label: "NLM", tool: "nlm.py", a: "an" },
  "wavelet-gamma": {
    flag: "--wavelet-k",
    dir: "wavelet",
    kind: "wavelet",
    label: "wavelet",
    tool: "wavelet.py",
    a: "a",
  },
} as const;
type DenoisedArm = keyof typeof DENOISED;
const isDenoised = (arm: Arm): arm is DenoisedArm => arm in DENOISED;

const denoiserPaths = (arm: DenoisedArm, id: string, k: string) => ({
  png: join(PRIVATE_S20, DENOISED[arm].dir, `k${k}`, `${id}.png`),
  record: join(PRIVATE_S20, DENOISED[arm].dir, `k${k}`, `${id}.json`),
});
const sidecarPath = (id: string) => join(PRIVATE, "inputs", `${id}.json`);
const autoPath = (id: string) => join(PRIVATE, "local", `${id}.auto.json`);

function sameDims(a: readonly number[] | null | undefined, w: number, h: number): boolean {
  return Array.isArray(a) && a.length === 2 && a[0] === w && a[1] === h;
}

/** Keep only a PNG's critical chunks. libvips always writes `pHYs` (a DPI), and the S-20 files carry
 * no metadata at all; dropping whole ancillary chunks leaves every remaining CRC valid. */
export function stripPngMetadata(png: Buffer): Buffer {
  const signature = png.subarray(0, 8);
  if (!signature.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    throw new Refused("the encoder did not produce a PNG");
  const keep: Buffer[] = [signature];
  for (let i = 8; i < png.length;) {
    const end = i + 12 + png.readUInt32BE(i);
    if (end > png.length) throw new Refused("the encoder produced a truncated PNG chunk");
    const type = png.toString("latin1", i + 4, i + 8);
    if (["IHDR", "PLTE", "IDAT", "IEND"].includes(type)) keep.push(png.subarray(i, end));
    i = end;
  }
  return Buffer.concat(keep);
}

async function writePng(img: Rgb, out: string): Promise<void> {
  mkdirSync(join(out, ".."), { recursive: true });
  const png = await sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 3 } })
    .png()
    .toBuffer();
  writeFileSync(out, stripPngMetadata(png));
}

/** decoded: the one decode of the common input every S-20 step starts from. */
async function renderDecoded(id: string): Promise<string> {
  const out = decodedPaths(id);
  guardPaths([sidecarPath(id), out.png, out.record], false);
  const side = readSidecar(id);
  const common = repoPath(side.common.path);
  guardPaths([common], false);
  if (!existsSync(common) || sha256File(common) !== side.common.sha256)
    throw new Refused(
      `${id}: ${side.common.path} is missing or no longer the common file its sidecar names; run python3 scripts/s19/inputs.py --check ${id}`,
    );
  const img = await decode(common);
  if (!sameDims(side.common.dimensions, img.width, img.height))
    throw new Refused(
      `${id}: the common input decodes to ${String(img.width)}×${String(img.height)}, its sidecar says ${JSON.stringify(side.common.dimensions)}`,
    );
  const pixels = sha256Bytes(img.data);
  await writePng(img, out.png);
  const again = await decode(out.png);
  if (sha256Bytes(again.data) !== pixels)
    throw new Refused(
      `${id}: ${out.png} does not decode back to the pixels just written; the PNG round trip is not lossless`,
    );
  const record: DecodedRecord = {
    kind: "decoded",
    id,
    common: { path: rel(common), sha256: side.common.sha256 },
    common_sha256: side.common.sha256,
    pixels_sha256: pixels,
    output_sha256: sha256File(out.png),
    dimensions: [img.width, img.height],
    decoder: { sharp: sharp.versions.sharp, vips: sharp.versions.vips },
    implementation_sha256: sha256File(import.meta.filename),
    rendered_at: new Date().toISOString(),
  };
  writeFileSync(out.record, `${JSON.stringify(record, null, 2)}\n`);
  return out.png;
}

/** The shared decode of this photo, its PNG verified pixel by pixel against `pixels_sha256`. */
async function verifiedDecoded(id: string, commonSha: string): Promise<{ rec: DecodedRecord; img: Rgb }> {
  const p = decodedPaths(id);
  if (!existsSync(p.record) || !existsSync(p.png))
    throw new Refused(
      `${id}: no shared decode at ${p.record}; run npx tsx scripts/s19/local-arms.ts decoded ${id} first`,
    );
  const rec = JSON.parse(readFileSync(p.record, "utf8")) as Untrusted<DecodedRecord>;
  if (rec.kind !== "decoded" || rec.id !== id || rec.common_sha256 !== commonSha)
    throw new Refused(
      `${id}: ${p.record} is not the decode of this photo's current common input; re-run local-arms.ts decoded ${id}`,
    );
  const img = await decode(p.png);
  if (sha256Bytes(img.data) !== rec.pixels_sha256)
    throw new Refused(
      `${id}: ${p.png} no longer holds the pixels its record names (pixels_sha256); re-run local-arms.ts decoded ${id}`,
    );
  if (!sameDims(rec.dimensions, img.width, img.height))
    throw new Refused(
      `${id}: ${p.png} is ${String(img.width)}×${String(img.height)}, its record says ${JSON.stringify(rec.dimensions)}`,
    );
  return { rec: rec as DecodedRecord, img };
}

/** control-full and a denoised arm (nlm-gamma, wavelet-gamma): the same decoded pixels, Auto record and
 * LUT; only the denoiser differs. */
async function renderMatched(arm: "control-full" | DenoisedArm, id: string, k?: string): Promise<string> {
  const dec = decodedPaths(id);
  const d = arm === "control-full" ? undefined : DENOISED[arm];
  const den = d && k ? denoiserPaths(arm as DenoisedArm, id, k) : undefined;
  if (d && !den) throw new Refused(`${arm} needs ${d.flag} <k>`);
  const dir = den ? join(PRIVATE, "arms", arm, `k${String(k)}`) : join(PRIVATE, "arms", "control-full");
  const out = join(dir, `${id}.png`);
  const outRecord = join(dir, `${id}.json`);
  guardPaths(
    [sidecarPath(id), autoPath(id), dec.png, dec.record, ...(den ? [den.png, den.record] : []), out, outRecord],
    false,
  );
  const side = readSidecar(id);
  guardPaths([repoPath(side.common.path)], false); // autoRecord hashes it
  const rec = autoRecord(id, false);
  const autoFileSha = sha256File(autoPath(id));
  const decoded = await verifiedDecoded(id, side.common.sha256);
  let img = decoded.img;
  let input = dec.png;
  let source: Record<string, unknown> | null = null;
  if (den && d) {
    if (!existsSync(den.record) || !existsSync(den.png))
      throw new Refused(
        `${id}: no ${d.label} render at ${den.record}; run python3 scripts/s20/${d.tool} for k ${String(k)} first`,
      );
    const n = JSON.parse(readFileSync(den.record, "utf8")) as Untrusted<DenoiserRecord>;
    const missing = (
      ["id", "k", "decoded_pixels_sha256", "output_sha256", "dimensions", "config_sha256"] as const
    ).filter((f) => n[f] === undefined || n[f] === null);
    if (missing.length)
      throw new Refused(`${id}: ${den.record} is not ${d.a} ${d.tool} record (missing ${missing.join(", ")})`);
    if (n.id !== id || n.k !== Number(k))
      throw new Refused(
        `${id}: ${den.record} is for photo ${String(n.id)} at k ${String(n.k)}, not ${id} at k ${String(k)}`,
      );
    if (n.decoded_record && resolve(repoPath(n.decoded_record)) !== resolve(dec.record))
      throw new Refused(`${id}: ${den.record} names decoded record ${n.decoded_record}, not ${rel(dec.record)}`);
    if (n.decoded_pixels_sha256 !== decoded.rec.pixels_sha256)
      throw new Refused(
        `${id}: ${den.record} was rendered from other decoded pixels than ${rel(dec.record)} (decoded_pixels_sha256); re-render it with ${d.tool}`,
      );
    if (sha256File(den.png) !== n.output_sha256)
      throw new Refused(
        `${id}: ${den.png} is no longer the output its record names (output_sha256); re-render it with ${d.tool}`,
      );
    img = await decode(den.png);
    if (!sameDims(n.dimensions, img.width, img.height) || !sameDims(decoded.rec.dimensions, img.width, img.height))
      throw new Refused(
        `${id}: ${d.label} output ${String(img.width)}×${String(img.height)} (record ${JSON.stringify(n.dimensions)}) ≠ decoded ${JSON.stringify(decoded.rec.dimensions)}`,
      );
    input = den.png;
    source = {
      kind: d.kind,
      record: rel(den.record),
      record_sha256: sha256File(den.record),
      output_sha256: n.output_sha256,
      config_sha256: n.config_sha256,
      k: n.k,
    };
  }
  const lut = buildGammaLut(rec.local.gamma);
  img = applyLut(img, lut);
  await writePng(img, out);
  writeFileSync(
    outRecord,
    `${JSON.stringify(
      {
        arm,
        id,
        input: rel(input),
        input_sha256: sha256File(input),
        source,
        decoded_record: rel(dec.record),
        decoded_record_sha256: sha256File(dec.record),
        decoded_pixels_sha256: decoded.rec.pixels_sha256,
        auto_record: { common_sha256: rec.common_sha256, session_id: rec.session_id, provenance: "recomputed" },
        auto_file_sha256: autoFileSha,
        gamma: rec.local.gamma,
        tone: { kind: "gamma" },
        lut_sha256: sha256Bytes(lut),
        blur_sigma_px: 0,
        output_sha256: sha256File(out),
        dimensions: [img.width, img.height],
        implementation_sha256: sha256File(import.meta.filename),
        rendered_at: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  return out;
}

async function compareLocal(id: string, img: Rgb, validation: boolean): Promise<string> {
  const path = join(PRIVATE, validation ? "validation-local" : "local", `${id}.jpg`);
  if (!existsSync(path)) throw new Refused(`${id}: no real Local download at ${path}`);
  const real = await decode(path);
  if (real.width !== img.width || real.height !== img.height)
    throw new Refused(
      `${id}: real Local is ${String(real.width)}×${String(real.height)}, the approximation ${String(img.width)}×${String(img.height)}`,
    );
  const hist = new Float64Array(256);
  let sum = 0;
  for (let i = 0; i < img.data.length; i++) {
    const d = Math.abs(img.data[i] - real.data[i]);
    sum += d;
    hist[d]++;
  }
  let cum = 0;
  let p99 = 255;
  for (let d = 0; d < 256; d++) {
    cum += hist[d];
    if (cum >= 0.99 * img.data.length) {
      p99 = d;
      break;
    }
  }
  return `mean |Δ| ${(sum / img.data.length).toFixed(3)}, p99 |Δ| ${String(p99)} (0–255, all channels)`;
}

async function main(): Promise<number> {
  try {
    const args = parseCommon(process.argv.slice(2));
    const arm = args.rest.shift() as Arm | undefined;
    if (!arm || !ARMS.includes(arm)) {
      console.error(
        `usage: local-arms.ts <${ARMS.join("|")}> <ids…>|--all [--compare-local] [--source <png>] [--attempts <jsonl>] [--curve-config <json>] [--nlm-k <k>] [--wavelet-k <k>]`,
      );
      return 2;
    }
    args.ids = args.rest;
    const s20 = S20_ARMS.includes(arm);
    if (s20 && (args.validation || args.allValidation))
      throw new Refused(`${arm} is an S-20 step 1 arm: it covers the tuning photos only and has no validation mode`);
    for (const [owner, d] of Object.entries(DENOISED))
      if (args.opts.get(d.flag) !== undefined && arm !== owner) throw new Refused(`${d.flag} needs the ${owner} arm`);
    let k: string | undefined;
    if (isDenoised(arm)) {
      const { flag } = DENOISED[arm];
      const raw = args.opts.get(flag);
      if (raw === undefined) throw new Refused(`${arm} needs ${flag} <k>, one of the grid's k values`);
      k = formatK(raw, flag);
    }
    const ids = guard(args);
    if (ids.length === 0) throw new Refused("no photos selected: name ids or pass --all");
    if (s20) {
      let failed = 0;
      for (const id of ids) {
        try {
          const out =
            arm === "decoded"
              ? await renderDecoded(id)
              : await renderMatched(arm as "control-full" | DenoisedArm, id, k);
          console.log(`✓ ${id}: ${out}`);
        } catch (e) {
          if (!(e instanceof Refused)) throw e;
          console.log(`✗ ${e.message}`);
          failed++;
        }
      }
      return failed ? 1 : 0;
    }
    const source = args.opts.get("--source");
    if (source && (arm !== "nafnet-gamma" || ids.length !== 1))
      throw new Refused("--source needs nafnet-gamma and one id");
    if (source) guardPaths([source], args.validation); // the id guard says nothing about this path
    const nafnetConfigSha = sha256File(repoPath(args.opts.get("--nafnet-config") ?? "scripts/s19/configs/nafnet.json"));
    const curvePath = repoPath(args.opts.get("--curve-config") ?? "scripts/s19/configs/curve.json");
    const curveConfig = arm.endsWith("-curve")
      ? { cfg: JSON.parse(readFileSync(curvePath, "utf8")) as CurveConfig, sha256: sha256File(curvePath) }
      : undefined;
    const attempts = args.opts.get("--attempts");
    if (attempts) {
      if (arm !== "control" && arm !== "nafnet-gamma") throw new Refused("--attempts needs control or nafnet-gamma");
      if (source) throw new Refused("--attempts and --source name two different NAFNet sources");
      if (args.validation)
        throw new Refused("--attempts reads a historical tuning index; validation uses the gate ledger");
      guardPaths([attempts], args.validation);
    }
    const ledger = attempts ? repoPath(attempts) : GATE_LEDGER;
    const compare = args.flags.has("--compare-local");
    if (compare && arm !== "local-equiv") throw new Refused("--compare-local measures the local-equiv arm only");
    let failed = 0;
    for (const id of ids) {
      try {
        const { out, img } = await render(
          arm,
          id,
          args.validation,
          nafnetConfigSha,
          source ? repoPath(source) : undefined,
          ledger,
          curveConfig,
        );
        const measured = compare ? `; vs real Local: ${await compareLocal(id, img, args.validation)}` : "";
        console.log(`✓ ${id}: ${out}${measured}`);
      } catch (e) {
        if (!(e instanceof Refused)) throw e;
        console.log(`✗ ${e.message}`);
        failed++;
      }
    }
    return failed ? 1 : 0;
  } catch (e) {
    if (e instanceof Refused) {
      console.error(`refused: ${e.message}`);
      return 1;
    }
    throw e;
  }
}

void main().then((code) => process.exit(code));
