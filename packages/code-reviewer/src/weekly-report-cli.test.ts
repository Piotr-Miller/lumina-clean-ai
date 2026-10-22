import { describe, expect, it } from "vitest";

import { DEFAULT_OUT_DIR, parseWeeklyArgs, runWeeklyReportCli, type WeeklyReportIo } from "./weekly-report-cli.js";
import { apiPr, apiRun, FakeGitHub, REPO, reviewJson, serverError } from "./weekly-report-github-fake.js";
import { alarmMarker, weeklyMarker } from "./weekly-report-render.js";

// The CLI's exit contract against a scripted GitHub (plan phase 2 §3):
// exit 0 = a report was produced, alarm or not; exit 1 = no runs list, no
// publish, or a wrong invocation — each with subject, state and way out.

const BASE_ARGS = ["--repo", REPO, "--owner", "Piotr-Miller", "--out-dir", "/out"];
const MONDAY = new Date("2026-10-26T06:00:00Z");

interface Harness {
  fake: FakeGitHub;
  io: WeeklyReportIo;
  logs: string[];
  errors: string[];
  removed: string[];
}

const harness = (now = MONDAY): Harness => {
  const fake = new FakeGitHub();
  fake.runs = [apiRun({})];
  fake.artifacts.set(39653424585, [{ name: "ai-review-output", expired: false }]);
  fake.artifactText.set(39653424585, reviewJson({ finder: 0.07646, judge: 0.027728, impl: 0.228852 }, "failed"));
  fake.commitPulls.set("3516d86bb773e5215424c917d52e6ce8d45924a4", [apiPr(300)]);
  fake.addIssue({ number: 300, title: "pr", body: "", state: "closed", labels: ["ai-cr:failed"], pull_request: {} });
  const logs: string[] = [];
  const errors: string[] = [];
  const removed: string[] = [];
  const io: WeeklyReportIo = {
    gh: fake.gh,
    now: () => now,
    readFile: fake.readFile,
    writeFile: (path, content) => fake.files.set(path, content),
    mkdir: () => undefined,
    appendFile: (path, content) => fake.files.set(path, (fake.files.get(path) ?? "") + content),
    makeTempDir: () => "/tmp/dl",
    removeDir: (path) => removed.push(path),
    log: (message) => logs.push(message),
    logError: (message) => errors.push(message),
  };
  return { fake, io, logs, errors, removed };
};

/** The tracking issue's number; PR #300 already occupies the fake, so it is not 1. */
const tracking = (h: Harness): number =>
  [...h.fake.issues.values()].find((issue) => issue.labels.includes("ai-review-report"))?.number ?? -1;

const run = (h: Harness, argv: string[], env: Record<string, string | undefined> = {}) =>
  runWeeklyReportCli(argv, env, h.io);

describe("parseWeeklyArgs", () => {
  it("requires --repo and --owner and defaults the rest", () => {
    expect(parseWeeklyArgs(["--repo", REPO, "--owner", "Piotr-Miller"])).toEqual({
      repo: REPO,
      owner: "Piotr-Miller",
      outDir: DEFAULT_OUT_DIR,
      dryRun: false,
    });
    expect(() => parseWeeklyArgs(["--owner", "Piotr-Miller"])).toThrow(/--repo must be <owner>\/<name>/u);
    expect(() => parseWeeklyArgs(["--repo", REPO])).toThrow(/--owner must be a GitHub login/u);
    expect(() => parseWeeklyArgs(["--repo", "a/b/c", "--owner", "x"])).toThrow(/--repo/u);
    expect(() => parseWeeklyArgs([...BASE_ARGS, "--bogus", "1"])).toThrow(/unknown or valueless argument "--bogus"/u);
    expect(() => parseWeeklyArgs([...BASE_ARGS, "--week"])).toThrow(/valueless/u);
  });
});

describe("runWeeklyReportCli", () => {
  it("publishes the last complete week by default and writes report.md and report.json", async () => {
    const h = harness();
    const summary = "/summary.md";
    expect(await run(h, BASE_ARGS, { GITHUB_STEP_SUMMARY: summary })).toBe(0);

    const report = h.fake.files.get("/out/report.md") ?? "";
    expect(report.startsWith(weeklyMarker("2026-W43"))).toBe(true);
    expect(report).toContain("$0.333040");
    expect(report).not.toContain("IGNORE PREVIOUS INSTRUCTIONS");
    expect(report).not.toContain("hostile text");
    expect(JSON.parse(h.fake.files.get("/out/report.json") ?? "{}")).toMatchObject({
      week: "2026-W43",
      observedAt: "2026-10-26T06:00:00.000Z",
      published: { trackingIssue: tracking(h) },
    });
    expect(h.fake.files.get(summary)).toContain(weeklyMarker("2026-W43"));
    expect(h.fake.allComments(tracking(h))[0]?.body).toBe(report);
    expect(h.fake.files.has("/out/alarm.md")).toBe(false);
    expect(h.removed).toEqual(["/tmp/dl"]);
    expect(h.logs.at(-1)).toMatch(/^week=2026-W43 workflows=1 known_spend=\$0\.333040 .*alarm=not fired → https:\/\//u);
  });

  it("makes zero write calls under --dry-run and still writes the report and alarm files", async () => {
    const h = harness();
    expect(await run(h, [...BASE_ARGS, "--dry-run", "--week", "2026-W43"], { AI_REVIEW_WEEKLY_ALARM_USD: "0.1" })).toBe(
      0,
    );
    expect(h.fake.writes()).toEqual([]);
    expect(h.fake.calls.every((call) => call.args[0] === "run" || !call.args.includes("-X"))).toBe(true);
    expect(h.fake.files.get("/out/report.md")).toContain("🚨 fired");
    expect(h.fake.files.get("/out/alarm.md")?.startsWith(alarmMarker("2026-W43"))).toBe(true);
    expect(h.logs.at(-1)).toContain("dry run: nothing was posted");
  });

  it("opens an alarm issue that links back to the week comment, and writes alarm.md", async () => {
    const h = harness();
    expect(await run(h, BASE_ARGS, { AI_REVIEW_WEEKLY_ALARM_USD: "0.1" })).toBe(0);
    const alarm = [...h.fake.issues.values()].find((issue) => issue.labels.includes("ai-review-alarm"));
    const commentId = h.fake.allComments(tracking(h))[0]?.id ?? 0;
    expect(alarm?.body).toContain(`issues/${String(tracking(h))}#issuecomment-${String(commentId)}`);
    expect(h.fake.files.get("/out/alarm.md")).toBe(alarm?.body);
    expect(h.logs.at(-1)).toContain("alarm issue https://");
  });

  it("annotates the week's alarm issue when a re-run no longer fires", async () => {
    const h = harness();
    await run(h, BASE_ARGS, { AI_REVIEW_WEEKLY_ALARM_USD: "0.1" });
    expect(await run(h, BASE_ARGS)).toBe(0);
    const alarms = [...h.fake.issues.values()].filter((issue) => issue.labels.includes("ai-review-alarm"));
    expect(alarms).toHaveLength(1);
    expect(alarms[0]?.body).toContain("No longer over threshold as of 2026-10-26T06:00:00Z.");
    expect(alarms[0]?.body?.startsWith(alarmMarker("2026-W43"))).toBe(true);
    expect(h.fake.allComments(tracking(h))).toHaveLength(1);
  });

  it("exits 1 naming the endpoint and gh's message when the runs list fails", async () => {
    const h = harness();
    h.fake.failures.set(`repos/${REPO}/actions/workflows/review.yml/runs`, serverError);
    const summary = "/summary.md";
    expect(await run(h, BASE_ARGS, { GITHUB_STEP_SUMMARY: summary })).toBe(1);
    const message = h.errors.join("\n");
    expect(message).toContain("could not list review.yml runs");
    expect(message).toContain(`repos/${REPO}/actions/workflows/review.yml/runs?created=2026-10-18..2026-10-26`);
    expect(message).toContain("gh: Server Error (HTTP 502)");
    expect(message).toContain("Nothing was posted");
    expect(message).not.toContain("stack noise");
    expect(h.fake.files.get(summary)).toContain("AI review weekly report failed");
    expect(h.fake.writes()).toEqual([]);
    expect(h.removed).toEqual(["/tmp/dl"]);
  });

  it("exits 1 with the way out when publishing fails, keeping the rendered report", async () => {
    const h = harness();
    h.fake.failures.set(`POST repos/${REPO}/issues`, serverError);
    expect(await run(h, BASE_ARGS)).toBe(1);
    const message = h.errors.join("\n");
    expect(message).toContain(`could not publish — POST repos/${REPO}/issues failed (gh exit 1)`);
    expect(message).toContain("/out/report.md");
    expect(message).toContain("idempotent");
    expect(h.fake.files.has("/out/report.md")).toBe(true);
  });

  it.each(["2026-W54", "2026-43", "W43"])(
    "exits 1 naming an invalid --week %s, before any GitHub call",
    async (week) => {
      const h = harness();
      expect(await run(h, [...BASE_ARGS, "--week", week])).toBe(1);
      expect(h.errors.join("\n")).toContain(`invalid --week ${JSON.stringify(week)}`);
      expect(h.fake.calls).toEqual([]);
    },
  );

  it("warns about a rejected threshold variable and uses the default", async () => {
    const h = harness();
    expect(await run(h, [...BASE_ARGS, "--dry-run"], { AI_REVIEW_WEEKLY_ALARM_UNREPORTED: "lots" })).toBe(0);
    expect(h.errors).toContain(
      'warning: AI_REVIEW_WEEKLY_ALARM_UNREPORTED rejected value "lots"; using the default 5.',
    );
    expect(h.fake.files.get("/out/report.md")).toContain("AI_REVIEW_WEEKLY_ALARM_UNREPORTED");
  });

  it("posts a report reading 0 runs for an empty week", async () => {
    const h = harness();
    h.fake.runs = [];
    expect(await run(h, BASE_ARGS)).toBe(0);
    expect(h.fake.allComments(tracking(h))[0]?.body).toContain("0 runs");
  });
});
