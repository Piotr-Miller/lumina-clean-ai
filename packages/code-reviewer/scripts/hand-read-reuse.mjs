// Proposes which hand-read rows may INHERIT an owner classification (change
// `finder-verification`, plan.md Phase 2 §3; rule in plan.md Definitions
// "Hand-read reuse", R10). Free: it reads files, it calls nothing.
//
// A row inherits a classification only when ALL FOUR hold against one row the
// owner already classified: the same PR, the same code version (#269 `fca2778`,
// #240 `54d3557`), the same dedup key (`file:startLine|category`, the identity
// `mergeFindings` dedups on) and an owner-approved claim match. The first three
// are mechanical; the claim match is the owner's judgement and arrives as an
// input. The script never assigns a label to a row without all four — a row
// with a key match and no claim decision is listed for the owner, and every
// other row is classified anew.
//
// The judgement is inherited, the observation is not: an inherited row still
// counts in its own arm's N and G3 result. This script only proposes the
// match table; the owner approves it before any seed is written.
//
// Usage (from packages/code-reviewer):
//   node scripts/hand-read-reuse.mjs --rows <rows.json> --prior <prior.json> \
//     [--claims <claims.json>] --out <match-table.json>
//
//   rows.json    [{ "id", "pr", "codeVersion", "file", "startLine"?, "category", "description" }]
//   prior.json   [{ "id", "pr", "codeVersion", "file", "startLine"?, "category", "claim", "label" }]
//   claims.json  { "<row id>": { "prior": "<prior id>", "claimMatch": true | false } }   (owner-approved)
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { findingKey } from "../src/findings.ts";

/** The dedup key the hand-read uses: mergeFindings' identity, `file:startLine|category`. */
export const dedupKey = (row) => `${findingKey(row)}|${String(row.category)}`;

const requireRows = (rows, name, fields) => {
  if (!Array.isArray(rows)) throw new Error(`${name} must be a JSON array`);
  const ids = new Set();
  for (const row of rows) {
    if (typeof row?.id !== "string" || row.id === "") throw new Error(`every ${name} row needs a non-empty id`);
    if (ids.has(row.id)) throw new Error(`duplicate ${name} row id ${row.id}`);
    ids.add(row.id);
    for (const field of fields) {
      if (row[field] === undefined) throw new Error(`${name} row ${row.id} lacks ${field}`);
    }
  }
};

/**
 * The match table. One entry per row:
 * - `inherit`: all four conditions hold; carries the prior row and its label;
 * - `needs-claim-decision`: PR, version and key match a prior row, and the
 *   owner has not decided whether the claim matches — no label;
 * - `classify`: no prior row matches, or the owner said the claim differs — no label.
 * Throws when a claim decision names a prior row that does not match the row
 * on PR, version and key: that decision was made about something else.
 */
export function proposeReuse({ rows, prior, claims = {} }) {
  requireRows(rows, "rows", ["pr", "codeVersion", "file", "category"]);
  requireRows(prior, "prior", ["pr", "codeVersion", "file", "category", "label"]);
  const priorById = new Map(prior.map((row) => [row.id, row]));
  for (const rowId of Object.keys(claims)) {
    if (!rows.some((row) => row.id === rowId))
      throw new Error(`claims name row ${rowId}, which the table does not hold`);
  }

  return rows.map((row) => {
    const key = dedupKey(row);
    const candidates = prior
      .filter((p) => p.pr === row.pr && p.codeVersion === row.codeVersion && dedupKey(p) === key)
      .map((p) => p.id);
    const base = { rowId: row.id, pr: row.pr, codeVersion: row.codeVersion, dedupKey: key, candidates };
    const claim = claims[row.id];
    if (claim !== undefined) {
      if (typeof claim.prior !== "string" || typeof claim.claimMatch !== "boolean") {
        throw new Error(`claims[${row.id}] must be { prior: <id>, claimMatch: true | false }`);
      }
      if (!candidates.includes(claim.prior)) {
        throw new Error(
          `claims[${row.id}] names ${claim.prior}, which does not match the row on PR, code version and dedup key`,
        );
      }
      if (claim.claimMatch) {
        const source = priorById.get(claim.prior);
        return { ...base, decision: "inherit", inherited: { priorId: claim.prior, label: source.label } };
      }
      return { ...base, decision: "classify", reason: `claim differs from ${claim.prior} (owner)` };
    }
    if (candidates.length > 0) return { ...base, decision: "needs-claim-decision" };
    return { ...base, decision: "classify", reason: "no prior row with the same PR, code version and dedup key" };
  });
}

function main(args) {
  const flag = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const rowsPath = flag("--rows");
  const priorPath = flag("--prior");
  const claimsPath = flag("--claims");
  const out = flag("--out");
  if (rowsPath === undefined || priorPath === undefined || out === undefined) {
    console.error("usage: --rows <rows.json> --prior <prior.json> [--claims <claims.json>] --out <table.json>");
    return 2;
  }
  let table;
  try {
    table = proposeReuse({
      rows: JSON.parse(readFileSync(rowsPath, "utf8")),
      prior: JSON.parse(readFileSync(priorPath, "utf8")),
      claims: claimsPath === undefined ? {} : JSON.parse(readFileSync(claimsPath, "utf8")),
    });
  } catch (error) {
    console.error(`hand-read-reuse: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  writeFileSync(out, `${JSON.stringify(table, null, 2)}\n`);
  const count = (decision) => table.filter((entry) => entry.decision === decision).length;
  console.log(
    `${String(table.length)} row(s): inherit ${String(count("inherit"))}, ` +
      `needs-claim-decision ${String(count("needs-claim-decision"))}, classify ${String(count("classify"))} — ` +
      "the owner approves this table before any seed is written",
  );
  return count("needs-claim-decision") === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
