import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkPublicSkillsParity, renderParityReport, type ParityResult } from "../scripts/lib/public-skills-parity";

const OPTIONS = { claudeSkillsDir: ".claude/skills", agentsSkillsDir: ".agents/skills" };

let root: string;

const write = (relPath: string, content: string): void => {
  const abs = join(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
};

const writePair = (skill: string, file: string, content: string): void => {
  write(`${OPTIONS.claudeSkillsDir}/${skill}/${file}`, content);
  write(`${OPTIONS.agentsSkillsDir}/${skill}/${file}`, content);
};

const okResult = (result: ParityResult): Extract<ParityResult, { ok: true }> => {
  if (!result.ok) throw new Error(`expected ok result, got: ${result.environmentError}`);
  return result;
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "skills-parity-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("checkPublicSkillsParity", () => {
  it("passes on byte-identical pairs (including nested reference files)", () => {
    writePair("alpha", "SKILL.md", "# alpha\n");
    writePair("alpha", "references/deep.md", "nested\n");
    const result = okResult(checkPublicSkillsParity(root, ["alpha"], OPTIONS));
    expect(result.findings).toEqual([]);
    expect(result.comparedFiles).toBe(2);
  });

  it("reports a missing tree as an environment error, not drift", () => {
    write(`${OPTIONS.claudeSkillsDir}/alpha/SKILL.md`, "# alpha\n");
    const result = checkPublicSkillsParity(root, ["alpha"], OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.environmentError).toContain(".agents/skills");
  });

  it("flags a public skill missing from one tree", () => {
    write(`${OPTIONS.claudeSkillsDir}/alpha/SKILL.md`, "# alpha\n");
    mkdirSync(join(root, OPTIONS.agentsSkillsDir), { recursive: true });
    const result = okResult(checkPublicSkillsParity(root, ["alpha"], OPTIONS));
    expect(result.findings).toEqual([expect.objectContaining({ kind: "missing-skill", path: ".agents/skills/alpha" })]);
  });

  it("flags a file present in only one tree, in either direction", () => {
    writePair("alpha", "SKILL.md", "# alpha\n");
    write(`${OPTIONS.claudeSkillsDir}/alpha/only-claude.md`, "c\n");
    write(`${OPTIONS.agentsSkillsDir}/alpha/only-agents.md`, "a\n");
    const result = okResult(checkPublicSkillsParity(root, ["alpha"], OPTIONS));
    expect(result.findings).toHaveLength(2);
    expect(result.findings.map((f) => f.path).sort()).toEqual([
      ".agents/skills/alpha/only-claude.md",
      ".claude/skills/alpha/only-agents.md",
    ]);
    expect(result.findings.every((f) => f.kind === "missing-in-tree")).toBe(true);
  });

  it("flags byte drift between a pair (public pairs carry no adaptations)", () => {
    writePair("alpha", "SKILL.md", "# alpha\n");
    write(`${OPTIONS.agentsSkillsDir}/alpha/SKILL.md`, "# alpha (edited)\n");
    const result = okResult(checkPublicSkillsParity(root, ["alpha"], OPTIONS));
    expect(result.findings).toEqual([
      expect.objectContaining({ kind: "content-drift", path: ".agents/skills/alpha/SKILL.md" }),
    ]);
  });

  it("ignores non-allowlisted skills entirely (local course skills may differ)", () => {
    writePair("alpha", "SKILL.md", "# alpha\n");
    write(`${OPTIONS.claudeSkillsDir}/10x-local-only/SKILL.md`, "# local claude flavor\n");
    const result = okResult(checkPublicSkillsParity(root, ["alpha"], OPTIONS));
    expect(result.findings).toEqual([]);
  });
});

describe("renderParityReport", () => {
  it("renders OK with the compared-pair count", () => {
    writePair("alpha", "SKILL.md", "# alpha\n");
    const report = renderParityReport(["alpha"], checkPublicSkillsParity(root, ["alpha"], OPTIONS));
    expect(report).toContain("OK: no drift (1 file pairs byte-compared)");
  });

  it("renders findings with kind, path, and a DRIFT summary line", () => {
    writePair("alpha", "SKILL.md", "# alpha\n");
    write(`${OPTIONS.agentsSkillsDir}/alpha/SKILL.md`, "# drifted\n");
    const report = renderParityReport(["alpha"], checkPublicSkillsParity(root, ["alpha"], OPTIONS));
    expect(report).toContain("[content-drift] .agents/skills/alpha/SKILL.md");
    expect(report).toContain("DRIFT: 1 finding(s)");
  });

  it("renders environment errors distinctly", () => {
    const report = renderParityReport(["alpha"], checkPublicSkillsParity(root, ["alpha"], OPTIONS));
    expect(report).toContain("Environment error: skills tree missing");
  });
});
