// Build final self-contained boards: inline {{IMG:*}} / {{FONT:*}} tokens as data URIs.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const kit = dirname(dirname(fileURLToPath(import.meta.url)));
const templates = join(kit, "templates");
const outDir = join(kit, "boards");
mkdirSync(outDir, { recursive: true });

const b64 = (p) => readFileSync(p).toString("base64");
const imgUri = (name) => `data:image/jpeg;base64,${b64(join(kit, "assets", "derived", name))}`;
const fontUri = (name) => `data:font/woff2;base64,${b64(join(kit, "assets", "fonts", name))}`;

let fail = false;
for (const file of readdirSync(templates).filter((f) => f.endsWith(".html"))) {
  let html = readFileSync(join(templates, file), "utf8");
  html = html.replace(/\{\{IMG:([^}]+)\}\}/g, (_, n) => imgUri(n));
  html = html.replace(/\{\{FONT:([^}]+)\}\}/g, (_, n) => fontUri(n));

  const leftover = html.match(/\{\{[A-Z]+:[^}]+\}\}/g);
  const external = html.match(/(?:src|href)\s*=\s*["']https?:|url\(\s*["']?https?:/g);
  if (leftover) { console.error(`${file}: unresolved tokens: ${leftover.join(", ")}`); fail = true; }
  if (external) { console.error(`${file}: external references: ${external.join(", ")}`); fail = true; }
  if (!html.startsWith("<!-- @dsCard")) { console.error(`${file}: missing @dsCard first-line marker`); fail = true; }

  const out = join(outDir, file);
  writeFileSync(out, html);
  console.log(`${file} -> ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
}
if (fail) process.exit(1);
console.log("OK: all boards self-contained");
