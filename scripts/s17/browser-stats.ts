/**
 * S-17 Auto values from the app's `sampleImageLuma` in headless Chromium — a
 * repeatable diagnostic, not the tuning source (decision revised 2026-09-27).
 *
 * `<id>.browser.json` stores full `LumaStats` and the Local and Cloud recommendations.
 * Phase 2–3 tune from desktop Chrome 154 stats in
 * `test-photos/private/s17/harness/desktop-chrome-154.stats.json`, applying the
 * app's `recommendParams`. The offline path (`decode-inputs.py` + `auto-values.ts`)
 * is the closer cross-check: 18/60 differing fields against desktop, versus 34/60
 * for this headless path. The desktop capture used a hidden tab, so S17-04 needs
 * a visible-tab check before model runs (plan Phase 1 note).
 *
 * Loads each photo the way `EnhanceWorkspace` does (a Blob object URL decoded by
 * `new Image()`), runs the app's own `sampleImageLuma` from
 * `src/lib/engines/auto-params.client.ts` on it — transpiled, not rewritten — and
 * compares every `LumaStats` field, plus the Local and Cloud recommendations,
 * with the offline `<id>.auto.json` from `decode-inputs.py` + `auto-values.ts`.
 *
 *   npx tsx scripts/s17/browser-stats.ts                 # the six tuning photos
 *   npx tsx scripts/s17/browser-stats.ts S17-01 S17-06   # named ids
 *
 * Writes `<id>.browser.json` next to the offline record — before comparing, so a
 * difference never withholds it. Exit status of the cross-check:
 *   0  every percentile identical, |Δ| ≤ 0.001 on mean and the three ratios, and
 *      the recommendations equal to two decimals;
 *   2  a difference beyond that, printed per field; investigate it before using
 *      this record as a diagnostic;
 *   1  the check could not run (missing offline record, browser or decode failure).
 * These thresholds decide what this tool REPORTS; accepting parity is the
 * maintainer's call, recorded against plan row 1.6.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "@playwright/test";
import ts from "typescript";

import { recommendParams } from "../../src/lib/engines/auto-params";
import type { LumaStats } from "../../src/lib/engines/types";
import { HARNESS_DIR, REPO, readManifest, type AutoValues } from "./harness";

const ORIGIN = "https://s17-harness.invalid";
const STAT_FIELDS = [
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
const CONTINUOUS_TOLERANCE = 0.001;

interface BrowserSample {
  stats: LumaStats;
  naturalWidth: number;
  naturalHeight: number;
}

function transpile(relPath: string): string {
  const source = readFileSync(join(REPO, relPath), "utf8");
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

async function main(): Promise<void> {
  const dir = process.env.HARNESS_DIR ?? HARNESS_DIR;
  const manifest = readManifest();
  const requested = process.argv.slice(2);
  const entries =
    requested.length > 0
      ? manifest.filter((e) => requested.includes(e.id))
      : manifest.filter((e) => e.split === "tuning");
  const missing = requested.filter((id) => !manifest.some((e) => e.id === id));
  if (missing.length > 0) {
    console.error(`not in s17-benchmark.json: ${missing.join(", ")}`);
    process.exit(1);
  }
  for (const e of entries) {
    if (!existsSync(join(dir, `${e.id}.auto.json`))) {
      console.error(`${e.id}: no offline record in ${dir}; run decode-inputs.py and auto-values.ts first.`);
      process.exit(1);
    }
  }

  // Hash the bytes that will actually be served: a record stamped with the manifest
  // sha256 must come from those exact bytes, not from whatever the offline run saw.
  const photoBytes = new Map<string, Buffer>();
  for (const e of entries) {
    const bytes = readFileSync(join(REPO, e.path));
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== e.sha256) {
      console.error(`${e.id}: ${e.path} has sha256 ${actual}, the manifest says ${e.sha256}.`);
      process.exit(1);
    }
    photoBytes.set(e.id, bytes);
  }

  const modules: Record<string, string> = {
    "/auto-params": transpile("src/lib/engines/auto-params.ts"),
    "/auto-params.client": transpile("src/lib/engines/auto-params.client.ts"),
  };
  const page_html = `<!doctype html><meta charset="utf-8"><script type="module">
import { sampleImageLuma } from "/auto-params.client";
window.sampleImageLuma = sampleImageLuma;
window.harnessReady = true;
</script>`;

  const browser = await chromium.launch();
  let worst = 0;
  try {
    const page = await browser.newPage();
    await page.route(`${ORIGIN}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/") return route.fulfill({ contentType: "text/html", body: page_html });
      if (path in modules) return route.fulfill({ contentType: "text/javascript", body: modules[path] });
      const photo = /^\/photo\/(S17-\d+)$/.exec(path);
      const entry = photo ? entries.find((e) => e.id === photo[1]) : undefined;
      const bytes = entry ? photoBytes.get(entry.id) : undefined;
      if (bytes) return route.fulfill({ contentType: "image/jpeg", body: bytes });
      return route.fulfill({ status: 404, body: "not found" });
    });
    await page.goto(`${ORIGIN}/`);
    await page.waitForFunction(() => (window as unknown as { harnessReady?: boolean }).harnessReady === true);

    for (const entry of entries) {
      const offline = JSON.parse(readFileSync(join(dir, `${entry.id}.auto.json`), "utf8")) as AutoValues;
      if (offline.input_sha256 !== entry.sha256) {
        console.error(
          `${entry.id}: offline record was made from sha256 ${offline.input_sha256}, manifest says ${entry.sha256}.`,
        );
        process.exit(1);
      }
      // Same decode as EnhanceWorkspace: File → object URL → new Image() → sampleImageLuma.
      const sample = await page.evaluate(async (url: string): Promise<BrowserSample> => {
        const blob = await (await fetch(url)).blob();
        const objectUrl = URL.createObjectURL(blob);
        try {
          const img = new Image();
          img.src = objectUrl;
          await img.decode();
          const w = window as unknown as { sampleImageLuma: (i: HTMLImageElement) => LumaStats };
          return { stats: w.sampleImageLuma(img), naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      }, `${ORIGIN}/photo/${entry.id}`);

      const local = recommendParams(sample.stats, "local");
      const cloud = recommendParams(sample.stats, "cloud");
      writeFileSync(
        join(dir, `${entry.id}.browser.json`),
        `${JSON.stringify({ id: entry.id, input_sha256: entry.sha256, browser: browser.version(), ...sample, local, cloud }, null, 2)}\n`,
      );

      const lines: string[] = [];
      let status = 0;
      for (const f of STAT_FIELDS) {
        const a = offline.stats[f];
        const b = sample.stats[f];
        const d = b - a;
        const bad = PERCENTILES.has(f) ? Math.round(d * 255) !== 0 : Math.abs(d) > CONTINUOUS_TOLERANCE;
        if (bad) status = 2;
        const unit = PERCENTILES.has(f) ? ` (${String(Math.round(d * 255))} bins)` : "";
        lines.push(
          `  ${bad ? "✗" : " "} ${f.padEnd(14)} offline ${a.toFixed(4)}  browser ${b.toFixed(4)}  Δ ${d.toFixed(4)}${unit}`,
        );
      }
      const params: [string, number, number][] = [
        ["cloud.gamma", offline.cloud.gamma, cloud.gamma],
        ["cloud.strength", offline.cloud.strength, cloud.strength],
        ["local.gamma", offline.local.gamma, local.gamma],
        ["local.blur", offline.local.blur, local.blur],
      ];
      for (const [name, a, b] of params) {
        const bad = a.toFixed(2) !== b.toFixed(2);
        if (bad) status = 2;
        lines.push(`  ${bad ? "✗" : " "} ${name.padEnd(14)} offline ${a.toFixed(4)}  browser ${b.toFixed(4)}`);
      }
      const [ow, oh] = offline.sample_dimensions;
      console.log(
        `${entry.id}  ${status === 0 ? "MATCH" : "DIFFERS"}  natural ${String(sample.naturalWidth)}x${String(sample.naturalHeight)}  offline sample ${String(ow)}x${String(oh)} (${offline.filter})`,
      );
      console.log(lines.join("\n"));
      worst = Math.max(worst, status);
    }
  } finally {
    await browser.close();
  }
  console.log(
    worst === 0
      ? `parity: all ${String(entries.length)} photo(s) match within the reported thresholds.`
      : "parity: differences found (✗) — explain them or fix the offline path before Phase 2.",
  );
  process.exit(worst);
}

void main();
