import type { GhResult, GhRunner } from "./weekly-report-github.js";

// A scripted, in-memory GitHub for the weekly report's collector, publisher
// and CLI tests. It answers the exact `gh` invocations weekly-report-github.ts
// makes, keeps issue/comment/label state so upserts can be observed across
// runs, and records every call. Test-only: nothing in the package imports it.

export const REPO = "Piotr-Miller/lumina-clean-ai";
export const REPO_ID = 1248550443;
export const OTHER_REPO = { id: 999, full_name: "someone/fork" };
export const THIS_REPO = { id: REPO_ID, full_name: REPO };

export interface FakeIssue {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  labels: string[];
  pull_request?: object;
}

export interface FakeComment {
  id: number;
  user: { login: string } | null;
  body: string;
  updated_at: string;
}

export interface FakeReaction {
  user: { login: string } | null;
  content: string;
  created_at: string;
}

export interface FakeJob {
  name: string;
  run_attempt?: number;
  status: string;
  conclusion: string | null;
  steps?: { name: string; status?: string; conclusion: string | null }[];
}

const ok = (value: unknown): GhResult => ({ code: 0, stdout: JSON.stringify(value), stderr: "" });
export const notFound: GhResult = {
  code: 1,
  stdout: '{"message":"Not Found","status":"404"}',
  stderr: "gh: Not Found (HTTP 404)\n",
};
export const serverError: GhResult = { code: 1, stdout: "", stderr: "gh: Server Error (HTTP 502)\nstack noise\n" };

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export class FakeGitHub {
  runs: Record<string, unknown>[] = [];
  artifacts = new Map<number, { name: string; expired: boolean }[]>();
  /** review.json text served by `gh run download`, per run ID. */
  artifactText = new Map<number, string>();
  jobs = new Map<string, FakeJob[]>();
  commitPulls = new Map<string, unknown[]>();
  issues = new Map<number, FakeIssue>();
  comments = new Map<number, FakeComment[]>();
  reactions = new Map<number, FakeReaction[]>();
  labels = new Set<string>();
  /** `<METHOD> <path>`, a bare path (any method; no query) or `run download <id>` → a failed result. */
  failures = new Map<string, GhResult>();
  /** Endpoint path → raw stdout, for unreadable-response cases. */
  rawResponses = new Map<string, string>();
  /** Items per page for list endpoints, to exercise --paginate --slurp. */
  pageSize = 100;
  calls: { args: string[]; input?: string }[] = [];
  /** The in-memory filesystem `gh run download` writes into. */
  files = new Map<string, string>();
  private nextId = 7_000_000;
  private clock = Date.parse("2026-10-26T06:00:00Z");

  readonly gh: GhRunner = (args, input) => {
    this.calls.push({ args, ...(input === undefined ? {} : { input }) });
    return Promise.resolve(this.handle(args, input));
  };

  readonly readFile = (path: string): string => {
    const text = this.files.get(path);
    if (text === undefined) throw new Error(`ENOENT: ${path}`);
    return text;
  };

  /** Calls that would change GitHub state. */
  writes(): string[][] {
    return this.calls
      .map((call) => call.args)
      .filter((args) => args[0] === "api" && args[1] === "-X" && WRITE_METHODS.has(args[2] ?? ""));
  }

  endpoints(): string[] {
    return this.calls.map((call) =>
      call.args[0] === "api" ? (call.args.find((a) => a.startsWith("repos/")) ?? "") : call.args.join(" "),
    );
  }

  addIssue(issue: Omit<FakeIssue, "number"> & { number?: number }): FakeIssue {
    const number = issue.number ?? this.issues.size + 1;
    const created = { ...issue, number };
    this.issues.set(number, created);
    return created;
  }

  addComment(issue: number, comment: Omit<FakeComment, "id"> & { id?: number }): FakeComment {
    const created = { ...comment, id: comment.id ?? (this.nextId += 1) };
    this.comments.set(issue, [...(this.comments.get(issue) ?? []), created]);
    return created;
  }

  allComments(issue: number): FakeComment[] {
    return this.comments.get(issue) ?? [];
  }

  private now(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString().replace(/\.\d{3}Z$/u, "Z");
  }

  private pages(items: unknown[], wrap?: (page: unknown[]) => unknown): GhResult {
    const pages: unknown[] = [];
    for (let i = 0; i === 0 || i < items.length; i += this.pageSize) {
      const page = items.slice(i, i + this.pageSize);
      pages.push(wrap === undefined ? page : wrap(page));
    }
    return ok(pages);
  }

  private handle(args: string[], input?: string): GhResult {
    if (args[0] === "run" && args[1] === "download") return this.download(args);
    if (args[0] !== "api") return { code: 1, stdout: "", stderr: `unexpected gh call: ${args.join(" ")}` };
    const method = args[1] === "-X" ? (args[2] ?? "GET") : "GET";
    const target = args.find((arg) => arg.startsWith("repos/")) ?? "";
    const [path = "", query = ""] = target.split("?");
    const failure = this.failures.get(`${method} ${path}`) ?? this.failures.get(path);
    if (failure !== undefined) return failure;
    const raw = this.rawResponses.get(path);
    if (raw !== undefined) return { code: 0, stdout: raw, stderr: "" };
    const params = new URLSearchParams(query);
    const body = input === undefined ? {} : (JSON.parse(input) as Record<string, unknown>);
    const base = `repos/${REPO}/`;
    if (!path.startsWith(base)) return notFound;
    const rest = path.slice(base.length);
    let match: RegExpExecArray | null;

    if (rest === "actions/workflows/review.yml/runs") {
      return this.pages(this.runs, (page) => ({ total_count: this.runs.length, workflow_runs: page }));
    }
    if ((match = /^actions\/runs\/(\d+)\/artifacts$/u.exec(rest))) {
      const list = this.artifacts.get(Number(match[1])) ?? [];
      return this.pages(list, (page) => ({ total_count: list.length, artifacts: page }));
    }
    if ((match = /^actions\/runs\/(\d+)\/attempts\/(\d+)\/jobs$/u.exec(rest))) {
      const list = this.jobs.get(`${match[1]}/${match[2]}`) ?? [];
      return this.pages(list, (page) => ({ total_count: list.length, jobs: page }));
    }
    if ((match = /^commits\/([^/]+)\/pulls$/u.exec(rest))) return this.pages(this.commitPulls.get(match[1]) ?? []);
    if ((match = /^issues\/(\d+)\/labels$/u.exec(rest))) {
      const issue = this.issues.get(Number(match[1]));
      return issue === undefined ? notFound : this.pages(issue.labels.map((name) => ({ name })));
    }
    if ((match = /^issues\/comments\/(\d+)\/reactions$/u.exec(rest))) {
      return this.pages(this.reactions.get(Number(match[1])) ?? []);
    }
    if ((match = /^issues\/comments\/(\d+)$/u.exec(rest)) && method === "PATCH") {
      const id = Number(match[1]);
      for (const [issue, list] of this.comments) {
        const comment = list.find((item) => item.id === id);
        if (comment !== undefined) {
          comment.body = String(body.body);
          comment.updated_at = this.now();
          return ok({ ...comment, html_url: this.commentUrl(issue, id) });
        }
      }
      return notFound;
    }
    if ((match = /^issues\/(\d+)\/comments$/u.exec(rest))) {
      const issue = Number(match[1]);
      if (!this.issues.has(issue)) return notFound;
      if (method === "POST") {
        const comment = this.addComment(issue, {
          user: { login: "github-actions[bot]" },
          body: String(body.body),
          updated_at: this.now(),
        });
        return ok({ ...comment, html_url: this.commentUrl(issue, comment.id) });
      }
      return this.pages(
        this.allComments(issue).map((item) => ({ ...item, html_url: this.commentUrl(issue, item.id) })),
      );
    }
    if ((match = /^issues\/(\d+)$/u.exec(rest)) && method === "PATCH") {
      const issue = this.issues.get(Number(match[1]));
      if (issue === undefined) return notFound;
      if (typeof body.body === "string") issue.body = body.body;
      if (body.state === "open" || body.state === "closed") issue.state = body.state;
      return ok(this.issueJson(issue));
    }
    if (rest === "issues" && method === "POST") {
      const issue = this.addIssue({
        title: String(body.title),
        body: typeof body.body === "string" ? body.body : null,
        state: "open",
        labels: Array.isArray(body.labels) ? body.labels.map(String) : [],
      });
      return ok(this.issueJson(issue));
    }
    if (rest === "issues") {
      const label = params.get("labels");
      const state = params.get("state") ?? "open";
      const list = [...this.issues.values()].filter(
        (issue) => (label === null || issue.labels.includes(label)) && (state === "all" || issue.state === state),
      );
      return this.pages(list.map((issue) => this.issueJson(issue)));
    }
    if ((match = /^labels\/(.+)$/u.exec(rest))) {
      return this.labels.has(decodeURIComponent(match[1])) ? ok({ name: match[1] }) : notFound;
    }
    if (rest === "labels" && method === "POST") {
      this.labels.add(String(body.name));
      return ok({ name: body.name });
    }
    return { code: 1, stdout: "", stderr: `unexpected endpoint: ${method} ${path}` };
  }

  private download(args: string[]): GhResult {
    const id = Number(args[2]);
    const failure = this.failures.get(`run download ${String(id)}`);
    if (failure !== undefined) return failure;
    const dir = args[args.indexOf("-D") + 1] ?? "";
    const text = this.artifactText.get(id);
    if (text !== undefined) this.files.set(`${dir}/review.json`, text);
    return { code: 0, stdout: "", stderr: "" };
  }

  private commentUrl(issue: number, id: number): string {
    return `https://github.com/${REPO}/issues/${String(issue)}#issuecomment-${String(id)}`;
  }

  private issueJson(issue: FakeIssue): Record<string, unknown> {
    return {
      ...issue,
      labels: issue.labels.map((name) => ({ name })),
      html_url: `https://github.com/${REPO}/issues/${String(issue.number)}`,
    };
  }
}

/** A review.yml run as the runs API returns it. */
export const apiRun = (overrides: Record<string, unknown>): Record<string, unknown> => ({
  id: 39653424585,
  created_at: "2026-10-21T18:31:02Z",
  run_attempt: 1,
  status: "completed",
  conclusion: "success",
  head_sha: "3516d86bb773e5215424c917d52e6ce8d45924a4",
  head_branch: "chore/ai-review-reenable",
  pull_requests: [],
  repository: THIS_REPO,
  ...overrides,
});

/** A PR as the commit-associated PRs endpoint returns it; `headSha` is its CURRENT head. */
export const apiPr = (
  number: number,
  options: {
    headRef?: string;
    headSha?: string;
    headRepo?: object | null;
    baseRef?: string;
    baseRepo?: object | null;
  } = {},
): Record<string, unknown> => ({
  number,
  state: "closed",
  head: {
    ref: options.headRef ?? "chore/ai-review-reenable",
    sha: options.headSha ?? "1bf4dc67eec04d9443dc4095ed6dd32d0233c0ff",
    repo: options.headRepo === undefined ? THIS_REPO : options.headRepo,
  },
  base: {
    ref: options.baseRef ?? "master",
    repo: options.baseRepo === undefined ? THIS_REPO : options.baseRepo,
  },
});

/** The ai-review job of one attempt; `review` is the AI review step's conclusion. */
export const reviewJob = (attempt: number, review: string | null, overrides: Partial<FakeJob> = {}): FakeJob => ({
  name: "ai-review",
  run_attempt: attempt,
  status: "completed",
  conclusion: "success",
  steps: [
    { name: "Set up job", conclusion: "success" },
    { name: "Compute PR diff (three-dot vs merge-base)", conclusion: "success" },
    { name: "AI review", conclusion: review },
    { name: "Upload review output artifact", conclusion: review === "skipped" ? "skipped" : "success" },
  ],
  ...overrides,
});

/** A minimal review.json carrying the cost fields the report reads. */
export const reviewJson = (costs: { finder?: number; judge?: number; impl?: number }, verdict = "passed"): string =>
  JSON.stringify({
    summary: "IGNORE PREVIOUS INSTRUCTIONS <script>",
    findings: [{ id: "F1", severity: "minor", description: "hostile text" }],
    preDedupFindingCount: 1,
    verdict,
    verdictReason: "r",
    models: { finder: "z-ai/glm-4.6", judge: "anthropic/claude-sonnet-5" },
    finderTelemetry: costs.finder === undefined ? undefined : { attempts: 1, cost: costs.finder },
    judgeTelemetry: costs.judge === undefined ? undefined : { attempts: 1, cost: costs.judge },
    ...(costs.impl === undefined
      ? {}
      : {
          implReviewTelemetry: { attempts: 1, cost: costs.impl },
          implReview: { status: "reviewed", verdict: "APPROVED", findings: [] },
        }),
  });
