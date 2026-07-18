import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderSkillsSyncReport, runSkillsSyncCheck, type SkillsSyncResult } from "../scripts/lib/skills-sync-checker";
import type { SkillsSyncConfig } from "../scripts/lib/skills-sync-config";

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

const ALPHA = "# alpha\nstable body\n";
const EXT_UPSTREAM = "# ext\nupstream body\n";
const EXT_EXTENDED = `${EXT_UPSTREAM}\n## local extension\nSENTINEL-A\nSENTINEL-B\n`;
const ADAPTED_CLAUDE = "# adapted\nread CLAUDE.md for the rules\nend\n";
const ADAPTED_AGENTS = "# adapted\nread AGENTS.md for the rules\nend\n";
const FORMATTED_UPSTREAM = "# formatted\n*upstream* flavor\n";
const FORMATTED_ON_DISK = "# formatted\n_upstream_ flavor\n";
const LOCK = "# lock-bootstrap skill\n";
const PERSONAL = "# personal skill\n";
const PROMPT = "prompt body\n";

const CONFIG: SkillsSyncConfig = {
  claudeSkillsDir: ".claude/skills",
  agentsSkillsDir: ".agents/skills",
  manifestPath: ".claude/.10x-cli-manifest.json",
  claudePromptsDir: ".claude/prompts",
  lockBootstrapSkills: ["lockskill"],
  extendedSkills: [{ path: "ext/SKILL.md", sentinels: ["SENTINEL-A", "SENTINEL-B"] }],
  manualParityFiles: [{ path: "ext/SKILL.user.md", sentinels: ["SENTINEL-A"] }],
  adaptedLines: {
    "adapted/SKILL.md": [{ claude: "read CLAUDE.md for the rules", agents: "read AGENTS.md for the rules" }],
  },
  acceptedLocalHashes: {
    ".claude/skills/formatted/SKILL.md": sha256(FORMATTED_ON_DISK),
  },
};

const MANIFEST = JSON.stringify({
  files: {
    skills: {
      alpha: { files: ["SKILL.md"], contentHashes: { "SKILL.md": sha256(ALPHA) } },
      // Extended skill: the manifest still carries the UPSTREAM hash, so the
      // healthy on-disk state (extension present) MISMATCHES the manifest.
      ext: { files: ["SKILL.md"], contentHashes: { "SKILL.md": sha256(EXT_UPSTREAM) } },
      adapted: { files: ["SKILL.md"], contentHashes: { "SKILL.md": sha256(ADAPTED_CLAUDE) } },
      // Formatter-noise case: disk deviates from the manifest but its exact
      // bytes are pinned in acceptedLocalHashes.
      formatted: { files: ["SKILL.md"], contentHashes: { "SKILL.md": sha256(FORMATTED_UPSTREAM) } },
    },
    prompts: ["p1.md"],
    configs: [],
    promptHashes: { "p1.md": sha256(PROMPT) },
  },
});

let root: string;

function write(rel: string, content: string): void {
  const abs = join(root, ...rel.split("/"));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

function findingsOf(result: SkillsSyncResult) {
  if (!result.ok) throw new Error(`expected ok result, got environment error: ${result.environmentError}`);
  return result.findings;
}

describe("runSkillsSyncCheck", () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "skills-sync-"));
    write(".claude/.10x-cli-manifest.json", MANIFEST);
    write(".claude/prompts/p1.md", PROMPT);
    for (const tree of [".claude/skills", ".agents/skills"]) {
      write(`${tree}/alpha/SKILL.md`, ALPHA);
      write(`${tree}/ext/SKILL.md`, EXT_EXTENDED);
      write(`${tree}/ext/SKILL.user.md`, EXT_EXTENDED);
      write(`${tree}/formatted/SKILL.md`, FORMATTED_ON_DISK);
      write(`${tree}/lockskill/SKILL.md`, LOCK);
      write(`${tree}/personal/SKILL.md`, PERSONAL);
    }
    write(".claude/skills/adapted/SKILL.md", ADAPTED_CLAUDE);
    write(".agents/skills/adapted/SKILL.md", ADAPTED_AGENTS);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("reports zero findings on a clean fixture", () => {
    expect(findingsOf(runSkillsSyncCheck(root, CONFIG))).toEqual([]);
  });

  it("signal 1: flags a skill missing from one tree", () => {
    rmSync(join(root, ".agents", "skills", "alpha"), { recursive: true });
    const findings = findingsOf(runSkillsSyncCheck(root, CONFIG));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      signal: 1,
      kind: "missing-in-tree",
      fileClass: "manifest-managed",
      path: ".agents/skills/alpha/SKILL.md",
    });
  });

  it("signal 1: flags a manifest-listed file missing from BOTH trees (dir-diff alone cannot see it)", () => {
    rmSync(join(root, ".claude", "skills", "alpha"), { recursive: true });
    rmSync(join(root, ".agents", "skills", "alpha"), { recursive: true });
    const findings = findingsOf(runSkillsSyncCheck(root, CONFIG));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      signal: 1,
      kind: "missing-from-disk",
      path: ".claude/skills/alpha/SKILL.md",
    });
  });

  it("signal 2: flags an unauthorized local edit of a normal managed file", () => {
    const edited = "# alpha\nlocally edited body\n";
    write(".claude/skills/alpha/SKILL.md", edited);
    write(".agents/skills/alpha/SKILL.md", edited); // keep the pair equal → only signal 2 fires
    const findings = findingsOf(runSkillsSyncCheck(root, CONFIG));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      signal: 2,
      kind: "unauthorized-edit",
      fileClass: "manifest-managed",
      path: ".claude/skills/alpha/SKILL.md",
    });
  });

  it("signal 2 inverted: a manifest MATCH on an extended skill means the extension was wiped", () => {
    write(".claude/skills/ext/SKILL.md", EXT_UPSTREAM);
    write(".agents/skills/ext/SKILL.md", EXT_UPSTREAM);
    const findings = findingsOf(runSkillsSyncCheck(root, CONFIG));
    expect(
      findings.some(
        (finding) =>
          finding.signal === 2 && finding.kind === "extension-wiped" && finding.path === ".claude/skills/ext/SKILL.md",
      ),
    ).toBe(true);
    // The wipe also removed the sentinels from SKILL.md in both trees.
    expect(findings.filter((finding) => finding.kind === "missing-sentinel")).toHaveLength(4);
  });

  it("signal 2: a manifest mismatch pinned in acceptedLocalHashes is clean, but a further edit alarms", () => {
    // Clean-fixture test already proves the pinned deviation itself is silent.
    const edited = "# formatted\nsomething else entirely\n";
    write(".claude/skills/formatted/SKILL.md", edited);
    write(".agents/skills/formatted/SKILL.md", edited); // keep the pair equal → only signal 2 fires
    const findings = findingsOf(runSkillsSyncCheck(root, CONFIG));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      signal: 2,
      kind: "unauthorized-edit",
      path: ".claude/skills/formatted/SKILL.md",
    });
  });

  it("signal 2: flags an edited manifest-tracked prompt", () => {
    write(".claude/prompts/p1.md", "tampered prompt\n");
    const findings = findingsOf(runSkillsSyncCheck(root, CONFIG));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      signal: 2,
      kind: "unauthorized-edit",
      path: ".claude/prompts/p1.md",
    });
  });

  it("signal 3+4: flags a sentinel removed from one tree", () => {
    write(".agents/skills/ext/SKILL.md", EXT_EXTENDED.replace("SENTINEL-B\n", ""));
    const findings = findingsOf(runSkillsSyncCheck(root, CONFIG));
    expect(
      findings.some(
        (finding) =>
          finding.signal === 3 &&
          finding.kind === "missing-sentinel" &&
          finding.path === ".agents/skills/ext/SKILL.md" &&
          finding.detail.includes("SENTINEL-B"),
      ),
    ).toBe(true);
    expect(findings.some((finding) => finding.signal === 4 && finding.kind === "content-drift")).toBe(true);
  });

  it("signal 3: checks sentinels in manual-parity files too", () => {
    write(".agents/skills/ext/SKILL.user.md", EXT_EXTENDED.replace("SENTINEL-A\n", "AAAAaaaaaa\n"));
    const findings = findingsOf(runSkillsSyncCheck(root, CONFIG));
    expect(
      findings.some(
        (finding) =>
          finding.signal === 3 &&
          finding.kind === "missing-sentinel" &&
          finding.fileClass === "personal-manual" &&
          finding.path === ".agents/skills/ext/SKILL.user.md",
      ),
    ).toBe(true);
  });

  it("signal 4: flags pair drift on a file without an allowlist entry", () => {
    write(".agents/skills/personal/SKILL.md", "# personal skill (edited)\n");
    const findings = findingsOf(runSkillsSyncCheck(root, CONFIG));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      signal: 4,
      kind: "content-drift",
      fileClass: "personal-manual",
      path: ".agents/skills/personal/SKILL.md",
    });
  });

  it("signal 4: flags a substitution that does not match the allowlist", () => {
    write(".agents/skills/adapted/SKILL.md", "# adapted\nread OTHER.md for the rules\nend\n");
    const findings = findingsOf(runSkillsSyncCheck(root, CONFIG));
    expect(findings.some((finding) => finding.signal === 4 && finding.kind === "content-drift")).toBe(true);
    expect(findings.some((finding) => finding.signal === 4 && finding.kind === "adaptation-missing")).toBe(true);
  });

  it("signal 4: flags a wiped adaptation (pair byte-equal despite an allowlist entry)", () => {
    write(".agents/skills/adapted/SKILL.md", ADAPTED_CLAUDE);
    const findings = findingsOf(runSkillsSyncCheck(root, CONFIG));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      signal: 4,
      kind: "adaptation-missing",
      path: ".agents/skills/adapted/SKILL.md",
    });
  });

  it("signal 4: flags a line-count change in an adapted pair", () => {
    write(".agents/skills/adapted/SKILL.md", `${ADAPTED_AGENTS}extra trailing line\n`);
    const findings = findingsOf(runSkillsSyncCheck(root, CONFIG));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ signal: 4, kind: "content-drift" });
    expect(findings[0].detail).toContain("line count differs");
  });

  it("returns an environment error (not drift) for an unreadable manifest", () => {
    write(".claude/.10x-cli-manifest.json", "not json{");
    const result = runSkillsSyncCheck(root, CONFIG);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.environmentError).toMatch(/manifest/);
  });

  it("returns an environment error when a skills tree is missing", () => {
    rmSync(join(root, ".agents"), { recursive: true, force: true });
    const result = runSkillsSyncCheck(root, CONFIG);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.environmentError).toContain(".agents/skills");
  });

  it("renders an OK report for a clean result", () => {
    const report = renderSkillsSyncReport(runSkillsSyncCheck(root, CONFIG));
    expect(report).toContain("OK: no drift detected");
  });

  it("renders findings grouped by file class with next-step hints", () => {
    rmSync(join(root, ".agents", "skills", "alpha"), { recursive: true });
    write(".agents/skills/personal/SKILL.md", "# personal skill (edited)\n");
    const report = renderSkillsSyncReport(runSkillsSyncCheck(root, CONFIG));
    expect(report).toContain("Manifest-managed files");
    expect(report).toContain("Personal skills + manual files");
    expect(report).toContain(".agents/skills/alpha/SKILL.md");
    expect(report).toContain("next: ");
    expect(report).toContain("DRIFT: 2 finding(s)");
  });

  it("renders the environment error message", () => {
    write(".claude/.10x-cli-manifest.json", "not json{");
    expect(renderSkillsSyncReport(runSkillsSyncCheck(root, CONFIG))).toMatch(/^Environment error:/);
  });
});
