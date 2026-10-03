// Freezes an owner-approved dedup table and draws the G3 hand-read sample
// (change `finder-model-swap`, plan.md Phase 1 §4; rules in
// context/changes/finder-model-swap/gate.md §6). Free: no network.
//
// Freeze order (gate.md): approved table → `freeze` → its sha256 written to
// gate.md → seed written to gate.md → `draw`. `draw` refuses a table whose
// sha256 differs from the frozen one, so neither the table nor the seed can be
// chosen after seeing the sample. No re-draw.
//
// Usage (from packages/code-reviewer):
//   node scripts/hand-read-sample.mjs freeze <table.json>
//   node scripts/hand-read-sample.mjs draw <table.json> --sha <hex> --seed <64 hex chars>
//
// The table is a JSON array of rows, each with a unique string `id`.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Sample size cap and the 5% rule (owner, 2026-10-02). */
export const SAMPLE_SIZE = 40;

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

// Canonical JSON: object keys sorted at every level, no whitespace, so the
// hash depends on the table's content, not on how an editor laid it out.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function validateTable(table) {
  if (!Array.isArray(table)) throw new Error("the table must be a JSON array of rows");
  const ids = new Set();
  for (const row of table) {
    if (typeof row?.id !== "string" || row.id === "") throw new Error("every row needs a non-empty string id");
    if (ids.has(row.id)) throw new Error(`duplicate row id ${JSON.stringify(row.id)}`);
    ids.add(row.id);
  }
  return table;
}

export function freeze(table) {
  return sha256(canonical(validateTable(table)));
}

/** Rejected-findings limit: floor(0.05 × N) when N < 40, else 2 of 40. */
export function limitFor(n) {
  return Math.floor(0.05 * Math.min(n, SAMPLE_SIZE));
}

/**
 * Draws min(40, N) rows, ranked by sha256(seed + ":" + id) ascending. Returns
 * `{ n, limit, sample }`, or `{ n: 0, fail: "G3 FAIL: no findings" }` without
 * drawing. Throws when the table does not match the frozen sha256 or the seed
 * is not 32 bytes of hex.
 */
export function draw(table, { sha, seed }) {
  const actual = freeze(table);
  if (actual !== sha)
    throw new Error(`table sha256 ${actual} does not match the frozen ${String(sha)}; refusing to draw`);
  if (typeof seed !== "string" || !/^[0-9a-f]{64}$/u.test(seed)) {
    throw new Error("--seed must be 32 bytes as 64 lowercase hex characters");
  }
  const n = table.length;
  if (n === 0) return { n: 0, limit: 0, fail: "G3 FAIL: no findings" };
  const ranked = table
    .map((row) => ({ id: row.id, rank: sha256(`${seed}:${row.id}`) }))
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
  return { n, limit: limitFor(n), sample: ranked.slice(0, Math.min(SAMPLE_SIZE, n)).map((r) => r.id) };
}

function main(args) {
  const [command, path] = args;
  const flag = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  if ((command !== "freeze" && command !== "draw") || path === undefined) {
    console.error("usage: freeze <table.json> | draw <table.json> --sha <hex> --seed <hex>");
    return 2;
  }
  const table = JSON.parse(readFileSync(path, "utf8"));
  if (command === "freeze") {
    console.log(freeze(table));
    return 0;
  }
  const result = draw(table, { sha: flag("--sha"), seed: flag("--seed") });
  if (result.fail !== undefined) {
    console.log(`N=0 — ${result.fail}`);
    return 1;
  }
  console.log(`N=${String(result.n)} sample=${String(result.sample.length)} limit=${String(result.limit)} rejected`);
  for (const id of result.sample) console.log(id);
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
