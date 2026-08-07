// CI entry (npm run review): diff in → review.json + comment.md out.
// This file owns process exit; the library only ever throws. Exit-code
// contract: any produced verdict (incl. "failed") is exit 0 — advisory data;
// exit 1 means technical failure only (the action's posting steps rely on it).

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { runReviewPipeline } from "./pipeline.js";
import { renderStickyComment } from "./render.js";

interface CliArgs {
  diffFile?: string;
  outDir: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { outDir: ".review-out" };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv.at(i);
    const value = argv.at(i + 1);
    if (flag === "--diff-file" && value !== undefined) {
      args.diffFile = value;
      i += 1;
    } else if (flag === "--out-dir" && value !== undefined) {
      args.outDir = value;
      i += 1;
    } else {
      throw new Error(
        `Unknown or valueless argument: ${flag ?? ""}. Usage: npm run review -- --diff-file <path> [--out-dir <dir>]`,
      );
    }
  }
  return args;
}

/** `--diff-file <path>` or stdin (fd 0) when the flag is absent. */
function readDiff(diffFile: string | undefined): string {
  return diffFile === undefined ? readFileSync(0, "utf8") : readFileSync(diffFile, "utf8");
}

/** Actions run URL when the standard env triple is present; omitted locally. */
function resolveRunUrl(): string | undefined {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  return GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
    ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
    : undefined;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const diff = readDiff(args.diffFile);
  if (diff.trim() === "") throw new Error("Empty diff — nothing to review.");

  const result = await runReviewPipeline({
    diff,
    prTitle: process.env.PR_TITLE,
    prBody: process.env.PR_BODY,
  });

  mkdirSync(args.outDir, { recursive: true });
  writeFileSync(join(args.outDir, "review.json"), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(join(args.outDir, "comment.md"), renderStickyComment(result, { runUrl: resolveRunUrl() }));

  console.log(
    `verdict=${result.verdict} findings=${String(result.findings.length)} ` +
      `(finder=${result.models.finder}, judge=${result.models.judge}) → ${args.outDir}/`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) appendFileSync(summaryPath, `\n## AI review failed\n\n${message}\n`);
  // exitCode + natural drain instead of process.exit(1): a hard exit while a
  // failed fetch's handles are closing trips a libuv assertion on Windows
  // (exit code 127/abort instead of the contractual 1).
  process.exitCode = 1;
}
