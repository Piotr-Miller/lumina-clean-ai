import { describe, expect, it } from "vitest";

import {
  MAX_COMMENT_CHARS,
  MAX_FIELD_CHARS,
  MAX_RENDERED_FINDINGS,
  renderStickyComment,
  STICKY_MARKER,
} from "./render.js";
import { CRITERIA } from "./scorecard.js";
import type { IdentifiedFinding, PipelineResult, Scores, Severity } from "./schemas.js";

const identified = (id: string, overrides: Partial<IdentifiedFinding> = {}): IdentifiedFinding => ({
  id,
  file: "src/a.ts",
  startLine: 5,
  severity: "minor",
  category: "correctness",
  description: `desc ${id}`,
  suggestion: `fix ${id}`,
  ...overrides,
});

const scores = (findingIds: string[] = []): Scores =>
  Object.fromEntries(
    CRITERIA.map(({ key }) => [key, { score: 7, justification: "j", findingIds }]),
  ) as Scores;

const result = (overrides: Partial<PipelineResult> = {}): PipelineResult => ({
  summary: "overall assessment",
  findings: [identified("F1")],
  scores: scores(),
  verdict: "passed",
  verdictReason: "looks solid",
  diffStats: { files: 1, additions: 2, deletions: 1 },
  diffTruncated: false,
  bodyTruncated: false,
  droppedFindingIdRefs: 0,
  models: { finder: "cheap/finder", judge: "big/judge" },
  ...overrides,
});

describe("renderStickyComment", () => {
  it("ends with the sticky marker (the upsert anchor)", () => {
    expect(renderStickyComment(result()).trimEnd().endsWith(STICKY_MARKER)).toBe(true);
  });

  it("renders a passed headline with the verdict reason and summary", () => {
    const comment = renderStickyComment(result());
    expect(comment).toContain("✅ PASSED");
    expect(comment).toContain("looks solid");
    expect(comment).toContain("overall assessment");
  });

  it("renders a failed headline", () => {
    expect(renderStickyComment(result({ verdict: "failed" }))).toContain("❌ FAILED");
  });

  it("renders one labelled score row per criterion, with finding references", () => {
    const comment = renderStickyComment(result({ scores: scores(["F1"]) }));
    for (const { label } of CRITERIA) expect(comment).toContain(`| ${label} | 7/10 | F1 |`);
  });

  it("renders an em dash for criteria without finding references", () => {
    expect(renderStickyComment(result())).toContain("| Implementation correctness | 7/10 | — |");
  });

  it("caps findings at MAX_RENDERED_FINDINGS by severity and counts the rest", () => {
    const severities: Severity[] = ["nit", "minor", "critical", "major", "minor", "nit", "critical"];
    const findings = severities.map((severity, index) =>
      identified(`F${String(index + 1)}`, { severity, startLine: index + 1 }),
    );
    const comment = renderStickyComment(result({ findings }));
    const rendered = [...comment.matchAll(/- \*\*(F\d+)\*\*/gu)].map((m) => m[1]);
    expect(rendered).toHaveLength(MAX_RENDERED_FINDINGS);
    // The two criticals and the major outrank every minor/nit.
    expect(rendered.slice(0, 3)).toEqual(["F3", "F7", "F4"]);
    expect(comment).toContain("…and 2 more finding(s)");
  });

  it("renders a no-findings note instead of an empty section", () => {
    const comment = renderStickyComment(result({ findings: [] }));
    expect(comment).toContain("No findings.");
    expect(comment).not.toContain("Top findings");
  });

  it("notes diff/body truncation and dropped references only when present", () => {
    const clean = renderStickyComment(result());
    expect(clean).not.toContain("⚠️");
    const noisy = renderStickyComment(
      result({ diffTruncated: true, bodyTruncated: true, droppedFindingIdRefs: 2 }),
    );
    expect(noisy).toContain("diff truncated at 100 KB");
    expect(noisy).toContain("PR body truncated at 2,000 chars");
    expect(noisy).toContain("2 unknown finding reference(s)");
  });

  it("links the run only when runUrl is provided", () => {
    const url = "https://github.com/acme/repo/actions/runs/1";
    expect(renderStickyComment(result(), { runUrl: url })).toContain(`[run](${url})`);
    expect(renderStickyComment(result())).not.toContain("[run](");
  });

  it("names both models in the footer", () => {
    const comment = renderStickyComment(result());
    expect(comment).toContain("finder: cheap/finder");
    expect(comment).toContain("judge: big/judge");
  });
});

describe("renderStickyComment (model-controlled Markdown isolation)", () => {
  it("flattens newlines and escapes pipes/headings smuggled through a description", () => {
    const attack = "bad |cell|\n### Fake heading\n| a | b |";
    const comment = renderStickyComment(result({ findings: [identified("F1", { description: attack })] }));
    // No line may start with the smuggled heading — it stays inline in the finding row.
    expect(comment.split("\n").some((line) => line.startsWith("### Fake"))).toBe(false);
    expect(comment).toContain("\\|cell\\|");
    const findingLine = comment.split("\n").find((line) => line.includes("**F1**"));
    expect(findingLine).toContain("Fake heading");
  });

  it("escapes a summary and verdict reason that try to open new sections", () => {
    const comment = renderStickyComment(
      result({ summary: "### Injected section\nspoof", verdictReason: "> fake quote" }),
    );
    // The only heading lines are the author-owned ones; injected markers are escaped.
    expect(comment.split("\n").some((line) => line.startsWith("### Injected"))).toBe(false);
    expect(comment.split("\n").some((line) => line.startsWith("> "))).toBe(false);
    expect(comment).toContain("\\### Injected section spoof");
    expect(comment).toContain("\\> fake quote");
  });

  it("keeps a backtick-carrying file path inside its code span", () => {
    const comment = renderStickyComment(
      result({ findings: [identified("F1", { file: "src/a`.ts" })] }),
    );
    expect(comment).toContain("``src/a`.ts:5``");
  });

  it("renders a file-level finding as its path alone, never file:0", () => {
    const comment = renderStickyComment(
      result({ findings: [identified("F1", { startLine: undefined })] }),
    );
    expect(comment).toContain("`src/a.ts`");
    expect(comment).not.toContain("src/a.ts:0");
  });

  it("defuses @mentions and Markdown links in model text", () => {
    const comment = renderStickyComment(
      result({ summary: "ping @octocat", verdictReason: "[click me](https://evil.example)" }),
    );
    expect(comment).toContain("@<!-- -->octocat");
    expect(comment).not.toContain("ping @octocat");
    // The opening bracket is escaped, so the sequence can never parse as a link.
    expect(comment).toContain("\\[click me](");
    expect(comment).not.toMatch(/(?<!\\)\[click me\]\(/u);
  });

  it("caps an oversized field with an ellipsis", () => {
    const comment = renderStickyComment(result({ summary: "s".repeat(MAX_FIELD_CHARS + 500) }));
    expect(comment).toContain(`${"s".repeat(MAX_FIELD_CHARS)}…`);
    expect(comment).not.toContain("s".repeat(MAX_FIELD_CHARS + 1));
  });

  it("enforces the whole-comment ceiling and keeps the sticky marker last", () => {
    const findings = Array.from({ length: 2_000 }, (_, index) => identified(`F${String(index + 1)}`));
    const ids = findings.map((finding) => finding.id);
    const comment = renderStickyComment(result({ findings, scores: scores(ids) }));
    expect(comment.length).toBeLessThanOrEqual(MAX_COMMENT_CHARS);
    expect(comment).toContain("comment truncated");
    expect(comment.trimEnd().endsWith(STICKY_MARKER)).toBe(true);
  });
});
