import { join } from "node:path";

import { z } from "zod";

import type {
  AssociationFailure,
  PrAssociation,
  PrFacts,
  RawArtifact,
  RawReaction,
  RawRun,
  SkipEvidence,
  WeekWindow,
} from "./weekly-report.js";
import { alarmMarker, weeklyMarker } from "./weekly-report-render.js";

// The only module of the weekly ai-review report that talks to GitHub
// (change ai-review-weekly-report, phase 2). It turns API responses into the
// pure core's raw facts and publishes with marker-based upserts. Every call
// goes through an injected `gh` runner, so tests script the API and the
// process shell binds the real binary.
//
// Writes, all in publishWeek: label creation, the tracking issue (create
// only), its week comment (create/PATCH) and the week's alarm issue
// (create/PATCH body — never its state). collectWeek only reads.

export interface GhResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs `gh <args>`; `input` is written to its stdin (used with `--input -`). */
export type GhRunner = (args: string[], input?: string) => Promise<GhResult>;

/** A GitHub call the report cannot do without: it names the endpoint, the exit code and gh's own message. */
export class ReportError extends Error {
  constructor(
    readonly endpoint: string,
    readonly code: number,
    readonly detail: string,
  ) {
    super(`${endpoint} failed (gh exit ${String(code)}): ${detail}`);
    this.name = "ReportError";
  }
}

export const BOT_LOGIN = "github-actions[bot]";
export const STICKY_MARKER = "<!-- ai-cr:sticky -->";
export const REPORT_LABEL = "ai-review-report";
export const ALARM_LABEL = "ai-review-alarm";
export const REPORT_ISSUE_TITLE = "AI review weekly report";
export const ARTIFACT_NAME = "ai-review-output";
/** review.yml's job and the two steps whose outcomes prove the docs-only skip. */
export const REVIEW_JOB_NAME = "ai-review";
export const DIFF_STEP_NAME = "Compute PR diff (three-dot vs merge-base)";
export const REVIEW_STEP_NAME = "AI review";
/** review.yml triggers on pull_request to master only. */
const BASE_REF = "master";

const MAX_DETAIL_CHARS = 300;

/**
 * gh's own message, never a stack tail: the first non-empty stderr line (gh
 * writes `gh: Not Found (HTTP 404)` there), control characters escaped and
 * length bounded, because a hostile response must not forge log lines.
 */
export function ghMessage(result: GhResult): string {
  const line = result.stderr
    .split("\n")
    .map((text) => text.trim())
    .find((text) => text !== "");
  const shown = (line ?? "no error output").replace(/\p{Cc}/gu, "?");
  return shown.length > MAX_DETAIL_CHARS ? `${shown.slice(0, MAX_DETAIL_CHARS)}…` : shown;
}

const isNotFound = (result: GhResult): boolean => result.stderr.includes("(HTTP 404)");

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

/** `gh api --paginate --slurp`: every page in one outer array, or the failed call (a non-JSON body counts as one). */
async function slurp(gh: GhRunner, endpoint: string): Promise<{ pages: unknown[] } | { error: GhResult }> {
  const result = await gh(["api", "--paginate", "--slurp", endpoint]);
  if (result.code !== 0) return { error: result };
  const value = parseJson(result.stdout);
  return Array.isArray(value)
    ? { pages: value }
    : { error: { ...result, code: 1, stderr: "response is not a JSON page array" } };
}

/** Pages of a list endpoint that returns a bare array, flattened; undefined when any page is not an array. */
const flattenArrayPages = (pages: unknown[]): unknown[] | undefined =>
  pages.every((page) => Array.isArray(page)) ? (pages as unknown[][]).flat() : undefined;

// --- API shapes (lenient: a malformed field degrades one fact, never the whole report) ---

const repoRef = z.object({
  id: z.number().optional().catch(undefined),
  full_name: z.string().optional().catch(undefined),
});

const prCandidate = z.object({
  number: z.unknown(),
  head: z.object({ ref: z.string().optional().catch(undefined), repo: repoRef.nullable().catch(null) }).catch({
    repo: null,
  }),
  base: z.object({ ref: z.string().optional().catch(undefined), repo: repoRef.nullable().catch(null) }).catch({
    repo: null,
  }),
});
type PrCandidate = z.infer<typeof prCandidate>;

const workflowRun = z.object({
  id: z.number().catch(Number.NaN),
  created_at: z.string().catch(""),
  run_attempt: z.number().nullable().catch(null),
  status: z.string().catch("unknown"),
  conclusion: z.string().nullable().catch(null),
  head_sha: z.string().nullable().catch(null),
  head_branch: z.string().nullable().catch(null),
  pull_requests: z.array(z.unknown()).catch([]),
  repository: repoRef.optional().catch(undefined),
});
type WorkflowRun = z.infer<typeof workflowRun>;

const runsPage = z.object({ workflow_runs: z.array(z.unknown()) });
const artifactsPage = z.object({
  artifacts: z.array(z.object({ name: z.string(), expired: z.boolean().catch(false) })),
});
const jobsPage = z.object({
  jobs: z.array(
    z.object({
      name: z.string(),
      run_attempt: z.number().optional(),
      status: z.string(),
      conclusion: z.string().nullable(),
      steps: z.array(z.object({ name: z.string(), conclusion: z.string().nullable() })).optional(),
    }),
  ),
});
const issueComment = z.object({
  id: z.number(),
  user: z.object({ login: z.string() }).nullable(),
  body: z.string().nullable().catch(null),
  updated_at: z.string(),
  html_url: z.string().optional(),
});
const reaction = z.object({
  user: z.object({ login: z.string() }).nullable().catch(null),
  content: z.string(),
  created_at: z.string(),
});
const label = z.object({ name: z.string() });
const issue = z.object({
  number: z.number(),
  body: z.string().nullable().catch(null),
  html_url: z.string().optional(),
  pull_request: z.unknown().optional(),
});

const parseItems = <T>(schema: z.ZodType<T>, items: unknown[]): T[] | undefined => {
  const parsed = z.array(schema).safeParse(items);
  return parsed.success ? parsed.data : undefined;
};

// --- Collection ---

const DAY_MS = 86_400_000;
const isoDate = (time: number): string => new Date(time).toISOString().slice(0, 10);

/**
 * The runs API's `created=` filter is date-granular and inclusive, so the
 * query is one day wider on each side and the exact window is applied here.
 */
export const runsEndpoint = (repo: string, window: WeekWindow): string =>
  `repos/${repo}/actions/workflows/review.yml/runs?created=${isoDate(window.start.getTime() - DAY_MS)}..${isoDate(
    window.end.getTime(),
  )}&per_page=100`;

async function listRuns(gh: GhRunner, repo: string, window: WeekWindow): Promise<WorkflowRun[]> {
  const endpoint = runsEndpoint(repo, window);
  const response = await slurp(gh, endpoint);
  if ("error" in response) throw new ReportError(endpoint, response.error.code, ghMessage(response.error));
  const runs: WorkflowRun[] = [];
  for (const page of response.pages) {
    const parsed = runsPage.safeParse(page);
    if (!parsed.success) throw new ReportError(endpoint, 1, "a page has no workflow_runs array");
    for (const item of parsed.data.workflow_runs) runs.push(workflowRun.parse(item));
  }
  return runs;
}

const positiveAttempt = (value: number | null): number | null =>
  value !== null && Number.isSafeInteger(value) && value >= 1 ? value : null;

/** The one unambiguous, unexpired ai-review-output artifact, downloaded; anything else never proves $0. */
async function collectArtifact(
  gh: GhRunner,
  repo: string,
  runId: number,
  downloadDir: string,
  readFile: (path: string) => string,
): Promise<RawArtifact> {
  const listing = await slurp(gh, `repos/${repo}/actions/runs/${String(runId)}/artifacts?per_page=100`);
  if ("error" in listing) return { kind: "unreadable" };
  const matching: { expired: boolean }[] = [];
  for (const page of listing.pages) {
    const parsed = artifactsPage.safeParse(page);
    if (!parsed.success) return { kind: "unreadable" };
    matching.push(...parsed.data.artifacts.filter((artifact) => artifact.name === ARTIFACT_NAME));
  }
  // An expired artifact is as absent as one the API no longer lists: neither says what the run spent.
  const live = matching.filter((artifact) => !artifact.expired);
  if (live.length === 0) return { kind: "absent" };
  // Several snapshots under one name: `gh run download -n` would pick one silently. Never guess or sum.
  if (live.length > 1) return { kind: "unreadable" };
  const dir = join(downloadDir, String(runId));
  const download = await gh(["run", "download", String(runId), "-R", repo, "-n", ARTIFACT_NAME, "-D", dir]);
  if (download.code !== 0) return { kind: "unreadable" };
  try {
    return { kind: "downloaded", text: readFile(join(dir, "review.json")) };
  } catch {
    return { kind: "unreadable" };
  }
}

/**
 * The docs-only skip, proven from the SAME attempt's job steps: exactly one
 * successful ai-review job of that attempt, whose diff step succeeded and
 * whose AI review step was skipped. Unreadable or uninterpretable steps are
 * `unavailable`; readable steps without the predicate are `not-skipped`.
 */
export async function collectSkipEvidence(
  gh: GhRunner,
  repo: string,
  runId: number,
  runAttempt: number | null,
): Promise<SkipEvidence> {
  if (runAttempt === null) return "unavailable";
  const response = await slurp(
    gh,
    `repos/${repo}/actions/runs/${String(runId)}/attempts/${String(runAttempt)}/jobs?per_page=100`,
  );
  if ("error" in response) return "unavailable";
  const jobs: z.infer<typeof jobsPage>["jobs"] = [];
  for (const page of response.pages) {
    const parsed = jobsPage.safeParse(page);
    if (!parsed.success) return "unavailable";
    jobs.push(...parsed.data.jobs);
  }
  const reviewJobs = jobs.filter((job) => job.name === REVIEW_JOB_NAME);
  const job = reviewJobs.at(0);
  if (reviewJobs.length !== 1 || job === undefined) return "unavailable";
  if (job.run_attempt !== runAttempt || job.steps === undefined) return "unavailable";
  const stepNamed = (name: string) => {
    const steps = job.steps?.filter((step) => step.name === name) ?? [];
    return steps.length === 1 ? steps[0] : undefined;
  };
  const diffStep = stepNamed(DIFF_STEP_NAME);
  const reviewStep = stepNamed(REVIEW_STEP_NAME);
  // A renamed or duplicated step cannot be interpreted — that is "could not see", not "did not skip".
  if (diffStep === undefined || reviewStep === undefined) return "unavailable";
  return job.status === "completed" &&
    job.conclusion === "success" &&
    diffStep.conclusion === "success" &&
    reviewStep.conclusion === "skipped"
    ? "confirmed"
    : "not-skipped";
}

// --- PR association ---

interface RepoIdentity {
  fullName: string;
  /** Learned from a run's own `repository` object; compared when both sides carry one. */
  id?: number;
}

const sameRepo = (candidate: z.infer<typeof repoRef> | null, repo: RepoIdentity): boolean => {
  if (candidate === null) return false;
  if (candidate.id !== undefined && repo.id !== undefined) return candidate.id === repo.id;
  return candidate.full_name?.toLowerCase() === repo.fullName.toLowerCase();
};

const prNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;

/** Distinct PR numbers whose head is this repo + the run's branch and whose base is this repo's master. */
const matchingPrs = (candidates: readonly PrCandidate[], repo: RepoIdentity, headBranch: string): Set<number> => {
  const numbers = new Set<number>();
  for (const candidate of candidates) {
    const number = prNumber(candidate.number);
    if (
      number !== undefined &&
      candidate.head.ref === headBranch &&
      sameRepo(candidate.head.repo, repo) &&
      candidate.base.ref === BASE_REF &&
      sameRepo(candidate.base.repo, repo)
    ) {
      numbers.add(number);
    }
  }
  return numbers;
};

const fromMatches = (numbers: Set<number>, none: AssociationFailure): PrAssociation => {
  const only = [...numbers].at(0);
  if (numbers.size === 1 && only !== undefined) return { kind: "mapped", pr: only };
  return { kind: "unavailable", reason: numbers.size === 0 ? none : "ambiguous" };
};

/**
 * One PR per run, or an explicit unavailable reason. The run's embedded
 * association is used when it yields a usable match; otherwise the
 * commit-associated PRs (open and closed). A candidate's current head SHA is
 * never compared with the run's: a PR moves on after the run it reviewed.
 */
async function resolveAssociation(
  gh: GhRunner,
  repo: RepoIdentity,
  run: WorkflowRun,
  commitPulls: Map<string, Promise<PrCandidate[] | undefined>>,
): Promise<PrAssociation> {
  const headBranch = run.head_branch ?? "";
  if (headBranch !== "") {
    const embedded = run.pull_requests.flatMap((item) => {
      const parsed = prCandidate.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
    const matches = matchingPrs(embedded, repo, headBranch);
    if (matches.size > 0) return fromMatches(matches, "missing");
  }
  const sha = run.head_sha ?? "";
  if (sha === "" || headBranch === "") return { kind: "unavailable", reason: "lookup failed" };
  let lookup = commitPulls.get(sha);
  if (lookup === undefined) {
    lookup = (async () => {
      const response = await slurp(gh, `repos/${repo.fullName}/commits/${sha}/pulls?per_page=100`);
      if ("error" in response) return undefined;
      const items = flattenArrayPages(response.pages);
      return items === undefined ? undefined : parseItems(prCandidate, items);
    })();
    commitPulls.set(sha, lookup);
  }
  const candidates = await lookup;
  if (candidates === undefined) return { kind: "unavailable", reason: "lookup failed" };
  return fromMatches(matchingPrs(candidates, repo, headBranch), "missing");
}

// --- Per-PR facts ---

const isSticky = (comment: z.infer<typeof issueComment>): boolean =>
  comment.user?.login === BOT_LOGIN && comment.body?.includes(STICKY_MARKER) === true;

async function collectPrFacts(gh: GhRunner, repo: string, pr: number): Promise<PrFacts> {
  const labelsResponse = await slurp(gh, `repos/${repo}/issues/${String(pr)}/labels?per_page=100`);
  const labelItems = "error" in labelsResponse ? undefined : flattenArrayPages(labelsResponse.pages);
  const labels = labelItems === undefined ? undefined : parseItems(label, labelItems);

  const sticky = await (async (): Promise<PrFacts["sticky"]> => {
    const commentsResponse = await slurp(gh, `repos/${repo}/issues/${String(pr)}/comments?per_page=100`);
    if ("error" in commentsResponse) return { kind: "unavailable" };
    const items = flattenArrayPages(commentsResponse.pages);
    const comments = items === undefined ? undefined : parseItems(issueComment, items);
    if (comments === undefined) return { kind: "unavailable" };
    // The action PATCHes the first matching comment; the lowest ID is that one.
    const comment = comments
      .filter(isSticky)
      .sort((a, b) => a.id - b.id)
      .at(0);
    if (comment === undefined) return { kind: "none" };
    const reactionsResponse = await slurp(
      gh,
      `repos/${repo}/issues/comments/${String(comment.id)}/reactions?per_page=100`,
    );
    if ("error" in reactionsResponse) return { kind: "unavailable" };
    const reactionItems = flattenArrayPages(reactionsResponse.pages);
    const reactions = reactionItems === undefined ? undefined : parseItems(reaction, reactionItems);
    if (reactions === undefined) return { kind: "unavailable" };
    return {
      kind: "found",
      updatedAt: comment.updated_at,
      reactions: reactions.map((item): RawReaction => ({
        user: item.user?.login ?? null,
        content: item.content,
        createdAt: item.created_at,
      })),
    };
  })();

  return { number: pr, labels: labels === undefined ? null : labels.map((item) => item.name), sticky };
}

export interface CollectDeps {
  gh: GhRunner;
  /** `owner/name`. */
  repo: string;
  window: WeekWindow;
  /** Fresh directory for artifact downloads — outside any uploaded output, so PR-derived files are not re-published. */
  downloadDir: string;
  readFile: (path: string) => string;
}

export interface CollectedWeek {
  runs: RawRun[];
  prs: PrFacts[];
}

/**
 * Reads everything one week's report needs. A failure to list runs throws a
 * ReportError naming the endpoint; every per-run or per-PR failure becomes an
 * explicit fact (an unreported reason, an unavailable association, a failed
 * label or comment lookup) and the report still gets produced.
 */
export async function collectWeek({ gh, repo, window, downloadDir, readFile }: CollectDeps): Promise<CollectedWeek> {
  const listed = await listRuns(gh, repo, window);
  const seen = new Set<number>();
  const runs = listed.filter((run) => {
    if (seen.has(run.id)) return false;
    seen.add(run.id);
    const created = Date.parse(run.created_at);
    // An unreadable created_at reaches the core, which names it in the report's warnings.
    return Number.isNaN(created) || (created >= window.start.getTime() && created < window.end.getTime());
  });

  const repoId = runs.find((run) => run.repository?.full_name?.toLowerCase() === repo.toLowerCase())?.repository?.id;
  const identity: RepoIdentity = { fullName: repo, ...(repoId === undefined ? {} : { id: repoId }) };
  const commitPulls = new Map<string, Promise<PrCandidate[] | undefined>>();

  const raw: RawRun[] = [];
  for (const run of runs) {
    const runAttempt = positiveAttempt(run.run_attempt);
    const base = {
      id: run.id,
      createdAt: run.created_at,
      runAttempt,
      status: run.status,
      conclusion: run.conclusion,
    };
    if (Number.isNaN(Date.parse(run.created_at)) || !Number.isSafeInteger(run.id) || run.id <= 0) {
      raw.push({
        ...base,
        artifact: { kind: "absent" },
        prAssociation: { kind: "unavailable", reason: "lookup failed" },
      });
      continue;
    }
    const notRun = run.status === "completed" && run.conclusion === "skipped";
    const artifact: RawArtifact = notRun
      ? { kind: "absent" }
      : await collectArtifact(gh, repo, run.id, downloadDir, readFile);
    const needsSkipEvidence = run.status === "completed" && run.conclusion === "success" && artifact.kind === "absent";
    const skipEvidence = needsSkipEvidence ? await collectSkipEvidence(gh, repo, run.id, runAttempt) : undefined;
    const prAssociation = await resolveAssociation(gh, identity, run, commitPulls);
    raw.push({ ...base, artifact, ...(skipEvidence === undefined ? {} : { skipEvidence }), prAssociation });
  }

  // Per-PR lookups only for PRs that get a row: mapped, with at least one run beyond a label-event skip.
  const eligiblePrs = new Set<number>();
  for (const run of raw) {
    const notRun = run.status === "completed" && run.conclusion === "skipped";
    if (!notRun && run.prAssociation.kind === "mapped") eligiblePrs.add(run.prAssociation.pr);
  }
  const prs: PrFacts[] = [];
  for (const pr of [...eligiblePrs].sort((a, b) => a - b)) prs.push(await collectPrFacts(gh, repo, pr));

  return { runs: raw, prs };
}

// --- Publishing ---

const LABELS: readonly { name: string; color: string; description: string }[] = [
  { name: REPORT_LABEL, color: "0e8a16", description: "Tracking issue for the weekly advisory AI review report" },
  {
    name: ALARM_LABEL,
    color: "d93f0b",
    description: "A week's advisory AI review spend or coverage crossed its threshold",
  },
];

async function write(gh: GhRunner, method: "POST" | "PATCH", endpoint: string, body: object): Promise<unknown> {
  const result = await gh(["api", "-X", method, endpoint, "--input", "-"], JSON.stringify(body));
  if (result.code !== 0) throw new ReportError(`${method} ${endpoint}`, result.code, ghMessage(result));
  return parseJson(result.stdout);
}

async function readList<T>(gh: GhRunner, endpoint: string, schema: z.ZodType<T>): Promise<T[]> {
  const response = await slurp(gh, endpoint);
  if ("error" in response) throw new ReportError(endpoint, response.error.code, ghMessage(response.error));
  const items = flattenArrayPages(response.pages);
  const parsed = items === undefined ? undefined : parseItems(schema, items);
  if (parsed === undefined) throw new ReportError(endpoint, 1, "the response is not the expected list");
  return parsed;
}

/** Absence is claimed only on an explicit 404; any other failure is "could not see" and stops the publish. */
async function ensureLabel(gh: GhRunner, repo: string, spec: (typeof LABELS)[number]): Promise<void> {
  const endpoint = `repos/${repo}/labels/${encodeURIComponent(spec.name)}`;
  const result = await gh(["api", endpoint]);
  if (result.code === 0) return;
  if (!isNotFound(result)) throw new ReportError(endpoint, result.code, ghMessage(result));
  await write(gh, "POST", `repos/${repo}/labels`, spec);
}

const htmlUrl = (value: unknown, endpoint: string): string => {
  const parsed = z.object({ html_url: z.string() }).safeParse(value);
  if (!parsed.success) throw new ReportError(endpoint, 1, "the response carries no html_url");
  return parsed.data.html_url;
};

export interface PublishDeps {
  gh: GhRunner;
  repo: string;
  week: string;
  commentBody: string;
  alarm: {
    fired: boolean;
    /** The alarm issue body; it links the week comment, so it is rendered once that comment's URL is known. */
    renderBody: (reportCommentUrl: string) => string;
  };
  /** Non-fatal notes, such as several open tracking issues. */
  log: (message: string) => void;
}

export interface PublishResult {
  trackingIssue: number;
  commentUrl: string;
  alarmIssueUrl?: string;
}

/**
 * Idempotent per week: the comment is found by its marker on a
 * github-actions[bot] comment and PATCHed; the alarm issue is found by its
 * body marker on an ai-review-alarm issue in any state and only its body is
 * PATCHed, so an issue the owner closed stays closed.
 */
export async function publishWeek({ gh, repo, week, commentBody, alarm, log }: PublishDeps): Promise<PublishResult> {
  for (const spec of LABELS) await ensureLabel(gh, repo, spec);

  const openEndpoint = `repos/${repo}/issues?labels=${REPORT_LABEL}&state=open&per_page=100`;
  const open = (await readList(gh, openEndpoint, issue))
    .filter((item) => item.pull_request === undefined)
    .sort((a, b) => a.number - b.number);
  let trackingIssue: number;
  const first = open.at(0);
  if (first === undefined) {
    const created = await write(gh, "POST", `repos/${repo}/issues`, {
      title: REPORT_ISSUE_TITLE,
      labels: [REPORT_LABEL],
      body:
        "One comment per ISO week from `.github/workflows/ai-review-weekly-report.yml`: observed provider-reported " +
        "cost, verdict and label mixes, finding counts and the owner's 👍/👎 on the AI review comments. Advisory only.",
    });
    const parsed = z.object({ number: z.number() }).safeParse(created);
    if (!parsed.success) throw new ReportError(`POST repos/${repo}/issues`, 1, "the response carries no issue number");
    trackingIssue = parsed.data.number;
  } else {
    trackingIssue = first.number;
    if (open.length > 1) {
      log(
        `note: ${String(open.length)} open ${REPORT_LABEL} issues (${open
          .map((item) => `#${String(item.number)}`)
          .join(", ")}); posting on the lowest, #${String(trackingIssue)}.`,
      );
    }
  }

  const marker = weeklyMarker(week);
  const comments = await readList(
    gh,
    `repos/${repo}/issues/${String(trackingIssue)}/comments?per_page=100`,
    issueComment,
  );
  const existing = comments
    .filter((comment) => comment.user?.login === BOT_LOGIN && comment.body?.includes(marker) === true)
    .sort((a, b) => a.id - b.id)
    .at(0);
  const commentEndpoint =
    existing === undefined
      ? `repos/${repo}/issues/${String(trackingIssue)}/comments`
      : `repos/${repo}/issues/comments/${String(existing.id)}`;
  const commentUrl = htmlUrl(
    await write(gh, existing === undefined ? "POST" : "PATCH", commentEndpoint, { body: commentBody }),
    commentEndpoint,
  );

  const alarmEndpoint = `repos/${repo}/issues?labels=${ALARM_LABEL}&state=all&per_page=100`;
  const weekAlarm = (await readList(gh, alarmEndpoint, issue))
    .filter((item) => item.pull_request === undefined && item.body?.includes(alarmMarker(week)) === true)
    .sort((a, b) => a.number - b.number)
    .at(0);

  if (weekAlarm !== undefined) {
    // Body only — never `state`: re-running the report must not reopen what the owner closed.
    const endpoint = `repos/${repo}/issues/${String(weekAlarm.number)}`;
    const url = htmlUrl(await write(gh, "PATCH", endpoint, { body: alarm.renderBody(commentUrl) }), endpoint);
    return { trackingIssue, commentUrl, alarmIssueUrl: url };
  }
  if (!alarm.fired) return { trackingIssue, commentUrl };
  const endpoint = `repos/${repo}/issues`;
  const url = htmlUrl(
    await write(gh, "POST", endpoint, {
      title: `AI review alarm — ${week}`,
      labels: [ALARM_LABEL],
      body: alarm.renderBody(commentUrl),
    }),
    endpoint,
  );
  return { trackingIssue, commentUrl, alarmIssueUrl: url };
}
