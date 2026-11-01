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
 *   nafnet-curve, blur-curve  Phase 4; refused until that phase defines the curve.
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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

import sharp from "sharp";

import { recommendParams } from "../../src/lib/engines/auto-params";
import { buildGammaLut } from "../../src/lib/engines/image-helpers";
import {
  PRIVATE,
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

const ARMS = ["local-equiv", "control", "nafnet-gamma", "nafnet-curve", "blur-curve"] as const;
type Arm = (typeof ARMS)[number];

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

function applyGamma(img: Rgb, gamma: number): Rgb {
  const lut = buildGammaLut(gamma);
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
): Promise<{ out: string; img: Rgb }> {
  if (arm === "nafnet-curve" || arm === "blur-curve")
    throw new Refused(`${arm} is defined in Phase 4 (only if exposure costs NAFNet its wins); no curve exists yet`);
  const rec = autoRecord(id, validation);
  const side = readSidecar(id);
  let input: string;
  let source: Source | undefined;
  let sigma = 0;
  const historical = ledger !== GATE_LEDGER;
  const gateInput = { path: repoPath(side.nafnet.path), sha256: side.nafnet.sha256 };
  let nafnetInput = gateInput;
  if (arm === "local-equiv") {
    input = repoPath(side.common.path);
    sigma = rec.local.blur;
  } else if (arm === "control") {
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
  if (arm === "nafnet-gamma") {
    const meta = await sharp(nafnetInput.path).metadata();
    if (img.width !== meta.width || img.height !== meta.height)
      throw new Refused(
        `${id}: NAFNet output ${String(img.width)}×${String(img.height)} ≠ its input ${String(meta.width)}×${String(meta.height)}`,
      );
  }
  img = applyGamma(gaussian(img, sigma), rec.local.gamma);
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
        `usage: local-arms.ts <${ARMS.join("|")}> <ids…>|--all [--compare-local] [--source <png>] [--attempts <jsonl>]`,
      );
      return 2;
    }
    args.ids = args.rest;
    const ids = guard(args);
    if (ids.length === 0) throw new Refused("no photos selected: name ids or pass --all");
    const source = args.opts.get("--source");
    if (source && (arm !== "nafnet-gamma" || ids.length !== 1))
      throw new Refused("--source needs nafnet-gamma and one id");
    if (source) guardPaths([source], args.validation); // the id guard says nothing about this path
    const nafnetConfigSha = sha256File(repoPath(args.opts.get("--nafnet-config") ?? "scripts/s19/configs/nafnet.json"));
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
