import { join } from "node:path";

import { runReviewPipeline } from "./pipeline.js";
import { renderStickyComment } from "./render.js";

// The CLI's whole contract, extracted injectable so tests can pin the exact
// boundary the composite action consumes (impl-review-phase-1 F6):
// exit 0 = any produced verdict (incl. "failed" — advisory data), exit 1 =
// technical failure only. review-pr.ts is the thin process shell.

export interface CliIo {
  /** Read the whole of stdin (fd 0) as UTF-8. */
  readStdin: () => string;
  readFile: (path: string) => string;
  writeFile: (path: string, content: string) => void;
  /** Recursive mkdir. */
  mkdir: (path: string) => void;
  appendFile: (path: string, content: string) => void;
  log: (message: string) => void;
  logError: (message: string) => void;
}

export type CliEnv = Record<string, string | undefined>;

interface CliArgs {
  diffFile?: string;
  outDir: string;
  /** Trusted project review rules — the caller must source this from the base branch, never the PR head. */
  projectContextFile?: string;
}

export function parseArgs(argv: string[]): CliArgs {
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
    } else if (flag === "--project-context-file" && value !== undefined) {
      args.projectContextFile = value;
      i += 1;
    } else {
      throw new Error(
        `Unknown or valueless argument: ${flag ?? ""}. Usage: npm run review -- --diff-file <path> [--out-dir <dir>] [--project-context-file <path>]`,
      );
    }
  }
  return args;
}

/** Optional positive-integer ms override; unset/empty → pipeline default, invalid → exit 1. */
function parseTimeoutEnv(env: CliEnv, name: string): number | undefined {
  const raw = env[name];
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer (milliseconds), got: ${raw}`);
  }
  return value;
}

const errorLabel = (error: unknown): string =>
  typeof error === "object" &&
  error !== null &&
  "name" in error &&
  typeof error.name === "string" &&
  error.name !== ""
    ? error.name
    : String(error);

/** Actions run URL when the standard env triple is present; omitted locally. */
function resolveRunUrl(env: CliEnv): string | undefined {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = env;
  return GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
    ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
    : undefined;
}

export async function runReviewCli(
  argv: string[],
  env: CliEnv,
  io: CliIo,
  pipeline: typeof runReviewPipeline = runReviewPipeline,
): Promise<0 | 1> {
  try {
    const args = parseArgs(argv);
    const diff = args.diffFile === undefined ? io.readStdin() : io.readFile(args.diffFile);
    if (diff.trim() === "") throw new Error("Empty diff — nothing to review.");

    const result = await pipeline({
      diff,
      prTitle: env.PR_TITLE,
      prBody: env.PR_BODY,
      timeouts: {
        finderTimeoutMs: parseTimeoutEnv(env, "REVIEW_FINDER_TIMEOUT_MS"),
        judgeTimeoutMs: parseTimeoutEnv(env, "REVIEW_JUDGE_TIMEOUT_MS"),
      },
      projectReviewContext:
        args.projectContextFile === undefined ? undefined : io.readFile(args.projectContextFile),
      // In an ultimately-green run this stderr line is the only evidence that
      // a transient flake happened and the single retry recovered it.
      onRetry: (pass, error, delayMs) => {
        io.logError(
          `retrying ${pass} after ${errorLabel(error)} in ${String(Math.round(delayMs))}ms`,
        );
      },
    });

    io.mkdir(args.outDir);
    io.writeFile(join(args.outDir, "review.json"), `${JSON.stringify(result, null, 2)}\n`);
    io.writeFile(
      join(args.outDir, "comment.md"),
      renderStickyComment(result, { runUrl: resolveRunUrl(env) }),
    );

    io.log(
      `verdict=${result.verdict} findings=${String(result.findings.length)} ` +
        `(finder=${result.models.finder}, judge=${result.models.judge}) → ${args.outDir}/`,
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.logError(message);
    const summaryPath = env.GITHUB_STEP_SUMMARY;
    if (summaryPath) io.appendFile(summaryPath, `\n## AI review failed\n\n${message}\n`);
    return 1;
  }
}
