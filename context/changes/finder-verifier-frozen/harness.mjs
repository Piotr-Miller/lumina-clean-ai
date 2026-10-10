// finder-verifier-frozen harness: the SEALED verifier of finder-verification on the
// frozen, already-classified findings of finder-failure-scenario Phase 0.
//
// Code under test comes from a worktree at the pushed tag
// `finder-verification/seal` (9c85aa2), never from this branch. The harness
// refuses to run unless that worktree's `packages/code-reviewer/src` is the
// sealed tree, `scripts/finder-gate-core.mjs` is the sealed file, and neither has
// an uncommitted change. Every rule below is defined in plan.md § Definitions.
//
// Modes:
//   plan       free — the excerpt plan per batch and arm, and the evidence lines each
//              finding receives.
//   dry-run    free — the whole verification path through the real `createVerifier`,
//              with OpenRouter replaced by the package's own stub.
//   self-test  free — every scoring, failure, budget and durability rule on stubbed
//              HTTP, through the sealed code. No network.
//   run        PAID — the series. Refuses unless gate.md is sealed and its pins match.
//   reconcile  free of model calls — closes an interrupted attempt (reads the key counter).
//   report     free — every pre-registered table, from the series file alone.
//   blind      free — the blinded hand-read sheet for the code-refutable refutations.
//
// Run from the repository root:
//   FV_PKG=<worktree>/packages/code-reviewer npx tsx context/changes/finder-verifier-frozen/harness.mjs <mode> [flags]
//   run       --series <path> --repeats 3 --t0 <usd> --cap <usd> --price-in <usd/M> --price-out <usd/M> [--resume]
//   reconcile --series <path> --key <attempt id>
//   report    --series <path> [--grades <grades.json> --key <key.json>] [--out <file.json>]
//   blind     --series <path> --seed <64 hex> --out <dir>
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HARNESS_PATH = fileURLToPath(import.meta.url);
const MODES = ["plan", "dry-run", "self-test", "run", "reconcile", "report", "blind"];
const MODE = process.argv[2];
if (!MODES.includes(MODE)) throw new Error(`usage: harness.mjs ${MODES.join("|")} [flags]`);

// ---- Pins ----
const SEAL_COMMIT = "9c85aa27f418c6d8cb669b1bedddbb333799fa02";
const SEAL_SRC_TREE = "9be9423531d08ec932f82db7683e97d4da5ddf5c";
const CORPUS = "context/archive/2026-10-09-finder-failure-scenario/phase0-findings.json";
const CORPUS_SHA256 = "46aaa0f2407bb08139d416cfde9c80d9fee69d5c42c73febc3635d0225830740";
const PRS = {
  269: {
    base: "3d0adc1b4910c31973c6ac98a7ce776fcb68d878",
    head: "fca2778742ec0bc02a84f42b23bf639fc32c7ad1",
    diffSha256: "1e4ec0882371989122f9e4254c93c4df1f51826a4f57dbfe04139175177e550f",
  },
  247: {
    base: "d097949bf217ecafb3333f63e757af67cc7daf07",
    head: "dec09f8d77b2f1ee45073c194d6cd8239a7d35c7",
    diffSha256: "21973af35cc39f60488935583a85baf894a6c1a9b51069d16de86e701b5dc2e1",
  },
};
const VERIFIER = { model: "openai/gpt-6-luna", slug: "openai" };

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const sha256 = (text) => execFileSync("sha256sum", { input: text, encoding: "utf8" }).split(" ")[0];

// ---- The sealed code ----
const PKG = process.env.FV_PKG;
if (PKG === undefined) throw new Error("FV_PKG must point at <seal worktree>/packages/code-reviewer");
const wt = (...args) => execFileSync("git", ["-C", PKG, ...args], { encoding: "utf8" }).trim();
if (wt("rev-parse", "HEAD") !== SEAL_COMMIT) throw new Error(`FV_PKG is not at the seal commit ${SEAL_COMMIT}`);
if (wt("rev-parse", "HEAD:packages/code-reviewer/src") !== SEAL_SRC_TREE)
  throw new Error("src tree differs from the seal");
if (wt("status", "--porcelain", "--", "src") !== "") throw new Error("uncommitted change under the sealed src");

const src = (file) => import(join(PKG, "src", file));
const { planExcerpts } = await src("excerpts.ts");
const { mergeFindings } = await src("findings.ts");
const { assignFindingIds } = await src("scorecard.ts");
const { parseDiffPaths, readDiffScoped } = await src("source-provider.ts");
const { runVerificationPass } = await src("pipeline.ts");
const { applyVerdicts, createVerifier } = await src("verifier.ts");
const { withOneRetry } = await src("retry.ts");
const { buildVerifierInstructions } = await src("prompts.ts");
const { openRouterStub } = await src("openrouter-stub.ts");

// ---- Inputs, rebuilt and checked ----
const corpusText = git("show", `HEAD:${CORPUS}`);
if (sha256(corpusText) !== CORPUS_SHA256) throw new Error("frozen corpus changed");
const corpus = JSON.parse(corpusText);
if (corpus.length !== 75) throw new Error(`expected 75 frozen findings, got ${String(corpus.length)}`);

const sources = {};
for (const [pr, pin] of Object.entries(PRS)) {
  const diff = git(
    "diff",
    `${pin.base}...${pin.head}`,
    "--",
    ".",
    ":(exclude,glob)**/reviews/*.md",
    ":(exclude,glob)**/results/*.json",
    ":(exclude,glob)**/ground-truth/*",
    ":(exclude,glob)**/*.md",
    ":(exclude,glob)**/*.jsonl",
  );
  if (sha256(diff) !== pin.diffSha256) throw new Error(`#${pr} diff does not reproduce: sha256 ${sha256(diff)}`);
  // The real read core over the committed tree at the head (as backcheck-269-policy.mjs).
  const root = `/${pin.head.slice(0, 7)}`;
  const strip = (path) => path.slice(root.length + 1);
  const reader = readDiffScoped({
    allowedPaths: parseDiffPaths(diff),
    root,
    realpath: (path) => path,
    isRegularFile: (path) => {
      try {
        return git("cat-file", "-t", `${pin.head}:${strip(path)}`).trim() === "blob";
      } catch {
        return false;
      }
    },
    readFile: (path) => git("show", `${pin.head}:${strip(path)}`),
  });
  const lines = new Map();
  const fileLines = (path) => {
    if (!lines.has(path)) lines.set(path, git("show", `${pin.head}:${path}`).replace(/\n$/u, "").split("\n"));
    return lines.get(path);
  };
  sources[pr] = { reader, fileLines };
}

// ---- Evidence lines for arm O ----
// G (#269): backcheck-269.py's EVID, ported verbatim from backcheck-269-policy.mjs.
// H (#247): proposed by the agent from finder-sonnet/hand-read-247.md, then corrected
// and approved by the owner on 2026-10-09 against dec09f8 (change.md). E rows carry
// none (descriptive set): O equals base there.
// "All evidence lines served" means every listed line, not all the evidence: Pillow's
// source, ROI data, experiments and the PR file list are not lines (owner, 2026-10-09).
const rng = (a, b = a) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const EVID = {
  "G-D1": { "scripts/s17/decode-inputs.py": rng(131, 142) },
  "G-D2": { "scripts/spikes/bread-spike.ts": [79, ...rng(91, 96), ...rng(189, 195), ...rng(198, 213)] },
  "G-D3": { "scripts/s17/contact-sheet.py": rng(150, 151), "scripts/spikes/bread-spike.ts": [233] },
  "G-D4": { "scripts/s17/decode-inputs.py": rng(1, 49) },
  "G-D5": {},
  "G-D6": { "scripts/s17/auto-values.ts": rng(14, 16) },
  "G-D7": { "scripts/s17/contact-sheet.py": rng(208, 211) },
  "G-D8": { "scripts/s17/desktop-stats.ts": rng(103, 136) },
  "G-D9": { "scripts/s17/desktop-stats.ts": [...rng(18, 23), ...rng(92, 100), ...rng(104, 111)] },
  "G-D10": { "scripts/s17/desktop-stats.ts": [...rng(18, 23), ...rng(56, 62), ...rng(92, 100)] },
  "G-D11": { "scripts/measure-hue-shares.py": [...rng(113, 114), ...rng(127, 132), ...rng(150, 152)] },
  "G-D12": { "scripts/measure-hue-shares.py": [...rng(37, 41), ...rng(143, 144)] },
  "G-D13": { "scripts/s17/contact-sheet.py": [...rng(208, 211), 215, ...rng(221, 222)] },
  "G-D14": { "scripts/s17/contact-sheet.py": [...rng(20, 24), ...rng(139, 146), 151] },
  "G-D15": { "scripts/s17/decode-inputs.py": [...rng(137, 140), ...rng(146, 149)] },
  "G-D16": { "scripts/s17/decode-inputs.py": [...rng(175, 176), ...rng(183, 193), 170] },
  "G-D17": { "scripts/s17/decode-inputs.py": [...rng(88, 102), ...rng(135, 140), ...rng(146, 149)] },
  "G-D18": {
    "scripts/s17/auto-values.ts": rng(39, 41),
    "scripts/s17/decode-inputs.py": rng(183, 185),
    "scripts/s17/browser-stats.ts": rng(80, 84),
  },
  "G-D19": { "scripts/s17/browser-stats.ts": rng(162, 191), "scripts/s17/harness.ts": rng(43, 51) },
  "G-D20": { "scripts/spikes/bread-spike.ts": [...rng(117, 121), ...rng(91, 96)] },
  "H-R1": { "scripts/prod-fetch-results.py": [...rng(2, 25), 38] },
  "H-R2": { "scripts/prod-fetch-results.py": rng(47, 56), "scripts/prod-result-dimensions.py": rng(62, 67) },
  "H-R3": { "scripts/prod-fetch-results.py": [68, ...rng(90, 93)] },
  "H-R4": { "scripts/prod-result-dimensions.py": [...rng(79, 98), ...rng(116, 128)] },
  "H-R5": { "scripts/prod-result-dimensions.py": [102, 109, ...rng(138, 139)] },
};

// The scoring class of each owner-classified row (owner decisions 3 and 7, change.md).
// H-R4 is ambiguous: verified whole, it joins a false JPEG claim to a true short-PNG
// exception (`:82`), so `unsupported` is not necessarily a model error.
const CLASS = {
  true: ["G-D2", "H-R1", "H-R3", "H-R5"],
  "false-code-refutable": ["G-D13", "G-D14", "G-D20"],
  ambiguous: ["G-D12", "G-D1", "G-D15", "G-D3", "G-D11", "G-D17", "H-R4"],
  policy: ["G-D4", "G-D5", "G-D6", "G-D7", "G-D8", "G-D9", "G-D10", "G-D16", "G-D18", "G-D19", "H-R2"],
};
const classOf = (row) =>
  row.startsWith("E-") ? "descriptive" : (Object.entries(CLASS).find(([, rows]) => rows.includes(row))?.[0] ?? "?");

// ---- Batches: one per original run/attempt, as production would have verified them ----
const batches = new Map();
for (const record of corpus) {
  const run = record.member.split("#")[0];
  if (!batches.has(run)) batches.set(run, { run, set: record.set, pr: String(record.pr), members: [] });
  batches.get(run).members.push(record);
}

const sameFinding = (a, b) =>
  a.file === b.file &&
  a.startLine === b.startLine &&
  a.endLine === b.endLine &&
  a.category === b.category &&
  a.description === b.description;
const withoutId = ({ id: _id, ...finding }) => finding;

// Renders a range exactly as excerpts.ts renderRange does (`NNNN| `, `NNNN>| ` when cited).
function renderLines(fileLines, start, end, cited) {
  const width = String(fileLines.length).length;
  const out = [];
  for (let n = start; n <= end; n += 1) {
    const mark = cited !== undefined && n >= cited.start && n <= cited.end ? ">" : "";
    out.push(`${String(n).padStart(width)}${mark}| ${fileLines[n - 1]}`);
  }
  return out.join("\n");
}

const runs = (sorted) => {
  const out = [];
  for (const n of sorted) {
    const last = out.at(-1);
    if (last !== undefined && n === last.end + 1) last.end = n;
    else out.push({ start: n, end: n });
  }
  return out;
};

// Arm O: the base plan, unchanged, plus one extra block per contiguous run of a
// finding's evidence lines that its own base blocks do not already hold. Nothing
// in the base plan is removed or reordered, so O differs from base only by evidence.
function augment(plan, identified, memberOf, source) {
  const blocks = [...plan.blocks];
  const perFinding = structuredClone(plan.perFinding);
  for (const finding of identified) {
    const entry = perFinding[finding.id];
    if (!("blockIds" in entry)) continue;
    const evidence = EVID[memberOf.get(finding.id).row] ?? {};
    const own = entry.blockIds.map((id) => blocks.find((b) => b.blockId === id));
    const cited =
      finding.startLine === undefined
        ? undefined
        : { start: finding.startLine, end: finding.endLine ?? finding.startLine };
    for (const [path, lines] of Object.entries(evidence)) {
      const missing = [...new Set(lines)]
        .filter((n) => !own.some((b) => b.path === path && b.startLine <= n && n <= b.endLine))
        .sort((a, b) => a - b);
      for (const range of runs(missing)) {
        const block = {
          blockId: `B${String(blocks.length + 1)}`,
          path,
          startLine: range.start,
          endLine: range.end,
          text: renderLines(source.fileLines(path), range.start, range.end, path === finding.file ? cited : undefined),
        };
        blocks.push(block);
        entry.blockIds.push(block.blockId);
      }
    }
  }
  return { blocks, perFinding };
}

function prepare(batch) {
  const source = sources[batch.pr];
  const identified = assignFindingIds(mergeFindings(batch.members.map((m) => withoutId(m.finding))));
  const memberOf = new Map();
  const idOf = new Map();
  for (const member of batch.members) {
    const finding = identified.find((f) => sameFinding(f, member.finding));
    if (finding === undefined) throw new Error(`member ${member.member} lost in mergeFindings`);
    if (memberOf.has(finding.id)) throw new Error(`members collapse onto ${finding.id} in ${batch.run}`);
    memberOf.set(finding.id, member);
    idOf.set(member.member, finding.id);
  }
  const reader = source.reader;
  const base = planExcerpts({ findings: identified, read: reader, diffPaths: reader.paths });
  const oracle = augment(base, identified, memberOf, source);
  return { source, identified, memberOf, idOf, reader, plans: { base, O: oracle } };
}

function serving(plan, finding, member) {
  const entry = plan.perFinding[finding.id];
  if (!("blockIds" in entry)) return { state: `unverifiable:${entry.unverifiable}`, blocks: [] };
  const blocks = entry.blockIds.map((id) => plan.blocks.find((b) => b.blockId === id));
  const evidence = Object.entries(EVID[member.row] ?? {}).flatMap(([path, xs]) => xs.map((line) => ({ path, line })));
  const served = evidence.filter(({ path, line }) =>
    blocks.some((b) => b.path === path && b.startLine <= line && line <= b.endLine),
  );
  return {
    state: "excerpted",
    blocks: blocks.map((b) => `${b.blockId} ${b.path}:${String(b.startLine)}-${String(b.endLine)}`),
    lines: blocks.reduce((t, b) => t + b.endLine - b.startLine + 1, 0),
    chars: blocks.reduce((t, b) => t + b.text.length, 0),
    evidence: evidence.length === 0 ? "none defined" : `${String(served.length)}/${String(evidence.length)}`,
    missing: evidence.filter((x) => !served.includes(x)).map(({ path, line }) => `${path}:${String(line)}`),
  };
}

// ======================================================================
// Phase 1: paid run, reconcile, report, blind, self-test
// ======================================================================

// ---- More sealed code: the gate core's request recorder and error classifier ----
const GATE_CORE_SHA256 = "e713226c84ce35d7f29fd2644660e823a91645c653761ee8f33e9a5f784bcb17";
const GATE_CORE_PATH = join(PKG, "scripts", "finder-gate-core.mjs");
const fileSha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
if (fileSha256(GATE_CORE_PATH) !== GATE_CORE_SHA256)
  throw new Error("scripts/finder-gate-core.mjs differs from the seal");
if (wt("status", "--porcelain", "--", "scripts/finder-gate-core.mjs") !== "")
  throw new Error("uncommitted change to the sealed scripts/finder-gate-core.mjs");
const { describeRequest, classify, isModelAttributableError } = await import(GATE_CORE_PATH);
const { DEFAULT_VERIFIER_TIMEOUT_MS } = await src("pipeline.ts");
const { buildVerifierPrompt } = await src("prompts.ts");
const HARNESS_SHA256 = fileSha256(HARNESS_PATH);

// ---- Frozen scoring inputs (owner decisions 2, 8 and 10; approved at the Phase 2 seal) ----
// Findings whose description makes two or more separately checkable claims. Flagged in the
// report, never split (owner decision 2). Agent proposal, 2026-10-10, completed on the owner's review.
const COMPOUND = [
  "openai-pr269-01#1.3", // G-D9: missing baseline → uncaught exception; malformed values mislead
  "openai-pr269-09#9.4", // G-D10: malformed JSON escapes; missing entries cause unrelated errors
  "openai-pr269-05#5.2", // G-D13: unreachable ValueError; silent empty index
  "openai-pr269-09#9.1", // G-D14: enlargement; aspect distortion
  "247-r1#1", // H-R2: no key-shape check; no localhost check
  "247-r1#3", // H-R4: JPEG SOF past the range (false); any truncated header (true for short PNG)
  "medium-247-r2#3", // E-R247-09: false negatives from stale files; false positives from reuse
  // Added 2026-10-10 on the owner's review of the draft gate.md (a testing claim joined to a defect claim):
  "openai-pr269-05#5.4", // G-D7: no tests for the empty cases; an uncaught exception (refuted by D13's rationale)
  "openai-pr269-01#1.5", // G-D4: no decoder tests; the orientation sizing defect (D1's claim)
  "openai-pr269-07#7.4", // G-D5: no tests; the cleanup path and empty/malformed regions have failure cases
];
// The pre-registered rationales for the code-refutable rows, verbatim from
// context/archive/2026-10-02-finder-model-swap/hand-read-269-presort.md:22,26,31, and the
// hand-read rule (owner decision 10).
const RATIONALE = {
  rule:
    "Sukces wymaga refuted, cytatu przechodzącego zapieczętowany quote check oraz argumentu, który wraz z " +
    "cytatem rzeczywiście obala zamrożoną tezę. Hand-read stosuje wcześniej zapisane uzasadnienia. Nietrafiony " +
    "argument i brak poprawnego cytatu są raportowane osobno.",
  "G-D13":
    'A requested id with no runs exits with "no runs found for …" before `build_photo` is called, so `min(sizes)` ' +
    'never sees an empty set; an empty default scan writes the index and prints "0 photo(s), 0 run(s)" to stderr.',
  "G-D14":
    'The claim inverts the arithmetic: outputs smaller than the original make line 146 a downscale, the documented rule ("an output is never enlarged") is honoured at line 151, and every image on one sheet comes from the same photo, so the aspect ratios agree to rounding.',
  "G-D20":
    '`return` at line 120 leaves `runPrediction` itself (a `return` inside an `if` returns from the enclosing function), so nothing parses the error body or polls; `main`\'s `finally` runs the cleanup and the process ends with exit code 1 (the predecessor rejected the "fragile" version of this claim, N45).',
};

// Canonical JSON (sorted keys) so a pin does not depend on key order.
const canon = (v) =>
  Array.isArray(v)
    ? `[${v.map(canon).join(",")}]`
    : v !== null && typeof v === "object"
      ? `{${Object.keys(v)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canon(v[k])}`)
          .join(",")}}`
      : JSON.stringify(v);
const hashCanon = (v) => createHash("sha256").update(canon(v)).digest("hex");
const PINS = {
  sealCommit: SEAL_COMMIT,
  srcTree: SEAL_SRC_TREE,
  gateCore: GATE_CORE_SHA256,
  corpus: CORPUS_SHA256,
  diffs: { 269: PRS[269].diffSha256, 247: PRS[247].diffSha256 },
  evid: hashCanon(EVID),
  class: hashCanon(CLASS),
  compound: hashCanon(COMPOUND),
  rationale: hashCanon(RATIONALE),
  model: VERIFIER.model,
  slug: VERIFIER.slug,
};
const ROUTING = { order: [VERIFIER.slug], only: [VERIFIER.slug], allow_fallbacks: true, require_parameters: true };
const ARMS = ["base", "O"];
const OUTPUT_CAP_TOKENS = 16_384; // the sealed MAX_OUTPUT_TOKENS, sent as max_tokens on every request
const CAP_HARD = 1.0;

// ---- Errors: a refusal says what is true, what it looked at, and how to proceed ----
class HarnessRefusal extends Error {
  constructor(message) {
    super(message);
    this.name = "HarnessRefusal";
  }
}
class HarnessCrash extends Error {} // self-test only: simulates the process dying mid-attempt
class BudgetStop extends Error {}
class ViolationStop extends Error {}
class UnboundedRequest extends Error {}
const refuse = (message) => {
  throw new HarnessRefusal(message);
};

// ---- Series file: append-only, one fsync per line ----
const nowIso = () => new Date().toISOString();
// The file operations go through FS so the self-test can observe that every line is
// fsync'd before the request it records is sent (review F4). Production uses node:fs.
let FS = { openSync, writeSync, fsyncSync, closeSync };
function appendLine(path, obj) {
  const fd = FS.openSync(path, "a");
  try {
    FS.writeSync(fd, `${JSON.stringify(obj)}\n`);
    FS.fsyncSync(fd);
  } finally {
    FS.closeSync(fd);
  }
}
const readLines = (path) =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l));

function seriesState(lines) {
  const header = lines[0];
  if (header?.kind !== "header") refuse("the series file has no header line; it was not written by this harness");
  const attempts = new Map();
  const byKey = new Map();
  let counterMax = null;
  for (const line of lines.slice(1)) {
    if (line.kind === "counter") counterMax = Math.max(counterMax ?? -Infinity, line.usage);
    else if (line.kind === "start") {
      const a = { start: line, requests: [], end: null, interrupted: null };
      attempts.set(line.id, a);
      if (!byKey.has(line.key)) byKey.set(line.key, []);
      byKey.get(line.key).push(a);
    } else if (line.kind === "request") attempts.get(line.id)?.requests.push(line);
    else if (line.kind === "end") attempts.get(line.id).end = line;
    else if (line.kind === "interrupted") attempts.get(line.id).interrupted = line;
  }
  const open = [...attempts.values()].filter((a) => a.end === null && a.interrupted === null);
  let recorded = 0;
  for (const a of attempts.values()) recorded += a.end?.cost ?? a.interrupted?.cost ?? 0;
  return { header, attempts, byKey, open, recorded, counterMax };
}
// T = max(C − T0, Σ recorded): the counter can only raise T; recorded spend counts once.
const spendT = (state) => Math.max(state.counterMax === null ? 0 : state.counterMax - state.header.t0, state.recorded);
// A slot is done unless its latest attempt was a condition violation (owner decision
// 2026-10-10: the violated slot gets one fresh attempt on resume) or is still open.
function slotDone(list) {
  const last = list?.at(-1);
  if (last === undefined) return false;
  if (last.interrupted !== null) return true;
  if (last.end === null) return false;
  return last.end.status !== "condition-violation";
}

// ---- Cost bounds ----
const perToken = (prices) => ({ pin: prices.inPerM / 1e6, pout: prices.outPerM / 1e6 });
// Request gate bound (plan § Definitions, Request gate): conditional on A1–A3.
function requestBound(body, prices) {
  if (typeof body?.max_tokens !== "number" || !Array.isArray(body?.messages)) return null;
  const { pin, pout } = perToken(prices);
  const bytes = Buffer.byteLength(JSON.stringify(body.messages), "utf8");
  const m = body.messages.length;
  const tokIn = bytes + 32 * m + 32;
  return { bytes, messages: m, maxTokens: body.max_tokens, tokIn, bound: 1.1 * (tokIn * pin + body.max_tokens * pout) };
}
// Admission reserve P (plan § Definitions, P): decides only whether to start an attempt.
function admissionP(callBytes, prices) {
  const { pin, pout } = perToken(prices);
  const repairBytes = 3000 + 4 * OUTPUT_CAP_TOKENS;
  return (
    1.1 *
    2 *
    ((callBytes + 256) * pin + OUTPUT_CAP_TOKENS * pout + (repairBytes + 256) * pin + OUTPUT_CAP_TOKENS * pout)
  );
}
// E (plan § Definitions, E): the expected cost, for reporting only.
function expectedE(callBytes, sent, prices) {
  const { pin, pout } = perToken(prices);
  return (callBytes / 3.5) * pin + 60 * sent * pout;
}
function callMessagesBytes(plan, identified) {
  const sent = identified.filter((f) => "blockIds" in plan.perFinding[f.id]);
  if (sent.length === 0) return { sent: 0, bytes: 0 };
  const prompt = buildVerifierPrompt({ findings: sent, blocks: plan.blocks, perFinding: plan.perFinding });
  const messages = [
    { role: "system", content: buildVerifierInstructions() },
    { role: "user", content: prompt },
  ];
  return { sent: sent.length, bytes: Buffer.byteLength(JSON.stringify(messages), "utf8") + 200 };
}

// ---- Classification (plan § Definitions, Error precedence; first match wins) ----
const chainOf = (error) => {
  const out = [];
  let x = error;
  for (let i = 0; i < 8 && x !== undefined && x !== null; i += 1) {
    out.push(x);
    x = x.cause;
  }
  return out;
};
function stepViolations(requests, steps) {
  for (const r of requests) {
    if (r.blocked) continue;
    if (typeof r.status === "number" && r.status >= 200 && r.status < 300) {
      if (r.provider === null) return "provider-missing";
      if (r.provider !== "OpenAI") return `provider-${r.provider}`;
    }
    if ((r.reasoningTokens ?? 0) > 0) return "reasoning-tokens (wire)";
    if (r.reasoningChars > 0) return "reasoning-text (wire)";
    if (r.promptTokens !== null && r.promptTokens > r.tokIn) return "prompt-tokens-above-bound (A1/A2 broke)";
    if (r.cost !== null && r.cost > r.bound) return "cost-above-bound (A1–A3 broke)";
  }
  // Steps exist only for successful responses (the sealed gate's provider rule).
  for (const s of steps) {
    if (s.provider === null) return "provider-missing";
    if (s.provider !== "OpenAI") return `provider-${s.provider}`;
    if ((s.reasoningTokens?.sdk ?? 0) > 0) return "reasoning-tokens (SDK)";
    if ((s.reasoningTokens?.openrouter ?? 0) > 0) return "reasoning-tokens (OpenRouter metadata)";
    if ((s.reasoningTextChars ?? 0) > 0) return "reasoning-text (SDK)";
  }
  return null;
}
const accountOf = (rec) => (rec.status === 401 || rec.status === 402 ? `account-${String(rec.status)}` : null);
// Recorded violations and account errors outrank a budget stop (review F1): a slot whose
// conditions were broken gets its fresh attempt on resume, never a permanent "not met".
function classifyAttempt({ error, requests, steps, budgetStopped, unbounded, latched }) {
  if (unbounded) return { status: "condition-violation", cause: "unbounded-request (no max_tokens)" };
  const account = [...chainOf(error).map((x) => x?.statusCode), ...requests.map((r) => r.status)].find(
    (s) => s === 401 || s === 402,
  );
  if (account !== undefined) return { status: "condition-violation", cause: `account-${String(account)}` };
  if (latched !== undefined && latched !== null) return { status: "condition-violation", cause: latched };
  const violation = stepViolations(requests, steps);
  if (violation !== null) return { status: "condition-violation", cause: violation };
  if (budgetStopped) return { status: "budget-stopped", cause: "budget" };
  if (error === undefined || error === null) return { status: "ok", cause: null };
  if (isModelAttributableError(error)) {
    if (error?.name === "VerifierOutputError")
      return {
        status: "failed-attempt",
        cause: !error.repaired && error.finishReason === "length" ? "length" : "format",
      };
    return { status: "failed-attempt", cause: classify(error) };
  }
  if (chainOf(error).some((x) => x?.name === "AI_NoOutputGeneratedError"))
    return { status: "failed-attempt", cause: "no-output" };
  return { status: "condition-violation", cause: `measurement-error:${classify(error)}` };
}

// ---- One attempt: both arms through the same gate and the same telemetry ----
function gatedFetch(ctx) {
  return async (url, init) => {
    // A violation already observed on this attempt stops every later send (review F1).
    if (ctx.latched !== undefined)
      throw new ViolationStop(`request not sent: ${ctx.latched} was observed on an earlier request of this attempt`);
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}");
    const b = requestBound(body, ctx.prices);
    if (b === null) {
      ctx.unbounded = true;
      throw new UnboundedRequest("a request without max_tokens cannot be bounded; refused, nothing sent");
    }
    const spentInAttempt = ctx.requests.reduce((t, r) => t + (r.blocked ? 0 : (r.cost ?? r.bound)), 0);
    const rec = {
      n: ctx.requests.length + 1,
      ...b,
      blocked: false,
      status: null,
      provider: null,
      cost: null,
      promptTokens: null,
      completionTokens: null,
      reasoningTokens: null,
      reasoningChars: 0,
      finishReason: null,
      content: null,
      generationId: null,
      serviceTier: null,
      error: null,
    };
    if (ctx.Tbase + spentInAttempt + b.bound > ctx.cap) {
      rec.blocked = true;
      ctx.requests.push(rec);
      ctx.budgetStopped = { T: ctx.Tbase + spentInAttempt, bound: b.bound, cap: ctx.cap };
      throw new BudgetStop(`request ${String(rec.n)} not sent: T + bound > cap`);
    }
    appendLine(ctx.seriesPath, { kind: "request", id: ctx.id, n: rec.n, ...b, at: nowIso() });
    ctx.requests.push(rec);
    ctx.hooks?.beforeSend?.(rec);
    let res;
    try {
      res = await ctx.fetchImpl(url, init);
    } catch (error) {
      rec.error = `${error?.name ?? typeof error}: ${String(error?.message ?? error).slice(0, 200)}`;
      throw error;
    }
    rec.status = res.status;
    try {
      const data = await res.clone().json();
      rec.provider = typeof data?.provider === "string" && data.provider !== "" ? data.provider : null;
      const u = data?.usage ?? {};
      rec.cost = typeof u.cost === "number" && Number.isFinite(u.cost) ? u.cost : null;
      rec.promptTokens = typeof u.prompt_tokens === "number" ? u.prompt_tokens : null;
      rec.completionTokens = typeof u.completion_tokens === "number" ? u.completion_tokens : null;
      const rt = u.completion_tokens_details?.reasoning_tokens;
      rec.reasoningTokens = typeof rt === "number" ? rt : null;
      const message = data?.choices?.[0]?.message;
      rec.reasoningChars = typeof message?.reasoning === "string" ? message.reasoning.length : 0;
      rec.finishReason = data?.choices?.[0]?.finish_reason ?? null;
      rec.content = typeof message?.content === "string" ? message.content : null;
      // Amendment 1: the audit trail for the served endpoint tier. Recorded only; it changes no
      // request and no scoring. A missing or null field stays null ("undetermined").
      rec.generationId = typeof data?.id === "string" && data.id !== "" ? data.id : null;
      rec.serviceTier = typeof data?.service_tier === "string" && data.service_tier !== "" ? data.service_tier : null;
    } catch {
      // A body that is not JSON carries no usage: the request is charged its bound.
    }
    // Latch the first observable violation now, before the SDK can repair or retry.
    const seen = accountOf(rec) ?? stepViolations([rec], []);
    if (seen !== null && ctx.latched === undefined) ctx.latched = seen;
    return res;
  };
}

async function runAttempt({ prepared, arm, ctx }) {
  const plan = prepared.plans[arm];
  const fetchImpl = gatedFetch(ctx);
  const make = (options) =>
    createVerifier({
      ...options,
      apiKey: ctx.apiKey,
      fetch: fetchImpl,
      providerRouting: ROUTING,
      onStepEnd: (step) => {
        const described = describeRequest("verifier", step);
        ctx.steps.push(described);
        const seen = stepViolations([], [described]);
        if (seen !== null && ctx.latched === undefined) ctx.latched = seen;
        options.onStepEnd?.(step);
      },
    });
  const started = performance.now();
  let records = [];
  let published = [];
  let error;
  try {
    ctx.hooks?.beforeVerify?.();
    if (arm === "base") {
      // The sealed pass itself, unchanged.
      const pass = await runVerificationPass({
        findings: prepared.identified,
        reader: prepared.reader,
        requireVerification: true,
        model: VERIFIER.model,
        apiKey: ctx.apiKey,
        createVerifier: make,
        timeoutMs: ctx.timeoutMs ?? DEFAULT_VERIFIER_TIMEOUT_MS,
        ...(ctx.sleep === undefined ? {} : { sleep: ctx.sleep }),
      });
      records = pass.verification.verdicts;
      published = pass.published;
    } else {
      // Arm O: step 3 of runVerificationPass on the augmented plan.
      const sent = prepared.identified.filter((f) => "blockIds" in plan.perFinding[f.id]);
      const output =
        sent.length === 0
          ? { verdicts: [] }
          : await withOneRetry(
              () =>
                make({ model: VERIFIER.model }).verify(
                  { findings: sent, blocks: plan.blocks, perFinding: plan.perFinding },
                  { timeoutMs: ctx.timeoutMs ?? DEFAULT_VERIFIER_TIMEOUT_MS },
                ),
              ctx.sleep === undefined ? {} : { sleep: ctx.sleep },
            );
      const applied = applyVerdicts({ findings: prepared.identified, plan, output });
      records = applied.records;
      published = applied.published;
    }
  } catch (caught) {
    if (caught instanceof HarnessCrash) throw caught;
    error = caught;
  }
  const verdict = classifyAttempt({
    error,
    requests: ctx.requests,
    steps: ctx.steps,
    budgetStopped: ctx.budgetStopped !== undefined,
    unbounded: ctx.unbounded === true,
    latched: ctx.latched,
  });
  const sentRequests = ctx.requests.filter((r) => !r.blocked);
  const cost = sentRequests.reduce((t, r) => t + (r.cost ?? r.bound), 0);
  const flags = [];
  if (verdict.status === "ok" && sentRequests.some((r) => r.finishReason === "length")) flags.push("length");
  if (sentRequests.some((r) => r.cost === null)) flags.push("cost-incomplete");
  const publishedIds = new Set(published.map((f) => f.id));
  return {
    ...verdict,
    flags,
    latencyMs: Math.round(performance.now() - started),
    cost,
    costComplete: sentRequests.every((r) => r.cost !== null),
    requests: ctx.requests,
    steps: ctx.steps,
    records:
      verdict.status === "ok"
        ? records.map((r) => ({
            member: prepared.memberOf.get(r.id).member,
            id: r.id,
            state: r.state,
            reasonCode: r.reasonCode ?? null,
            modelVerdict: r.modelVerdict ?? null,
            quote: r.quote ?? null,
            quoteVerified: r.quoteVerified ?? null,
            quoteMatch: r.quoteMatch ?? null,
            reason: r.reason ?? null,
            blockIds: r.blockIds ?? [],
            published: publishedIds.has(r.id),
          }))
        : [],
    error:
      error === undefined
        ? null
        : chainOf(error).map((x) => ({
            name: x?.name ?? typeof x,
            message: String(x?.message ?? x).slice(0, 300),
            statusCode: x?.statusCode ?? null,
          })),
  };
}

// ---- Seal check (Phase 2 writes gate.md; a run refuses anything else) ----
function preRegistrationSection(text) {
  const lines = text.split("\n");
  const a = lines.indexOf("## Pre-registration");
  const b = lines.findIndex((l, i) => i > a && l === "_End of Pre-registration._");
  if (a < 0 || b < 0) return null;
  return `${lines.slice(a, b + 1).join("\n")}\n`;
}
function checkSeal(gatePath) {
  if (!existsSync(gatePath))
    refuse(
      `no ${gatePath}: the pre-registration is not written or sealed yet (plan Phase 2). No paid call before the seal.`,
    );
  const text = readFileSync(gatePath, "utf8");
  const section = preRegistrationSection(text);
  if (section === null) refuse(`${gatePath} has no "## Pre-registration" … "_End of Pre-registration._" section.`);
  // The heading as a whole line: the file's own preamble mentions "## Pre-registration seal" in prose.
  const textLines = text.split("\n");
  const sealLine = textLines.indexOf("## Pre-registration seal");
  const sealSection =
    sealLine < 0
      ? ""
      : textLines
          .slice(sealLine)
          .join("\n")
          .split(/\n(?=## )/u)[0];
  const sealed = sealLine < 0 ? null : sealSection.match(/\*\*`([0-9a-f]{64})`\*\*/u);
  if (sealed === null) refuse(`${gatePath} is not sealed: no recorded sha256 under "## Pre-registration seal".`);
  const actual = createHash("sha256").update(section, "utf8").digest("hex");
  if (sealed[1] !== actual)
    refuse(
      `the pre-registration changed after the seal: recorded ${sealed[1]}, now ${actual}. The seal is never recomputed.`,
    );
  const pinsBlock = section.match(/```json pins\n([\s\S]*?)\n```/u);
  if (pinsBlock === null) refuse("the pre-registration has no ```json pins``` block.");
  const sealedPins = { ...JSON.parse(pinsBlock[1]) };
  sealedPins.harness = harnessPinInForce(text, sealedPins.harness);
  const expected = { ...PINS, harness: HARNESS_SHA256 };
  const differing = [...new Set([...Object.keys(sealedPins), ...Object.keys(expected)])].filter(
    (k) => canon(sealedPins[k]) !== canon(expected[k]),
  );
  if (differing.length > 0)
    refuse(`the sealed pins differ from this harness and its inputs: ${differing.join(", ")}. Nothing was sent.`);
}

// Amendments (gate.md § Amendments, after the seal): each `### Amendment N (…)` … `_End of Amendment N._`
// block carries its own recorded sha256 and a ```json amendment-pins``` block that may change ONLY the
// harness pin, naming the pin it supersedes. Applied in order 1, 2, …; anything else is refused.
function harnessPinInForce(text, sealedHarness) {
  const lines = text.split("\n");
  const sealLine = lines.indexOf("## Pre-registration seal");
  let current = sealedHarness;
  for (let n = 1; ; n += 1) {
    const start = lines.findIndex(
      (l) => l === `### Amendment ${String(n)}` || l.startsWith(`### Amendment ${String(n)} (`),
    );
    if (start < 0) break;
    if (start < sealLine) refuse(`amendment ${String(n)} sits before the seal; an amendment always follows it`);
    const end = lines.findIndex((l, i) => i > start && l === `_End of Amendment ${String(n)}._`);
    if (end < 0) refuse(`amendment ${String(n)} has no "_End of Amendment ${String(n)}._" line`);
    const block = `${lines.slice(start, end + 1).join("\n")}\n`;
    const tail = lines
      .slice(end + 1)
      .join("\n")
      .split(/\n(?=#{2,3} )/u)[0];
    const recorded = tail.match(/\*\*`([0-9a-f]{64})`\*\*/u);
    if (recorded === null) refuse(`amendment ${String(n)} has no recorded sha256 after its block`);
    const actual = createHash("sha256").update(block, "utf8").digest("hex");
    if (recorded[1] !== actual)
      refuse(`amendment ${String(n)} changed after it was recorded: recorded ${recorded[1]}, now ${actual}`);
    const pins = block.match(/```json amendment-pins\n([\s\S]*?)\n```/u);
    if (pins === null) refuse(`amendment ${String(n)} has no \`\`\`json amendment-pins\`\`\` block`);
    const ap = JSON.parse(pins[1]);
    if (canon(Object.keys(ap).sort()) !== canon(["harness", "supersedes"]))
      refuse(`amendment ${String(n)} may change only the harness pin; it names ${Object.keys(ap).join(", ")}`);
    if (ap.supersedes !== current)
      refuse(
        `amendment ${String(n)} supersedes ${String(ap.supersedes)}, but the harness pin in force is ${String(current)}`,
      );
    current = ap.harness;
  }
  return current;
}

// ---- The series ----
const slotList = (repeats, runIds, arms) => {
  const out = [];
  for (let r = 1; r <= repeats; r += 1)
    for (const run of runIds)
      for (const arm of arms) out.push({ key: `r${String(r)}/${run}/${arm}`, repeat: r, run, arm });
  return out;
};

async function liveCounter(apiKey) {
  const res = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) refuse(`reading the key counter failed: HTTP ${String(res.status)} from GET /api/v1/key`);
  const usage = (await res.json())?.data?.usage;
  if (typeof usage !== "number") refuse("GET /api/v1/key returned no numeric data.usage");
  return usage;
}

async function runSeries(opts) {
  const log = opts.log ?? ((line) => console.log(line));
  const repeats = Number(opts.repeats);
  if (!Number.isInteger(repeats) || repeats < 1) refuse("--repeats must be a positive integer");
  const cap = Number(opts.cap);
  if (!Number.isFinite(cap) || cap < 0) refuse("--cap is required (no default)");
  if (cap > CAP_HARD) refuse(`--cap ${String(cap)} is above the hard limit $${String(CAP_HARD)} (owner decision 12)`);
  if (!opts.allowOutside) {
    const rel = relative(HERE, resolve(opts.seriesPath));
    if (rel.startsWith("..") || rel === "") refuse(`the series must live in ${HERE}; got ${opts.seriesPath}`);
  }
  if (!opts.skipSealCheck) checkSeal(opts.gatePath ?? join(HERE, "gate.md"));
  const runIds = opts.runs ?? [...batches.keys()];
  const arms = opts.arms ?? ARMS;

  let header;
  if (!existsSync(opts.seriesPath)) {
    if (opts.resume) refuse(`--resume given but ${opts.seriesPath} does not exist`);
    for (const k of ["t0", "priceIn", "priceOut"])
      if (!Number.isFinite(Number(opts[k])))
        refuse(`--${k.replace(/[A-Z]/u, (c) => `-${c.toLowerCase()}`)} is required on the first invocation`);
    header = {
      kind: "header",
      version: 1,
      ...PINS,
      harness: HARNESS_SHA256,
      repeats,
      runs: runIds,
      arms,
      prices: { inPerM: Number(opts.priceIn), outPerM: Number(opts.priceOut) },
      t0: Number(opts.t0),
      t0At: opts.t0At ?? nowIso(),
      createdAt: nowIso(),
    };
    mkdirSync(dirname(resolve(opts.seriesPath)), { recursive: true });
    appendLine(opts.seriesPath, header);
  } else {
    if (!opts.resume) refuse(`${opts.seriesPath} exists; pass --resume to continue it (nothing is overwritten)`);
    const state = seriesState(readLines(opts.seriesPath));
    header = state.header;
    const now = { ...PINS, harness: HARNESS_SHA256, repeats, runs: runIds, arms };
    const differing = Object.keys(now).filter((k) => canon(header[k]) !== canon(now[k]));
    if (differing.length > 0)
      refuse(
        `resume refused: ${differing.join(", ")} differ from the series header. A changed condition needs a new series.`,
      );
    if (opts.t0 !== undefined && Number(opts.t0) !== header.t0)
      refuse(`resume refused: --t0 ${String(opts.t0)} differs from the header's T0 ${String(header.t0)}`);
    for (const [k, h] of [
      ["priceIn", "inPerM"],
      ["priceOut", "outPerM"],
    ])
      if (opts[k] !== undefined && Number(opts[k]) !== header.prices[h])
        refuse(`resume refused: the price ${k} differs from the header's ${String(header.prices[h])}`);
    if (state.open.length > 0) {
      const ids = state.open.map((a) => a.start.id).join(", ");
      refuse(
        `resume refused: attempt ${ids} has a start line and no end (the process died mid-attempt). ` +
          `Reconcile it first: harness.mjs reconcile --series ${opts.seriesPath} --key <id>. It is never re-sent.`,
      );
    }
  }

  const readCounter = opts.readCounter ?? (() => liveCounter(opts.apiKey));
  appendLine(opts.seriesPath, { kind: "counter", usage: await readCounter(), at: nowIso(), when: "start" });
  let state = seriesState(readLines(opts.seriesPath));
  let T = spendT(state);
  const preparedOf = new Map();
  let outcome = "complete";
  for (const slot of slotList(repeats, runIds, arms)) {
    if (slotDone(state.byKey.get(slot.key))) continue;
    if (!preparedOf.has(slot.run)) preparedOf.set(slot.run, prepare(batches.get(slot.run)));
    const prepared = preparedOf.get(slot.run);
    const call = callMessagesBytes(prepared.plans[slot.arm], prepared.identified);
    const P = call.sent === 0 ? 0 : admissionP(call.bytes, header.prices);
    const E = call.sent === 0 ? 0 : expectedE(call.bytes, call.sent, header.prices);
    if (!opts.skipAdmission && T + P > cap) {
      log(
        `STOP (admission) before ${slot.key}: T $${T.toFixed(6)} + P $${P.toFixed(6)} > cap $${cap.toFixed(2)}. Nothing sent. Raise --cap (≤ $1.00) only on an owner decision.`,
      );
      outcome = "admission-stop";
      break;
    }
    const attemptNo = (state.byKey.get(slot.key)?.length ?? 0) + 1;
    const id = `${slot.key}#${String(attemptNo)}`;
    appendLine(opts.seriesPath, { kind: "start", id, ...slot, attempt: attemptNo, P, E, T, at: nowIso() });
    const ctx = {
      id,
      seriesPath: opts.seriesPath,
      prices: header.prices,
      cap,
      Tbase: T,
      requests: [],
      steps: [],
      apiKey: opts.apiKey,
      fetchImpl: opts.fetchImpl ?? globalThis.fetch,
      hooks: opts.hooks,
      sleep: opts.sleep,
      timeoutMs: opts.timeoutMs,
    };
    const result = await runAttempt({ prepared, arm: slot.arm, ctx }); // a HarnessCrash propagates: no end line
    appendLine(opts.seriesPath, { kind: "end", id, key: slot.key, ...result, at: nowIso() });
    state = seriesState(readLines(opts.seriesPath));
    T = spendT(state);
    log(
      `${id.padEnd(34)} ${result.status.padEnd(19)} ${String(result.cause ?? "").padEnd(24)} cost $${result.cost.toFixed(6)}` +
        ` (E $${E.toFixed(6)}, P $${P.toFixed(6)}) T $${T.toFixed(6)}${result.flags.length > 0 ? ` [${result.flags.join(",")}]` : ""}`,
    );
    if (result.status === "condition-violation") {
      log(
        `STOP (condition violation) at ${id}: ${result.cause}. Every line is kept. Resume only under identical conditions; the slot then gets one fresh attempt.`,
      );
      outcome = "condition-violation";
      break;
    }
    if (result.status === "budget-stopped") {
      log(
        `STOP (request gate) at ${id}: T $${ctx.budgetStopped.T.toFixed(6)} + bound $${ctx.budgetStopped.bound.toFixed(6)} > cap $${cap.toFixed(2)}. The slot is not met and never re-sent.`,
      );
      outcome = "budget-stopped";
      break;
    }
  }
  appendLine(opts.seriesPath, { kind: "counter", usage: await readCounter(), at: nowIso(), when: "end" });
  state = seriesState(readLines(opts.seriesPath));
  T = spendT(state);
  log(
    `SERIES ${outcome}: T $${T.toFixed(6)} (recorded $${state.recorded.toFixed(6)}; counter Δ ${state.counterMax === null ? "n/a" : `$${(state.counterMax - state.header.t0).toFixed(6)}`}), cap $${cap.toFixed(2)}`,
  );
  return { outcome, T, state };
}

async function reconcile({ seriesPath, key, readCounter }) {
  const state = seriesState(readLines(seriesPath));
  const attempt = state.open.find((a) => a.start.id === key);
  if (attempt === undefined)
    refuse(`no open attempt ${key} in ${seriesPath}; open: ${state.open.map((a) => a.start.id).join(", ") || "none"}`);
  appendLine(seriesPath, { kind: "counter", usage: await readCounter(), at: nowIso(), when: "reconcile" });
  const requestBounds = attempt.requests.reduce((t, r) => t + r.bound, 0);
  const cost = Math.max(attempt.start.P, requestBounds);
  appendLine(seriesPath, {
    kind: "interrupted",
    id: key,
    key: attempt.start.key,
    cost,
    P: attempt.start.P,
    requestBounds,
    basis: "max(P, Σ request bounds); the key counter is never used to lower it",
    at: nowIso(),
  });
  return { cost, requestBounds, P: attempt.start.P };
}

// ---- Scoring (plan § Definitions: Survives, Refutes, Hard pass, True-class diagnosis) ----
const rowOfMember = new Map(corpus.map((r) => [r.member, r.row]));
const findingOfMember = new Map(corpus.map((r) => [r.member, r.finding]));

function scoringAttempt(list) {
  // The last attempt that is not a condition violation; violated attempts are never scored.
  const usable = (list ?? []).filter(
    (a) => a.interrupted !== null || (a.end !== null && a.end.status !== "condition-violation"),
  );
  return usable.at(-1) ?? null;
}
function memberOutcome(attempt, member) {
  if (attempt === null) return { kind: "missing", cause: "not run", met: false };
  if (attempt.interrupted !== null) return { kind: "execution", cause: "interrupted", met: false };
  const e = attempt.end;
  if (e.status === "failed-attempt") return { kind: "execution", cause: e.cause, met: false };
  if (e.status === "budget-stopped") return { kind: "execution", cause: "budget", met: false };
  const r = e.records.find((x) => x.member === member);
  const state = r.published ? "published" : r.state === "unverifiable" ? `unverifiable:${r.reasonCode}` : r.state;
  return {
    kind: "result",
    state,
    published: r.published,
    refutedVerified: r.state === "refuted" && r.quoteVerified === true,
    refutedNoEvidence: r.state === "refuted" && r.quoteVerified !== true,
    reasonCode: r.reasonCode,
    modelVerdict: r.modelVerdict,
    quote: r.quote,
    quoteVerified: r.quoteVerified,
    quoteMatch: r.quoteMatch,
    reason: r.reason,
    flags: e.flags,
  };
}
function scoreFinding(outcomes) {
  const met = outcomes.filter((o) => o.met).length;
  const n = outcomes.length;
  return {
    met,
    n,
    hard: met === n ? "pass" : met === 0 ? "fail" : "unstable",
    majority: met * 2 > n ? "pass" : "fail",
  };
}
function diagnose(base, oracle) {
  const n = base.length;
  const bm = base.filter((o) => o.met).length;
  const om = oracle.filter((o) => o.met).length;
  if (bm === n && om === n) return "survives";
  if (bm === n) return "survives, O anomaly";
  if (base.filter((o) => !o.met).every((o) => o.kind === "execution")) return "lost to reliability";
  if (om === n) return "evidence-delivery limit";
  return "investigate";
}

function buildReport({ state, grades, blindKey }) {
  const { header } = state;
  const gradeOf = new Map();
  if (grades !== undefined) {
    if (blindKey === undefined) refuse("--grades needs --key (the blind key that maps labels to slots)");
    for (const [label, grade] of Object.entries(grades)) {
      const entry = blindKey.entries[label];
      if (entry === undefined) refuse(`grade ${label} has no entry in the blind key`);
      if (!["pass", "off-target", "no-evidence"].includes(grade))
        refuse(`grade ${label}: "${String(grade)}" is not pass|off-target|no-evidence`);
      gradeOf.set(`${entry.key}|${entry.member}`, grade);
    }
  }
  const rows = [];
  for (const rec of corpus) {
    const run = rec.member.split("#")[0];
    if (!header.runs.includes(run)) continue;
    const cls = classOf(rec.row);
    const arms = {};
    for (const arm of header.arms) {
      arms[arm] = [];
      for (let r = 1; r <= header.repeats; r += 1) {
        const key = `r${String(r)}/${run}/${arm}`;
        const o = { key, ...memberOutcome(scoringAttempt(state.byKey.get(key)), rec.member) };
        if (cls === "true") o.met = o.kind === "result" && o.published;
        else if (cls === "false-code-refutable") {
          o.autoMet = o.kind === "result" && o.refutedVerified;
          o.grade = gradeOf.get(`${key}|${rec.member}`) ?? null;
          o.met = o.autoMet && o.grade === "pass";
        } else o.met = false;
        arms[arm].push(o);
      }
    }
    rows.push({ member: rec.member, row: rec.row, class: cls, compound: COMPOUND.includes(rec.member), arms });
  }
  // A refutation is labelled by its quote evidence independently of any hand-read grade (review F2).
  const cell = (o) => {
    if (o.kind !== "result") return `${o.kind}:${o.cause}`;
    const state =
      o.state === "refuted" ? (o.refutedVerified ? "refuted (quote verified)" : "refuted without evidence") : o.state;
    return state + (o.grade ? ` / ${o.grade}` : "");
  };
  const trueRows = rows
    .filter((r) => r.class === "true")
    .map((r) => ({
      ...r,
      score: scoreFinding(r.arms.base),
      scoreO: r.arms.O === undefined ? null : scoreFinding(r.arms.O),
      diagnosis: r.arms.O === undefined ? "n/a (no arm O)" : diagnose(r.arms.base, r.arms.O),
    }));
  const refRows = rows
    .filter((r) => r.class === "false-code-refutable")
    .map((r) => ({
      ...r,
      auto: scoreFinding(r.arms.base.map((o) => ({ met: o.autoMet }))),
      handRead: grades === undefined ? null : scoreFinding(r.arms.base),
    }));
  const distribution = {};
  for (const r of rows.filter((x) => !["true", "false-code-refutable"].includes(x.class)))
    for (const [arm, outs] of Object.entries(r.arms))
      for (const o of outs) {
        const k = `${r.class}|${arm}|${cell(o)}`;
        distribution[k] = (distribution[k] ?? 0) + 1;
      }
  const attempts = [...state.attempts.values()];
  const byStatus = {};
  const byCause = {};
  const flags = {};
  let maxTokRatio = 0;
  let maxCostRatio = 0;
  let eSum = 0;
  const serviceTiers = {};
  const generationIds = { recorded: 0, missing: 0 };
  for (const a of attempts) {
    eSum += a.start.E ?? 0;
    const status = a.interrupted !== null ? "interrupted" : (a.end?.status ?? "open");
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const cause = a.interrupted !== null ? "interrupted" : a.end?.cause;
    if (cause) byCause[`${status}:${cause}`] = (byCause[`${status}:${cause}`] ?? 0) + 1;
    for (const f of a.end?.flags ?? []) flags[f] = (flags[f] ?? 0) + 1;
    for (const r of a.end?.requests ?? []) {
      if (!r.blocked && r.status !== null) {
        const tier = r.serviceTier ?? "undetermined";
        serviceTiers[tier] = (serviceTiers[tier] ?? 0) + 1;
        if (typeof r.generationId === "string") generationIds.recorded += 1;
        else generationIds.missing += 1;
      }
      if (r.promptTokens !== null && r.tokIn > 0) maxTokRatio = Math.max(maxTokRatio, r.promptTokens / r.tokIn);
      if (r.cost !== null && r.bound > 0) maxCostRatio = Math.max(maxCostRatio, r.cost / r.bound);
    }
  }
  const T = spendT(state);
  const json = {
    header: { ...header },
    spend: {
      recorded: state.recorded,
      counterDelta: state.counterMax === null ? null : state.counterMax - header.t0,
      T,
      expectedE: eSum,
      headroom: { maxPromptTokensOverBound: maxTokRatio, maxCostOverBound: maxCostRatio },
    },
    reliability: {
      attempts: attempts.length,
      byStatus,
      byCause,
      flags,
      open: state.open.length,
      serviceTiers,
      generationIds,
    },
    trueClass: trueRows.map((r) => ({
      member: r.member,
      row: r.row,
      compound: r.compound,
      base: r.arms.base.map(cell),
      O: r.arms.O?.map(cell) ?? null,
      hard: r.score.hard,
      met: `${String(r.score.met)}/${String(r.score.n)}`,
      majority: r.score.majority,
      diagnosis: r.diagnosis,
    })),
    codeRefutable: refRows.map((r) => ({
      member: r.member,
      row: r.row,
      compound: r.compound,
      base: r.arms.base.map(cell),
      O: r.arms.O?.map(cell) ?? null,
      automatic: { met: `${String(r.auto.met)}/${String(r.auto.n)}`, hard: r.auto.hard, majority: r.auto.majority },
      handRead:
        r.handRead === null
          ? "pending (no grades)"
          : {
              met: `${String(r.handRead.met)}/${String(r.handRead.n)}`,
              hard: r.handRead.hard,
              majority: r.handRead.majority,
            },
    })),
    distribution,
    // Every finding × repeat × arm, with the evidence fields the raw series keeps (review F2).
    detail: rows.flatMap((r) =>
      Object.entries(r.arms).flatMap(([arm, outs]) =>
        outs.map((o, i) => ({
          member: r.member,
          row: r.row,
          class: r.class,
          compound: r.compound,
          arm,
          repeat: i + 1,
          outcome: cell(o),
          kind: o.kind,
          cause: o.cause ?? null,
          state: o.state ?? null,
          reasonCode: o.reasonCode ?? null,
          modelVerdict: o.modelVerdict ?? null,
          quoteVerified: o.quoteVerified ?? null,
          quoteMatch: o.quoteMatch ?? null,
          quote: o.quote ?? null,
          reason: o.reason ?? null,
          grade: o.grade ?? null,
        })),
      ),
    ),
  };
  const md = [];
  md.push(`# Series report — ${header.model} @ ${header.slug}, ${String(header.repeats)} repeats`);
  md.push("", "## Spend", "");
  md.push(
    `- T = $${T.toFixed(6)} (recorded $${state.recorded.toFixed(6)}; counter Δ ${json.spend.counterDelta === null ? "n/a" : `$${json.spend.counterDelta.toFixed(6)}`}); expected E $${eSum.toFixed(6)}.`,
  );
  md.push(
    `- Headroom (A1–A3 check): max prompt_tokens ÷ bound ${maxTokRatio.toFixed(3)}; max cost ÷ bound ${maxCostRatio.toFixed(3)}.`,
  );
  md.push("", "## Reliability (execution, never judgement)", "");
  md.push(
    `- Attempts ${String(attempts.length)}; by status ${JSON.stringify(byStatus)}; by cause ${JSON.stringify(byCause)}; flags ${JSON.stringify(flags)}; open ${String(state.open.length)}.`,
  );
  md.push(
    `- Served tiers (Amendment 1; "undetermined" = no service_tier in the response): ${JSON.stringify(serviceTiers)}; generation ids recorded ${String(generationIds.recorded)}, missing ${String(generationIds.missing)}.`,
  );
  md.push("", "## True class — must survive publication, 3/3 base", "");
  md.push(
    "| Member | Row | Compound | Base r1..r3 | O r1..r3 | Base met | Hard | Majority | Diagnosis |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const r of json.trueClass)
    md.push(
      `| ${r.member} | ${r.row} | ${r.compound ? "yes" : ""} | ${r.base.join(", ")} | ${r.O?.join(", ") ?? "—"} | ${r.met} | ${r.hard} | ${r.majority} | ${r.diagnosis} |`,
    );
  md.push("", "## Code-refutable — must be refuted (automatic, then blinded hand-read), 3/3 base", "");
  md.push(
    "| Member | Row | Compound | Base r1..r3 | O r1..r3 | Automatic | Hand-read |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const r of json.codeRefutable)
    md.push(
      `| ${r.member} | ${r.row} | ${r.compound ? "yes" : ""} | ${r.base.join(", ")} | ${r.O?.join(", ") ?? "—"} | ${r.automatic.met} ${r.automatic.hard} (majority ${r.automatic.majority}) | ${typeof r.handRead === "string" ? r.handRead : `${r.handRead.met} ${r.handRead.hard} (majority ${r.handRead.majority})`} |`,
    );
  md.push(
    "",
    "## Information only — policy, ambiguous, descriptive",
    "",
    "| Class | Arm | Outcome | Count |",
    "| --- | --- | --- | --- |",
  );
  for (const [k, n] of Object.entries(distribution).sort()) {
    const [c, arm, o] = k.split("|");
    md.push(`| ${c} | ${arm} | ${o} | ${String(n)} |`);
  }
  const safe = (t, max) =>
    t === null || t === undefined ? "" : String(t).replace(/\s+/gu, " ").replace(/\|/gu, "\\|").slice(0, max);
  md.push(
    "",
    "## Every finding × repeat × arm (quotes and full reasons are in the JSON `detail`)",
    "",
    "| Member | Row | Class | Compound | Arm | Repeat | Outcome | Quote check | Match | Reason (first 100 chars) |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const d of json.detail)
    md.push(
      `| ${d.member} | ${d.row} | ${d.class} | ${d.compound ? "yes" : ""} | ${d.arm} | ${String(d.repeat)} | ${d.outcome} | ${d.quoteVerified === null ? "" : d.quoteVerified ? "passed" : "failed"} | ${d.quoteMatch ?? ""} | ${safe(d.reason, 100)} |`,
    );
  return { md: `${md.join("\n")}\n`, json };
}

function buildBlind({ state, seed }) {
  if (!/^[0-9a-f]{64}$/u.test(seed))
    refuse("--seed must be 32 bytes of hex (64 characters), written to gate.md before the draw");
  const items = [];
  for (const [key, list] of state.byKey) {
    const attempt = scoringAttempt(list);
    if (attempt?.end?.status !== "ok") continue;
    for (const r of attempt.end.records) {
      const row = rowOfMember.get(r.member);
      if (!CLASS["false-code-refutable"].includes(row) || r.state !== "refuted") continue;
      const [rep, run, arm] = key.split("/");
      items.push({
        key,
        member: r.member,
        row,
        run,
        arm,
        repeat: Number(rep.slice(1)),
        quote: r.quote,
        reason: r.reason,
        quoteVerified: r.quoteVerified,
      });
    }
  }
  const order = (x) => createHash("sha256").update(`${seed}:${x.key}:${x.member}`, "utf8").digest("hex");
  items.sort((a, b) => (order(a) < order(b) ? -1 : 1));
  const entries = {};
  const sheet = [
    "# Blinded hand-read — code-refutable refutations",
    "",
    'Grade each entry `pass`, `off-target` or `no-evidence` in `grades.json` (`{"R01": "pass", …}`).',
    "",
    `**Rule (pre-registered):** ${RATIONALE.rule}`,
    "",
  ];
  items.forEach((x, i) => {
    const label = `R${String(i + 1).padStart(2, "0")}`;
    entries[label] = { key: x.key, member: x.member, row: x.row, run: x.run, arm: x.arm, repeat: x.repeat };
    sheet.push(
      `## ${label}`,
      "",
      `**Frozen claim:** ${findingOfMember.get(x.member).description}`,
      "",
      `**Pre-registered rationale:** ${RATIONALE[x.row]}`,
      "",
      `**Quote check (automatic):** ${x.quoteVerified === true ? "passed" : "failed"}`,
      "",
      "**Quote:**",
      "",
      "~~~~text",
      x.quote ?? "",
      "~~~~",
      "",
      `**Verifier's reason:** ${x.reason ?? ""}`,
      "",
    );
  });
  const sheetText = `${sheet.join("\n")}\n`;
  for (const [label, e] of Object.entries(entries))
    for (const v of [e.key, e.member, e.run])
      if (sheetText.includes(v)) refuse(`blinding broken: ${label}'s ${v} appears in the sheet`);
  const keyText = `${JSON.stringify({ seed, entries }, null, 1)}\n`;
  return { sheetText, keyText, count: items.length };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) refuse(`unexpected argument ${a}`);
    const k = a.slice(2).replace(/-([a-z])/gu, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[k] = true;
    else {
      out[k] = next;
      i += 1;
    }
  }
  return out;
}

// ---- plan ----
if (MODE === "plan") {
  const findings = [];
  const perBatch = [];
  for (const batch of batches.values()) {
    const { identified, memberOf, plans } = prepare(batch);
    perBatch.push({
      run: batch.run,
      set: batch.set,
      pr: batch.pr,
      findings: identified.length,
      base: plans.base.telemetry,
      O: { blocks: plans.O.blocks.length, chars: plans.O.blocks.reduce((t, b) => t + b.text.length, 0) },
    });
    for (const finding of identified) {
      const member = memberOf.get(finding.id);
      findings.push({
        member: member.member,
        row: member.row,
        class: classOf(member.row),
        owner: member.owner,
        id: finding.id,
        cited: `${finding.file}:${String(finding.startLine ?? "-")}-${String(finding.endLine ?? finding.startLine ?? "-")}`,
        base: serving(plans.base, finding, member),
        O: serving(plans.O, finding, member),
      });
    }
  }
  const tally = (arm, filter) => {
    const xs = findings.filter(filter);
    const full = xs.filter((f) => /^(\d+)\/\1$/u.test(f[arm].evidence ?? "")).length;
    return {
      findings: xs.length,
      fullEvidence: full,
      unverifiable: xs.filter((f) => f[arm].state !== "excerpted").length,
    };
  };
  const summary = {
    sealCommit: SEAL_COMMIT,
    sealSrcTree: SEAL_SRC_TREE,
    corpusSha256: CORPUS_SHA256,
    batches: perBatch.length,
    findings: findings.length,
    byClass: Object.fromEntries(
      [...Object.keys(CLASS), "descriptive"].map((c) => [
        c,
        { base: tally("base", (f) => f.class === c), O: tally("O", (f) => f.class === c) },
      ]),
    ),
  };
  writeFileSync(join(HERE, "harness-plan-check.json"), `${JSON.stringify({ summary, perBatch, findings }, null, 1)}\n`);
  console.log(`SUMMARY ${JSON.stringify(summary, null, 1)}`);
  for (const f of findings) {
    console.log(
      `${f.member.padEnd(22)} ${f.row.padEnd(14)} ${f.class.padEnd(21)} base ${(f.base.evidence ?? f.base.state).padEnd(14)} ` +
        `O ${(f.O.evidence ?? f.O.state).padEnd(14)}`,
    );
  }
}

// ---- dry-run ----
if (MODE === "dry-run") {
  // A stub answer that walks every publication branch: finding k gets scenario k mod 4.
  const SCENARIOS = ["confirmed-good-quote", "refuted-good-quote", "unsupported", "confirmed-bad-quote"];
  const EXPECT = {
    "confirmed-good-quote": "published",
    "refuted-good-quote": "refuted",
    unsupported: "unsupported",
    "confirmed-bad-quote": "unverifiable",
  };
  const quoteFrom = (block) =>
    block.text
      .split("\n")
      .map((line) => line.replace(/^\s*\d+>?\| /u, ""))
      .find((line) => line.replace(/\s/gu, "").length >= 10) ?? null;

  const report = [];
  const failures = [];
  for (const batch of batches.values()) {
    const prepared = prepare(batch);
    for (const arm of ["base", "O"]) {
      const plan = prepared.plans[arm];
      const sent = prepared.identified.filter((f) => "blockIds" in plan.perFinding[f.id]);
      const scenarioOf = new Map(sent.map((f, k) => [f.id, SCENARIOS[k % SCENARIOS.length]]));
      const answer = {
        verdicts: sent.map((f) => {
          const scenario = scenarioOf.get(f.id);
          const own = plan.perFinding[f.id].blockIds.map((id) => plan.blocks.find((b) => b.blockId === id));
          const quote = own.map(quoteFrom).find((q) => q !== null) ?? "";
          if (scenario === "confirmed-good-quote") return { id: f.id, verdict: "confirmed", quote, reason: "stub" };
          if (scenario === "refuted-good-quote") return { id: f.id, verdict: "refuted", quote, reason: "stub" };
          if (scenario === "unsupported") return { id: f.id, verdict: "unsupported", quote: "", reason: "stub" };
          return { id: f.id, verdict: "confirmed", quote: "this text is not in any excerpt block", reason: "stub" };
        }),
      };
      const stub = openRouterStub([{ content: JSON.stringify(answer), finish: "stop", provider: "OpenAI", cost: 0 }]);
      const routing = {
        order: [VERIFIER.slug],
        only: [VERIFIER.slug],
        allow_fallbacks: true,
        require_parameters: true,
      };
      const make = (options) =>
        createVerifier({ ...options, apiKey: "dry-run-no-network", fetch: stub.fetch, providerRouting: routing });

      let records;
      let published;
      if (arm === "base") {
        // The sealed pass itself, unchanged.
        const pass = await runVerificationPass({
          findings: prepared.identified,
          reader: prepared.reader,
          requireVerification: true,
          model: VERIFIER.model,
          createVerifier: make,
        });
        records = pass.verification.verdicts;
        published = pass.published;
      } else {
        // Arm O: the same step 3 of runVerificationPass, on the augmented plan.
        const verify = make({ model: VERIFIER.model }).verify;
        const output =
          sent.length === 0
            ? { verdicts: [] }
            : await withOneRetry(() => verify({ findings: sent, blocks: plan.blocks, perFinding: plan.perFinding }));
        const applied = applyVerdicts({ findings: prepared.identified, plan, output });
        records = applied.records;
        published = applied.published;
      }

      const body = stub.bodies[0];
      if (sent.length > 0) {
        if (stub.bodies.length !== 1) failures.push(`${batch.run}/${arm}: ${String(stub.bodies.length)} requests`);
        if (body.model !== VERIFIER.model) failures.push(`${batch.run}/${arm}: model ${String(body.model)}`);
        if (JSON.stringify(body.reasoning) !== JSON.stringify({ enabled: false }))
          failures.push(`${batch.run}/${arm}: reasoning`);
        if (JSON.stringify(body.provider) !== JSON.stringify(routing)) failures.push(`${batch.run}/${arm}: routing`);
        if ("response_format" in body || "tools" in body) failures.push(`${batch.run}/${arm}: response_format/tools`);
      } else if (stub.bodies.length !== 0) failures.push(`${batch.run}/${arm}: called with nothing to send`);

      const inputChars =
        body === undefined
          ? 0
          : body.messages.reduce(
              (t, m) => t + (typeof m.content === "string" ? m.content.length : JSON.stringify(m.content).length),
              0,
            );
      for (const record of records) {
        const member = prepared.memberOf.get(record.id);
        const scenario = scenarioOf.get(record.id);
        const isPublished = published.some((f) => f.id === record.id);
        const got = isPublished ? "published" : record.state;
        if (scenario !== undefined && got !== EXPECT[scenario]) {
          failures.push(`${batch.run}/${arm} ${member.member}: ${scenario} → ${got}`);
        }
        if (scenario === undefined && isPublished)
          failures.push(`${batch.run}/${arm} ${member.member}: unsent but published`);
      }
      if (records.length !== prepared.identified.length)
        failures.push(`${batch.run}/${arm}: ${String(records.length)} records`);
      report.push({
        run: batch.run,
        arm,
        findings: prepared.identified.length,
        sent: sent.length,
        published: published.length,
        inputChars,
        members: records.map((r) => ({
          member: prepared.memberOf.get(r.id).member,
          id: r.id,
          scenario: scenarioOf.get(r.id) ?? "not sent",
          state: published.some((f) => f.id === r.id) ? "published" : r.state,
          reasonCode: r.reasonCode ?? null,
          quoteMatch: r.quoteMatch ?? null,
        })),
      });
    }
  }
  const instructionsChars = buildVerifierInstructions().length;
  const chars = (arm) => report.filter((r) => r.arm === arm).map((r) => r.inputChars);
  const summary = {
    batches: batches.size,
    requests: report.filter((r) => r.sent > 0).length,
    instructionsChars,
    inputChars: Object.fromEntries(
      ["base", "O"].map((arm) => [arm, { total: chars(arm).reduce((a, b) => a + b, 0), max: Math.max(...chars(arm)) }]),
    ),
    failures,
  };
  writeFileSync(
    join(process.env.FV_OUT ?? HERE, "harness-dry-run.json"),
    `${JSON.stringify({ summary, report }, null, 1)}\n`,
  );
  console.log(`SUMMARY ${JSON.stringify(summary, null, 1)}`);
  if (failures.length > 0) process.exitCode = 1;
}

// ---- self-test: every Definitions row and failure class, on stubbed HTTP, through the sealed code ----
async function selfTest() {
  const PRICES = { inPerM: 0.1, outPerM: 0.5 };
  const T0 = 10;
  const dir = mkdtempSync(join(process.env.FV_OUT ?? tmpdir(), "fv-selftest-"));
  let fileNo = 0;
  const fresh = () => join(dir, `s${String((fileNo += 1))}.jsonl`);
  const counterAt = (v) => async () => v;
  const noSleep = async () => {};
  const completion = ({
    content,
    finish = "stop",
    provider = "OpenAI",
    cost = 0.0001,
    promptTokens = 100,
    reasoningTokens,
    reasoningText,
    id = "gen-self-test",
    serviceTier,
  }) => ({
    id,
    object: "chat.completion",
    ...(serviceTier === undefined ? {} : { service_tier: serviceTier }),
    created: 0,
    model: VERIFIER.model,
    ...(provider === null ? {} : { provider }),
    choices: [
      {
        index: 0,
        finish_reason: finish,
        message: { role: "assistant", content, ...(reasoningText ? { reasoning: reasoningText } : {}) },
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: 5,
      total_tokens: promptTokens + 5,
      ...(cost === null ? {} : { cost }),
      ...(reasoningTokens ? { completion_tokens_details: { reasoning_tokens: reasoningTokens } } : {}),
    },
  });
  const errorBody = (status) => ({ status, json: { error: { message: `stub ${String(status)}`, code: status } } });
  const stub = (responder) => {
    const bodies = [];
    return {
      bodies,
      fetch: async (_url, init) => {
        const body = JSON.parse(init.body);
        bodies.push(body);
        const r = await responder(body, bodies.length);
        if (r.throw) throw r.throw;
        if (r.hang)
          return new Promise((_, reject) => {
            const s = init.signal;
            const fail = () => reject(s.reason ?? new DOMException("aborted", "AbortError"));
            if (s?.aborted) fail();
            else s?.addEventListener("abort", fail, { once: true });
          });
        return new Response(JSON.stringify(r.json), {
          status: r.status ?? 200,
          headers: { "content-type": "application/json" },
        });
      },
    };
  };
  const answer = (verdicts, extra = {}) => ({ json: completion({ content: JSON.stringify({ verdicts }), ...extra }) });
  const one = async ({
    run = "openai-pr269-02",
    arms = ["base"],
    responder,
    repeats = 1,
    cap = 0.8,
    counter = counterAt(T0),
    path = fresh(),
    resume = false,
    hooks,
    timeoutMs,
    skipAdmission,
    t0 = T0,
  }) => {
    const s = stub(responder);
    let result;
    let error;
    try {
      result = await runSeries({
        seriesPath: path,
        repeats,
        cap,
        t0,
        priceIn: PRICES.inPerM,
        priceOut: PRICES.outPerM,
        resume,
        apiKey: "self-test-no-network",
        fetchImpl: s.fetch,
        readCounter: counter,
        allowOutside: true,
        skipSealCheck: true,
        runs: [run],
        arms,
        sleep: noSleep,
        timeoutMs,
        hooks,
        skipAdmission,
        log: () => {},
      });
    } catch (caught) {
      error = caught;
    }
    const state = existsSync(path) ? seriesState(readLines(path)) : null;
    const ends = state === null ? [] : [...state.attempts.values()].map((a) => a.end).filter((e) => e !== null);
    return { s, result, error, state, ends, path };
  };

  const P02 = prepare(batches.get("openai-pr269-02"));
  const P05 = prepare(batches.get("openai-pr269-05"));
  const own = (prep, id, arm = "base") =>
    prep.plans[arm].perFinding[id].blockIds.map((b) => prep.plans[arm].blocks.find((x) => x.blockId === b));
  const texts = (blocks) => blocks.flatMap((b) => b.text.split("\n").map((l) => l.replace(/^\s*\d+>?\| /u, "")));
  const goodQuote = (blocks) =>
    texts(blocks).find((l) => l.replace(/\s/gu, "").length >= 12 && !/\s\s/u.test(l.trim()));
  const nineQuote = (blocks) =>
    texts(blocks)
      .map((l) => l.match(/\S{9}/u)?.[0])
      .find(Boolean);
  const wsQuote = (blocks) =>
    texts(blocks)
      .find((l) => /\S \S/u.test(l.trim()) && l.replace(/\s/gu, "").length >= 12)
      .trim()
      .replace(/(\S) (\S)/u, "$1  $2");
  const F02 = P02.identified[0].id;
  const B02 = own(P02, F02);
  const D13 = P05.idOf.get("openai-pr269-05#5.2");
  const others05 = P05.identified.filter((f) => f.id !== D13 && "blockIds" in P05.plans.base.perFinding[f.id]);
  const with05 = (v) =>
    answer([v, ...others05.map((f) => ({ id: f.id, verdict: "unsupported", quote: "", reason: "r" }))]);
  const rec0 = (r) => r.ends[0]?.records?.[0];
  const recOf = (r, member) => r.ends[0]?.records?.find((x) => x.member === member);
  const isRefusal = (e, text) => e instanceof HarnessRefusal && e.message.includes(text);

  const cases = [];
  const add = (group, name, fn) => cases.push({ group, name, fn });

  // Publication
  add("publication", "valid quote → published", async () => {
    const r = await one({
      responder: () => answer([{ id: F02, verdict: "confirmed", quote: goodQuote(B02), reason: "r" }]),
    });
    return [
      rec0(r)?.published === true && rec0(r).quoteMatch === "exact",
      `${r.ends[0]?.status} published=${rec0(r)?.published}`,
    ];
  });
  add("publication", "9-character quote → quote-not-in-excerpt", async () => {
    const r = await one({
      responder: () => answer([{ id: F02, verdict: "confirmed", quote: nineQuote(B02), reason: "r" }]),
    });
    return [
      rec0(r)?.reasonCode === "quote-not-in-excerpt" && !rec0(r).published,
      `${rec0(r)?.state}:${rec0(r)?.reasonCode}`,
    ];
  });
  add("publication", "unsupported → not survived", async () => {
    const r = await one({ responder: () => answer([{ id: F02, verdict: "unsupported", quote: "", reason: "r" }]) });
    return [rec0(r)?.state === "unsupported" && !rec0(r).published, rec0(r)?.state];
  });
  add("publication", "whitespace-collapsed match → published, quoteMatch whitespace", async () => {
    const r = await one({
      responder: () => answer([{ id: F02, verdict: "confirmed", quote: wsQuote(B02), reason: "r" }]),
    });
    return [
      rec0(r)?.published === true && rec0(r).quoteMatch === "whitespace",
      `${rec0(r)?.state} ${rec0(r)?.quoteMatch}`,
    ];
  });
  add("publication", "sent finding without a verdict → no-verdict", async () => {
    const r = await one({ responder: () => answer([]) });
    return [rec0(r)?.reasonCode === "no-verdict", `${rec0(r)?.reasonCode}`];
  });
  add("publication", "two verdicts for one id → duplicate-verdict", async () => {
    const v = { id: F02, verdict: "unsupported", quote: "", reason: "r" };
    const r = await one({ responder: () => answer([v, v]) });
    return [rec0(r)?.reasonCode === "duplicate-verdict", `${rec0(r)?.reasonCode}`];
  });

  // Refutation (G-D13 member, a code-refutable row)
  let refutedSeries;
  add("refutation", "refuted with an empty quote → refuted without evidence", async () => {
    const r = await one({
      run: "openai-pr269-05",
      responder: () => with05({ id: D13, verdict: "refuted", quote: "", reason: "r" }),
    });
    const o = memberOutcome(scoringAttempt(r.state.byKey.get("r1/openai-pr269-05/base")), "openai-pr269-05#5.2");
    return [
      o.refutedNoEvidence && !o.refutedVerified,
      JSON.stringify({ state: o.state, noEvidence: o.refutedNoEvidence }),
    ];
  });
  add("refutation", "refuted with a quote absent from its blocks → refuted without evidence", async () => {
    const r = await one({
      run: "openai-pr269-05",
      responder: () =>
        with05({ id: D13, verdict: "refuted", quote: "this line is not in any block at all", reason: "r" }),
    });
    const x = recOf(r, "openai-pr269-05#5.2");
    return [x?.state === "refuted" && x.quoteVerified === false, `${x?.state} quoteVerified=${x?.quoteVerified}`];
  });
  add("refutation", "refuted with a valid quote → automatic pass, pending hand-read", async () => {
    const r = await one({
      run: "openai-pr269-05",
      responder: () =>
        with05({ id: D13, verdict: "refuted", quote: goodQuote(own(P05, D13)), reason: "the guard exits first" }),
    });
    refutedSeries = r;
    const o = memberOutcome(scoringAttempt(r.state.byKey.get("r1/openai-pr269-05/base")), "openai-pr269-05#5.2");
    return [o.refutedVerified === true, `${o.state} refutedVerified=${o.refutedVerified}`];
  });

  // Failed attempt: the whole batch fails that repeat, no extra draw
  add("failed-attempt", "malformed output twice → format, 2 requests", async () => {
    const r = await one({ responder: () => ({ json: completion({ content: "not json {" }) }) });
    return [
      r.ends[0]?.status === "failed-attempt" &&
        r.ends[0].cause === "format" &&
        r.s.bodies.length === 2 &&
        r.ends[0].records.length === 0,
      `${r.ends[0]?.status}:${r.ends[0]?.cause} requests=${r.s.bodies.length}`,
    ];
  });
  add("failed-attempt", "unparseable first answer with finish=length → length, no repair", async () => {
    const r = await one({ responder: () => ({ json: completion({ content: '{"verdicts": [', finish: "length" }) }) });
    return [
      r.ends[0]?.cause === "length" && r.s.bodies.length === 1,
      `${r.ends[0]?.status}:${r.ends[0]?.cause} requests=${r.s.bodies.length}`,
    ];
  });
  add("failed-attempt", "parseable first answer with finish=length → scored, length noted", async () => {
    const r = await one({
      responder: () =>
        answer([{ id: F02, verdict: "confirmed", quote: goodQuote(B02), reason: "r" }], { finish: "length" }),
    });
    return [
      r.ends[0]?.status === "ok" && r.ends[0].flags.includes("length") && rec0(r)?.published,
      `${r.ends[0]?.status} flags=${r.ends[0]?.flags}`,
    ];
  });
  add("failed-attempt", "AI_NoOutputGeneratedError → no-output (classifier)", async () => {
    const e = Object.assign(new Error("no output"), { name: "AI_NoOutputGeneratedError" });
    const c = classifyAttempt({ error: e, requests: [], steps: [] });
    return [c.status === "failed-attempt" && c.cause === "no-output", `${c.status}:${c.cause}`];
  });
  add("failed-attempt", "503 twice → exactly one retry, then failed", async () => {
    const r = await one({ responder: () => errorBody(503) });
    return [
      r.ends[0]?.status === "failed-attempt" && r.ends[0].cause === "APICallError-503" && r.s.bodies.length === 2,
      `${r.ends[0]?.status}:${r.ends[0]?.cause} requests=${r.s.bodies.length}`,
    ];
  });
  add("failed-attempt", "timeout on both tries → timeout, cost-incomplete", async () => {
    const r = await one({ responder: () => ({ hang: true }), timeoutMs: 40 });
    const e = r.ends[0];
    return [
      e?.cause === "timeout" &&
        r.s.bodies.length === 2 &&
        e.costComplete === false &&
        Math.abs(e.cost - e.requests.reduce((t, x) => t + x.bound, 0)) < 1e-12,
      `${e?.status}:${e?.cause} requests=${r.s.bodies.length} costComplete=${e?.costComplete}`,
    ];
  });
  add("failed-attempt", "HTTP 400 → failed at once", async () => {
    const r = await one({ responder: () => errorBody(400) });
    return [
      r.ends[0]?.status === "failed-attempt" && r.ends[0].cause === "APICallError-400" && r.s.bodies.length === 1,
      `${r.ends[0]?.status}:${r.ends[0]?.cause} requests=${r.s.bodies.length}`,
    ];
  });

  // Condition violation: stops the series, keeps every earlier line
  const violation = (name, responder, expectCause, extra = {}) =>
    add("condition-violation", name, async () => {
      const r = await one({ arms: ["base", "O"], responder, ...extra });
      const e = r.ends[0];
      const kept = r.state.header.kind === "header" && r.state.attempts.size === 1;
      return [
        e?.status === "condition-violation" &&
          String(e.cause).startsWith(expectCause) &&
          r.result?.outcome === "condition-violation" &&
          kept,
        `${e?.status}:${e?.cause} attempts=${r.state.attempts.size}`,
      ];
    });
  const good = () => answer([{ id: F02, verdict: "confirmed", quote: goodQuote(B02), reason: "r" }]);
  violation("provider Azure", () => answer([], { provider: "Azure" }), "provider-Azure");
  violation("provider missing", () => answer([], { provider: null }), "provider-missing");
  violation("OpenRouter reasoning tokens alone (wire)", () => answer([], { reasoningTokens: 4 }), "reasoning-tokens");
  violation("reasoning text alone", () => answer([], { reasoningText: "thinking about it" }), "reasoning-text");
  violation("HTTP 401", () => errorBody(401), "account-401");
  violation("HTTP 402", () => errorBody(402), "account-402");
  violation(
    "connection error without a status",
    () => ({ throw: new TypeError("fetch failed", { cause: new Error("connect ECONNREFUSED") }) }),
    "measurement-error",
  );
  violation("runner TypeError", good, "measurement-error", {
    hooks: {
      beforeVerify: () => {
        throw new TypeError("injected runner fault");
      },
    },
  });
  add("condition-violation", "SDK reasoning tokens alone (step channel)", async () => {
    const v = stepViolations(
      [],
      [{ provider: "OpenAI", reasoningTokens: { sdk: 3, openrouter: null }, reasoningTextChars: 0 }],
    );
    return [v === "reasoning-tokens (SDK)", String(v)];
  });
  add(
    "condition-violation",
    "resume under identical conditions → the violated slot gets one fresh attempt",
    async () => {
      const path = fresh();
      await one({ path, arms: ["base", "O"], responder: () => answer([], { provider: "Azure" }) });
      const r = await one({ path, arms: ["base", "O"], resume: true, responder: good });
      const list = r.state.byKey.get("r1/openai-pr269-02/base");
      const scored = scoringAttempt(list);
      return [
        list.length === 2 &&
          scored === list[1] &&
          list[1].end.status === "ok" &&
          r.state.byKey.get("r1/openai-pr269-02/O")?.length === 1,
        `attempts=${list.length} scored=#${scored?.start.attempt} ${scored?.end?.status}`,
      ];
    },
  );

  // Error precedence
  add("precedence", "AI_NoOutputGeneratedError with a 402 cause → account", async () => {
    const e = Object.assign(new Error("no output"), { name: "AI_NoOutputGeneratedError", cause: { statusCode: 402 } });
    const c = classifyAttempt({ error: e, requests: [], steps: [] });
    return [c.status === "condition-violation" && c.cause === "account-402", `${c.status}:${c.cause}`];
  });
  add("precedence", "a 5xx after a step from provider Azure → violation, not failed attempt", async () => {
    const r = await one({
      responder: (_b, n) =>
        n % 2 === 1 ? { json: completion({ content: "not json {", provider: "Azure" }) } : errorBody(503),
    });
    return [
      r.ends[0]?.status === "condition-violation" && r.ends[0].cause === "provider-Azure" && r.s.bodies.length === 1,
      `${r.ends[0]?.status}:${r.ends[0]?.cause} requests=${r.s.bodies.length}`,
    ];
  });
  add("precedence", "reported cost above the request bound → violation", async () => {
    const r = await one({ responder: () => answer([], { cost: 5 }) });
    return [r.ends[0]?.cause?.startsWith("cost-above-bound"), `${r.ends[0]?.status}:${r.ends[0]?.cause}`];
  });
  add("precedence", "reported prompt_tokens above the bound → violation", async () => {
    const r = await one({ responder: () => answer([], { promptTokens: 10_000_000 }) });
    return [r.ends[0]?.cause?.startsWith("prompt-tokens-above-bound"), `${r.ends[0]?.status}:${r.ends[0]?.cause}`];
  });

  // Cost
  add("cost", "unreported request cost → charged its own bound, flagged, continues", async () => {
    const r = await one({
      arms: ["base", "O"],
      responder: () => answer([{ id: F02, verdict: "unsupported", quote: "", reason: "r" }], { cost: null }),
    });
    const e = r.ends[0];
    return [
      e?.status === "ok" &&
        e.flags.includes("cost-incomplete") &&
        Math.abs(e.cost - e.requests[0].bound) < 1e-12 &&
        r.ends.length === 2,
      `${e?.status} flags=${e?.flags} cost=${e?.cost} bound=${e?.requests[0]?.bound} attempts=${r.ends.length}`,
    ];
  });

  // Budget
  const callBytes02 = (arm) => callMessagesBytes(P02.plans[arm], P02.identified).bytes;
  add("budget", "T + P > cap → the attempt is not started", async () => {
    const r = await one({ cap: 0.0001, responder: good });
    return [
      r.result?.outcome === "admission-stop" && r.s.bodies.length === 0,
      `${r.result?.outcome} requests=${r.s.bodies.length}`,
    ];
  });
  add("budget", "stale counter on resume → T counted once (max(C − T0, recorded))", async () => {
    const T = spendT({ header: { t0: 10 }, counterMax: 10.12, recorded: 0.3 });
    return [T === 0.3, `T=${T}`];
  });
  add("budget", "recorded 0.795 with cap 0.80 → refused before any request", async () => {
    const path = fresh();
    const Pbase = admissionP(callBytes02("base"), PRICES);
    await one({ path, arms: ["base", "O"], cap: Pbase + 0.00005, responder: good });
    appendLine(path, { kind: "start", id: "synthetic#1", key: "synthetic", P: 0, at: nowIso() });
    appendLine(path, {
      kind: "end",
      id: "synthetic#1",
      key: "synthetic",
      status: "ok",
      cost: 0.795,
      records: [],
      requests: [],
      steps: [],
      flags: [],
      at: nowIso(),
    });
    const r = await one({ path, arms: ["base", "O"], resume: true, cap: 0.8, responder: good });
    return [
      r.result?.outcome === "admission-stop" && r.s.bodies.length === 0,
      `${r.result?.outcome} requests=${r.s.bodies.length} T=${spendT(r.state).toFixed(4)}`,
    ];
  });
  add("budget", "--cap 1.01 → refused", async () => {
    const r = await one({ cap: 1.01, responder: good });
    return [isRefusal(r.error, "hard limit") && r.s.bodies.length === 0, String(r.error?.message).slice(0, 80)];
  });
  add("budget", "resume with a different --t0 → refused", async () => {
    const path = fresh();
    await one({ path, responder: good });
    const r = await one({ path, resume: true, t0: 11, responder: good });
    return [isRefusal(r.error, "T0"), String(r.error?.message).slice(0, 80)];
  });
  add("budget", "admission reserve P of a 1-finding batch holds the full 16,384-token output", async () => {
    const P = admissionP(callBytes02("base"), PRICES);
    const floor = 1.1 * 2 * 2 * OUTPUT_CAP_TOKENS * (PRICES.outPerM / 1e6);
    return [P >= floor, `P=${P.toFixed(6)} floor=${floor.toFixed(6)}`];
  });
  add("budget", "request gate blocks a repair whose bound passes the cap → budget-stopped", async () => {
    const calib = await one({ responder: good });
    const b1 = calib.ends[0].requests[0].bound;
    const r = await one({
      cap: b1,
      skipAdmission: true,
      responder: (_b, n) => (n === 1 ? { json: completion({ content: "not json {", cost: b1 * 0.9 }) } : good()),
    });
    return [
      r.ends[0]?.status === "budget-stopped" && r.s.bodies.length === 1 && r.result?.outcome === "budget-stopped",
      `${r.ends[0]?.status} requests=${r.s.bodies.length}`,
    ];
  });
  add("budget", "the gate's bound follows the actual repair body (1,000 closing delimiters)", async () => {
    const plain = await one({
      responder: (_b, n) => (n === 1 ? { json: completion({ content: "not json {" }) } : good()),
    });
    const heavy = await one({
      responder: (_b, n) =>
        n === 1 ? { json: completion({ content: `not json {${"</code-excerpt>".repeat(1000)}` }) } : good(),
    });
    const a = plain.ends[0].requests[1];
    const b = heavy.ends[0].requests[1];
    const recomputed =
      1.1 * ((b.bytes + 32 * b.messages + 32) * (PRICES.inPerM / 1e6) + b.maxTokens * (PRICES.outPerM / 1e6));
    return [
      b.bytes > a.bytes + 10_000 && Math.abs(b.bound - recomputed) < 1e-12,
      `repair bytes ${a.bytes} → ${b.bytes}, bound ${a.bound.toFixed(6)} → ${b.bound.toFixed(6)}`,
    ];
  });
  add("budget", "a body without max_tokens → refused, nothing sent", async () => {
    const ctx = { prices: PRICES, requests: [], Tbase: 0, cap: 1, seriesPath: fresh(), id: "x" };
    let sent = 0;
    ctx.fetchImpl = async () => {
      sent += 1;
      return new Response("{}");
    };
    let thrown;
    try {
      await gatedFetch(ctx)("https://x", { body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }) });
    } catch (e) {
      thrown = e;
    }
    const c = classifyAttempt({ requests: [], steps: [], unbounded: ctx.unbounded });
    return [
      thrown instanceof UnboundedRequest && sent === 0 && c.status === "condition-violation",
      `${thrown?.constructor?.name} sent=${sent} ${c.status}`,
    ];
  });

  // Durability
  add("durability", "killed after start, before end → resume refused; reconcile; never re-sent", async () => {
    const path = fresh();
    const crash = await one({
      path,
      arms: ["base", "O"],
      responder: good,
      hooks: {
        beforeSend: () => {
          throw new HarnessCrash("simulated death");
        },
      },
    });
    const s1 = seriesState(readLines(path));
    const refused = await one({ path, arms: ["base", "O"], resume: true, responder: good });
    const id = s1.open[0]?.start.id;
    const before = readLines(path).length;
    const rec = await reconcile({ seriesPath: path, key: id, readCounter: counterAt(T0) });
    const resumed = await one({ path, arms: ["base", "O"], resume: true, responder: good });
    const st = resumed.state;
    const o = memberOutcome(scoringAttempt(st.byKey.get("r1/openai-pr269-02/base")), "openai-pr269-02#2.1");
    const okAll =
      crash.error instanceof HarnessCrash &&
      s1.open.length === 1 &&
      isRefusal(refused.error, "reconcile") &&
      refused.s.bodies.length === 0 &&
      rec.cost === Math.max(rec.P, rec.requestBounds) &&
      rec.cost >= rec.P &&
      readLines(path).length > before &&
      resumed.s.bodies.length === 1 &&
      st.byKey.get("r1/openai-pr269-02/base").length === 1 &&
      o.kind === "execution" &&
      o.cause === "interrupted";
    return [
      okAll,
      `open=${s1.open.length} refused=${refused.error instanceof HarnessRefusal} cost=${rec.cost.toFixed(6)} (P ${rec.P.toFixed(6)}, Σbounds ${rec.requestBounds.toFixed(6)}) resumedRequests=${resumed.s.bodies.length} base=${o.kind}:${o.cause}`,
    ];
  });
  add("durability", "equal counter reads never lower an interrupted slot's cost", async () => {
    const path = fresh();
    await one({
      path,
      responder: good,
      hooks: {
        beforeSend: () => {
          throw new HarnessCrash("simulated death");
        },
      },
    });
    const id = seriesState(readLines(path)).open[0].start.id;
    const rec = await reconcile({ seriesPath: path, key: id, readCounter: counterAt(T0) });
    const T = spendT(seriesState(readLines(path)));
    return [T >= rec.P && rec.cost > 0, `T=${T.toFixed(6)} cost=${rec.cost.toFixed(6)} counterΔ=0`];
  });

  // Resume integrity
  const tamper = (field, value) =>
    add("resume-integrity", `a changed ${field} hash in the header → refused`, async () => {
      const path = fresh();
      await one({ path, responder: good });
      const lines = readFileSync(path, "utf8").split("\n");
      const h = JSON.parse(lines[0]);
      h[field] = value;
      lines[0] = JSON.stringify(h);
      writeFileSync(path, lines.join("\n"));
      const r = await one({ path, resume: true, responder: good });
      return [isRefusal(r.error, field) && r.s.bodies.length === 0, String(r.error?.message).slice(0, 90)];
    });
  tamper("corpus", "0".repeat(64));
  tamper("harness", "0".repeat(64));
  tamper("gateCore", "0".repeat(64));

  // Scoring
  add("scoring", "2/3 → unstable, hard fail, majority pass", async () => {
    const s = scoreFinding([{ met: true }, { met: true }, { met: false }]);
    return [s.hard === "unstable" && s.majority === "pass", JSON.stringify(s)];
  });
  add("scoring", "diagnosis rules (1)–(5), exclusive, first match wins", async () => {
    const m = (met, kind = "result") => ({ met, kind });
    const got = [
      diagnose([m(true), m(true), m(true)], [m(true), m(true), m(true)]),
      diagnose([m(true), m(true), m(true)], [m(true), m(false), m(true)]),
      diagnose([m(true), m(false, "execution"), m(true)], [m(false), m(false), m(false)]),
      diagnose([m(true), m(false), m(false, "execution")], [m(true), m(true), m(true)]),
      diagnose([m(false), m(true), m(false)], [m(true), m(false), m(true)]),
    ];
    const want = ["survives", "survives, O anomaly", "lost to reliability", "evidence-delivery limit", "investigate"];
    return [canon(got) === canon(want), got.join(" | ")];
  });
  add("scoring", "report scores an interrupted slot as not met and reads the series alone", async () => {
    const path = fresh();
    await one({
      path,
      arms: ["base", "O"],
      responder: good,
      hooks: {
        beforeSend: () => {
          throw new HarnessCrash("x");
        },
      },
    });
    await reconcile({
      seriesPath: path,
      key: seriesState(readLines(path)).open[0].start.id,
      readCounter: counterAt(T0),
    });
    await one({ path, arms: ["base", "O"], resume: true, responder: good });
    const { json } = buildReport({ state: seriesState(readLines(path)) });
    const d2 = json.trueClass.find((x) => x.member === "openai-pr269-02#2.1");
    return [
      d2?.base[0] === "execution:interrupted" &&
        d2.O[0] === "published" &&
        d2.hard === "fail" &&
        d2.diagnosis === "lost to reliability",
      JSON.stringify(d2),
    ];
  });

  // Blind
  add("blind", "the sheet carries no key value (slot, member, run); the key maps every label", async () => {
    const { sheetText, keyText, count } = buildBlind({ state: refutedSeries.state, seed: "ab".repeat(32) });
    const key = JSON.parse(keyText);
    const ok =
      count >= 1 &&
      Object.keys(key.entries).length === count &&
      sheetText.includes(RATIONALE["G-D13"]) &&
      !sheetText.includes("openai-pr269-05");
    return [ok, `entries=${count}`];
  });

  // Seal
  add("seal", "no gate.md → run refused", async () => {
    let e;
    try {
      checkSeal(join(dir, "missing-gate.md"));
    } catch (caught) {
      e = caught;
    }
    return [isRefusal(e, "not written or sealed"), String(e?.message).slice(0, 80)];
  });
  const sealedGate = (pins, editAfter = false) => {
    const section = `## Pre-registration\n\ntext\n\n\`\`\`json pins\n${JSON.stringify(pins, null, 1)}\n\`\`\`\n\n_End of Pre-registration._\n`;
    const h = createHash("sha256").update(section, "utf8").digest("hex");
    const body = editAfter ? section.replace("text", "edited") : section;
    const p = join(dir, `gate-${String((fileNo += 1))}.md`);
    writeFileSync(p, `# Gate\n\n${body}\n## Pre-registration seal\n\n- sha256: **\`${h}\`**\n`);
    return p;
  };
  add("seal", "sealed gate.md with matching pins → accepted", async () => {
    let e;
    try {
      checkSeal(sealedGate({ ...PINS, harness: HARNESS_SHA256 }));
    } catch (caught) {
      e = caught;
    }
    return [e === undefined, e === undefined ? "accepted" : e.message.slice(0, 80)];
  });
  add("seal", "sealed pins naming another harness.mjs → refused", async () => {
    let e;
    try {
      checkSeal(sealedGate({ ...PINS, harness: "f".repeat(64) }));
    } catch (caught) {
      e = caught;
    }
    return [isRefusal(e, "harness"), String(e?.message).slice(0, 90)];
  });
  add("seal", "pre-registration edited after the seal → refused", async () => {
    let e;
    try {
      checkSeal(sealedGate({ ...PINS, harness: HARNESS_SHA256 }, true));
    } catch (caught) {
      e = caught;
    }
    return [isRefusal(e, "changed after the seal"), String(e?.message).slice(0, 90)];
  });

  // Review F1: an observed violation latches and no later request is sent
  const latchCase = (name, extra, expectCause) =>
    add("latch (review F1)", name, async () => {
      const r = await one({ responder: () => ({ json: completion({ content: "not json {", ...extra }) }) });
      return [
        r.ends[0]?.status === "condition-violation" &&
          String(r.ends[0].cause).startsWith(expectCause) &&
          r.s.bodies.length === 1,
        `${r.ends[0]?.status}:${r.ends[0]?.cause} requests=${r.s.bodies.length}`,
      ];
    });
  latchCase("malformed answer + cost above its bound → exactly one request", { cost: 5 }, "cost-above-bound");
  latchCase(
    "malformed answer + prompt_tokens above its bound → exactly one request",
    { promptTokens: 10_000_000 },
    "prompt-tokens-above-bound",
  );
  latchCase("malformed answer + provider Azure → exactly one request", { provider: "Azure" }, "provider-Azure");
  latchCase("malformed answer + reasoning text → exactly one request", { reasoningText: "hmm" }, "reasoning-text");
  add("latch (review F1)", "violation + blocked repair → condition-violation, slot re-run on resume", async () => {
    const calib = await one({ responder: good });
    const b1 = calib.ends[0].requests[0].bound;
    const path = fresh();
    const r = await one({
      path,
      cap: b1,
      skipAdmission: true,
      responder: () => ({ json: completion({ content: "not json {", provider: "Azure", cost: b1 * 0.9 }) }),
    });
    const unit = classifyAttempt({
      requests: [{ status: 200, provider: "Azure", blocked: false, reasoningChars: 0, promptTokens: null, cost: null }],
      steps: [],
      budgetStopped: true,
    });
    const again = await one({ path, resume: true, cap: 0.8, responder: good });
    const list = again.state.byKey.get("r1/openai-pr269-02/base");
    return [
      r.ends[0]?.status === "condition-violation" &&
        r.s.bodies.length === 1 &&
        unit.status === "condition-violation" &&
        list.length === 2 &&
        list[1].end.status === "ok",
      `${r.ends[0]?.status}:${r.ends[0]?.cause} requests=${r.s.bodies.length}; unit=${unit.status}; resume attempts=${list.length}`,
    ];
  });

  // Review F2 + F3: the report carries every finding, and refutation scoring is pinned at report level
  const refutationSeries = async (verdicts, repeats) => {
    const path = fresh();
    await one({
      path,
      run: "openai-pr269-05",
      repeats,
      responder: (_b, n) => with05(verdicts[(n - 1) % verdicts.length]),
    });
    return seriesState(readLines(path));
  };
  const D13valid = { id: D13, verdict: "refuted", quote: goodQuote(own(P05, D13)), reason: "the guard exits first" };
  const D13empty = { id: D13, verdict: "refuted", quote: "", reason: "r" };
  const D13absent = { id: D13, verdict: "refuted", quote: "this line is not in any block at all", reason: "r" };
  const autoOf = (st) => buildReport({ state: st }).json.codeRefutable.find((x) => x.member === "openai-pr269-05#5.2");
  add("report (review F2)", "every member of a batch appears in the detail, labelled by quote evidence", async () => {
    const st = await refutationSeries([D13empty], 1);
    const { json, md } = buildReport({ state: st });
    const members = new Set(json.detail.map((d) => d.member));
    const d13 = json.detail.find((d) => d.member === "openai-pr269-05#5.2");
    const wanted = batches.get("openai-pr269-05").members.map((m) => m.member);
    return [
      wanted.every((m) => members.has(m)) &&
        d13.outcome === "refuted without evidence" &&
        d13.quoteVerified === false &&
        md.includes("openai-pr269-05#5.4"),
      `members=${[...members].join(",")} d13=${d13?.outcome}`,
    ];
  });
  add("report (review F3)", "automatic score: valid quote 1/1 pass, empty 0/1 fail, absent 0/1 fail", async () => {
    const a = autoOf(await refutationSeries([D13valid], 1));
    const b = autoOf(await refutationSeries([D13empty], 1));
    const c = autoOf(await refutationSeries([D13absent], 1));
    return [
      a.automatic.met === "1/1" &&
        a.automatic.hard === "pass" &&
        b.automatic.met === "0/1" &&
        b.automatic.hard === "fail" &&
        c.automatic.met === "0/1",
      `valid=${a.automatic.met} empty=${b.automatic.met} absent=${c.automatic.met}`,
    ];
  });
  add(
    "report (review F3)",
    "3 repeats mixed: automatic 1/3 unstable; hand-read pass vs off-target via the blind key",
    async () => {
      const st = await refutationSeries([D13valid, D13empty, D13absent], 3);
      const auto = autoOf(st);
      const { keyText } = buildBlind({ state: st, seed: "cd".repeat(32) });
      const key = JSON.parse(keyText);
      const gradesFor = (verifiedGrade) =>
        Object.fromEntries(
          Object.entries(key.entries).map(([label, e]) => [
            label,
            e.key.startsWith("r1/") ? verifiedGrade : "no-evidence",
          ]),
        );
      const pass = buildReport({ state: st, grades: gradesFor("pass"), blindKey: key }).json.codeRefutable.find(
        (x) => x.member === "openai-pr269-05#5.2",
      );
      const off = buildReport({ state: st, grades: gradesFor("off-target"), blindKey: key }).json.codeRefutable.find(
        (x) => x.member === "openai-pr269-05#5.2",
      );
      return [
        auto.automatic.met === "1/3" &&
          auto.automatic.hard === "unstable" &&
          pass.handRead.met === "1/3" &&
          off.handRead.met === "0/3" &&
          off.handRead.hard === "fail",
        `auto=${auto.automatic.met} ${auto.automatic.hard}; hand-read pass=${pass.handRead.met} off-target=${off.handRead.met}`,
      ];
    },
  );

  // Review F4: every journal line is fsync'd before the request it records is sent
  const instrumentedFs = (failFsyncOn) => {
    const pending = new Map();
    const unsynced = [];
    const events = [];
    return {
      events,
      unsynced,
      fs: {
        openSync: (path, flags) => {
          const fd = openSync(path, flags);
          pending.set(fd, []);
          return fd;
        },
        writeSync: (fd, text) => {
          pending.get(fd).push(text);
          unsynced.push(text);
          events.push({ op: "write", text });
          return writeSync(fd, text);
        },
        fsyncSync: (fd) => {
          const lines = pending.get(fd);
          if (failFsyncOn !== undefined && lines.some((t) => failFsyncOn(t))) {
            failFsyncOn = undefined;
            throw Object.assign(new Error("EIO: injected fsync failure"), { code: "EIO" });
          }
          for (const t of lines) unsynced.splice(unsynced.indexOf(t), 1);
          pending.set(fd, []);
          events.push({ op: "fsync" });
          return fsyncSync(fd);
        },
        closeSync: (fd) => {
          pending.delete(fd);
          return closeSync(fd);
        },
      },
    };
  };
  const withFs = async (inst, fn) => {
    const saved = FS;
    FS = inst.fs;
    try {
      return await fn();
    } finally {
      FS = saved;
    }
  };
  add("durability (review F4)", "start and request lines are fsync'd before the stub sees the request", async () => {
    const inst = instrumentedFs();
    const seenAtSend = [];
    const r = await withFs(inst, () =>
      one({
        responder: () => {
          seenAtSend.push({
            unsynced: inst.unsynced.length,
            hasStart: inst.events.some((e) => e.op === "write" && e.text.includes('"kind":"start"')),
            lastWrite: [...inst.events].reverse().find((e) => e.op === "write")?.text ?? "",
          });
          return good();
        },
      }),
    );
    const s0 = seenAtSend[0];
    return [
      r.ends[0]?.status === "ok" &&
        s0 !== undefined &&
        s0.unsynced === 0 &&
        s0.hasStart &&
        s0.lastWrite.includes('"kind":"request"'),
      JSON.stringify({ ...s0, lastWrite: s0?.lastWrite.slice(0, 40) }),
    ];
  });
  add("durability (review F4)", "a failed fsync of the request line → nothing is sent", async () => {
    const inst = instrumentedFs((t) => t.includes('"kind":"request"'));
    const r = await withFs(inst, () => one({ responder: good }));
    return [
      r.s.bodies.length === 0 && r.ends[0]?.status === "condition-violation",
      `requests=${r.s.bodies.length} ${r.ends[0]?.status}:${r.ends[0]?.cause}`,
    ];
  });

  // Amendment 1: the served tier is recorded for audit, for every response, repair and retry included
  add("amendment 1", "generation id and service_tier recorded per response, repair included", async () => {
    const r = await one({
      responder: (_b, n) =>
        n === 1
          ? { json: completion({ content: "not json {", id: "gen-a1", serviceTier: "default" }) }
          : {
              json: completion({
                content: JSON.stringify({ verdicts: [{ id: F02, verdict: "unsupported", quote: "", reason: "r" }] }),
                id: "gen-a2",
              }),
            },
    });
    const q = r.ends[0].requests.map((x) => `${x.generationId}/${x.serviceTier}`);
    const rel = buildReport({ state: r.state }).json.reliability;
    return [
      canon(q) === canon(["gen-a1/default", "gen-a2/null"]) &&
        canon(rel.serviceTiers) === canon({ default: 1, undetermined: 1 }) &&
        rel.generationIds.recorded === 2,
      `${q.join(" ")} tiers=${JSON.stringify(rel.serviceTiers)}`,
    ];
  });
  add("amendment 1", "an error response has no generation id; the retried response's id is recorded", async () => {
    const r = await one({
      responder: (_b, n) =>
        n === 1
          ? errorBody(503)
          : { json: completion({ content: JSON.stringify({ verdicts: [] }), id: "gen-b2", serviceTier: "default" }) },
    });
    const q = r.ends[0].requests.map((x) => `${x.generationId}/${x.serviceTier}`);
    const rel = buildReport({ state: r.state }).json.reliability;
    return [
      canon(q) === canon(["null/null", "gen-b2/default"]) &&
        rel.generationIds.missing === 1 &&
        rel.generationIds.recorded === 1,
      `${q.join(" ")} ids=${JSON.stringify(rel.generationIds)}`,
    ];
  });
  const amendedGate = ({ sealedHarness, amendmentPins, editAfter = false, position = "after" }) => {
    const section = `## Pre-registration\n\ntext\n\n\`\`\`json pins\n${JSON.stringify({ ...PINS, harness: sealedHarness }, null, 1)}\n\`\`\`\n\n_End of Pre-registration._\n`;
    const h = createHash("sha256").update(section, "utf8").digest("hex");
    const block = `### Amendment 1 (2026-10-10)\n\nwhy\n\n\`\`\`json amendment-pins\n${JSON.stringify(amendmentPins, null, 1)}\n\`\`\`\n\n_End of Amendment 1._\n`;
    const ah = createHash("sha256").update(block, "utf8").digest("hex");
    const body = editAfter ? block.replace("why", "edited") : block;
    const seal = `## Pre-registration seal\n\n- sha256: **\`${h}\`**\n`;
    const amend = `## Amendments\n\n${body}\n- sha256: **\`${ah}\`**\n`;
    const p = join(dir, `gate-${String((fileNo += 1))}.md`);
    writeFileSync(
      p,
      position === "after" ? `# Gate\n\n${section}\n${seal}\n${amend}` : `# Gate\n\n${amend}\n${section}\n${seal}`,
    );
    return p;
  };
  const sealOutcome = (path) => {
    try {
      checkSeal(path);
      return "accepted";
    } catch (e) {
      return e instanceof HarnessRefusal ? `refused: ${e.message}` : `threw ${String(e)}`;
    }
  };
  const OLD = "a".repeat(64);
  add("amendment 1", "a recorded amendment that supersedes the sealed harness pin → accepted", async () => {
    const o = sealOutcome(
      amendedGate({ sealedHarness: OLD, amendmentPins: { harness: HARNESS_SHA256, supersedes: OLD } }),
    );
    return [o === "accepted", o.slice(0, 90)];
  });
  add("amendment 1", "an amendment edited after its record → refused", async () => {
    const o = sealOutcome(
      amendedGate({ sealedHarness: OLD, amendmentPins: { harness: HARNESS_SHA256, supersedes: OLD }, editAfter: true }),
    );
    return [o.includes("changed after it was recorded"), o.slice(0, 90)];
  });
  add("amendment 1", "an amendment that changes any other pin → refused", async () => {
    const o = sealOutcome(
      amendedGate({
        sealedHarness: OLD,
        amendmentPins: { harness: HARNESS_SHA256, supersedes: OLD, corpus: "0".repeat(64) },
      }),
    );
    return [o.includes("may change only the harness pin"), o.slice(0, 90)];
  });
  add("amendment 1", "an amendment naming the wrong superseded pin → refused", async () => {
    const o = sealOutcome(
      amendedGate({ sealedHarness: OLD, amendmentPins: { harness: HARNESS_SHA256, supersedes: "b".repeat(64) } }),
    );
    return [o.includes("but the harness pin in force is"), o.slice(0, 90)];
  });
  add("amendment 1", "the sealed harness alone, once an amendment is in force → refused", async () => {
    const o = sealOutcome(
      amendedGate({
        sealedHarness: HARNESS_SHA256,
        amendmentPins: { harness: "c".repeat(64), supersedes: HARNESS_SHA256 },
      }),
    );
    return [o.includes("differ from this harness") && o.includes("harness"), o.slice(0, 90)];
  });
  add("seal", 'a preamble that mentions "## Pre-registration seal" in prose does not hide the seal', async () => {
    const p = sealedGate({ ...PINS, harness: HARNESS_SHA256 });
    writeFileSync(p, `> \`## Pre-registration seal\` records the hash.\n\n${readFileSync(p, "utf8")}`);
    const o = sealOutcome(p);
    return [o === "accepted", o.slice(0, 90)];
  });
  add("amendment 1", "an amendment placed before the seal → refused", async () => {
    const o = sealOutcome(
      amendedGate({
        sealedHarness: OLD,
        amendmentPins: { harness: HARNESS_SHA256, supersedes: OLD },
        position: "before",
      }),
    );
    return [o.includes("before the seal"), o.slice(0, 90)];
  });

  let failed = 0;
  for (const c of cases) {
    let ok;
    let observed;
    try {
      [ok, observed] = await c.fn();
    } catch (e) {
      ok = false;
      observed = `threw ${e?.name}: ${String(e?.message).slice(0, 160)}`;
    }
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.group.padEnd(19)} ${c.name.padEnd(86)} observed: ${observed}`);
  }
  console.log(
    `SELF-TEST ${failed === 0 ? "PASS" : "FAIL"}: ${String(cases.length - failed)}/${String(cases.length)} cases (scratch: ${dir})`,
  );
  if (failed > 0) process.exitCode = 1;
}

// ---- Modes ----
async function main() {
  const args = parseArgs(process.argv.slice(3));
  const need = (k) => {
    if (args[k] === undefined || args[k] === true)
      refuse(`--${k.replace(/[A-Z]/gu, (c) => `-${c.toLowerCase()}`)} is required for ${MODE}`);
    return args[k];
  };
  if (MODE === "self-test") return selfTest();
  if (MODE === "run") {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) refuse("OPENROUTER_API_KEY is not set; `run` makes paid calls and needs it");
    const r = await runSeries({
      seriesPath: need("series"),
      repeats: need("repeats"),
      cap: need("cap"),
      t0: args.t0,
      priceIn: args.priceIn,
      priceOut: args.priceOut,
      resume: args.resume === true,
      apiKey,
    });
    process.exitCode = { complete: 0, "admission-stop": 4, "budget-stopped": 4, "condition-violation": 3 }[r.outcome];
    return undefined;
  }
  if (MODE === "reconcile") {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) refuse("OPENROUTER_API_KEY is not set; `reconcile` records a key-counter read");
    const r = await reconcile({ seriesPath: need("series"), key: need("key"), readCounter: () => liveCounter(apiKey) });
    console.log(
      `RECONCILED ${String(args.key)}: cost $${r.cost.toFixed(6)} = max(P $${r.P.toFixed(6)}, Σ request bounds $${r.requestBounds.toFixed(6)}). Not re-sent.`,
    );
    return undefined;
  }
  if (MODE === "report") {
    const state = seriesState(readLines(need("series")));
    const grades = args.grades === undefined ? undefined : JSON.parse(readFileSync(args.grades, "utf8"));
    const blindKey = args.key === undefined ? undefined : JSON.parse(readFileSync(args.key, "utf8"));
    const { md, json } = buildReport({ state, grades, blindKey });
    process.stdout.write(md);
    if (args.out !== undefined) writeFileSync(args.out, `${JSON.stringify(json, null, 1)}\n`);
    return undefined;
  }
  if (MODE === "blind") {
    const state = seriesState(readLines(need("series")));
    const out = need("out");
    const { sheetText, keyText, count } = buildBlind({ state, seed: need("seed") });
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "sheet.md"), sheetText);
    writeFileSync(join(out, "key.json"), keyText);
    const h = (t) => createHash("sha256").update(t, "utf8").digest("hex");
    console.log(
      `BLIND ${String(count)} entries. sheet.md sha256 ${h(sheetText)}; key.json sha256 ${h(keyText)} (keep key.json out of the grading session).`,
    );
    return undefined;
  }
  return undefined;
}
if (!["plan", "dry-run"].includes(MODE)) {
  try {
    await main();
  } catch (e) {
    if (!(e instanceof HarnessRefusal)) throw e;
    console.error(`REFUSED: ${e.message}`);
    process.exitCode = 2;
  }
}
