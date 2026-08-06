import { describe, expect, it } from "vitest";

import { buildInstructions, buildPrompt } from "./prompts.js";
import { lensSchema } from "./schemas.js";

describe("buildInstructions", () => {
  it("produces a distinct instruction set per lens", () => {
    const all = lensSchema.options.map((lens) => buildInstructions(lens));
    expect(new Set(all).size).toBe(lensSchema.options.length);
  });

  it("embeds the lens focus and the shared reviewer core", () => {
    const security = buildInstructions("security");
    expect(security).toContain("Focus on security");
    expect(security).toContain("getFileContext");
    expect(security).toContain("absolute 1-based line numbers");
  });
});

describe("buildPrompt", () => {
  it("renders a diff unit with post-change line guidance", () => {
    const prompt = buildPrompt({ kind: "diff", diff: "--- a\n+++ b\n@@ -1 +1 @@" });
    expect(prompt).toContain("unified diff");
    expect(prompt).toContain("@@ -1 +1 @@");
  });

  it("renders a file unit with its path", () => {
    const prompt = buildPrompt({ kind: "file", path: "src/a.ts", content: "const x = 1;" });
    expect(prompt).toContain("`src/a.ts`");
    expect(prompt).toContain("const x = 1;");
  });

  it("renders a hunk unit with its absolute startLine", () => {
    const prompt = buildPrompt({ kind: "hunk", path: "src/a.ts", content: "x", startLine: 42 });
    expect(prompt).toContain("absolute file line 42");
    expect(prompt).toContain("`src/a.ts`");
  });
});
