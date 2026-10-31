/**
 * S-19 exact Auto records for the real Local baselines (plan Phase 1, item 6).
 *
 * The owner runs every prepared common input (`test-photos/private/s19/inputs/<id>-common.jpg`)
 * through the unchanged Local engine in the app, Auto ON, and saves each download as
 * `test-photos/private/s19/local/<id>.jpg`. This helper records, in the SAME desktop Chrome,
 * what the app's Auto sees on those identical bytes:
 *
 *   npx tsx scripts/s19/baseline.ts --serve [--port 4399] --all | <ids>
 *       Serves a local page. Open it in the Chrome you use for the app. It decodes each common
 *       input the way EnhanceWorkspace does (Blob → object URL → new Image()) and runs the app's
 *       own `sampleImageLuma` (src/lib/engines/auto-params.client.ts, transpiled, not rewritten).
 *       The server recomputes `recommendParams(stats, "local")` and writes
 *       `local/<id>.auto.json`: full-precision stats and parameters, the common input's sha256,
 *       the browser's user agent and version list, one session id per server run, and the app
 *       source revision (git HEAD plus the hashes of the two Auto source files). Optional fields
 *       on the page take the gamma/blur labels the app showed; they are kept as a diagnostic.
 *
 *   npx tsx scripts/s19/baseline.ts --check-auto --all | <ids>
 *       Hard checks: a record exists; its input hash equals the prepared common file and its
 *       sidecar; recomputing `recommendParams` from the saved stats gives exactly the recorded
 *       parameters; the Auto source files are unchanged since sampling; every record comes from
 *       one non-headless browser. Diagnostics, reported but never proof of parity: the app's
 *       rounded labels, and whether the download exists with the input's dimensions.
 *
 * The parameters are labelled "recomputed" (owner decision 2026-10-31): they are what the app's
 * code yields for the stats this browser sampled, not values read from the app while it
 * processed the photo.
 *
 * Validation photos are refused by `protocol.py check-access` before any byte is read; in
 * Phase 7 pass `--validation --access <release.json> --config <finalist.json>` and records go to
 * `validation-local/`. Exit status: 0 served / every hard check passed; 1 refused or a hard check
 * failed (named per photo); 2 usage.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

import sharp from "sharp";
import ts from "typescript";

import { recommendParams } from "../../src/lib/engines/auto-params";
import type { LumaStats } from "../../src/lib/engines/types";
import {
  AUTO_SOURCES,
  PRIVATE,
  REPO,
  Refused,
  guard,
  parseCommon,
  readSidecar,
  repoPath,
  sha256File,
  type AutoRecord,
} from "./s19";

const PROVENANCE =
  "recomputed: recommendParams(stats, 'local') in node, from LumaStats measured by the app's own " +
  "sampleImageLuma in the owner's browser on the common input; not read from the app at processing time";

function recordDir(validation: boolean): string {
  return join(PRIVATE, validation ? "validation-local" : "local");
}

function transpile(relPath: string): string {
  const source = readFileSync(join(REPO, relPath), "utf8");
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function sourceRevision(): AutoRecord["source_revision"] {
  const git = (...a: string[]): string => execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8" }).trim();
  return {
    git_head: git("rev-parse", "HEAD"),
    worktree_dirty: git("status", "--porcelain", "--", ...AUTO_SOURCES) !== "",
    files: Object.fromEntries(AUTO_SOURCES.map((f) => [f, sha256File(join(REPO, f))])),
  };
}

const PAGE = (ids: string[]): string => `<!doctype html><meta charset="utf-8"><title>S-19 Auto records</title>
<style>body{font:14px system-ui;background:#1c1c1e;color:#e8e8ea;margin:24px}td,th{padding:4px 10px;text-align:left}
input{width:5em}button{font:inherit}.ok{color:#5cb85c}.bad{color:#e06c6c}</style>
<h1>S-19: Auto on the prepared common inputs</h1>
<p>Open this page in the same desktop Chrome you use for the app. "Sample all" runs the app's own
<code>sampleImageLuma</code> on each file. The label fields are optional: type the gamma and blur
the app showed for that photo, then "Save labels".</p>
<button id="all">Sample all</button>
<table><thead><tr><th>Photo</th><th>Status</th><th>Gamma (recomputed)</th><th>Blur (recomputed)</th>
<th>App label γ</th><th>App label blur</th><th></th></tr></thead><tbody id="rows"></tbody></table>
<script type="module">
import { sampleImageLuma } from "/auto-params.client";
const ids = ${JSON.stringify(ids)};
const rows = document.getElementById("rows");
for (const id of ids) rows.insertAdjacentHTML("beforeend",
  '<tr id="r-' + id + '"><td>' + id + '</td><td class="st">—</td><td class="g"></td><td class="b"></td>' +
  '<td><input class="lg"></td><td><input class="lb"></td><td><button class="sv">Save labels</button></td></tr>');
const browser = async () => ({ userAgent: navigator.userAgent,
  fullVersionList: navigator.userAgentData ? (await navigator.userAgentData.getHighEntropyValues(["fullVersionList", "platformVersion"])) : null });
async function sample(id) {
  const row = document.getElementById("r-" + id);
  row.querySelector(".st").textContent = "sampling…";
  try {
    const blob = await (await fetch("/photo/" + id)).blob();
    const url = URL.createObjectURL(blob);
    const img = new Image(); img.src = url; await img.decode();
    const stats = sampleImageLuma(img);
    URL.revokeObjectURL(url);
    const res = await fetch("/record", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, stats, natural: [img.naturalWidth, img.naturalHeight], browser: await browser() }) });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    row.querySelector(".st").innerHTML = '<span class="ok">recorded</span>';
    row.querySelector(".g").textContent = out.local.gamma;
    row.querySelector(".b").textContent = out.local.blur;
  } catch (e) { row.querySelector(".st").innerHTML = '<span class="bad">' + e.message + "</span>"; }
}
document.getElementById("all").onclick = async () => { for (const id of ids) await sample(id); };
rows.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("sv")) return;
  const row = e.target.closest("tr"), id = row.id.slice(2);
  const res = await fetch("/labels", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, gamma: row.querySelector(".lg").value, blur: row.querySelector(".lb").value }) });
  row.querySelector(".st").innerHTML = res.ok ? '<span class="ok">labels saved</span>' : '<span class="bad">' + (await res.json()).error + "</span>";
});
</script>`;

async function readBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function serve(ids: string[], validation: boolean, port: number): void {
  const dir = recordDir(validation);
  mkdirSync(dir, { recursive: true });
  const sessionId = randomUUID();
  const revision = sourceRevision();
  const modules: Record<string, string> = {
    "/auto-params": transpile("src/lib/engines/auto-params.ts"),
    "/auto-params.client": transpile("src/lib/engines/auto-params.client.ts"),
  };
  const server = createServer((req, res) => {
    const send = (status: number, type: string, body: string | Buffer): void => {
      res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
      res.end(body);
    };
    const json = (status: number, body: unknown): void => {
      send(status, "application/json", JSON.stringify(body));
    };
    void (async () => {
      const path = new URL(req.url ?? "/", "http://localhost").pathname;
      if (req.method === "GET" && path === "/") {
        send(200, "text/html", PAGE(ids));
        return;
      }
      if (req.method === "GET" && path in modules) {
        send(200, "text/javascript", modules[path]);
        return;
      }
      const photo = /^\/photo\/([A-Z0-9-]+)$/.exec(path);
      if (req.method === "GET" && photo && ids.includes(photo[1])) {
        const side = readSidecar(photo[1]);
        send(200, "image/jpeg", readFileSync(repoPath(side.common.path)));
        return;
      }
      if (req.method === "POST" && path === "/record") {
        const body = (await readBody(req)) as {
          id: string;
          stats: LumaStats;
          natural: [number, number];
          browser: AutoRecord["browser"];
        };
        if (!ids.includes(body.id)) {
          json(400, { error: `${body.id} is not served by this session` });
          return;
        }
        const side = readSidecar(body.id);
        const commonSha = sha256File(repoPath(side.common.path));
        if (commonSha !== side.common.sha256) {
          json(409, { error: "common file differs from its sidecar" });
          return;
        }
        const out = join(dir, `${body.id}.auto.json`);
        const previous = existsSync(out) ? (JSON.parse(readFileSync(out, "utf8")) as AutoRecord) : undefined;
        const record: AutoRecord = {
          id: body.id,
          common_sha256: commonSha,
          common_dimensions: side.common.dimensions,
          natural_dimensions: body.natural,
          stats: body.stats,
          local: recommendParams(body.stats, "local"),
          parameter_provenance: PROVENANCE,
          browser: body.browser,
          session_id: sessionId,
          sampled_at: new Date().toISOString(),
          source_revision: revision,
          ui_labels: previous?.session_id === sessionId ? previous.ui_labels : undefined,
        };
        writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
        json(200, { local: record.local });
        return;
      }
      if (req.method === "POST" && path === "/labels") {
        const body = (await readBody(req)) as { id: string; gamma: string; blur: string };
        const out = join(dir, `${body.id}.auto.json`);
        if (!ids.includes(body.id) || !existsSync(out)) {
          json(400, { error: "sample this photo first" });
          return;
        }
        const record = JSON.parse(readFileSync(out, "utf8")) as AutoRecord;
        record.ui_labels = { gamma: body.gamma.trim(), blur: body.blur.trim() };
        writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
        json(200, { ok: true });
        return;
      }
      json(404, { error: "not found" });
    })().catch((e: unknown) => {
      json(500, { error: e instanceof Error ? e.message : String(e) });
    });
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`serving ${String(ids.length)} prepared input(s) at http://127.0.0.1:${String(port)}/`);
    console.log(`session ${sessionId}; records → ${dir}. Open it in your desktop Chrome; Ctrl+C when done.`);
  });
}

async function check(ids: string[], validation: boolean): Promise<number> {
  const dir = recordDir(validation);
  let failed = 0;
  const browsers = new Set<string>();
  const current = Object.fromEntries(AUTO_SOURCES.map((f) => [f, sha256File(join(REPO, f))]));
  for (const id of ids) {
    const problems: string[] = [];
    const notes: string[] = [];
    const path = join(dir, `${id}.auto.json`);
    if (!existsSync(path)) {
      console.log(`✗ ${id}: no Auto record at ${path}; run baseline.ts --serve and sample it in your Chrome`);
      failed++;
      continue;
    }
    const rec = JSON.parse(readFileSync(path, "utf8")) as AutoRecord;
    const side = readSidecar(id);
    const onDisk = sha256File(repoPath(side.common.path));
    if (rec.common_sha256 !== side.common.sha256 || onDisk !== side.common.sha256)
      problems.push(
        `input hash: record ${rec.common_sha256.slice(0, 12)}…, sidecar ${side.common.sha256.slice(0, 12)}…, file ${onDisk.slice(0, 12)}…`,
      );
    const again = recommendParams(rec.stats, "local");
    if (again.gamma !== rec.local.gamma || again.blur !== rec.local.blur)
      problems.push(`recomputed ${JSON.stringify(again)} ≠ recorded ${JSON.stringify(rec.local)}`);
    for (const [f, sha] of Object.entries(current))
      if (rec.source_revision.files[f] !== sha) problems.push(`${f} changed since sampling`);
    if (rec.source_revision.worktree_dirty) problems.push("Auto sources had uncommitted edits when sampled");
    if (/Headless/i.test(rec.browser.userAgent))
      problems.push("sampled in a headless browser, not your desktop Chrome");
    browsers.add(rec.browser.userAgent);
    if (rec.ui_labels?.gamma || rec.ui_labels?.blur) {
      const g = rec.ui_labels.gamma && Number(rec.ui_labels.gamma).toFixed(2) !== rec.local.gamma.toFixed(2);
      const b = rec.ui_labels.blur && Number(rec.ui_labels.blur).toFixed(1) !== rec.local.blur.toFixed(1);
      notes.push(
        `labels γ ${rec.ui_labels.gamma ?? "—"} / blur ${rec.ui_labels.blur ?? "—"} ${g || b ? "DIFFER from" : "agree with"} the rounded recomputed values (diagnostic)`,
      );
    } else notes.push("no app labels recorded (diagnostic)");
    const download = join(dir, `${id}.jpg`);
    if (existsSync(download)) {
      const meta = await sharp(download).metadata();
      const same = meta.width === side.common.dimensions[0] && meta.height === side.common.dimensions[1];
      notes.push(`download ${String(meta.width)}×${String(meta.height)}${same ? "" : " ≠ input size"} (diagnostic)`);
    } else notes.push("no download saved yet (diagnostic)");
    const status = problems.length ? "✗" : "✓";
    console.log(
      `${status} ${id}: γ ${String(rec.local.gamma)} blur ${String(rec.local.blur)} (recomputed), ${rec.browser.userAgent.replace(/^.*(Chrome\/[\d.]+).*$/, "$1")}, session ${rec.session_id.slice(0, 8)}`,
    );
    for (const p of problems) console.log(`    ✗ ${p}`);
    for (const n of notes) console.log(`      ${n}`);
    if (problems.length) failed++;
  }
  if (browsers.size > 1) {
    console.log(`✗ records come from ${String(browsers.size)} different browsers: ${[...browsers].join(" | ")}`);
    failed++;
  }
  console.log(
    failed ? `${String(failed)} problem(s)` : `all ${String(ids.length)} Auto record(s) pass the hard checks`,
  );
  return failed ? 1 : 0;
}

async function main(): Promise<number> {
  try {
    const args = parseCommon(process.argv.slice(2));
    args.ids = args.rest;
    if (!args.flags.has("--serve") && !args.flags.has("--check-auto")) {
      console.error("usage: baseline.ts --serve | --check-auto  (--all | <ids>)  [--validation --access F --config F]");
      return 2;
    }
    const ids = guard(args);
    if (ids.length === 0) throw new Refused("no photos selected: name ids or pass --all");
    if (args.flags.has("--serve")) {
      serve(ids, args.validation, Number(args.opts.get("--port") ?? 4399));
      return -1;
    }
    return await check(ids, args.validation);
  } catch (e) {
    if (e instanceof Refused) {
      console.error(`refused: ${e.message}`);
      return 1;
    }
    throw e;
  }
}

void main().then((code) => {
  if (code >= 0) process.exit(code);
});
