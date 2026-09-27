/**
 * Serve the S-17 sampler to a visible desktop browser, using one local command:
 *
 *   npx tsx scripts/s17/desktop-stats.ts
 *
 * Open the printed URL in desktop Chrome and click Measure. The page uses the
 * app's compiled sampleImageLuma, with Blob → new Image() → onload for each
 * licensed tuning photo. The downloaded JSON is `{ meta, stats }`: `meta` holds
 * the user agent and the tab's visibility at the start and end of the run.
 *
 * Compare a download with the tuning baseline FIELD BY FIELD — never by file
 * hash, which differs for identical numbers whenever the formatting differs:
 *
 *   npx tsx scripts/s17/desktop-stats.ts --compare <download.json> [--baseline <file>]
 *
 * It prints every LumaStats field against the baseline (percentiles in 1/255
 * bins), each photo's clip-guard side (clipRatio > 0.005) and the Local and
 * Cloud Auto values from the app's recommendParams. Exit status:
 *   0  no Auto value changes at display precision and no clip-guard side changes;
 *   2  at least one does — refresh the baseline and recompute before tuning;
 *   1  the comparison could not run (missing file, unexpected shape).
 * The baseline's own SHA-256 is checked against BASELINE_SHA256 (recorded in the
 * plan) and a mismatch is reported, since it means the tuning source changed.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

import ts from "typescript";

import { recommendParams } from "../../src/lib/engines/auto-params";
import type { LumaStats } from "../../src/lib/engines/types";
import { HARNESS_DIR, REPO, readManifest } from "./harness";

/** The tuning baseline recorded in the plan (Phase 1 decision, 2026-09-27). */
const BASELINE = join(HARNESS_DIR, "desktop-chrome-154.stats.json");
const BASELINE_SHA256 = "088fc3f14df2b3662d1c739bf646a4160510ad85472738b65e63bbad3c7d5a40";
/** `recommendParams` caps gamma above this clipRatio — the guard S17-04 sits next to. */
const CLIP_GUARD = 0.005;
const FIELDS = [
  "mean",
  "p05",
  "p25",
  "p50",
  "p75",
  "p95",
  "p99",
  "shadowRatio",
  "highlightRatio",
  "clipRatio",
] as const;
const PERCENTILES = new Set<string>(["p05", "p25", "p50", "p75", "p95", "p99"]);

/** Accepts the `{ meta, stats }` download and the older bare `{ id: stats }` baseline. */
function readStats(path: string): Record<string, LumaStats> {
  if (!existsSync(path)) {
    console.error(`no such file: ${path}`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as { stats?: Record<string, LumaStats> } & Record<string, unknown>;
  return raw.stats ?? (raw as unknown as Record<string, LumaStats>);
}

function autoLine(s: LumaStats): string {
  const c = recommendParams(s, "cloud");
  const l = recommendParams(s, "local");
  return `cloud ${c.gamma.toFixed(2)}/${c.strength.toFixed(2)}  local ${l.gamma.toFixed(2)}/${l.blur.toFixed(1)}`;
}

function compare(downloadPath: string, baselinePath: string): never {
  const baselineHash = createHash("sha256").update(readFileSync(baselinePath)).digest("hex");
  if (baselinePath === BASELINE && baselineHash !== BASELINE_SHA256) {
    console.log(`⚠ baseline ${baselinePath} has sha256 ${baselineHash}, not the recorded ${BASELINE_SHA256}.`);
  }
  const base = readStats(baselinePath);
  const next = readStats(downloadPath);
  let changed = false;
  for (const { id } of entries) {
    const a = base[id];
    const b = next[id] as LumaStats | undefined;
    if (!b) {
      console.error(`${id}: missing from ${downloadPath}`);
      process.exit(1);
    }
    const autoA = autoLine(a);
    const autoB = autoLine(b);
    const sideA = a.clipRatio > CLIP_GUARD;
    const sideB = b.clipRatio > CLIP_GUARD;
    const flip = autoA !== autoB || sideA !== sideB;
    if (flip) changed = true;
    console.log(`${id}  ${flip ? "CHANGED" : "same Auto"}`);
    console.log(
      `   baseline ${autoA}   clipRatio ${a.clipRatio.toFixed(5)} ${sideA ? ">" : "≤"} ${String(CLIP_GUARD)}`,
    );
    console.log(
      `   new      ${autoB}   clipRatio ${b.clipRatio.toFixed(5)} ${sideB ? ">" : "≤"} ${String(CLIP_GUARD)}`,
    );
    for (const f of FIELDS) {
      const d = b[f] - a[f];
      const shown = PERCENTILES.has(f) ? `${String(Math.round(d * 255))} bins` : d.toFixed(4);
      console.log(`     ${f.padEnd(14)} ${a[f].toFixed(4)} → ${b[f].toFixed(4)}  Δ ${shown}`);
    }
  }
  console.log(
    changed
      ? "result: Auto values or a clip-guard side changed — refresh the baseline and recompute all six before tuning."
      : "result: no Auto value or clip-guard side changed.",
  );
  process.exit(changed ? 2 : 0);
}

const HOST = "127.0.0.1";
const PORT = 8917;
const entries = readManifest().filter((entry) => entry.split === "tuning");
const photos = new Map<string, Buffer>();

for (const entry of entries) {
  const bytes = readFileSync(join(REPO, entry.path));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== entry.sha256) {
    throw new Error(`${entry.id}: input SHA-256 ${actual} differs from the frozen manifest`);
  }
  photos.set(entry.id, bytes);
}

const argv = process.argv.slice(2);
const compareAt = argv.indexOf("--compare");
if (compareAt !== -1) {
  const download = argv[compareAt + 1];
  if (!download) {
    console.error("usage: desktop-stats.ts --compare <download.json> [--baseline <file>]");
    process.exit(1);
  }
  const baselineAt = argv.indexOf("--baseline");
  compare(download, baselineAt !== -1 && argv[baselineAt + 1] ? argv[baselineAt + 1] : BASELINE);
}

function compile(path: string): string {
  return ts.transpileModule(readFileSync(join(REPO, path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

const modules = new Map([
  ["/auto-params", compile("src/lib/engines/auto-params.ts")],
  ["/auto-params.client", compile("src/lib/engines/auto-params.client.ts")],
]);

const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>S-17 desktop luma stats</title>
<main>
  <h1>S-17 desktop luma stats</h1>
  <p>Keep this tab visible. Click Measure, then download the JSON and note the browser version and visibility state.</p>
  <button id="measure" type="button">Measure</button>
  <a id="download" hidden download="desktop-chrome-stats.json">Download stats JSON</a>
  <p id="meta"></p>
  <pre id="output"></pre>
</main>
<script type="module">
import { sampleImageLuma } from "/auto-params.client";
const ids = ${JSON.stringify(entries.map((entry) => entry.id))};
const button = document.getElementById("measure");
const meta = document.getElementById("meta");
const output = document.getElementById("output");
const download = document.getElementById("download");
let previousUrl;

button.addEventListener("click", async () => {
  button.disabled = true;
  download.hidden = true;
  const visibility = document.visibilityState;
  const result = {};
  try {
    for (const id of ids) {
      meta.textContent = "Measuring " + id + "…";
      const response = await fetch("/photo/" + id);
      if (!response.ok) throw new Error(id + ": HTTP " + response.status);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        const image = new Image();
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error(id + ": image decode failed"));
          image.src = objectUrl;
        });
        result[id] = sampleImageLuma(image);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }
    const record = {
      meta: {
        userAgent: navigator.userAgent,
        visibilityAtStart: visibility,
        visibilityAtEnd: document.visibilityState,
        measuredAt: new Date().toISOString(),
      },
      stats: result,
    };
    const json = JSON.stringify(record, null, 2) + "\\n";
    output.textContent = json;
    meta.textContent = navigator.userAgent + " | visibility at start: " + visibility +
      " | visibility at end: " + document.visibilityState;
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    previousUrl = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    download.href = previousUrl;
    download.hidden = false;
  } catch (error) {
    meta.textContent = String(error);
  } finally {
    button.disabled = false;
  }
});
</script>
</html>`;

const server = createServer((request, response) => {
  const path = new URL(request.url ?? "/", `http://${HOST}:${PORT}`).pathname;
  if (request.method !== "GET") {
    response.writeHead(405).end("method not allowed");
    return;
  }
  if (path === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }).end(html);
    return;
  }
  const module = modules.get(path);
  if (module !== undefined) {
    response
      .writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" })
      .end(module);
    return;
  }
  const photo = /^\/photo\/(S17-\d+)$/.exec(path);
  const bytes = photo ? photos.get(photo[1]) : undefined;
  if (bytes) {
    response.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-store" }).end(bytes);
    return;
  }
  response.writeHead(404).end("not found");
});

server.listen(PORT, HOST, () => {
  console.log(`Open http://${HOST}:${PORT}/ in desktop Chrome, keep it visible, then click Measure.`);
});
