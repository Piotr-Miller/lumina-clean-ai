import { describe, expect, it } from "vitest";

import { aggregateWeek, isoWeekWindow, parseThresholds, type RawRun } from "./weekly-report.js";
import {
  apiPr,
  apiRun,
  FakeGitHub,
  notFound,
  OTHER_REPO,
  REPO,
  reviewJob,
  reviewJson,
  serverError,
} from "./weekly-report-github-fake.js";
import { collectWeek, publishWeek, ReportError, runsEndpoint } from "./weekly-report-github.js";
import { alarmMarker, weeklyMarker } from "./weekly-report-render.js";

// Collector and publisher against a scripted GitHub (plan phase 2 §3). The
// baseline is live run 39653424585: empty pull_requests, head
// chore/ai-review-reenable @ 3516d86, closed PR #300 whose head has moved on.

const W43 = isoWeekWindow("2026-W43");
const BASELINE_SHA = "3516d86bb773e5215424c917d52e6ce8d45924a4";
const OWNER = "Piotr-Miller";

const collect = (fake: FakeGitHub) =>
  collectWeek({ gh: fake.gh, repo: REPO, window: W43, downloadDir: "/dl", readFile: fake.readFile });

const runById = (runs: readonly RawRun[], id: number): RawRun => {
  const run = runs.find((item) => item.id === id);
  if (run === undefined) throw new Error(`run ${String(id)} not collected`);
  return run;
};

/** The baseline: one reviewed run that maps to #300 only through the commit API. */
const baseline = (): FakeGitHub => {
  const fake = new FakeGitHub();
  fake.runs = [apiRun({})];
  fake.artifacts.set(39653424585, [{ name: "ai-review-output", expired: false }]);
  fake.artifactText.set(39653424585, reviewJson({ finder: 0.07646, judge: 0.027728, impl: 0.228852 }));
  fake.commitPulls.set(BASELINE_SHA, [apiPr(300)]);
  fake.addIssue({ number: 300, title: "pr", body: "", state: "closed", labels: ["ai-cr:failed"], pull_request: {} });
  return fake;
};

describe("collectWeek — window", () => {
  it("queries one day wider on each side and drops a run one second outside the exact window", async () => {
    const fake = baseline();
    fake.runs = [
      apiRun({ id: 1, created_at: "2026-10-18T23:59:59Z" }),
      apiRun({ id: 2, created_at: "2026-10-19T00:00:00Z", conclusion: "skipped" }),
      apiRun({ id: 3, created_at: "2026-10-25T23:59:59Z", conclusion: "skipped" }),
      apiRun({ id: 4, created_at: "2026-10-26T00:00:00Z" }),
    ];
    const { runs } = await collect(fake);

    expect(runsEndpoint(REPO, W43)).toContain("created=2026-10-18..2026-10-26");
    expect(fake.endpoints()[0]).toBe(runsEndpoint(REPO, W43));
    expect(runs.map((run) => run.id)).toEqual([2, 3]);
    // Out-of-window runs cost no further calls.
    expect(fake.endpoints().some((endpoint) => /runs\/(1|4)\//u.test(endpoint))).toBe(false);
  });

  it("reads every page of the runs list and counts a duplicated run once", async () => {
    const fake = baseline();
    fake.pageSize = 2;
    fake.runs = [
      apiRun({ id: 11, conclusion: "skipped" }),
      apiRun({ id: 12, conclusion: "skipped" }),
      apiRun({ id: 12, conclusion: "skipped" }),
      apiRun({ id: 13, conclusion: "skipped" }),
    ];
    const { runs } = await collect(fake);
    expect(runs.map((run) => run.id)).toEqual([11, 12, 13]);
  });

  it("passes a run with an unreadable created_at to the core, which names it, without looking it up", async () => {
    const fake = baseline();
    fake.runs = [apiRun({ id: 21, created_at: "not a date" })];
    const { runs } = await collect(fake);
    expect(runs).toHaveLength(1);
    expect(fake.calls).toHaveLength(1);
    const report = aggregateWeek({
      week: "2026-W43",
      observedAt: new Date("2026-10-26T06:00:00Z"),
      owner: OWNER,
      runs,
      prs: [],
      thresholds: parseThresholds({}),
    });
    expect(report.invalidCreatedAt).toEqual([21]);
  });

  it("throws a ReportError naming the endpoint when the runs list fails", async () => {
    const fake = baseline();
    fake.failures.set(`repos/${REPO}/actions/workflows/review.yml/runs`, serverError);
    const error = await collect(fake).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ReportError);
    expect((error as ReportError).message).toContain(runsEndpoint(REPO, W43));
    expect((error as ReportError).message).toContain("gh: Server Error (HTTP 502)");
    expect((error as ReportError).message).not.toContain("stack noise");
  });

  it("throws when a runs page is not the expected shape, rather than reporting an empty week", async () => {
    const fake = baseline();
    fake.rawResponses.set(`repos/${REPO}/actions/workflows/review.yml/runs`, '[{"message":"rate limited"}]');
    await expect(collect(fake)).rejects.toThrow(/no workflow_runs array/u);
  });
});

describe("collectWeek — PR association", () => {
  it("resolves an empty pull_requests array through the commit API to closed #300 despite its moved head SHA", async () => {
    const fake = baseline();
    const { runs, prs } = await collect(fake);
    const run = runById(runs, 39653424585);
    expect(run.prAssociation).toEqual({ kind: "mapped", pr: 300 });
    expect(fake.endpoints()).toContain(`repos/${REPO}/commits/${BASELINE_SHA}/pulls?per_page=100`);
    expect(prs.map((pr) => pr.number)).toEqual([300]);
  });

  it("uses one valid embedded association without the fallback, and counts duplicate candidates once", async () => {
    const fake = baseline();
    const embedded = { ...apiPr(300), head: { ref: "chore/ai-review-reenable", repo: { id: 1248550443 } } };
    fake.runs = [apiRun({ pull_requests: [embedded, embedded] })];
    const { runs } = await collect(fake);
    expect(runById(runs, 39653424585).prAssociation).toEqual({ kind: "mapped", pr: 300 });
    expect(fake.endpoints().some((endpoint) => endpoint.includes("/commits/"))).toBe(false);
  });

  it("counts duplicate commit-API candidates for one PR once", async () => {
    const fake = baseline();
    fake.commitPulls.set(BASELINE_SHA, [apiPr(300), apiPr(300, { headSha: "ffff" })]);
    const { runs } = await collect(fake);
    expect(runById(runs, 39653424585).prAssociation).toEqual({ kind: "mapped", pr: 300 });
  });

  it("keeps an ambiguous embedded association ambiguous", async () => {
    const fake = baseline();
    fake.runs = [apiRun({ pull_requests: [apiPr(300), apiPr(310)] })];
    const { runs } = await collect(fake);
    expect(runById(runs, 39653424585).prAssociation).toEqual({ kind: "unavailable", reason: "ambiguous" });
    expect(fake.endpoints().some((endpoint) => endpoint.includes("/commits/"))).toBe(false);
  });

  it.each([
    ["another head repository", [apiPr(300, { headRepo: OTHER_REPO })], "missing"],
    ["another head ref", [apiPr(300, { headRef: "feature/other" })], "missing"],
    ["another base ref", [apiPr(300, { baseRef: "release" })], "missing"],
    ["another base repository", [apiPr(300, { baseRepo: OTHER_REPO })], "missing"],
    ["a missing repository identity", [apiPr(300, { headRepo: null })], "missing"],
    ["no candidate", [], "missing"],
    ["two distinct matches", [apiPr(300), apiPr(301)], "ambiguous"],
  ])("leaves the association unavailable for %s", async (_name, candidates, reason) => {
    const fake = baseline();
    fake.commitPulls.set(BASELINE_SHA, candidates);
    const { runs, prs } = await collect(fake);
    expect(runById(runs, 39653424585).prAssociation).toEqual({ kind: "unavailable", reason });
    expect(prs).toEqual([]);
    expect(fake.endpoints().some((endpoint) => /issues\/\d+\//u.test(endpoint))).toBe(false);
  });

  it.each([
    ["a missing head SHA", { head_sha: null }, undefined],
    ["a missing head ref", { head_branch: "" }, undefined],
    ["a failed lookup", {}, "fail"],
    ["an unreadable lookup", {}, "raw"],
  ])("reports lookup failed for %s and keeps the run's known weekly data", async (_name, overrides, mode) => {
    const fake = baseline();
    fake.runs = [apiRun(overrides)];
    const path = `repos/${REPO}/commits/${BASELINE_SHA}/pulls`;
    if (mode === "fail") fake.failures.set(path, serverError);
    if (mode === "raw") fake.rawResponses.set(path, "<html>");
    const { runs, prs } = await collect(fake);
    const run = runById(runs, 39653424585);
    expect(run.prAssociation).toEqual({ kind: "unavailable", reason: "lookup failed" });
    expect(prs).toEqual([]);

    const report = aggregateWeek({
      week: "2026-W43",
      observedAt: new Date("2026-10-26T06:00:00Z"),
      owner: OWNER,
      runs,
      prs,
      thresholds: parseThresholds({}),
    });
    expect(report.spend.known).toBeCloseTo(0.33304, 6);
    expect(report.counts.reviewed).toBe(1);
    expect(report.prs).toEqual([]);
    expect(report.unmappedRuns.map((item) => item.id)).toEqual([39653424585]);
    expect(report.prCoverageIncomplete).toBe(true);
  });
});

describe("collectWeek — artifacts and skip evidence", () => {
  it("downloads the one unambiguous artifact and keeps run_attempt", async () => {
    const fake = baseline();
    fake.runs = [apiRun({ run_attempt: 3 })];
    const { runs } = await collect(fake);
    const run = runById(runs, 39653424585);
    expect(run.artifact.kind).toBe("downloaded");
    expect(run.runAttempt).toBe(3);
    expect(fake.calls.map((call) => call.args)).toContainEqual([
      "run",
      "download",
      "39653424585",
      "-R",
      REPO,
      "-n",
      "ai-review-output",
      "-D",
      "/dl/39653424585",
    ]);
  });

  it("never downloads, sums or picks between several same-name snapshots", async () => {
    const fake = baseline();
    fake.artifacts.set(39653424585, [
      { name: "ai-review-output", expired: false },
      { name: "ai-review-output", expired: false },
    ]);
    const { runs } = await collect(fake);
    expect(runById(runs, 39653424585).artifact).toEqual({ kind: "unreadable" });
    expect(fake.calls.some((call) => call.args[0] === "run")).toBe(false);
  });

  it.each([
    [0, null],
    [-1, null],
    [1.5, null],
    [null, null],
    ["2", null],
    [2, 2],
  ])("normalizes run_attempt %j to %j", async (attempt, expected) => {
    const fake = baseline();
    fake.runs = [apiRun({ run_attempt: attempt })];
    const { runs } = await collect(fake);
    expect(runById(runs, 39653424585).runAttempt).toBe(expected);
  });

  it("reports a paid run whose artifact is omitted or expired as artifact missing", async () => {
    const fake = baseline();
    fake.runs = [apiRun({ id: 31 }), apiRun({ id: 32 })];
    fake.artifacts.set(32, [{ name: "ai-review-output", expired: true }]);
    fake.jobs.set("31/1", [reviewJob(1, "success")]);
    fake.jobs.set("32/1", [reviewJob(1, "success")]);
    const { runs } = await collect(fake);
    expect(fake.calls.some((call) => call.args[0] === "run")).toBe(false);

    const report = aggregateWeek({
      week: "2026-W43",
      observedAt: new Date("2026-10-26T06:00:00Z"),
      owner: OWNER,
      runs,
      prs: [],
      thresholds: parseThresholds({}),
    });
    expect(report.unreportedRuns.map((run) => [run.id, run.runClass])).toEqual([
      [31, { kind: "unreported", reason: "artifact missing" }],
      [32, { kind: "unreported", reason: "artifact missing" }],
    ]);
  });

  it.each([
    ["a failed download", (fake: FakeGitHub) => fake.failures.set("run download 39653424585", serverError)],
    ["a download without review.json", (fake: FakeGitHub) => fake.artifactText.delete(39653424585)],
    [
      "a failed artifact listing",
      (fake: FakeGitHub) => fake.failures.set(`repos/${REPO}/actions/runs/39653424585/artifacts`, serverError),
    ],
  ])("reports %s as artifact unreadable", async (_name, arrange) => {
    const fake = baseline();
    arrange(fake);
    const { runs } = await collect(fake);
    expect(runById(runs, 39653424585).artifact).toEqual({ kind: "unreadable" });
  });

  it("proves a docs-only skip from the same attempt's steps", async () => {
    const fake = baseline();
    fake.runs = [apiRun({ id: 41, run_attempt: 2 })];
    fake.jobs.set("41/2", [reviewJob(2, "skipped")]);
    const { runs } = await collect(fake);
    expect(runById(runs, 41).skipEvidence).toBe("confirmed");
    expect(fake.endpoints()).toContain(`repos/${REPO}/actions/runs/41/attempts/2/jobs?per_page=100`);
  });

  it.each([
    ["review steps that ran", [reviewJob(1, "success")], "not-skipped"],
    ["a failed job", [reviewJob(1, "skipped", { conclusion: "failure" })], "not-skipped"],
    [
      "a failed diff step",
      [
        reviewJob(1, "skipped", {
          steps: [
            { name: "Compute PR diff (three-dot vs merge-base)", conclusion: "failure" },
            { name: "AI review", conclusion: "skipped" },
          ],
        }),
      ],
      "not-skipped",
    ],
    [
      "a renamed AI review step",
      [
        reviewJob(1, "skipped", {
          steps: [
            { name: "Compute PR diff (three-dot vs merge-base)", conclusion: "success" },
            { name: "Run AI review", conclusion: "skipped" },
          ],
        }),
      ],
      "unavailable",
    ],
    [
      "a missing diff step",
      [reviewJob(1, "skipped", { steps: [{ name: "AI review", conclusion: "skipped" }] })],
      "unavailable",
    ],
    ["two ai-review jobs", [reviewJob(1, "skipped"), reviewJob(1, "skipped")], "unavailable"],
    ["no ai-review job", [reviewJob(1, "skipped", { name: "other" })], "unavailable"],
    ["a different attempt's skipped step", [reviewJob(2, "skipped")], "unavailable"],
    ["a job without steps", [reviewJob(1, "skipped", { steps: undefined })], "unavailable"],
  ])("never proves $0 from %s", async (_name, jobs, expected) => {
    const fake = baseline();
    fake.runs = [apiRun({ id: 42 })];
    fake.jobs.set("42/1", jobs);
    const { runs } = await collect(fake);
    expect(runById(runs, 42).skipEvidence).toBe(expected);
  });

  it("does not look up steps without an attempt number, and a failed lookup is unavailable", async () => {
    const fake = baseline();
    fake.runs = [apiRun({ id: 43, run_attempt: null }), apiRun({ id: 44 })];
    fake.failures.set(`repos/${REPO}/actions/runs/44/attempts/1/jobs`, serverError);
    const { runs } = await collect(fake);
    expect(runById(runs, 43).skipEvidence).toBe("unavailable");
    expect(runById(runs, 44).skipEvidence).toBe("unavailable");
    expect(fake.endpoints().some((endpoint) => endpoint.includes("runs/43/attempts"))).toBe(false);

    const report = aggregateWeek({
      week: "2026-W43",
      observedAt: new Date("2026-10-26T06:00:00Z"),
      owner: OWNER,
      runs,
      prs: [],
      thresholds: parseThresholds({}),
    });
    expect(report.unreportedRuns.map((run) => run.runClass)).toEqual([
      { kind: "unreported", reason: "skip evidence unavailable" },
      { kind: "unreported", reason: "skip evidence unavailable" },
    ]);
  });

  it("makes no artifact or step calls for a label-event skip", async () => {
    const fake = baseline();
    fake.runs = [apiRun({ id: 45, conclusion: "skipped" })];
    await collect(fake);
    expect(fake.endpoints().some((endpoint) => endpoint.includes("runs/45/"))).toBe(false);
  });
});

describe("collectWeek — sticky comment, reactions and labels", () => {
  it("matches the sticky only on github-actions[bot] plus the marker", async () => {
    const fake = baseline();
    fake.addComment(300, {
      user: { login: "mallory" },
      body: "<!-- ai-cr:sticky --> fake",
      updated_at: "2026-10-21T18:40:00Z",
    });
    const { prs } = await collect(fake);
    expect(prs[0]?.sticky).toEqual({ kind: "none" });
  });

  it("reads the bot sticky's reactions; the core counts the owner's only", async () => {
    const fake = baseline();
    fake.addComment(300, {
      user: { login: "mallory" },
      body: "<!-- ai-cr:sticky --> fake",
      updated_at: "2026-10-21T18:40:00Z",
    });
    const sticky = fake.addComment(300, {
      user: { login: "github-actions[bot]" },
      body: "<!-- ai-cr:sticky -->\nreview",
      updated_at: "2026-10-21T18:52:51Z",
    });
    fake.reactions.set(sticky.id, [
      { user: { login: "someone-else" }, content: "-1", created_at: "2026-10-22T08:00:00Z" },
      { user: { login: "piotr-miller" }, content: "+1", created_at: "2026-10-22T09:00:00Z" },
      { user: null, content: "-1", created_at: "2026-10-22T09:00:00Z" },
    ]);
    const { runs, prs } = await collect(fake);
    expect(prs[0]?.labels).toEqual(["ai-cr:failed"]);
    expect(prs[0]?.sticky).toMatchObject({ kind: "found", updatedAt: "2026-10-21T18:52:51Z" });

    const report = aggregateWeek({
      week: "2026-W43",
      observedAt: new Date("2026-10-26T06:00:00Z"),
      owner: OWNER,
      runs,
      prs,
      thresholds: parseThresholds({}),
    });
    expect(report.prs[0]?.reaction).toEqual({ kind: "rated", state: "up", stale: false });
    expect(report.prs[0]?.label).toBe("failed");
  });

  it("reports a failed comment, reaction or label lookup as unavailable rather than as no comment", async () => {
    const fake = baseline();
    const sticky = fake.addComment(300, {
      user: { login: "github-actions[bot]" },
      body: "<!-- ai-cr:sticky -->",
      updated_at: "2026-10-21T18:52:51Z",
    });
    fake.failures.set(`repos/${REPO}/issues/comments/${String(sticky.id)}/reactions`, serverError);
    fake.failures.set(`repos/${REPO}/issues/300/labels`, serverError);
    const { prs } = await collect(fake);
    expect(prs[0]).toEqual({ number: 300, labels: null, sticky: { kind: "unavailable" } });
  });

  it("makes no per-PR call for a PR whose only runs are label-event skips", async () => {
    const fake = baseline();
    fake.runs = [apiRun({ id: 51, conclusion: "skipped" })];
    const { prs } = await collect(fake);
    expect(prs).toEqual([]);
    expect(fake.endpoints().some((endpoint) => endpoint.includes("/issues/"))).toBe(false);
  });
});

describe("publishWeek", () => {
  const publish = (fake: FakeGitHub, fired: boolean, body = "report body", log: string[] = []) =>
    publishWeek({
      gh: fake.gh,
      repo: REPO,
      week: "2026-W43",
      commentBody: `${weeklyMarker("2026-W43")}\n${body}`,
      alarm: {
        fired,
        renderBody: (url) => `${alarmMarker("2026-W43")}\n${fired ? "fired" : "cleared"} → ${url}`,
      },
      log: (message) => log.push(message),
    });

  it("creates the labels, the tracking issue, the week comment and the alarm issue on a first run", async () => {
    const fake = new FakeGitHub();
    const result = await publish(fake, true);
    expect([...fake.labels].sort()).toEqual(["ai-review-alarm", "ai-review-report"]);
    const tracking = fake.issues.get(result.trackingIssue);
    expect(tracking).toMatchObject({ title: "AI review weekly report", labels: ["ai-review-report"], state: "open" });
    expect(fake.allComments(result.trackingIssue)).toHaveLength(1);
    expect(result.commentUrl).toMatch(/\/issues\/1#issuecomment-\d+$/u);
    const alarms = [...fake.issues.values()].filter((issue) => issue.labels.includes("ai-review-alarm"));
    expect(alarms).toHaveLength(1);
    expect(alarms[0]?.body).toContain(result.commentUrl);
  });

  it("PATCHes on a second run for the same week: one comment, one alarm issue", async () => {
    const fake = new FakeGitHub();
    const first = await publish(fake, true, "first");
    const second = await publish(fake, true, "second");
    expect(second.trackingIssue).toBe(first.trackingIssue);
    expect(second.commentUrl).toBe(first.commentUrl);
    const comments = fake.allComments(first.trackingIssue);
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toContain("second");
    expect([...fake.issues.values()].filter((issue) => issue.labels.includes("ai-review-alarm"))).toHaveLength(1);
    expect(second.alarmIssueUrl).toBe(first.alarmIssueUrl);
  });

  it("ignores a marker comment that is not github-actions[bot]'s", async () => {
    const fake = new FakeGitHub();
    fake.labels = new Set(["ai-review-report", "ai-review-alarm"]);
    fake.addIssue({
      number: 5,
      title: "AI review weekly report",
      body: "",
      state: "open",
      labels: ["ai-review-report"],
    });
    fake.addComment(5, {
      user: { login: "mallory" },
      body: weeklyMarker("2026-W43"),
      updated_at: "2026-10-20T00:00:00Z",
    });
    await publish(fake, false);
    const comments = fake.allComments(5);
    expect(comments).toHaveLength(2);
    expect(comments[0]?.body).toBe(weeklyMarker("2026-W43"));
  });

  it("PATCHes a closed alarm issue's body and never reopens it", async () => {
    const fake = new FakeGitHub();
    fake.labels = new Set(["ai-review-report", "ai-review-alarm"]);
    fake.addIssue({
      number: 7,
      title: "AI review alarm — 2026-W43",
      body: alarmMarker("2026-W43"),
      state: "closed",
      labels: ["ai-review-alarm"],
    });
    const result = await publish(fake, true);
    expect(fake.issues.get(7)).toMatchObject({ state: "closed" });
    expect(fake.issues.get(7)?.body).toContain("fired →");
    expect(result.alarmIssueUrl).toMatch(/\/issues\/7$/u);
    const patch = fake.calls.find((call) => call.args.includes(`repos/${REPO}/issues/7`));
    expect(JSON.parse(patch?.input ?? "{}")).not.toHaveProperty("state");
  });

  it("annotates an existing week alarm on a non-firing run and creates none when there is none", async () => {
    const fake = new FakeGitHub();
    await publish(fake, false);
    expect([...fake.issues.values()].filter((issue) => issue.labels.includes("ai-review-alarm"))).toHaveLength(0);

    await publish(fake, true);
    const cleared = await publish(fake, false);
    const alarms = [...fake.issues.values()].filter((issue) => issue.labels.includes("ai-review-alarm"));
    expect(alarms).toHaveLength(1);
    expect(alarms[0]?.body).toContain("cleared →");
    expect(cleared.alarmIssueUrl).toBeDefined();
  });

  it("does not touch another week's alarm issue", async () => {
    const fake = new FakeGitHub();
    fake.addIssue({
      number: 9,
      title: "AI review alarm — 2026-W42",
      body: alarmMarker("2026-W42"),
      state: "open",
      labels: ["ai-review-alarm"],
    });
    await publish(fake, true);
    expect(fake.issues.get(9)?.body).toBe(alarmMarker("2026-W42"));
    expect([...fake.issues.values()].filter((issue) => issue.labels.includes("ai-review-alarm"))).toHaveLength(2);
  });

  it("posts on the lowest of several open tracking issues and says so", async () => {
    const fake = new FakeGitHub();
    fake.addIssue({
      number: 12,
      title: "AI review weekly report",
      body: "",
      state: "open",
      labels: ["ai-review-report"],
    });
    fake.addIssue({
      number: 4,
      title: "AI review weekly report",
      body: "",
      state: "open",
      labels: ["ai-review-report"],
    });
    fake.addIssue({
      number: 2,
      title: "a PR",
      body: "",
      state: "open",
      labels: ["ai-review-report"],
      pull_request: {},
    });
    const log: string[] = [];
    const result = await publish(fake, false, "body", log);
    expect(result.trackingIssue).toBe(4);
    expect(log.join("\n")).toContain("2 open ai-review-report issues (#4, #12)");
  });

  it("creates a missing label only on an explicit 404, and stops on any other failure", async () => {
    const fake = new FakeGitHub();
    fake.failures.set(`repos/${REPO}/labels/ai-review-report`, serverError);
    const error = await publish(fake, false).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ReportError);
    expect((error as Error).message).toContain(`repos/${REPO}/labels/ai-review-report`);
    expect(fake.writes()).toEqual([]);
  });

  it("names the endpoint when a write fails", async () => {
    const fake = new FakeGitHub();
    fake.labels = new Set(["ai-review-report", "ai-review-alarm"]);
    fake.addIssue({
      number: 3,
      title: "AI review weekly report",
      body: "",
      state: "open",
      labels: ["ai-review-report"],
    });
    fake.failures.set(`POST repos/${REPO}/issues/3/comments`, notFound);
    await expect(publish(fake, false)).rejects.toThrow(
      `repos/${REPO}/issues/3/comments failed (gh exit 1): gh: Not Found (HTTP 404)`,
    );
  });

  it("writes only labels, issues and issue comments", async () => {
    const fake = new FakeGitHub();
    await publish(fake, true);
    await publish(fake, false);
    for (const args of fake.writes()) {
      expect(args[3]).toMatch(
        new RegExp(`^repos/${REPO}/(labels|issues|issues/\\d+|issues/\\d+/comments|issues/comments/\\d+)$`, "u"),
      );
    }
  });
});
