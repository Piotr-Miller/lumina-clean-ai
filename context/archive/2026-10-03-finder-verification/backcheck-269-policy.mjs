// Policy backcheck (finder-verification plan.md Phase 3 §1, R6): runs the
// IMPLEMENTED excerpt policy (`planExcerpts` from the package, with the sealed
// EXCERPT_LIMITS) on the 38 raw #269 findings of `finder-model-swap`, attempt by
// attempt as the verifier would see them, against the code at fca2778. For each
// finding and each D-row it reports whether the owner-classified evidence lines
// (backcheck-269.py's EVID, ported verbatim below) land in a block delivered
// WITH that finding.
//
// Free: git and files only, no model call. Reads the code through the real
// structured reader (`readDiffScoped`) with git-backed file access, so the
// allowlist, containment and refusals are production's.
//
// Run from the repository root:
//   npx tsx context/changes/finder-verification/backcheck-269-policy.mjs
// Writes backcheck-269-policy.json next to this file and prints a summary.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { EXCERPT_LIMITS, planExcerpts } from "../../../packages/code-reviewer/src/excerpts.ts";
import { mergeFindings } from "../../../packages/code-reviewer/src/findings.ts";
import { buildVerifierInstructions, buildVerifierPrompt } from "../../../packages/code-reviewer/src/prompts.ts";
import { assignFindingIds } from "../../../packages/code-reviewer/src/scorecard.ts";
import { parseDiffPaths, readDiffScoped } from "../../../packages/code-reviewer/src/source-provider.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARCH = "context/archive/2026-10-02-finder-model-swap/";
const BASE = "3d0adc1b4910c31973c6ac98a7ce776fcb68d878";
const REV = "fca2778742ec0bc02a84f42b23bf639fc32c7ad1";
// The frozen diff recipe (gate.md § Inputs freeze); its sha256 is checked below.
const DIFF_SHA256 = "1e4ec0882371989122f9e4254c93c4df1f51826a4f57dbfe04139175177e550f";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const sha256 = (text) => execFileSync("sha256sum", { input: text, encoding: "utf8" }).split(" ")[0];

const diff = git(
  "diff",
  `${BASE}...${REV}`,
  "--",
  ".",
  ":(exclude,glob)**/reviews/*.md",
  ":(exclude,glob)**/results/*.json",
  ":(exclude,glob)**/ground-truth/*",
  ":(exclude,glob)**/*.md",
  ":(exclude,glob)**/*.jsonl",
);
if (sha256(diff) !== DIFF_SHA256) throw new Error(`#269 diff does not reproduce: sha256 ${sha256(diff)}`);

// The real read core over the committed tree at REV: `root` is a virtual
// prefix, realpath is the identity (git trees hold no symlink escapes we
// follow), and a path is a regular file when git calls it a blob.
const ROOT = "/fca2778";
const strip = (path) => path.slice(ROOT.length + 1);
const allowedPaths = parseDiffPaths(diff);
const reader = readDiffScoped({
  allowedPaths,
  root: ROOT,
  realpath: (path) => path,
  isRegularFile: (path) => {
    try {
      return git("cat-file", "-t", `${REV}:${strip(path)}`).trim() === "blob";
    } catch {
      return false;
    }
  },
  readFile: (path) => git("show", `${REV}:${strip(path)}`),
});
const diffPaths = [...allowedPaths].sort();

// ---- Evidence per D-row: backcheck-269.py's EVID and NONLINE, ported verbatim ----
const rng = (a, b = a) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const EVID = {
  D1: { "scripts/s17/decode-inputs.py": rng(131, 142) },
  D2: { "scripts/spikes/bread-spike.ts": [79, ...rng(91, 96), ...rng(189, 195), ...rng(198, 213)] },
  D3: { "scripts/s17/contact-sheet.py": rng(150, 151), "scripts/spikes/bread-spike.ts": [233] },
  D4: { "scripts/s17/decode-inputs.py": rng(1, 49) },
  D5: {},
  D6: { "scripts/s17/auto-values.ts": rng(14, 16) },
  D7: { "scripts/s17/contact-sheet.py": rng(208, 211) },
  D8: { "scripts/s17/desktop-stats.ts": rng(103, 136) },
  D9: { "scripts/s17/desktop-stats.ts": [...rng(18, 23), ...rng(92, 100), ...rng(104, 111)] },
  D10: { "scripts/s17/desktop-stats.ts": [...rng(18, 23), ...rng(56, 62), ...rng(92, 100)] },
  D11: { "scripts/measure-hue-shares.py": [...rng(113, 114), ...rng(127, 132), ...rng(150, 152)] },
  D12: { "scripts/measure-hue-shares.py": [...rng(37, 41), ...rng(143, 144)] },
  D13: { "scripts/s17/contact-sheet.py": [...rng(208, 211), 215, ...rng(221, 222)] },
  D14: { "scripts/s17/contact-sheet.py": [...rng(20, 24), ...rng(139, 146), 151] },
  D15: { "scripts/s17/decode-inputs.py": [...rng(137, 140), ...rng(146, 149)] },
  D16: { "scripts/s17/decode-inputs.py": [...rng(175, 176), ...rng(183, 193), 170] },
  D17: { "scripts/s17/decode-inputs.py": [...rng(88, 102), ...rng(135, 140), ...rng(146, 149)] },
  D18: {
    "scripts/s17/auto-values.ts": rng(39, 41),
    "scripts/s17/decode-inputs.py": rng(183, 185),
    "scripts/s17/browser-stats.ts": rng(80, 84),
  },
  D19: { "scripts/s17/browser-stats.ts": rng(162, 191), "scripts/s17/harness.ts": rng(43, 51) },
  D20: { "scripts/spikes/bread-spike.ts": [...rng(117, 121), ...rng(91, 96)] },
};
const NONLINE = {
  D1: "hand-read-269-checks.py experiment",
  D3: "id format (26 base32 chars; calibration.md)",
  D4: "PR file list (no test file); .github/ai-review-rules.md § Testing bar",
  D5: "PR file list; ai-review-rules.md § Testing bar",
  D6: "PR file list",
  D7: "PR file list",
  D8: "PR file list",
  D11: "test-photos/s17-benchmark.json ROI values",
  D15: "Pillow 12.3.0 JpegImageFile.draft source",
  D17: "hand-read-269-checks.py experiment",
};
const ROWS = Object.keys(EVID);

// ---- Findings: the 38 raw findings, attempt by attempt ----
const rowOf = new Map();
for (const row of JSON.parse(git("show", `HEAD:${ARCH}hand-read-openai.json`))) {
  for (const ref of row.findings) rowOf.set(ref, row.id);
}
const attempts = git("show", `HEAD:${ARCH}gate-openai-pr269.jsonl`)
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line) => JSON.parse(line))
  .filter((entry) => entry.kind === "attempt");

const sameFinding = (a, b) =>
  a.file === b.file &&
  a.startLine === b.startLine &&
  a.endLine === b.endLine &&
  a.category === b.category &&
  a.description === b.description;

const findings = [];
const perAttempt = [];
let samplePrompt = null;
for (const record of attempts) {
  // As the pipeline does: merge, then assign the final F-ids (pipeline.ts).
  const identified = assignFindingIds(mergeFindings(record.findings));
  const plan = planExcerpts({ findings: identified, read: reader, diffPaths });
  const blocksById = new Map(plan.blocks.map((block) => [block.blockId, block]));
  const verifiable = identified.filter((f) => "blockIds" in plan.perFinding[f.id]);
  const instructions = buildVerifierInstructions();
  const prompt = buildVerifierPrompt({ findings: verifiable, blocks: plan.blocks, perFinding: plan.perFinding });
  perAttempt.push({
    attempt: record.attempt,
    findings: identified.length,
    verifiable: verifiable.length,
    excerpts: plan.telemetry,
    verifierInputChars: instructions.length + prompt.length,
    promptChars: prompt.length,
    instructionsChars: instructions.length,
  });
  if (samplePrompt === null && verifiable.length > 0) samplePrompt = { attempt: record.attempt };

  record.findings.forEach((raw, index) => {
    const ref = `${String(record.attempt)}.${String(index + 1)}`;
    const finding = identified.find((f) => sameFinding(f, raw));
    if (finding === undefined) throw new Error(`finding ${ref} lost in mergeFindings`);
    const entry = plan.perFinding[finding.id];
    const blocks = "blockIds" in entry ? entry.blockIds.map((id) => blocksById.get(id)) : [];
    const delivered = (path, line) => blocks.some((b) => b.path === path && b.startLine <= line && line <= b.endLine);
    const row = rowOf.get(ref);
    const evidence = EVID[row];
    const lines = Object.entries(evidence).flatMap(([path, xs]) => xs.map((x) => ({ path, line: x })));
    const servedLines = lines.filter(({ path, line }) => delivered(path, line));
    findings.push({
      ref,
      row,
      id: finding.id,
      file: raw.file,
      startLine: raw.startLine ?? null,
      endLine: raw.endLine ?? null,
      category: raw.category,
      state: "blockIds" in entry ? "excerpted" : `unverifiable:${entry.unverifiable}`,
      detail: "blockIds" in entry ? null : entry.detail,
      blocks: blocks.map((b) => `${b.blockId} ${b.path}:${String(b.startLine)}-${String(b.endLine)}`),
      lines: blocks.reduce((t, b) => t + b.endLine - b.startLine + 1, 0),
      chars: blocks.reduce((t, b) => t + b.text.length, 0),
      evidenceLines: lines.length,
      evidenceServed: servedLines.length,
      served:
        lines.length === 0
          ? "no line evidence"
          : servedLines.length === lines.length
            ? "full"
            : servedLines.length > 0
              ? "partly"
              : "none",
      // Evidence by file, for the D13-style checks: which lines are missing.
      missing: lines.filter((x) => !servedLines.includes(x)).map(({ path, line }) => `${path}:${String(line)}`),
    });
  });
}
if (findings.length !== 38) throw new Error(`expected 38 findings, got ${String(findings.length)}`);

// ---- Rows: the best contributing finding decides ----
const RANK = { full: 3, partly: 2, none: 1, "no line evidence": 0 };
const rows = ROWS.map((row) => {
  const contributing = findings.filter((f) => f.row === row);
  const best = contributing.reduce((a, b) => (RANK[b.served] > RANK[a.served] ? b : a));
  return {
    row,
    findings: contributing.map((f) => f.ref),
    served: best.served,
    bestFinding: best.ref,
    states: [...new Set(contributing.map((f) => f.state))],
    nonLineEvidence: NONLINE[row] ?? null,
    // Fully served AND nothing outside the code is needed to decide it.
    fullAndCodeOnly: best.served === "full" && NONLINE[row] === undefined,
  };
});

// D13 (research §7): is main's guard at contact-sheet.py 208–211 delivered
// with the build_photo finding? An excerpt of build_photo alone confirms the
// false claim.
const d13 = findings
  .filter((f) => f.row === "D13")
  .map((f) => ({
    ref: f.ref,
    cited: `${f.file}:${String(f.startLine)}${f.endLine === null ? "" : `-${String(f.endLine)}`}`,
    guardDelivered: !f.missing.some((m) => /contact-sheet\.py:(20[89]|21[01])$/u.test(m)) && f.blocks.length > 0,
    blocks: f.blocks,
  }));

const count = (xs, key, value) => xs.filter((x) => x[key] === value).length;
const summary = {
  policy: "EXCERPT_LIMITS as implemented (E1–E4, no E5)",
  limits: EXCERPT_LIMITS,
  rows: {
    total: rows.length,
    full: count(rows, "served", "full"),
    partly: count(rows, "served", "partly"),
    none: count(rows, "served", "none"),
    noLineEvidence: count(rows, "served", "no line evidence"),
    fullAndCodeOnly: rows.filter((r) => r.fullAndCodeOnly).length,
    researchFigure: "10 of 20 (research.md §7)",
  },
  findings: {
    total: findings.length,
    full: count(findings, "served", "full"),
    partly: count(findings, "served", "partly"),
    none: count(findings, "served", "none"),
    noLineEvidence: count(findings, "served", "no line evidence"),
    unverifiable: Object.fromEntries(
      [...new Set(findings.filter((f) => f.state !== "excerpted").map((f) => f.state))].map((s) => [
        s,
        count(findings, "state", s),
      ]),
    ),
    maxLines: Math.max(...findings.map((f) => f.lines)),
    maxChars: Math.max(...findings.map((f) => f.chars)),
  },
  perAttempt,
  verifierInputChars: {
    median: median(perAttempt.map((a) => a.verifierInputChars)),
    max: Math.max(...perAttempt.map((a) => a.verifierInputChars)),
  },
  d13,
  sampleAttempt: samplePrompt,
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[Math.floor(mid)];
}

writeFileSync(join(HERE, "backcheck-269-policy.json"), `${JSON.stringify({ summary, rows, findings }, null, 1)}\n`);

console.log("ROWS (20): best contributing finding");
for (const r of rows) {
  console.log(
    `  ${r.row.padEnd(4)} ${r.served.padEnd(16)} best=${r.bestFinding.padEnd(5)} ${r.states.join(",")}` +
      `${r.nonLineEvidence === null ? "" : `  [+ non-line: ${r.nonLineEvidence}]`}`,
  );
}
console.log("FINDINGS (38)");
for (const f of findings) {
  console.log(
    `  ${f.ref.padEnd(5)} ${f.row.padEnd(4)} ${f.id.padEnd(4)} ${f.state.padEnd(30)} served=${f.served.padEnd(16)} ` +
      `${String(f.evidenceServed)}/${String(f.evidenceLines)} lines=${String(f.lines)} chars=${String(f.chars)}`,
  );
}
console.log(`D13: ${JSON.stringify(d13)}`);
console.log(`SUMMARY ${JSON.stringify({ ...summary, perAttempt: undefined })}`);
console.log(`PER ATTEMPT ${JSON.stringify(perAttempt)}`);
