import { join } from "node:path";

import {
  aggregateWeek,
  isoWeekWindow,
  parseThresholds,
  previousCompleteWeek,
  type WeekWindow,
} from "./weekly-report.js";
import { collectWeek, publishWeek, ReportError, type GhRunner, type PublishResult } from "./weekly-report-github.js";
import { renderAlarmBody, renderWeeklyComment, type ReportLinks } from "./weekly-report-render.js";

// The weekly report CLI's whole contract, injectable so tests pin it (the
// same split as cli.ts / review-pr.ts): run-weekly-report.ts only binds real
// IO. Exit 0 = a report was produced, alarm or not; exit 1 = it could not
// list runs, could not publish, or was invoked wrongly. Every exit-1 message
// names the subject, the state and the way out.

export interface WeeklyReportIo {
  gh: GhRunner;
  now: () => Date;
  readFile: (path: string) => string;
  writeFile: (path: string, content: string) => void;
  /** Recursive mkdir. */
  mkdir: (path: string) => void;
  appendFile: (path: string, content: string) => void;
  /** A fresh, empty directory for artifact downloads. */
  makeTempDir: () => string;
  removeDir: (path: string) => void;
  log: (message: string) => void;
  logError: (message: string) => void;
}

export type WeeklyReportEnv = Record<string, string | undefined>;

export const DEFAULT_OUT_DIR = ".review-out/weekly-report";

const USAGE =
  "Usage: npm run weekly-report -- --repo <owner/name> --owner <login> [--week <YYYY-Www>] [--out-dir <dir>] [--dry-run]";

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/u;

interface WeeklyArgs {
  repo: string;
  owner: string;
  week?: string;
  outDir: string;
  dryRun: boolean;
}

/** Thrown for a wrong invocation: the message already says what to pass instead. */
class UsageError extends Error {}

export function parseWeeklyArgs(argv: readonly string[]): WeeklyArgs {
  let repo: string | undefined;
  let owner: string | undefined;
  let week: string | undefined;
  let outDir = DEFAULT_OUT_DIR;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv.at(i);
    const value = argv.at(i + 1);
    if (flag === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (value === undefined || !["--repo", "--owner", "--week", "--out-dir"].includes(flag ?? "")) {
      throw new UsageError(`weekly report: unknown or valueless argument ${JSON.stringify(flag ?? "")}. ${USAGE}`);
    }
    if (flag === "--repo") repo = value;
    else if (flag === "--owner") owner = value;
    else if (flag === "--week") week = value;
    else outDir = value;
    i += 1;
  }
  if (repo === undefined || !REPO_PATTERN.test(repo)) {
    throw new UsageError(`weekly report: --repo must be <owner>/<name>, got ${JSON.stringify(repo ?? "")}. ${USAGE}`);
  }
  if (owner === undefined || !LOGIN_PATTERN.test(owner)) {
    throw new UsageError(`weekly report: --owner must be a GitHub login, got ${JSON.stringify(owner ?? "")}. ${USAGE}`);
  }
  return { repo, owner, ...(week === undefined ? {} : { week }), outDir, dryRun };
}

const iso = (date: Date): string => date.toISOString().replace(/\.\d{3}Z$/u, "Z");

const resolveWindow = (week: string): WeekWindow => {
  try {
    return isoWeekWindow(week);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new UsageError(
      `weekly report: invalid --week ${JSON.stringify(week)}: ${message}. ` +
        "Pass an ISO week such as 2026-W43, or omit --week for the last complete week. Nothing was collected or posted.",
    );
  }
};

export async function runWeeklyReportCli(
  argv: readonly string[],
  env: WeeklyReportEnv,
  io: WeeklyReportIo,
): Promise<0 | 1> {
  let stage: "setup" | "collect" | "publish" = "setup";
  let weekLabel = "this week";
  let outDir = DEFAULT_OUT_DIR;
  try {
    const args = parseWeeklyArgs(argv);
    outDir = args.outDir;
    const observedAt = io.now();
    const week = args.week ?? previousCompleteWeek(observedAt);
    weekLabel = week;
    const window = resolveWindow(week);
    const thresholds = parseThresholds(env);
    for (const warning of thresholds.warnings) {
      io.logError(
        `warning: ${warning.variable} rejected value ${JSON.stringify(warning.rejected)}; using the default ${String(
          warning.fallback,
        )}.`,
      );
    }

    stage = "collect";
    const downloadDir = io.makeTempDir();
    let collected;
    try {
      collected = await collectWeek({ gh: io.gh, repo: args.repo, window, downloadDir, readFile: io.readFile });
    } finally {
      io.removeDir(downloadDir);
    }

    const report = aggregateWeek({
      week,
      observedAt,
      owner: args.owner,
      runs: collected.runs,
      prs: collected.prs,
      thresholds,
    });
    const links: ReportLinks = { repoUrl: `https://github.com/${args.repo}` };
    const comment = renderWeeklyComment(report, links);

    io.mkdir(args.outDir);
    io.writeFile(join(args.outDir, "report.md"), comment);
    const writeJson = (published?: PublishResult): void => {
      io.writeFile(join(args.outDir, "report.json"), `${JSON.stringify({ ...report, published }, null, 2)}\n`);
    };
    writeJson();
    if (env.GITHUB_STEP_SUMMARY) io.appendFile(env.GITHUB_STEP_SUMMARY, `\n${comment}`);
    // The report also goes to the log: a reader of the run should not need to download the artifact.
    io.log(comment);

    const summary =
      `week=${week} workflows=${String(report.counts.workflows)} known_spend=$${report.spend.known.toFixed(6)}` +
      `${report.spend.incomplete ? " (lower bound)" : ""} coverage_gaps=${String(report.coverageGapWorkflows)} ` +
      `alarm=${report.alarm.fired ? "fired" : "not fired"}`;

    if (args.dryRun) {
      if (report.alarm.fired) io.writeFile(join(args.outDir, "alarm.md"), renderAlarmBody(report, report.alarm, links));
      io.log(`${summary} → ${args.outDir}/ (dry run: nothing was posted)`);
      return 0;
    }

    stage = "publish";
    const renderBody = (reportCommentUrl: string): string => {
      const body = renderAlarmBody(report, report.alarm, { ...links, reportCommentUrl });
      return report.alarm.fired ? body : `${body}\nNo longer over threshold as of ${iso(observedAt)}.\n`;
    };
    const published = await publishWeek({
      gh: io.gh,
      repo: args.repo,
      week,
      commentBody: comment,
      alarm: { fired: report.alarm.fired, renderBody },
      log: io.logError,
    });
    if (report.alarm.fired) io.writeFile(join(args.outDir, "alarm.md"), renderBody(published.commentUrl));
    writeJson(published);
    io.log(
      `${summary} → ${published.commentUrl}${
        published.alarmIssueUrl === undefined ? "" : ` · alarm issue ${published.alarmIssueUrl}`
      }`,
    );
    return 0;
  } catch (error) {
    const message = describeFailure(error, stage, weekLabel, outDir);
    io.logError(message);
    if (env.GITHUB_STEP_SUMMARY)
      io.appendFile(env.GITHUB_STEP_SUMMARY, `\n## AI review weekly report failed\n\n${message}\n`);
    return 1;
  }
}

function describeFailure(error: unknown, stage: "setup" | "collect" | "publish", week: string, outDir: string): string {
  if (error instanceof UsageError) return error.message;
  const cause = error instanceof Error ? error.message : String(error);
  if (stage === "collect") {
    const what = error instanceof ReportError ? "could not list review.yml runs" : "failed while collecting";
    return (
      `weekly report ${week}: ${what} — ${cause}. Nothing was posted. ` +
      "Check that GH_TOKEN can read Actions and issues in this repository, then re-run for this week."
    );
  }
  if (stage === "publish") {
    return (
      `weekly report ${week}: could not publish — ${cause}. The rendered report is in ${outDir}/report.md. ` +
      `Check that GH_TOKEN has issues: write, then re-run for ${week}; the comment and alarm upserts are idempotent.`
    );
  }
  return `weekly report ${week}: failed before collecting — ${cause}. Nothing was posted.`;
}
