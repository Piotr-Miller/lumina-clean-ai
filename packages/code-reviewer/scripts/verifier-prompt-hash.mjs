// Prints the hashes the finder-verification Pre-registration seals (plan.md
// Phase 3 §3; gate.md Pre-registration §1). Content hashes only — never commit
// SHAs, which a rebase-merge rewrites:
//
// - sha256 of `buildVerifierInstructions()`'s output;
// - sha256 of `buildVerifierPrompt` rendered on a FIXED sample: the first two
//   raw findings of attempt 1 of `finder-model-swap`'s #269 series, merged and
//   numbered as the pipeline does, with their excerpts planned by
//   `planExcerpts` against the code at fca2778;
// - sha256 of src/excerpts.ts, src/verifier.ts and src/prompts.ts as files;
// - the EXCERPT_LIMITS values (and the sha256 of their JSON).
//
// Free: git and files only. Run from packages/code-reviewer:
//   npx tsx scripts/verifier-prompt-hash.mjs
// The sample is read from git objects (the archive at HEAD, the code at
// fca2778), so the output reproduces on any checkout that has them.
//
// The gate runner IMPORTS `computeVerifierPromptHashes` (never a copy) and puts
// its sealed subset into every series line's identity (impl-review a8844a6 F3),
// so a series cannot be continued on code other than the code it started on.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { EXCERPT_LIMITS, planExcerpts } from "../src/excerpts.ts";
import { mergeFindings } from "../src/findings.ts";
import { buildVerifierInstructions, buildVerifierPrompt } from "../src/prompts.ts";
import { assignFindingIds } from "../src/scorecard.ts";
import { parseDiffPaths, readDiffScoped } from "../src/source-provider.ts";

const PACKAGE = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERIES = "context/archive/2026-10-02-finder-model-swap/gate-openai-pr269.jsonl";
const BASE = "3d0adc1b4910c31973c6ac98a7ce776fcb68d878";
const REV = "fca2778742ec0bc02a84f42b23bf639fc32c7ad1";
const DIFF_SHA256 = "1e4ec0882371989122f9e4254c93c4df1f51826a4f57dbfe04139175177e550f";

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: PACKAGE, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/** The hashes the Pre-registration seals, computed from git objects and the package's files. */
export function computeVerifierPromptHashes() {
  // The #269 diff by the frozen recipe (gate.md § Inputs freeze), from the repo root.
  const diff = git(
    "-C",
    git("rev-parse", "--show-toplevel").trim(),
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

  // The real read core over the committed tree at REV.
  const ROOT = "/fca2778";
  const relative = (path) => path.slice(ROOT.length + 1);
  const allowedPaths = parseDiffPaths(diff);
  const reader = readDiffScoped({
    allowedPaths,
    root: ROOT,
    realpath: (path) => path,
    isRegularFile: (path) => {
      try {
        return git("cat-file", "-t", `${REV}:${relative(path)}`).trim() === "blob";
      } catch {
        return false;
      }
    },
    readFile: (path) => git("show", `${REV}:${relative(path)}`),
  });

  const attempt1 = git("show", `HEAD:${SERIES}`)
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line))
    .find((entry) => entry.kind === "attempt" && entry.attempt === 1);
  if (attempt1 === undefined) throw new Error("attempt 1 not found in the #269 series");
  const sample = assignFindingIds(mergeFindings(attempt1.findings.slice(0, 2)));
  const plan = planExcerpts({ findings: sample, read: reader, diffPaths: [...allowedPaths].sort() });
  const instructions = buildVerifierInstructions();
  const prompt = buildVerifierPrompt({ findings: sample, blocks: plan.blocks, perFinding: plan.perFinding });

  const file = (path) => sha256(readFileSync(join(PACKAGE, path), "utf8"));
  return {
    verifierInstructions: sha256(instructions),
    verifierPromptSample: sha256(prompt),
    sample: {
      source: `${SERIES} attempt 1, findings 1–2, code at ${REV.slice(0, 7)}`,
      findings: sample.map(
        (f) => `${f.id} ${f.file}:${String(f.startLine)}${f.endLine === undefined ? "" : `-${String(f.endLine)}`}`,
      ),
      blocks: plan.blocks.length,
      promptChars: prompt.length,
      instructionsChars: instructions.length,
    },
    files: {
      "src/excerpts.ts": file("src/excerpts.ts"),
      "src/verifier.ts": file("src/verifier.ts"),
      "src/prompts.ts": file("src/prompts.ts"),
    },
    excerptLimits: EXCERPT_LIMITS,
    excerptLimitsSha256: sha256(JSON.stringify(EXCERPT_LIMITS)),
  };
}

// Printed only when run as a script; an import computes nothing until called.
if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  console.log(JSON.stringify(computeVerifierPromptHashes(), null, 2));
}
