// Unit-span check (finder-verification plan.md Phase 3 §1; plan-review re-run
// F2 and 3rd run F2): compares every top-level unit the excerpt planner computes
// (`findTopLevelUnits` in src/excerpts.ts, E2's grammar) with the parsers' own
// view, IN BOTH DIRECTIONS, on every source file of every frozen input:
//
// - TS/JS/TSX/JSX/MJS: `ts.createSourceFile` top-level statements under E2's own
//   grammar — FunctionDeclaration, ClassDeclaration, and a VariableStatement
//   whose single initializer is an ArrowFunction or FunctionExpression. Other
//   statements (interface, type, a non-function const, `describe(…)`) are
//   neither units nor mismatches.
// - Python: `ast` top-level FunctionDef / AsyncFunctionDef / ClassDef (`lineno`
//   = the def line, decorators excluded as in E2; `end_lineno`).
//
// Every E2 unit must be such a node with the same start and end line, and every
// such node must be an E2 unit. Inputs: #269 at fca2778, #240 at 54d3557 (its
// source is read; no model output for #240 exists or is read — owner,
// 2026-10-04), and the four fixture trees at HEAD. #247 is never read.
//
// Free: git and local parsers only. Run from the repository root:
//   npx tsx context/changes/finder-verification/unit-span-check.mjs
// Writes unit-span-check.json next to this file; exits 1 on any mismatch.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "../../../packages/code-reviewer/node_modules/typescript/lib/typescript.js";
import { findTopLevelUnits } from "../../../packages/code-reviewer/src/excerpts.ts";
import { parseDiffPaths } from "../../../packages/code-reviewer/src/source-provider.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const RECIPE_EXCLUDES = [
  ":(exclude,glob)**/reviews/*.md",
  ":(exclude,glob)**/results/*.json",
  ":(exclude,glob)**/ground-truth/*",
  ":(exclude,glob)**/*.md",
  ":(exclude,glob)**/*.jsonl",
];
const diffPathsAt = (base, head) => [
  ...parseDiffPaths(git("diff", `${base}...${head}`, "--", ".", ...RECIPE_EXCLUDES)),
];

const TS_FILE = /\.(ts|tsx|js|jsx|mjs)$/u;
const PY_FILE = /\.py$/u;
const FIXTURES = "packages/code-reviewer/evals/fixtures";

// Each input: the revision its files are read at, and the files.
const inputs = [
  {
    name: "#269",
    rev: "fca2778742ec0bc02a84f42b23bf639fc32c7ad1",
    paths: diffPathsAt("3d0adc1b4910c31973c6ac98a7ce776fcb68d878", "fca2778742ec0bc02a84f42b23bf639fc32c7ad1"),
  },
  {
    name: "#240",
    rev: "54d35575430f644876264397ac5c29b38db47f42",
    paths: diffPathsAt("035f7788409f2c60975544badf1f699ec00b119c", "54d35575430f644876264397ac5c29b38db47f42"),
  },
  ...["cross-hunk", "clean-change", "js-loop", "react-migration"].map((tree) => ({
    name: `fixture ${tree}`,
    rev: "HEAD",
    paths: git("ls-files", "--", `${FIXTURES}/${tree}`).split("\n").filter(Boolean),
  })),
];

const exists = (rev, path) => {
  try {
    return git("cat-file", "-t", `${rev}:${path}`).trim() === "blob";
  } catch {
    return false;
  }
};

/** Top-level statements under E2's grammar, 1-based start (keyword line) and end line. */
function tsUnits(path, text) {
  const kind = path.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : path.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : path.endsWith(".ts")
        ? ts.ScriptKind.TS
        : ts.ScriptKind.JS;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const line = (pos) => source.getLineAndCharacterOfPosition(pos).line + 1;
  const units = [];
  for (const statement of source.statements) {
    let name;
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      name = statement.name?.text ?? "default";
    } else if (ts.isVariableStatement(statement)) {
      const declarations = statement.declarationList.declarations;
      const init = declarations.length === 1 ? declarations[0].initializer : undefined;
      if (init !== undefined && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
        name = declarations[0].name.getText(source);
      }
    }
    if (name === undefined) continue;
    units.push({ name, start: line(statement.getStart(source)), end: line(statement.getEnd()) });
  }
  return units;
}

const PY_SCRIPT = `
import ast, json, sys
tree = ast.parse(sys.stdin.read())
out = []
for node in tree.body:
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        out.append({"name": node.name, "start": node.lineno, "end": node.end_lineno})
print(json.dumps(out))
`;
const pyUnits = (text) => JSON.parse(execFileSync("python3", ["-c", PY_SCRIPT], { input: text, encoding: "utf8" }));

const key = (u) => `${String(u.start)}-${String(u.end)}`;
const results = [];
for (const input of inputs) {
  for (const path of input.paths.sort()) {
    const isTs = TS_FILE.test(path);
    if (!isTs && !PY_FILE.test(path)) continue;
    if (!exists(input.rev, path)) continue;
    const text = git("show", `${input.rev}:${path}`);
    const lines = text.split("\n");
    if (lines.at(-1) === "") lines.pop();
    const ours = findTopLevelUnits(path, lines).map(({ name, start, end }) => ({ name, start, end }));
    const theirs = isTs ? tsUnits(path, text) : pyUnits(text);
    const theirKeys = new Set(theirs.map(key));
    const ourKeys = new Set(ours.map(key));
    results.push({
      input: input.name,
      rev: input.rev,
      path,
      parser: isTs ? "typescript" : "python ast",
      units: ours.length,
      parserUnits: theirs.length,
      // E2 unit with no parser node of the same span …
      onlyE2: ours.filter((u) => !theirKeys.has(key(u))),
      // … and a parser node E2 does not produce.
      onlyParser: theirs.filter((u) => !ourKeys.has(key(u))),
    });
  }
}

const mismatched = results.filter((r) => r.onlyE2.length > 0 || r.onlyParser.length > 0);
const summary = {
  files: results.length,
  byInput: Object.fromEntries(
    inputs.map((i) => [
      i.name,
      {
        files: results.filter((r) => r.input === i.name).length,
        units: results.filter((r) => r.input === i.name).reduce((t, r) => t + r.units, 0),
      },
    ]),
  ),
  units: results.reduce((t, r) => t + r.units, 0),
  parserUnits: results.reduce((t, r) => t + r.parserUnits, 0),
  mismatchedFiles: mismatched.length,
  typescript: `${String(ts.version)}`,
};
writeFileSync(join(HERE, "unit-span-check.json"), `${JSON.stringify({ summary, results }, null, 1)}\n`);
for (const r of results) {
  const flag = r.onlyE2.length + r.onlyParser.length === 0 ? "ok" : "MISMATCH";
  console.log(`${flag.padEnd(8)} ${r.input.padEnd(24)} ${r.path} units=${String(r.units)}/${String(r.parserUnits)}`);
  for (const u of r.onlyE2) console.log(`           E2 only:     ${u.name} ${key(u)}`);
  for (const u of r.onlyParser) console.log(`           parser only: ${u.name} ${key(u)}`);
}
console.log(`SUMMARY ${JSON.stringify(summary)}`);
process.exitCode = mismatched.length === 0 ? 0 : 1;
