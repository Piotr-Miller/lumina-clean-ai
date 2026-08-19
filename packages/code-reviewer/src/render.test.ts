import { describe, expect, it } from "vitest";

import {
  MAX_COMMENT_CHARS,
  MAX_FIELD_CHARS,
  MAX_RENDERED_FINDINGS,
  renderStickyComment,
  STICKY_MARKER,
} from "./render.js";
import { CRITERIA } from "./scorecard.js";
import type {
  IdentifiedFinding,
  IdentifiedImplFinding,
  ImplGrades,
  ImplReviewBlock,
  PipelineResult,
  Scores,
  Severity,
} from "./schemas.js";

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
  ) as unknown as Scores;

const result = (overrides: Partial<PipelineResult> = {}): PipelineResult => ({
  summary: "overall assessment",
  findings: [identified("F1")],
  preDedupFindingCount: 1,
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

// --- Implementation review section (phase 3) ---

// Defaults to the `code` locus because most render assertions are about the
// rendered location. Other loci are passed explicitly as whole objects.
const implFinding = (
  id: string,
  overrides: Partial<Omit<Extract<IdentifiedImplFinding, { locus: "code" }>, "locus">> = {},
): IdentifiedImplFinding => ({
  id,
  locus: "code",
  dimension: "plan_adherence",
  severity: "WARNING",
  impact: "LOW",
  title: `title ${id}`,
  file: "src/a.ts",
  startLine: 12,
  detail: `detail ${id}`,
  fix: `fix ${id}`,
  ...overrides,
});

const implGrades = (overrides: Partial<ImplGrades> = {}): ImplGrades => ({
  plan_adherence: "PASS",
  scope_discipline: "PASS",
  safety_quality: "PASS",
  architecture: "PASS",
  pattern_consistency: "PASS",
  test_coverage: "PASS",
  success_criteria: "PASS",
  ...overrides,
});

const reviewed = (overrides: Partial<Extract<ImplReviewBlock, { status: "reviewed" }>> = {}): ImplReviewBlock => ({
  status: "reviewed",
  planPath: "context/changes/x/plan.md",
  grades: implGrades(),
  verdict: "APPROVED",
  verdictReason: "matches the plan",
  findings: [],
  ...overrides,
});

describe("renderStickyComment implementation-review section", () => {
  // Three states, each pinned by a stable string the action and the tests can
  // both anchor on.
  it("renders the no-plan state from the ABSENCE of the key, never silence", () => {
    const comment = renderStickyComment(result());
    expect(comment).toContain("Implementation review — not run");
    expect(comment).toContain("No plan found for this PR");
    // A reader must be told how to opt in, or the section is just noise.
    expect(comment).toContain("Plan:");
  });

  it("renders the failed state and says the code review is unaffected", () => {
    const comment = renderStickyComment(result({ implReview: { status: "failed", error: "provider exploded" } }));
    expect(comment).toContain("Implementation review — ⚠️ could not complete");
    expect(comment).toContain("provider exploded");
    expect(comment).toContain("The code review above is unaffected.");
  });

  it("renders the reviewed state with verdict, plan path, findings, and grade table", () => {
    const comment = renderStickyComment(
      result({
        implReview: reviewed({
          verdict: "NEEDS_ATTENTION",
          grades: implGrades({ scope_discipline: "WARNING" }),
          findings: [implFinding("P1")],
        }),
      }),
    );
    expect(comment).toContain("Implementation review — 🟡 NEEDS ATTENTION");
    expect(comment).toContain("Reviewed against `context/changes/x/plan.md`");
    expect(comment).toContain("**P1** [WARNING/LOW]");
    expect(comment).toContain("detail P1");
    expect(comment).toContain("fix: fix P1");
    expect(comment).toContain("<details><summary>Dimension grades</summary>");
    expect(comment).toContain("| Scope Discipline | ▲ WARNING |");
    expect(comment).toContain("| Plan Adherence | ✔ PASS |");
  });

  // The two verdicts answer different questions; a reader who conflates them
  // reads a 🔴 plan verdict as a failed code review (criterion 3.15).
  it("keeps the two verdict vocabularies disjoint", () => {
    const comment = renderStickyComment(result({ implReview: reviewed({ verdict: "REJECTED" }) }));
    expect(comment).toContain("### AI Code Review — ✅ PASSED");
    expect(comment).toContain("Implementation review — 🔴 REJECTED");
    // No glyph appears in both headlines.
    for (const glyph of ["🟢", "🟡", "🔴"]) expect(comment.split("\n").at(0)).not.toContain(glyph);
  });

  it("caps rendered impl findings and says how many are left", () => {
    const findings = Array.from({ length: MAX_RENDERED_FINDINGS + 3 }, (_, i) => implFinding(`P${String(i + 1)}`));
    const comment = renderStickyComment(result({ implReview: reviewed({ findings }) }));
    expect(comment).toContain(`**P${String(MAX_RENDERED_FINDINGS)}**`);
    expect(comment).not.toContain(`**P${String(MAX_RENDERED_FINDINGS + 1)}**`);
    expect(comment).toContain("…and 3 more finding(s) in review.json.");
  });

  // One assertion per locus, so the exhaustive switch in implLocation is covered
  // rather than just compiled.
  it("renders a location per locus and none for absent", () => {
    const at = (finding: IdentifiedImplFinding) =>
      renderStickyComment(result({ implReview: reviewed({ findings: [finding] }) }));

    expect(at(implFinding("P1"))).toContain("`src/a.ts:12`");
    expect(
      at({
        id: "P2",
        locus: "file",
        file: "src/b.ts",
        dimension: "plan_adherence",
        severity: "WARNING",
        impact: "LOW",
        title: "title P2",
        detail: "d",
        fix: "f",
      }),
    ).toContain("`src/b.ts`");

    // No fabricated path, no bare `:12`.
    const absent = at({
      id: "P3",
      locus: "absent",
      dimension: "plan_adherence",
      severity: "WARNING",
      impact: "LOW",
      title: "title P3",
      detail: "d",
      fix: "f",
    });
    expect(absent).toContain("**P3** [WARNING/LOW] — title P3");
    expect(absent).not.toContain(":12");
  });

  // The plan path is UNTRUSTED: the PR body names it (criterion 3.11).
  it("escapes a plan path carrying Markdown control characters and an @mention", () => {
    const comment = renderStickyComment(
      result({ implReview: reviewed({ planPath: "a|b\n# heading @someone [x](y)" }) }),
    );
    const section = comment.slice(comment.indexOf("Reviewed against"));
    const firstLine = section.split("\n").at(0) ?? "";
    // Flattened onto one line: nothing can open a heading or a new table row.
    expect(firstLine).toContain("# heading");
    expect(comment).not.toMatch(/^# heading/mu);
    // Inside a code span, so the pipe cannot break the table and the mention
    // cannot ping — GitHub does not linkify inside code spans.
    expect(firstLine).toMatch(/`[^`]*a\|b[^`]*`/u);
  });

  it("still ends with the sticky marker when the impl section pushes it over the ceiling", () => {
    const findings = Array.from({ length: 2_000 }, (_, i) => identified(`F${String(i + 1)}`));
    const comment = renderStickyComment(
      result({ findings, scores: scores(findings.map((f) => f.id)), implReview: reviewed() }),
    );
    expect(comment.length).toBeLessThanOrEqual(MAX_COMMENT_CHARS);
    expect(comment.trimEnd().endsWith(STICKY_MARKER)).toBe(true);
  });

  it("notes a truncated plan so a partial review never reads as a complete one", () => {
    const comment = renderStickyComment(result({ implReview: reviewed(), planTruncated: true }));
    expect(comment).toContain("plan truncated at 80,000 chars");
    expect(renderStickyComment(result({ implReview: reviewed() }))).not.toContain("plan truncated");
  });

  // The bottom-of-comment footnote is below the verdict, and a reader scanning a
  // red REJECTED never reaches it. The caveat has to sit with the verdict.
  it("puts the diff-truncation caveat with the verdict, not only in the footnote", () => {
    const comment = renderStickyComment(result({ implReview: reviewed(), diffTruncated: true }));
    const caveat = comment.indexOf("this review saw only part of the change");
    expect(caveat).toBeGreaterThan(-1);
    expect(caveat).toBeLessThan(comment.indexOf("diff truncated at 100 KB"));
    expect(renderStickyComment(result({ implReview: reviewed() }))).not.toContain(
      "this review saw only part of the change",
    );
  });
});

describe("renderStickyComment gated implementation review", () => {
  // A gated run must never render as "no plan found" — that tells the reader
  // something false about their own PR.
  it("names the gate rather than borrowing the no-plan wording", () => {
    const comment = renderStickyComment(
      result({ implReview: { status: "skipped", reason: "the code review did not pass, so the implementation review was not run" } }),
    );
    expect(comment).toContain("Implementation review — not run");
    expect(comment).toContain("the code review did not pass");
    expect(comment).toContain("It runs once the code review above passes.");
    expect(comment).not.toContain("No plan found for this PR");
  });

  it("escapes a model- or config-supplied reason like every other field", () => {
    const comment = renderStickyComment(
      result({ implReview: { status: "skipped", reason: "bad\n# heading @someone" } }),
    );
    expect(comment).not.toMatch(/^# heading/mu);
    expect(comment).toContain("@<!-- -->someone");
  });
});
