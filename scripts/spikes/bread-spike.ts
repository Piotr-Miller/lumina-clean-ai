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
 */

// Pinned version (research §External). Lock/confirm this in spike-findings.md.
const BREAD_VERSION = "057a4e073829a8c50f2622206f71a8ed25331cd07a520bc264469389c7c11e54";

// A public low-light COLOR photo. Swap via argv[2] for a representative test shot.
const DEFAULT_IMAGE_URL =
  "https://replicate.delivery/pbxt/KWDkejqLfER3jrroDTUsSvBWFaHtapPxfg4xxZIqYmfh3zXm/Screenshot%202024-02-28%20at%2022.14.00.png";

const API = "https://api.replicate.com/v1/predictions";

async function main(): Promise<void> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    console.error("Set REPLICATE_API_TOKEN (your Replicate API token) and re-run.");
    process.exit(1);
  }
  // Pick the first http(s) arg so a stray positional token doesn't become the image.
  const imageUrl = process.argv.slice(2).find((a) => /^https?:\/\//.test(a)) ?? DEFAULT_IMAGE_URL;
  // Tune without editing code: GAMMA (≤1.5 brighten) / STRENGTH (≤0.2 denoise).
  const gamma = Number(process.env.GAMMA ?? "1.5");
  const strength = Number(process.env.STRENGTH ?? "0.05");
  console.log(
    `Bread spike → version ${BREAD_VERSION.slice(0, 12)}…  gamma=${gamma} strength=${strength}  image: ${imageUrl}`,
  );

  const wallStart = Date.now();

  // Create the prediction (Bread inputs: gamma ≤ 1.5 brighten, strength ≤ 0.2 denoise).
  const createRes = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      version: BREAD_VERSION,
      input: { image: imageUrl, gamma, strength },
    }),
  });
  if (!createRes.ok) {
    console.error(`create failed: ${createRes.status} ${await createRes.text()}`);
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
  console.log("→ Open the output URL: is it a usable COLOR enhanced image? Record warm/cold in spike-findings.md.");
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
