/**
 * S-04 Phase 0 — Bread de-risking spike (THROWAWAY).
 *
 * Hits the real Replicate `mingcv/bread` model to answer two unknowns BEFORE
 * the pipeline is built:
 *   1. Cold-start vs the ≤30s p95 budget (PRD Open Question #2).
 *   2. Does it accept a COLOR low-light JPG and return a usable COLOR result?
 *      (The API labels `image` "Grayscale input image" — verify.)
 *
 * Run it (needs your own Replicate token; this makes a real, ~$0.0006 paid call):
 *   REPLICATE_API_TOKEN=r8_... npx tsx scripts/spikes/bread-spike.ts [imageUrl]
 *
 * Run it TWICE to compare cold (idle model boot) vs warm:
 *   - first run after the model has been idle ≈ cold-start
 *   - immediately again ≈ warm (~3s per the model card)
 *
 * Record the numbers in context/changes/cloud-ai-realtime-result/spike-findings.md.
 * Raw `fetch` only — no dependency added for a throwaway.
 *
 * S-17 reuse — a direct model call that bypasses the app, its DB and the daily cap:
 *   REPLICATE_API_TOKEN=r8_... GAMMA=1.0 STRENGTH=0.05 \
 *     npx tsx scripts/spikes/bread-spike.ts test-photos/private/<file>.jpg
 *   - A LOCAL path (anything not http(s)) of at most DATA_URI_MAX_BYTES (1 MB) is
 *     sent inline as a data URI — the path the `04e57d16` byte-identity calibration
 *     used. A larger file goes through Replicate's file-upload API (up to 100 MB)
 *     and the returned URL is passed as `image`; Replicate recommends data URIs only
 *     below 1 MB. A failed upload exits non-zero naming the file and the HTTP
 *     status — it never falls back to a data URI. The transport is printed as
 *     `transport   : data-uri | upload | url`.
 *   - On success the output's RAW bytes are saved to OUT_DIR (default: the OS temp
 *     dir, `lumina-bread-direct/`) with their sha256 — never inside the repo — plus a
 *     `.json` sidecar recording the run (version, parameters, input sha256,
 *     transport, prediction id, output sha256).
 *   - Same pinned version and input shape as production (`src/lib/services/bread.ts`),
 *     but this is the model alone: no upload, no post-pass, no job row.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";

// Pinned version (research §External). Lock/confirm this in spike-findings.md.
const BREAD_VERSION = "057a4e073829a8c50f2622206f71a8ed25331cd07a520bc264469389c7c11e54";

// A public low-light COLOR photo. Swap via argv[2] for a representative test shot.
const DEFAULT_IMAGE_URL =
  "https://replicate.delivery/pbxt/KWDkejqLfER3jrroDTUsSvBWFaHtapPxfg4xxZIqYmfh3zXm/Screenshot%202024-02-28%20at%2022.14.00.png";

const API = "https://api.replicate.com/v1/predictions";
const FILES_API = "https://api.replicate.com/v1/files";

/** Above this size a local input is uploaded rather than inlined (Replicate: data URIs < 1 MB). */
const DATA_URI_MAX_BYTES = 1_000_000;

type Transport = "data-uri" | "upload" | "url";

interface ImageInput {
  /** What is passed to the model as `image`. */
  image: string;
  transport: Transport;
  /** sha256 of the local file; null for a remote URL. */
  inputSha256: string | null;
  /** Replicate file id to delete after the run; set only for `upload`. */
  uploadedFileId: string | null;
}

async function main(): Promise<void> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    console.error("Set REPLICATE_API_TOKEN (your Replicate API token) and re-run.");
    process.exit(1);
  }
  // An http(s) arg is passed through; any other arg is a local file (data URI or upload).
  const args = process.argv.slice(2);
  const remote = args.find((a) => /^https?:\/\//.test(a));
  const localPath = remote ? undefined : args.find((a) => !a.startsWith("-"));
  const input = localPath
    ? await localInput(localPath, token)
    : { image: remote ?? DEFAULT_IMAGE_URL, transport: "url" as const, inputSha256: null, uploadedFileId: null };
  const imageLabel = localPath ?? input.image;
  // Tune without editing code: GAMMA (≤1.5 brighten) / STRENGTH (≤0.2 denoise).
  const gamma = Number(process.env.GAMMA ?? "1.5");
  const strength = Number(process.env.STRENGTH ?? "0.05");
  console.log(
    `Bread spike → version ${BREAD_VERSION.slice(0, 12)}…  gamma=${gamma} strength=${strength}  image: ${imageLabel}`,
  );
  console.log(`transport   : ${input.transport}${input.uploadedFileId ? ` (file ${input.uploadedFileId})` : ""}`);
  if (input.inputSha256) console.log(`input sha256: ${input.inputSha256}`);

  const wallStart = Date.now();

  // Create the prediction (Bread inputs: gamma ≤ 1.5 brighten, strength ≤ 0.2 denoise).
  const createRes = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      version: BREAD_VERSION,
      input: { image: input.image, gamma, strength },
    }),
  });
  if (!createRes.ok) {
    console.error(`create failed: ${createRes.status} ${await createRes.text()}`);
    await deleteUpload(input, token);
    process.exit(1);
  }
  let prediction = (await createRes.json()) as ReplicatePrediction;
  console.log(`created prediction ${prediction.id} (status: ${prediction.status})`);

  // Poll the prediction's own URL until terminal.
  const getUrl = prediction.urls?.get ?? `${API}/${prediction.id}`;
  while (prediction.status !== "succeeded" && prediction.status !== "failed" && prediction.status !== "canceled") {
    await new Promise((r) => setTimeout(r, 1000));
    const poll = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
    prediction = (await poll.json()) as ReplicatePrediction;
  }

  const wallMs = Date.now() - wallStart;
  const created = prediction.created_at ? Date.parse(prediction.created_at) : null;
  const started = prediction.started_at ? Date.parse(prediction.started_at) : null;
  const completed = prediction.completed_at ? Date.parse(prediction.completed_at) : null;
  const queueMs = created !== null && started !== null ? started - created : null; // ≈ cold-start / boot wait
  const predictMs = started !== null && completed !== null ? completed - started : null; // ≈ inference

  console.log("──────────── RESULT ────────────");
  console.log(`status      : ${prediction.status}`);
  console.log(`output      : ${JSON.stringify(prediction.output)}`); // Bread → a single URI string
  if (prediction.error) console.log(`error       : ${prediction.error}`);
  console.log(`wall-clock  : ${(wallMs / 1000).toFixed(1)}s  (client perceived, incl. polling)`);
  if (queueMs !== null) console.log(`queue/boot  : ${(queueMs / 1000).toFixed(1)}s  (created→started ≈ cold-start)`);
  if (predictMs !== null) console.log(`predict     : ${(predictMs / 1000).toFixed(1)}s  (started→completed)`);
  if (prediction.metrics?.predict_time)
    console.log(`predict_time: ${prediction.metrics.predict_time}s (Replicate metric)`);
  console.log("────────────────────────────────");
  await deleteUpload(input, token);
  if (prediction.status === "succeeded" && typeof prediction.output === "string") {
    await saveOutput(prediction.output, prediction, { gamma, strength, imageLabel, input });
  }
  console.log("→ Open the output URL: is it a usable COLOR enhanced image? Record warm/cold in spike-findings.md.");
}

function mimeOf(path: string): string {
  const ext = extname(path).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : null;
  if (!mime) {
    console.error(`unsupported input ${path}: use .jpg, .jpeg or .png`);
    process.exit(1);
  }
  return mime;
}

/** Inline a small local file; upload a larger one through the Files API. */
async function localInput(path: string, token: string): Promise<ImageInput> {
  const mime = mimeOf(path);
  const bytes = readFileSync(path);
  const inputSha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length <= DATA_URI_MAX_BYTES) {
    return {
      image: `data:${mime};base64,${bytes.toString("base64")}`,
      transport: "data-uri",
      inputSha256,
      uploadedFileId: null,
    };
  }
  const form = new FormData();
  form.append("content", new Blob([bytes], { type: mime }), basename(path));
  const res = await fetch(FILES_API, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  if (!res.ok) {
    // Never fall back to a data URI: a > 1 MB inline input is outside Replicate's guidance.
    console.error(
      `upload failed for ${path} (${(bytes.length / 1e6).toFixed(1)} MB): HTTP ${res.status} ${await res.text()}`,
    );
    process.exit(1);
  }
  const file = (await res.json()) as ReplicateFile;
  const url = file.urls?.get;
  if (!url) {
    console.error(`upload of ${path} returned no file URL (file ${file.id}); not running the model.`);
    process.exit(1);
  }
  return { image: url, transport: "upload", inputSha256, uploadedFileId: file.id };
}

/** Best effort: an uploaded input is not needed once the prediction is terminal. */
async function deleteUpload(input: ImageInput, token: string): Promise<void> {
  if (!input.uploadedFileId) return;
  const res = await fetch(`${FILES_API}/${input.uploadedFileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.warn(
      `warn: could not delete uploaded file ${input.uploadedFileId} (HTTP ${res.status}); it stays in your Replicate account until it expires.`,
    );
  }
}

interface RunInfo {
  gamma: number;
  strength: number;
  imageLabel: string;
  input: ImageInput;
}

async function saveOutput(url: string, prediction: ReplicatePrediction, run: RunInfo): Promise<void> {
  const { id } = prediction;
  const { gamma, strength } = run;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`output download failed: ${res.status} ${url}`);
    return;
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  const dir = process.env.OUT_DIR ?? join(tmpdir(), "lumina-bread-direct");
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, `${id.slice(0, 8)}-g${gamma}-s${strength}${extname(new URL(url).pathname) || ".png"}`);
  writeFileSync(dest, bytes);
  const outputSha256 = createHash("sha256").update(bytes).digest("hex");
  console.log(`saved       : ${dest}  (${(bytes.length / 1024).toFixed(1)} KB)`);
  console.log(`sha256      : ${outputSha256}`);
  const sidecar = {
    prediction_id: id,
    version: BREAD_VERSION,
    gamma,
    strength,
    input: run.imageLabel.startsWith("data:") ? "(data URI)" : run.imageLabel,
    input_sha256: run.input.inputSha256,
    transport: run.input.transport,
    output_file: dest,
    output_sha256: outputSha256,
    predict_time_s: prediction.metrics?.predict_time ?? null,
    completed_at: prediction.completed_at ?? null,
  };
  writeFileSync(`${dest}.json`, `${JSON.stringify(sidecar, null, 2)}\n`);
  console.log(`run record  : ${dest}.json`);
}

interface ReplicateFile {
  id: string;
  urls?: { get?: string };
}

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: unknown;
  error: string | null;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  urls?: { get?: string };
  metrics?: { predict_time?: number };
}

void main();
