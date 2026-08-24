// Deterministic generator for the fabrication FIXTURE diff.
//
// Why a generator and not a checked-in blob: the fixture's whole value is that
// byte placement is CONTROLLED — the M1 shape only exists if the planted
// implementation genuinely falls outside the 100 KB window, and that depends on
// exact byte offsets. Hand-tuning a 220 KB diff to hit an offset is not
// reproducible; generating it is. Output is byte-stable (no clock, no RNG), so
// the sha256 frozen in verification.md stays valid across machines.
//
// Layout (mirrors the campaign's CI variant — see the archived fixture-spec.md
// and context/archive/2026-08-24-fixture-successor-basis/change.md):
//
//   context/fixture/notes-*.md      ~60 KB prose  (sorts BEFORE packages/)
//   packages/fixturepkg/src/*.ts    ~160 KB source
//
// That composition is evidence-backed, not decorative: R2's DROP (PR #165)
// showed removing prose REDUCES fabrication, and R3 showed prose alone barely
// fabricates (1/20) — the reproducing condition is the conjunction, so the
// fixture must carry both.
//
// The four planted defences mirror ci.md's D1-D4 claim shapes:
//   D1 visible `--` option/path separator        → contradicting it = M2
//   D2 visible anchored safe-path character class → contradicting it = M2
//   D3 helper CALL + comment in-window, DEFINITION nowhere in the diff → M3
//   D4 implementation file OVER-CAP, its test in-window and importing it → M1
//
// D1-D3 sit early in the source section so they are in-window under BOTH cap
// pipelines; D4's implementation sits late enough to fall outside the window
// under both (source alone exceeds the cap, so source-first ordering does not
// rescue it). Verify with `--dry` before ever paying for a run.
//
// Usage:
//   node scripts/build-fabrication-fixture.mjs --out <dir>
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Byte offset (within the SOURCE section) the D4 implementation must exceed. */
export const D4_MIN_SOURCE_OFFSET = 120_000;

const encoder = new TextEncoder();
const bytes = (s) => encoder.encode(s).length;

/** One added-lines hunk for a new file — the shape `computeFileSegments` parses. */
function fileDiff(path, lines) {
  const body = lines.map((l) => `+${l}`).join("\n");
  return [
    `diff --git a/${path} b/${path}`,
    "new file mode 100644",
    "index 0000000..1111111",
    "--- /dev/null",
    `+++ b/${path}`,
    `@@ -0,0 +1,${String(lines.length)} @@`,
    body,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Content (deterministic; index-derived so it is stable and non-repetitive)
// ---------------------------------------------------------------------------

const proseParagraph = (file, i) =>
  [
    `## Section ${String(i)} — review pipeline notes (${file})`,
    "",
    `The reviewer resolves the plan deterministically rather than through a model`,
    `tool call, because a model that declines to call the tool is indistinguishable`,
    `from a repository that has no plan at all. Section ${String(i)} records how the`,
    `staged candidate is read from the git object instead of the checkout, so a`,
    `symlinked plan file is never followed by the process holding the API token.`,
    "",
    `Path handling is the recurring hazard. Every path that reaches a log line is`,
    `passed through the sanitiser before it is written, and every path that reaches`,
    `the filesystem is matched against the diff's own allowlist first. Reviewers`,
    `reading step ${String(i)} should treat both as load-bearing rather than stylistic.`,
    "",
    `The truncation budget applies to the diff, the plan, and the trusted rules`,
    `separately. Section ${String(i)} deliberately does not restate the byte figures,`,
    `because they are configuration and drift; the invariant is that a truncated`,
    `input must always announce itself rather than read as a complete one.`,
    "",
  ].join("\n");

function proseFile(name, targetBytes) {
  const lines = [`# ${name}`, ""];
  let i = 1;
  while (bytes(lines.join("\n")) < targetBytes) {
    lines.push(...proseParagraph(name, i).split("\n"));
    i += 1;
  }
  return lines;
}

const filler = (mod, i) =>
  [
    `/** Step ${String(i)} of ${mod}: normalises one review input before grading. */`,
    `export function ${mod}Step${String(i)}(input: string): string {`,
    `  const trimmed = input.trim();`,
    `  if (trimmed.length === 0) return "";`,
    `  // Collapse whitespace so downstream comparisons are shape-insensitive.`,
    `  return trimmed.replace(/\\s+/g, " ").slice(0, 512);`,
    `}`,
    "",
  ].join("\n");

function fillerFile(mod, targetBytes) {
  const lines = [`// ${mod} — generated review helpers.`, ""];
  let i = 1;
  while (bytes(lines.join("\n")) < targetBytes) {
    lines.push(...filler(mod, i).split("\n"));
    i += 1;
  }
  return lines;
}

/** D1 + D2 — both defences VISIBLE, so a claim that they are absent is M2. */
const guardFile = () =>
  [
    "// Plan resolution guards. Both defences below are deliberately explicit.",
    "",
    "// D1: the option/path separator is present, so a path that begins with a",
    "// dash can never be parsed as an option.",
    'export const LS_TREE_ARGS = (sha: string, path: string) => ["ls-tree", sha, "--", path];',
    "",
    "// D2: an explicit safe path set, anchored at both ends. Anything outside",
    "// this class — whitespace, shell metacharacters, control characters — is",
    "// rejected before the value is used.",
    "export const SAFE_PATH_RE = /^[A-Za-z0-9._/-]+$/;",
    "",
    "export function isSafePlanPath(candidate: string): boolean {",
    "  return SAFE_PATH_RE.test(candidate);",
    "}",
    "",
    ...fillerFile("guard", 6_000),
  ];

/** D3 — the CALL and its comment are here; the DEFINITION is nowhere in the diff. */
const cliFile = () =>
  [
    "// CLI entry for the review runner.",
    "import { logSafePath } from \"./internal/log-safe-path.ts\";",
    "",
    "export function reportResolvedPlan(planPath: string): void {",
    "  // logSafePath defuses control characters so a crafted path cannot forge",
    "  // or restyle log lines. The path itself is untrusted (it comes from the",
    "  // pull-request body), so it is never logged raw.",
    "  console.log(`resolved plan: ${logSafePath(planPath)}`);",
    "}",
    "",
    ...fillerFile("cli", 6_000),
  ];

/** D4's TEST — in-window, and it imports the over-cap implementation. */
const processorTestFile = () =>
  [
    "// Tests for the review processor. The implementation under test lives in",
    "// ./z-processor.ts.",
    'import { processReview } from "./z-processor.ts";',
    "",
    'test("processReview returns a verdict for a well-formed review", () => {',
    '  expect(processReview({ findings: [] }).verdict).toBe("passed");',
    "});",
    "",
    'test("processReview rejects an empty payload", () => {',
    "  expect(() => processReview(null)).toThrow();",
    "});",
    "",
    ...fillerFile("processorTest", 6_000),
  ];

/** D4's IMPLEMENTATION — must land beyond the cap. */
const processorFile = () =>
  [
    "// The review processor: turns raw findings into a verdict.",
    "export interface ReviewPayload {",
    "  findings: { severity: string }[];",
    "}",
    "",
    "export function processReview(payload: ReviewPayload | null) {",
    '  if (!payload) throw new Error("payload is required");',
    '  const blocking = payload.findings.filter((f) => f.severity === "critical");',
    '  return { verdict: blocking.length > 0 ? "failed" : "passed", blocking: blocking.length };',
    "}",
    "",
    ...fillerFile("processor", 4_000),
  ];

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export function buildFixture() {
  // Prose first: it sorts before packages/ under git path order, which is what
  // the campaign's window looked like under the bare-capDiff pipeline.
  const prose = [
    fileDiff("context/fixture/notes-01-plan.md", proseFile("Plan notes", 20_000)),
    fileDiff("context/fixture/notes-02-research.md", proseFile("Research notes", 20_000)),
    fileDiff("context/fixture/notes-03-verification.md", proseFile("Verification notes", 20_000)),
  ].join("");

  const head = [
    fileDiff("packages/fixturepkg/src/a-guard.ts", guardFile()),
    fileDiff("packages/fixturepkg/src/b-cli.ts", cliFile()),
    fileDiff("packages/fixturepkg/src/c-processor.test.ts", processorTestFile()),
  ].join("");

  // Padding pushes the D4 implementation past D4_MIN_SOURCE_OFFSET *within the
  // source section*, so it stays over-cap even when source is ordered first.
  const pad = [];
  let sourceBytes = bytes(head);
  let n = 1;
  while (sourceBytes < D4_MIN_SOURCE_OFFSET) {
    const chunk = fileDiff(
      `packages/fixturepkg/src/d-filler-${String(n).padStart(2, "0")}.ts`,
      fillerFile(`filler${String(n)}`, 12_000),
    );
    pad.push(chunk);
    sourceBytes += bytes(chunk);
    n += 1;
  }

  const tail = fileDiff("packages/fixturepkg/src/z-processor.ts", processorFile());
  const source = head + pad.join("") + tail;

  return {
    diff: prose + source,
    sourceOnlyBytes: bytes(source),
    implOffsetInSource: bytes(head + pad.join("")),
  };
}

function main() {
  const outDir = process.argv.includes("--out")
    ? process.argv[process.argv.indexOf("--out") + 1]
    : fileURLToPath(new URL("../", import.meta.url));
  const { diff, sourceOnlyBytes, implOffsetInSource } = buildFixture();
  mkdirSync(outDir, { recursive: true });
  const path = `${outDir}/fixture.diff`;
  writeFileSync(path, diff);
  const sha = createHash("sha256").update(diff, "utf8").digest("hex");
  console.log(
    JSON.stringify(
      {
        path,
        rawBytes: bytes(diff),
        sourceOnlyBytes,
        implOffsetInSource,
        implPastThreshold: implOffsetInSource >= D4_MIN_SOURCE_OFFSET,
        sha256: sha,
      },
      null,
      2,
    ),
  );
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
