import {
  ALARM_UNREPORTED_VARIABLE,
  ALARM_USD_VARIABLE,
  type AlarmDecision,
  type AlarmTrigger,
  type FindingTotals,
  type ImplOutcome,
  type LabelState,
  type PassTotal,
  type PrRow,
  type ReactionCell,
  type ReportRun,
  roundUsd,
  type SpendSummary,
  type WeeklyReport,
} from "./weekly-report.js";

// Markdown for the weekly ai-review report comment and its alarm issue body.
// review.json is derived from PR-controlled content, so nothing here renders
// free text from it: only numbers, enums, run/PR links built from numeric IDs,
// and model ids that pass MODEL_ID_PATTERN. GitHub-supplied enums (status,
// conclusion) go through the same allowlist treatment.

import { MAX_COMMENT_CHARS } from "./render.js";

export interface ReportLinks {
  /** `https://github.com/<owner>/<repo>`, built by the CLI from a validated slug. */
  repoUrl: string;
  /** The week's report comment, once published — the alarm issue links back to it. */
  reportCommentUrl?: string;
}

const REPO_URL_PATTERN = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/u;
const COMMENT_PATH_PATTERN = /^\/issues\/\d+#issuecomment-\d+$/u;

/** A malformed repo URL is a caller bug that would corrupt every link, so it stops rendering outright. */
const assertRepoUrl = (links: ReportLinks): void => {
  if (!REPO_URL_PATTERN.test(links.repoUrl)) {
    throw new Error("weekly report: repoUrl is not an https://github.com/<owner>/<repo> URL; no report rendered.");
  }
};

/** The report comment link, only when it is a comment URL inside this repo; otherwise the alarm links nothing. */
const safeReportCommentUrl = (links: ReportLinks): string | undefined => {
  const url = links.reportCommentUrl;
  return url?.startsWith(links.repoUrl) === true && COMMENT_PATH_PATTERN.test(url.slice(links.repoUrl.length))
    ? url
    : undefined;
};

export const weeklyMarker = (week: string): string => `<!-- ai-review-weekly:${week} -->`;
export const alarmMarker = (week: string): string => `<!-- ai-review-alarm:${week} -->`;

/** Fixed in every comment and alarm body: what "reported" can and cannot mean. */
export const COST_CAVEAT =
  "All amounts are observed provider-reported cost read from each run's `review.json`. A pass total sums the " +
  "requests whose cost the provider reported and can omit individual request costs, so an amount without `≥` " +
  "means no gap was detected, not that the bill is complete.";

const MODEL_ID_PATTERN = /^[A-Za-z0-9._/:-]+$/u;
const MAX_MODEL_ID_CHARS = 200;

export const TRUNCATION_NOTICE =
  "\n\n⚠️ comment truncated — the full report is `report.md` in the report workflow run's `ai-review-weekly-report` artifact.\n";
const ENUM_PATTERN = /^[a-z_]{1,40}$/u;

export const safeModelId = (id: string): string =>
  id.length <= MAX_MODEL_ID_CHARS && MODEL_ID_PATTERN.test(id) ? `\`${id}\`` : "(unrecognised model id)";

/** Distinct after mapping, so many hostile ids collapse into one "(unrecognised model id)". */
const safeModelList = (ids: readonly string[]): string => [...new Set(ids.map(safeModelId))].join(", ");

const safeEnum = (value: string | null): string =>
  value === null ? "none" : ENUM_PATTERN.test(value) ? value : "(unrecognised)";

/** Every amount goes through the alarm's own rounding, so two lines never disagree on the same figure. */
const usd = (value: number): string => `$${roundUsd(value).toFixed(6)}`;

/** `$X reported` with no detected gap, `≥ $X` with one, `unknown` when nothing was observed at all. */
export function formatSpend(spend: SpendSummary): string {
  if (!spend.incomplete) return `${usd(spend.known)} reported`;
  return spend.hasKnown ? `≥ ${usd(spend.known)}` : "unknown";
}

const plural = (count: number, one: string, many = `${one}s`): string => `${String(count)} ${count === 1 ? one : many}`;

const iso = (date: Date): string => date.toISOString().replace(/\.\d{3}Z$/u, "Z");

const runLink = (links: ReportLinks, id: number): string =>
  `[run ${String(id)}](${links.repoUrl}/actions/runs/${String(id)})`;
const prLink = (links: ReportLinks, pr: number): string => `[#${String(pr)}](${links.repoUrl}/pull/${String(pr)})`;

const LABEL_TEXT: Record<LabelState, string> = {
  passed: "`ai-cr:passed`",
  failed: "`ai-cr:failed`",
  none: "none",
  both: "both (conflicting)",
  unavailable: "lookup failed",
};

const IMPL_TEXT: Record<ImplOutcome, string> = {
  APPROVED: "APPROVED",
  NEEDS_ATTENTION: "NEEDS ATTENTION",
  REJECTED: "REJECTED",
  failed: "failed",
  skipped: "skipped",
  "no plan": "no plan",
};

const reactionText = (cell: ReactionCell | undefined): string => {
  if (cell === undefined) return "—";
  if (cell.kind !== "rated") return cell.kind;
  const glyph = { up: "👍", down: "👎", mixed: "👍👎 mixed", unrated: "unrated" }[cell.state];
  return cell.stale ? `${glyph} (stale)` : glyph;
};

const findingsText = (totals: FindingTotals): string =>
  `${String(totals.critical)}/${String(totals.major)}/${String(totals.minor)}/${String(totals.nit)} · ${String(
    totals.preDedup,
  )} · ${String(totals.impl)}`;

/**
 * A pass nobody reported a cost for is `unknown` or `not run`, never a $0 that reads as free. A cohort gap
 * (an unreported run or an unobserved attempt) may hide spend on any pass, so it bounds every pass amount.
 */
const passCost = (total: PassTotal, cohortGap: boolean): string => {
  if (total.reported > 0) return total.unknown > 0 || cohortGap ? `≥ ${usd(total.known)}` : usd(total.known);
  if (total.unknown > 0) return "unknown";
  return total.notRun > 0 ? "not run" : "—";
};

const passRow = (name: string, total: PassTotal, cohortGap: boolean): string =>
  `| ${name} | ${passCost(total, cohortGap)} | ${String(total.reported)} | ${String(total.unknown)} | ${String(
    total.notRun,
  )} |`;

const prRow = (links: ReportLinks, row: PrRow): string => {
  const latest = row.latest;
  const verdict = latest === undefined ? "—" : `${latest.verdict === "passed" ? "✅" : "❌"} ${latest.verdict}`;
  const impl = latest === undefined ? "—" : IMPL_TEXT[latest.impl];
  const findings = latest === undefined ? "—" : findingsText(latest.findings);
  return `| ${prLink(links, row.pr)} | ${String(row.runs)} | ${formatSpend(row.spend)} | ${verdict} | ${impl} | ${
    LABEL_TEXT[row.label]
  } | ${findings} | ${reactionText(row.reaction)} |`;
};

const describeTrigger = (trigger: AlarmTrigger): string =>
  trigger.kind === "spend"
    ? `known observed provider-reported spend ${usd(trigger.knownSpend)} exceeds ${usd(trigger.threshold)} (\`${ALARM_USD_VARIABLE}\`)`
    : `${plural(trigger.coverageGapWorkflows, "workflow")} with unreadable review output or incomplete attempt coverage ` +
      `reach the threshold of ${String(trigger.threshold)} (\`${ALARM_UNREPORTED_VARIABLE}\`); ` +
      `${String(trigger.unreportedWorkflows)} of the cohort are class-unreported`;

const alarmLine = (report: WeeklyReport): string => {
  if (report.alarm.fired) {
    return `**Alarm:** 🚨 fired — ${report.alarm.triggers.map(describeTrigger).join("; ")}. See the week's alarm issue.`;
  }
  return (
    `**Alarm:** not fired — known observed provider-reported spend ${usd(report.spend.known)} ≤ ${usd(report.thresholds.usd)}, ` +
    `${plural(report.coverageGapWorkflows, "coverage-gap workflow")} < ${String(report.thresholds.unreported)}.`
  );
};

const gapNotes = (report: WeeklyReport): string => {
  const notes = [
    report.counts.unreported > 0 ? `${String(report.counts.unreported)} unreported` : undefined,
    report.counts.partial > 0 ? `${String(report.counts.partial)} partial` : undefined,
    report.attemptGapRuns.length > 0
      ? `${String(report.attemptGapRuns.length)} with incomplete attempt coverage`
      : undefined,
  ].filter((note) => note !== undefined);
  return notes.length === 0 ? "" : ` (gaps: ${notes.join(", ")})`;
};

const classBreakdown = (report: WeeklyReport): string => {
  const { workflows, reviewed, noReview, unreported, notRun } = report.counts;
  if (workflows === 0) return "**Runs:** 0 runs in this cohort.";
  return (
    `**Runs:** ${plural(workflows, "run")} (distinct workflow IDs) — ${String(reviewed)} reviewed · ` +
    `${String(noReview)} no-review · ${String(unreported)} unreported · ${String(notRun)} not-run`
  );
};

const unreportedLine = (links: ReportLinks, run: ReportRun): string =>
  `- ${runLink(links, run.id)} — conclusion ${safeEnum(run.conclusion)} — ${
    run.runClass.kind === "unreported" ? run.runClass.reason : run.runClass.kind
  }`;

const attemptLine = (links: ReportLinks, run: ReportRun): string =>
  run.attempts.kind === "gap"
    ? `- ${runLink(links, run.id)} — run_attempt ${String(run.attempts.runAttempt)}, ${plural(
        run.attempts.unobserved,
        "earlier attempt",
      )} unobserved`
    : `- ${runLink(links, run.id)} — run_attempt unknown (missing or invalid metadata)`;

const associationLine = (links: ReportLinks, run: ReportRun): string =>
  `- ${runLink(links, run.id)} — ${run.association.kind === "unavailable" ? run.association.reason : "mapped"} (${
    run.runClass.kind
  })`;

const thresholdWarning = (warning: WeeklyReport["thresholds"]["warnings"][number]): string => {
  // A repo variable is owner-controlled, but it still lands in Markdown: keep
  // only characters that cannot open structure, and bound the length.
  const shown = warning.rejected.slice(0, 40).replace(/[^A-Za-z0-9 ._+-]/gu, "?");
  return `- \`${warning.variable}\`: rejected value \`${shown}\`; using the default ${String(warning.fallback)}.`;
};

export function renderWeeklyComment(report: WeeklyReport, links: ReportLinks): string {
  assertRepoUrl(links);
  const cohortGap = report.unreportedRuns.length > 0 || report.attemptGapRuns.length > 0;
  const lines: string[] = [
    weeklyMarker(report.week),
    `### AI review — ${report.week}`,
    "",
    `Cohort: \`review.yml\` workflow runs created ${iso(report.window.start)} – ${iso(report.window.end)} ` +
      `(by original \`created_at\`; later attempts stay with their workflow) · observed as of ${iso(report.observedAt)}`,
  ];
  if (report.partialWeek) {
    lines.push(
      "",
      `⏳ Partial week: cut off at ${iso(report.observedAt)}, before the week ended. Figures will change.`,
    );
  }
  lines.push(
    "",
    `**Spend:** ${formatSpend(report.spend)} observed provider-reported cost${gapNotes(report)}`,
    "",
    classBreakdown(report),
    "",
    `**Coverage:** ${plural(report.counts.unreported, "class-unreported run")} · ${plural(
      report.coverageGapWorkflows,
      "coverage-gap workflow",
    )} (unreported ∪ incomplete attempt coverage, counted once each; the alarm's count)`,
    "",
    alarmLine(report),
    "",
    `> ${COST_CAVEAT}`,
    "",
    "#### Spend by pass",
    "",
    "| Pass | Observed provider-reported cost | Runs reported | Runs unknown | Runs not run |",
    "| --- | --- | --- | --- | --- |",
    passRow("finder", report.byPass.finder, cohortGap),
    passRow("judge", report.byPass.judge, cohortGap),
    passRow("impl", report.byPass.impl, cohortGap),
  );

  lines.push("", "#### Per PR", "");
  if (report.prs.length === 0) {
    lines.push("No PR in this cohort had a run beyond label-event skips.");
  } else {
    lines.push(
      "Latest = the reviewed run with the greatest original `created_at` (ties: greatest run ID). " +
        "Findings: critical/major/minor/nit · pre-dedup · impl. Label and reaction as they stand now.",
      "",
      "| PR | Runs | Observed spend | Latest verdict | Impl | Label | Findings | Owner reaction |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      ...report.prs.map((row) => prRow(links, row)),
    );
  }

  const mix = <K extends string>(record: Record<K, number>, label: (key: K) => string): string =>
    (Object.entries(record) as [K, number][]).map(([key, count]) => `${label(key)} ${String(count)}`).join(" · ");
  lines.push(
    "",
    "#### Mixes",
    "",
    `- Verdict (per reviewed run): ${mix(report.verdictMix, (key) => key)}`,
    `- Impl verdict (per reviewed run): ${mix(report.implMix, (key) => IMPL_TEXT[key])}`,
    `- Label (per PR): ${mix(report.labelMix, (key) => LABEL_TEXT[key])}`,
    `- Findings (cohort, once per workflow): ${findingsText(report.findings)}`,
  );

  lines.push("", "#### Unreported runs", "");
  lines.push(
    ...(report.unreportedRuns.length === 0
      ? ["None."]
      : report.unreportedRuns.map((run) => unreportedLine(links, run))),
  );

  lines.push("", "#### Attempt coverage", "");
  if (report.attemptGapRuns.length === 0) {
    lines.push("Every workflow was observed on its only attempt.");
  } else {
    lines.push(
      `${plural(report.attemptGapRuns.length, "workflow")} with earlier attempts this report cannot observe ` +
        `(${plural(report.unobservedAttempts, "unobserved attempt")}); their totals are lower bounds.`,
      "",
      ...report.attemptGapRuns.map((run) => attemptLine(links, run)),
    );
  }
  lines.push(
    "",
    `Coverage-gap workflows (unreported ∪ incomplete attempt coverage): ${String(report.coverageGapWorkflows)}.`,
  );

  lines.push("", "#### PR association coverage", "");
  if (report.unmappedRuns.length === 0) {
    lines.push("Every run mapped to exactly one PR.");
  } else {
    lines.push(
      report.prCoverageIncomplete
        ? "⚠️ Label and reaction coverage is incomplete: these runs could not be mapped to one PR. Their spend, verdicts and findings still count above."
        : "These runs could not be mapped to one PR; none of them is eligible for labels or reactions.",
      "",
      ...report.unmappedRuns.map((run) => associationLine(links, run)),
    );
  }

  if (report.models.finder.length > 0 || report.models.judge.length > 0) {
    lines.push(
      "",
      `<sub>finder: ${safeModelList(report.models.finder) || "—"} · judge: ${
        safeModelList(report.models.judge) || "—"
      }</sub>`,
    );
  }

  const warnings = [
    ...report.thresholds.warnings.map(thresholdWarning),
    ...(report.invalidCreatedAt.length > 0
      ? [
          `- ${plural(report.invalidCreatedAt.length, "run")} had an unreadable \`created_at\` and belong to no week: ${report.invalidCreatedAt
            .map((id) => runLink(links, id))
            .join(", ")}.`,
        ]
      : []),
    ...(report.invalidRunIds > 0
      ? [
          `- ${plural(report.invalidRunIds, "row")} had a run ID that is not a positive integer and could not be counted or linked.`,
        ]
      : []),
  ];
  if (warnings.length > 0) lines.push("", "#### Warnings", "", ...warnings);

  // Whole-comment ceiling, as in render.ts: GitHub rejects a comment over 65,536 characters, which would
  // fail the publish instead of posting. The week marker leads the comment, so the upsert anchor survives.
  const comment = `${lines.join("\n")}\n`;
  if (comment.length <= MAX_COMMENT_CHARS) return comment;
  return comment.slice(0, MAX_COMMENT_CHARS - TRUNCATION_NOTICE.length) + TRUNCATION_NOTICE;
}

export function renderAlarmBody(report: WeeklyReport, alarm: AlarmDecision, links: ReportLinks): string {
  assertRepoUrl(links);
  const reportCommentUrl = safeReportCommentUrl(links);
  const lines = [
    alarmMarker(report.week),
    `### AI review alarm — ${report.week}`,
    "",
    `Cohort: \`review.yml\` workflow runs created ${iso(report.window.start)} – ${iso(report.window.end)}.`,
    "",
    alarm.fired ? "Triggered by:" : "No trigger is currently over threshold.",
    "",
    ...alarm.triggers.map((trigger) => `- ${describeTrigger(trigger)}`),
    "",
    `Known spend: ${formatSpend(report.spend)} observed provider-reported cost · ${plural(
      report.counts.unreported,
      "class-unreported run",
    )} · ${plural(report.coverageGapWorkflows, "coverage-gap workflow")} · observed as of ${iso(report.observedAt)}.`,
    "",
    reportCommentUrl === undefined
      ? "Details: the week's comment on the AI review weekly report issue."
      : `Details: [the ${report.week} report](${reportCommentUrl}).`,
    "",
    `> ${COST_CAVEAT}`,
    "",
    "Advisory only: this alarm blocks nothing.",
  ];
  return `${lines.join("\n")}\n`;
}
