import { join } from "node:path";

import { runReviewPipeline, type FinderStepInfo, type PipelineInput } from "./pipeline.js";
import { renderStickyComment } from "./render.js";
import type { PipelineResult } from "./schemas.js";
import { createDiffScopedReaderForDiff, createDiffScopedSourceForDiff } from "./source-provider.js";

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
  /** Resolve symlinks to the canonical absolute path (fs.realpathSync). */
  realpath: (path: string) => string;
  /** True when the path is a regular file (fs.statSync().isFile()). */
  isRegularFile: (path: string) => boolean;
}

export type CliEnv = Record<string, string | undefined>;

interface CliArgs {
  diffFile?: string;
  outDir: string;
  /** Trusted project review rules — the caller must source this from the base branch, never the PR head. */
  projectContextFile?: string;
  /** Checkout root for the finder's diff-scoped file-context tool; absent → tool-less (legacy) run. */
  sourceRoot?: string;
  /**
   * The plan this PR claims to implement. UNTRUSTED (PR-head content) — the
   * caller must stage it from the Git object after a blob-mode check, never
   * read it through the checkout, because a symlinked plan.md would be
   * resolved by THIS process, the one holding OPENROUTER_API_KEY. Absent or
   * empty → no plan, which is a known state, not an error.
   */
  planFile?: string;
  /**
   * CI policy (R8, change `finder-verification`): findings must be verified
   * against the source root before they are published. Without `--source-root`
   * the run aborts before any model call; with findings but no readable source
   * it aborts after the finder. Absent (local runs) → unverified findings are
   * published with a warning and a comment footnote.
   */
  requireVerification: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { outDir: ".review-out", requireVerification: false };
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
    } else if (flag === "--source-root" && value !== undefined) {
      args.sourceRoot = value;
      i += 1;
    } else if (flag === "--plan-file" && value !== undefined) {
      args.planFile = value;
      i += 1;
    } else if (flag === "--require-verification") {
      args.requireVerification = true;
    } else {
      throw new Error(
        `Unknown or valueless argument: ${flag ?? ""}. Usage: npm run review -- --diff-file <path> [--out-dir <dir>] [--project-context-file <path>] [--source-root <dir>] [--plan-file <path>] [--require-verification]`,
      );
    }
  }
  return args;
}

/** CI default for the finder's loop budget when a source is active. */
export const DEFAULT_FINDER_MAX_STEPS = 5;

/** Optional positive-integer step budget; unset/empty → default, invalid → exit 1. */
function parseMaxStepsEnv(env: CliEnv): number | undefined {
  const raw = env.REVIEW_FINDER_MAX_STEPS;
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`REVIEW_FINDER_MAX_STEPS must be a positive integer (steps), got: ${raw}`);
  }
  return value;
}

const tokenCount = (value: number | undefined): string => (value === undefined ? "?" : String(value));

const formatRange = (call: { startLine?: number; endLine?: number }): string =>
  call.startLine === undefined && call.endLine === undefined
    ? ""
    : `:${String(call.startLine ?? 1)}-${call.endLine === undefined ? "end" : String(call.endLine)}`;

// The path is model-chosen and untrusted: control characters (newlines, ANSI
// escapes) would let an injection-steered model forge or restyle telemetry
// lines in the Actions log (impl-review-full F4). Matched via the Cc Unicode
// property (C0 + DEL + C1) so no control literal appears in the source.
const logSafePath = (path: string): string => path.replace(/\p{Cc}/gu, "?");

// One stderr line per finder loop step — in an Actions log this is the only
// live evidence of what the tool loop fetched and spent.
const formatFinderStepLine = (index: number, info: FinderStepInfo): string => {
  const calls =
    info.fileContextCalls.length === 0
      ? "no getFileContext call"
      : info.fileContextCalls.map((call) => `getFileContext ${logSafePath(call.path)}${formatRange(call)}`).join(", ");
  const usage = `tokens in=${tokenCount(info.usage.inputTokens)} out=${tokenCount(info.usage.outputTokens)} total=${tokenCount(info.usage.totalTokens)}`;
  // The provider slug comes from the response, not from us — escaped like the
  // path for the same reason. `?` when OpenRouter did not report one.
  const route = `provider=${info.provider === undefined ? "?" : logSafePath(info.provider)} finish=${logSafePath(info.finishReason)}`;
  return `finder step ${String(index)}: ${calls} (${usage}) ${route}`;
};

/** How much of a rejected model output reaches the log. */
export const REJECTED_OUTPUT_CAP_CHARS = 2_000;
export const REJECTED_OUTPUT_TRUNCATION_MARKER = "[...rejected output truncated at 2,000 chars]";

// Visible escapes rather than logSafePath's "?": the rejected text is usually
// multi-line JSON, and the reader needs to see where the lines broke. Either
// way no control character reaches the log, so the untrusted text cannot
// forge or restyle log lines.
const escapeControl = (text: string): string =>
  text.replace(/\p{Cc}/gu, (char) => {
    if (char === "\n") return "\\n";
    if (char === "\r") return "\\r";
    if (char === "\t") return "\\t";
    return `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
  });

const stringField = (error: object, key: string): string | undefined =>
  key in error && typeof (error as Record<string, unknown>)[key] === "string"
    ? ((error as Record<string, unknown>)[key] as string)
    : undefined;

/**
 * The text a model produced and the pipeline rejected, as one stderr line —
 * so an outage can be attributed from the run log alone (change
 * `finder-serialization-outage`: 35 failed runs logged only "could not parse
 * the response", never what the model had sent).
 *
 * Reads any error carrying a string `text` — the finder's `FinderOutputError`,
 * the judge's `NoObjectGeneratedError` — plus its `finishReason` and `provider`
 * where present. `undefined` when the error carries no text — an abort or an
 * auth error never produced output. An empty text is still reported: "the
 * model sent nothing" is a finding.
 *
 * `fallbackProvider` is the upstream of the last request the CLI observed. It
 * fills in only when the error carries no provider of its own: the SDK's
 * `NoObjectGeneratedError` has no provider field, and its `response.body` is
 * left empty unless the call opts into `include.responseBody` (ai@7.0.52,
 * index.js:5896), so without it the one line meant to attribute a judge
 * failure would always read `provider=?`. The last observed request is the
 * one that produced the rejected text: a pass throws right after its own last
 * step, so no other request can come between them.
 *
 * Labelled by the error's class, not by pass: the pipeline rethrows the raw
 * error, and the class is what the log can state without guessing.
 *
 * The text is untrusted model output and the log is public: capped at
 * REJECTED_OUTPUT_CAP_CHARS and control characters escaped. It goes to stderr
 * only — never into comment.md or the step summary.
 */
export function formatRejectedOutputLine(error: unknown, fallbackProvider?: string): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const text = stringField(error, "text");
  if (text === undefined) return undefined;
  const own = stringField(error, "provider");
  const provider = own === undefined || own === "" ? fallbackProvider : own;
  const finish = stringField(error, "finishReason");
  let shown = text;
  if (text.length > REJECTED_OUTPUT_CAP_CHARS) {
    // Never end on half a surrogate pair.
    shown = text.slice(0, REJECTED_OUTPUT_CAP_CHARS).replace(/[\uD800-\uDBFF]$/u, "");
    shown += REJECTED_OUTPUT_TRUNCATION_MARKER;
  }
  const route = `provider=${provider === undefined || provider === "" ? "?" : escapeControl(provider)}, finish=${
    finish === undefined ? "?" : escapeControl(finish)
  }`;
  return `rejected output (${escapeControl(errorLabel(error))}, ${route}, ${String(text.length)} chars): ${escapeControl(shown)}`;
}

// One stderr line for the whole third pass — in an Actions log this is the
// only live evidence that the pass ran and what it cost. Cost is printed only
// when the provider reported it: a fabricated "$0.000000" would read as free.
const formatImplReviewLine = (result: PipelineResult): string | undefined => {
  const block = result.implReview;
  if (block === undefined) return undefined;
  const telemetry = result.implReviewTelemetry;
  const usage =
    telemetry === undefined
      ? "no usage reported"
      : `attempts=${String(telemetry.attempts)} tokens in=${tokenCount(telemetry.inputTokens)} out=${tokenCount(
          telemetry.outputTokens,
        )} total=${tokenCount(telemetry.totalTokens)}${
          telemetry.cost === undefined ? "" : ` cost=$${telemetry.cost.toFixed(6)}`
        }`;
  const outcome =
    block.status === "reviewed"
      ? `${block.verdict} with ${String(block.findings.length)} finding(s)`
      : block.status === "skipped"
        ? `SKIPPED (${block.reason})`
        : `FAILED (${block.error})`;
  return `impl review: ${outcome} (${usage})`;
};

const usd = (value: number): string => `$${value.toFixed(6)}`;

/**
 * The whole run's provider spend, and the one number criterion 4.8 actually
 * asks for: the implementation review stated as a RATIO of the code review it
 * rides alongside. An absolute nobody can calibrate is how a 57.6x finder
 * premium nearly got adopted once.
 *
 * Emitted only when at least one pass reported a cost, and the ratio only when
 * the baseline is non-zero — dividing by an unreported baseline would print a
 * confident Infinity.
 */
const formatCostLine = (result: PipelineResult): string | undefined => {
  const finder = result.finderTelemetry?.cost;
  const verifier = result.verifierTelemetry?.cost;
  const judge = result.judgeTelemetry?.cost;
  const impl = result.implReviewTelemetry?.cost;
  if (finder === undefined && verifier === undefined && judge === undefined && impl === undefined) return undefined;
  const parts = [
    `finder=${finder === undefined ? "?" : usd(finder)}`,
    // "(not run)" when no verifier request was observed — zero findings, or no
    // source — so it never reads as an unreported cost.
    `verifier=${verifier === undefined ? (result.verifierTelemetry === undefined ? "(not run)" : "?") : usd(verifier)}`,
    `judge=${judge === undefined ? "?" : usd(judge)}`,
    `impl=${impl === undefined ? "(not run)" : usd(impl)}`,
  ];
  const baseline = (finder ?? 0) + (judge ?? 0);
  if (impl !== undefined && finder !== undefined && judge !== undefined && baseline > 0) {
    parts.push(`impl/(finder+judge)=${(impl / baseline).toFixed(2)}x`);
  }
  return `review cost: ${parts.join(" ")}`;
};

/**
 * One stderr line saying what verification did — the run log's only record of
 * how many findings were withheld, and of a run that published UNVERIFIED
 * findings (lessons.md: a degradation must name what is missing and what it
 * costs). Silent when there was nothing to verify.
 */
const formatVerificationLine = (result: PipelineResult, args: CliArgs): string | undefined => {
  const { verification } = result;
  if (verification.status === "no-findings") return undefined;
  if (verification.status === "skipped-no-source") {
    const missing =
      args.sourceRoot === undefined
        ? "no --source-root was given"
        : `the diff declares no post-change path under --source-root ${logSafePath(args.sourceRoot)}`;
    return (
      `WARNING: verification skipped — ${missing}, so the verifier had no code to read. ` +
      `${String(result.findings.length)} finding(s) are published UNVERIFIED; in CI, --require-verification makes this an error.`
    );
  }
  const counts = new Map<string, number>();
  for (const record of verification.verdicts) {
    const key = record.reasonCode === undefined ? record.state : `${record.state}:${record.reasonCode}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const breakdown = [...counts].map(([key, value]) => `${key}=${String(value)}`).join(" ");
  return (
    `verification: ${String(result.findings.length)} of ${String(result.preVerificationFindingCount)} finding(s) ` +
    `published (model=${logSafePath(verification.model ?? "?")}; ${breakdown})`
  );
};

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
  typeof error === "object" && error !== null && "name" in error && typeof error.name === "string" && error.name !== ""
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
  // The upstream of the most recent observed request, for the rejected-output
  // line (see formatRejectedOutputLine). Reset on every observation, so a
  // request without a reported provider never inherits an older one's.
  let lastObservedProvider: string | undefined;
  try {
    const args = parseArgs(argv);
    // R8: checked before the diff is even read, so no model call can happen.
    if (args.requireVerification && args.sourceRoot === undefined) {
      throw new Error(
        "--require-verification was given without --source-root: the verifier would have no code to read, so the " +
          "findings could only be published unverified. Pass --source-root <checkout>, or drop " +
          "--require-verification for a local run that publishes unverified findings with a warning.",
      );
    }
    const diff = args.diffFile === undefined ? io.readStdin() : io.readFile(args.diffFile);
    if (diff.trim() === "") throw new Error("Empty diff — nothing to review.");

    // Diff-scoped file-context source, opt-in via --source-root. The
    // allowlist derives from the FULL diff read above — capDiff truncation
    // happens later inside the pipeline, and a truncated allowlist would
    // refuse legitimate requests. Absent flag → empty spread: no source, no
    // maxSteps, no step telemetry — byte-identical to the legacy invocation.
    let sourceInputs: Pick<PipelineInput, "source" | "finderMaxSteps" | "onFinderStep" | "reader"> = {};
    if (args.sourceRoot !== undefined) {
      // The allowlist derives from the FULL diff read above — capDiff
      // truncation happens later inside the pipeline, and a truncated
      // allowlist would refuse legitimate requests. `undefined` back means the
      // diff has no post-change paths (e.g. deletions only), so there is
      // nothing the tool could serve: empty spread, no source, no maxSteps, no
      // step telemetry — byte-identical to the legacy invocation.
      const source = createDiffScopedSourceForDiff({
        diff,
        root: args.sourceRoot,
        readFile: io.readFile,
        realpath: io.realpath,
        isRegularFile: io.isRegularFile,
      });
      // The verifier's reader: the same root and the same allowlist, as a
      // structured delivered/refused result instead of model-facing prose.
      const reader = createDiffScopedReaderForDiff({
        diff,
        root: args.sourceRoot,
        readFile: io.readFile,
        realpath: io.realpath,
        isRegularFile: io.isRegularFile,
      });
      if (reader !== undefined) sourceInputs = { reader };
      if (source !== undefined) {
        const finderMaxSteps = parseMaxStepsEnv(env) ?? DEFAULT_FINDER_MAX_STEPS;
        // CLI-maintained monotonic index: the SDK's stepNumber resets to 0 on
        // the retry attempt, which would make the log lie about real spend.
        let stepIndex = 0;
        sourceInputs = {
          ...sourceInputs,
          source,
          finderMaxSteps,
          onFinderStep: (info) => {
            stepIndex += 1;
            lastObservedProvider = info.provider;
            io.logError(formatFinderStepLine(stepIndex, info));
          },
        };
      }
    }

    // An empty staged plan file means "no plan", matching the
    // --project-context-file convention: the workflow writes an empty file
    // rather than branching, so emptiness must not read as a truncated plan.
    // PLAN_PATH is display metadata and equally untrusted — the PR body can
    // name it — so it rides in via env like PR_TITLE/PR_BODY and is escaped
    // at render time, never interpolated.
    let planInput: Pick<PipelineInput, "plan"> = {};
    if (args.planFile !== undefined) {
      const planText = io.readFile(args.planFile);
      // The telemetry line is emitted ONLY when the flag was passed: without
      // it, "the workflow resolved no plan" and "the plan pass silently never
      // ran" are indistinguishable in an Actions log — the silent-inertness
      // failure this design exists to avoid. Omitting the flag stays
      // byte-identical to the legacy invocation, stderr included.
      // logSafePath because PLAN_PATH is untrusted: control characters would
      // let an injected value forge or restyle log lines (impl-review-full F4).
      if (planText.trim() === "") {
        io.logError("plan file is empty — treated as no plan");
      } else {
        planInput = { plan: { text: planText, ...(env.PLAN_PATH ? { path: env.PLAN_PATH } : {}) } };
        io.logError(
          `plan supplied: ${logSafePath(env.PLAN_PATH ?? "(path not given)")} (${String(planText.length)} chars)`,
        );
      }
    }

    const result = await pipeline({
      diff,
      ...sourceInputs,
      ...planInput,
      prTitle: env.PR_TITLE,
      prBody: env.PR_BODY,
      timeouts: {
        finderTimeoutMs: parseTimeoutEnv(env, "REVIEW_FINDER_TIMEOUT_MS"),
        judgeTimeoutMs: parseTimeoutEnv(env, "REVIEW_JUDGE_TIMEOUT_MS"),
        implReviewTimeoutMs: parseTimeoutEnv(env, "REVIEW_IMPL_REVIEW_TIMEOUT_MS"),
        verifierTimeoutMs: parseTimeoutEnv(env, "REVIEW_VERIFIER_TIMEOUT_MS"),
      },
      requireVerification: args.requireVerification,
      projectReviewContext: args.projectContextFile === undefined ? undefined : io.readFile(args.projectContextFile),
      // CI policy, not a library default: the pass costs ~9.47x the code review
      // it accompanies, and a red code review means the diff is about to change.
      implReviewGate: "code-review-passed",
      // In an ultimately-green run this stderr line is the only evidence that
      // a transient flake happened and the single retry recovered it.
      onRetry: (pass, error, delayMs) => {
        io.logError(`retrying ${pass} after ${errorLabel(error)} in ${String(Math.round(delayMs))}ms`);
      },
      // A repaired run is otherwise indistinguishable from a clean one; this
      // line is how persistent model drift stays visible in the Actions log.
      onOutputRepair: ({ reason }) => {
        io.logError(`finder format repair requested after strict-parse failure: ${reason}`);
      },
      // Silent on purpose: it only remembers the judge's upstream, so a judge
      // parse failure can name its endpoint in the rejected-output line.
      onJudgeStep: (info) => {
        lastObservedProvider = info.provider;
      },
      onJudgeOutputRepair: ({ reason }) => {
        io.logError(`judge output repaired after strict-parse failure: ${reason}`);
      },
      // Remembers the verifier's upstream for the rejected-output line, like the judge's.
      onVerifierStep: (info) => {
        lastObservedProvider = info.provider;
      },
      onVerifierOutputRepair: ({ reason }) => {
        io.logError(`verifier format repair requested after strict-parse failure: ${reason}`);
      },
    });

    const verificationLine = formatVerificationLine(result, args);
    if (verificationLine !== undefined) io.logError(verificationLine);

    const implReviewLine = formatImplReviewLine(result);
    if (implReviewLine !== undefined) io.logError(implReviewLine);
    const costLine = formatCostLine(result);
    if (costLine !== undefined) io.logError(costLine);

    io.mkdir(args.outDir);
    io.writeFile(join(args.outDir, "review.json"), `${JSON.stringify(result, null, 2)}\n`);
    io.writeFile(join(args.outDir, "comment.md"), renderStickyComment(result, { runUrl: resolveRunUrl(env) }));

    io.log(
      `verdict=${result.verdict} findings=${String(result.findings.length)} ` +
        `(finder=${result.models.finder}, judge=${result.models.judge}) → ${args.outDir}/`,
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.logError(message);
    // stderr only: the rejected text is untrusted, so it stays out of the
    // step summary below as well as out of comment.md.
    const rejected = formatRejectedOutputLine(error, lastObservedProvider);
    if (rejected !== undefined) io.logError(rejected);
    const summaryPath = env.GITHUB_STEP_SUMMARY;
    if (summaryPath) io.appendFile(summaryPath, `\n## AI review failed\n\n${message}\n`);
    return 1;
  }
}
