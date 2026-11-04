import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { isDocsOnlyChange, parseChangedPaths } from "../scripts/lib/docs-only";

describe("isDocsOnlyChange", () => {
  it("is true when every changed path is under context/", () => {
    expect(
      isDocsOnlyChange([
        "context/changes/x/change.md",
        "context/archive/2026-01-01-x/plan.md",
        "context/foundation/roadmap.md",
      ]),
    ).toBe(true);
  });

  it("is true for non-Markdown files under context/ (the allowlist is a tree, not an extension)", () => {
    expect(
      isDocsOnlyChange(["context/changes/x/references/compare.html", "context/changes/x/evaluations/a.jsonl"]),
    ).toBe(true);
  });

  it("is false for an empty change set, so a classification that saw nothing runs everything", () => {
    expect(isDocsOnlyChange([])).toBe(false);
  });

  it("is false when any path is outside context/", () => {
    expect(isDocsOnlyChange(["context/changes/x/change.md", "src/lib/engines/local-engine.ts"])).toBe(false);
  });

  it.each([
    ["AGENTS.md"],
    [".claude/skills/gauntlet-loop/SKILL.md"],
    [".github/ai-review-rules.md"],
    [".github/workflows/ci.yml"],
    ["tests/README.md"],
  ])("is false for Markdown or config that a gate does read: %s", (path) => {
    expect(isDocsOnlyChange([path])).toBe(false);
  });

  it("is false for a sibling name that merely starts with the same letters", () => {
    expect(isDocsOnlyChange(["contextual/notes.md"])).toBe(false);
    expect(isDocsOnlyChange(["context"])).toBe(false);
  });

  it("is false for a path that climbs out of context/", () => {
    expect(isDocsOnlyChange(["context/../src/middleware.ts"])).toBe(false);
  });

  it("is true for temp_steps.md alone and together with context/ paths", () => {
    expect(isDocsOnlyChange(["temp_steps.md"])).toBe(true);
    expect(isDocsOnlyChange(["temp_steps.md", "context/changes/x/change.md"])).toBe(true);
  });

  it("matches temp_steps.md exactly, never as a prefix or in another directory", () => {
    expect(isDocsOnlyChange(["temp_steps.md.bak"])).toBe(false);
    expect(isDocsOnlyChange(["temp_steps.mdx"])).toBe(false);
    expect(isDocsOnlyChange(["temp_steps.md/x.ts"])).toBe(false);
    expect(isDocsOnlyChange(["src/temp_steps.md"])).toBe(false);
    expect(isDocsOnlyChange(["temp_steps.md", "src/types.ts"])).toBe(false);
  });

  it("is false for a path Git quoted, because it no longer starts with the prefix", () => {
    expect(isDocsOnlyChange(['"context/changes/x/tab\\there.md"'])).toBe(false);
  });
});

describe("parseChangedPaths", () => {
  it("drops blank lines and CRLF endings", () => {
    expect(parseChangedPaths("context/a.md\r\n\ncontext/b.md\n")).toEqual(["context/a.md", "context/b.md"]);
  });

  it("returns no paths for empty output", () => {
    expect(parseChangedPaths("")).toEqual([]);
    expect(parseChangedPaths("\n\n")).toEqual([]);
  });
});

describe("docs-only.ts as a script (the form CI runs)", () => {
  const run = (stdin: string): string =>
    execFileSync(process.execPath, ["scripts/lib/docs-only.ts"], { input: stdin, encoding: "utf8" }).trim();

  it("prints true for a context-only change set", () => {
    expect(run("context/changes/x/change.md\ncontext/foundation/roadmap.md\n")).toBe("true");
  });

  it("prints false for a mixed change set and for empty input", () => {
    expect(run("context/changes/x/change.md\nsrc/types.ts\n")).toBe("false");
    expect(run("")).toBe("false");
  });
});
