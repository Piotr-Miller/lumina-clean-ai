// Build final self-contained boards/cards from templates:
//  - {{CSS:name}}  -> inline contents of templates/partials/<name> (shared skin)
//  - {{IMG:name}}  -> data URI of assets/derived/<name>
//  - {{FONT:name}} -> data URI of assets/fonts/<name>
// Walks templates/ recursively (skipping partials/), preserving relative paths
// under boards/ (the local staging mirror for DesignSync write_files).
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const kit = dirname(dirname(fileURLToPath(import.meta.url)));
const templates = join(kit, "templates");
const outRoot = join(kit, "boards");

const b64 = (p) => readFileSync(p).toString("base64");
const imgUri = (name) => `data:image/jpeg;base64,${b64(join(kit, "assets", "derived", name))}`;
const fontUri = (name) => `data:font/woff2;base64,${b64(join(kit, "assets", "fonts", name))}`;
const partial = (name) => readFileSync(join(templates, "partials", name), "utf8");

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "partials") yield* walk(p);
    } else if (e.name.endsWith(".html")) {
      yield p;
    }
  }
}

let fail = false;
for (const file of walk(templates)) {
  const rel = relative(templates, file).split(sep).join("/");
  let html = readFileSync(file, "utf8");
  html = html.replace(/\{\{CSS:([^}]+)\}\}/g, (_, n) => partial(n));
  html = html.replace(/\{\{IMG:([^}]+)\}\}/g, (_, n) => imgUri(n));
  html = html.replace(/\{\{FONT:([^}]+)\}\}/g, (_, n) => fontUri(n));

  const leftover = html.match(/\{\{[A-Z]+:[^}]+\}\}/g);
  const external = html.match(/(?:src|href)\s*=\s*["']https?:|url\(\s*["']?https?:/g);
  if (leftover) { console.error(`${rel}: unresolved tokens: ${leftover.join(", ")}`); fail = true; }
  if (external) { console.error(`${rel}: external references: ${external.join(", ")}`); fail = true; }
  if (!html.startsWith("<!-- @dsCard")) { console.error(`${rel}: missing @dsCard first-line marker`); fail = true; }

  const out = join(outRoot, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`${rel} -> ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
}
if (fail) process.exit(1);
console.log("OK: all cards self-contained");
