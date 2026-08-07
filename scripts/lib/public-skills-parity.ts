/**
 * Pure logic for the PUBLIC skills-parity check (`scripts/check-skills-sync.ts`).
 *
 * This repo publishes only an allowlist of skills (course rule: 10x-Workflow
 * skills stay unpublished; `10x-impl-review-ci` is the explicitly permitted
 * exception, plus registry-sourced non-course skills). For those public
 * skills the two managed trees (`.claude/skills` ↔ `.agents/skills`) must
 * stay byte-identical pairs. The richer course-workflow checker (manifest
 * hash baselines, extension sentinels, per-tool adaptation allowlists) lives
 * OUTSIDE the public repo in gitignored `scripts/local/` — its config quotes
 * course-skill content and must not be published.
 *
 * Root and options are injected so every branch is unit-testable on temp-dir
 * fixtures. Findings (drift → exit 1) are distinct from environment errors
 * (missing tree → exit 2).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export type ParityFindingKind = "missing-skill" | "missing-in-tree" | "content-drift";

export interface ParityFinding {
  kind: ParityFindingKind;
  /** Repo-relative path of the offending skill dir or file (posix separators). */
  path: string;
  detail: string;
}

export interface ParityOptions {
  /** Repo-relative path of the Claude Code skills tree. */
  claudeSkillsDir: string;
  /** Repo-relative path of the Codex skills tree. */
  agentsSkillsDir: string;
}

export type ParityResult =
  { ok: true; findings: ParityFinding[]; comparedFiles: number } | { ok: false; environmentError: string };

/** Recursively list a dir's files as sorted dir-relative posix paths. */
function listFiles(dirRoot: string): string[] {
  const files: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else files.push(rel);
    }
  };
  walk(dirRoot, "");
  return files.sort();
}

export function checkPublicSkillsParity(root: string, publicSkills: string[], options: ParityOptions): ParityResult {
  const trees = [
    [options.claudeSkillsDir, join(root, options.claudeSkillsDir)],
    [options.agentsSkillsDir, join(root, options.agentsSkillsDir)],
  ] as const;
  for (const [label, dir] of trees) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      return { ok: false, environmentError: `skills tree missing: ${label}` };
    }
  }

  const findings: ParityFinding[] = [];
  let comparedFiles = 0;

  for (const skill of publicSkills) {
    const claudeDir = join(root, options.claudeSkillsDir, skill);
    const agentsDir = join(root, options.agentsSkillsDir, skill);
    const missingSomewhere = [
      [claudeDir, options.claudeSkillsDir],
      [agentsDir, options.agentsSkillsDir],
    ] as const;
    let missing = false;
    for (const [dir, treeLabel] of missingSomewhere) {
      if (!existsSync(dir)) {
        findings.push({
          kind: "missing-skill",
          path: `${treeLabel}/${skill}`,
          detail: "public skill directory missing from this tree",
        });
        missing = true;
      }
    }
    if (missing) continue;

    const claudeFiles = listFiles(claudeDir);
    const agentsFiles = listFiles(agentsDir);
    const claudeSet = new Set(claudeFiles);
    const agentsSet = new Set(agentsFiles);

    for (const file of claudeFiles) {
      if (!agentsSet.has(file)) {
        findings.push({
          kind: "missing-in-tree",
          path: `${options.agentsSkillsDir}/${skill}/${file}`,
          detail: `present in ${options.claudeSkillsDir} but missing here`,
        });
      }
    }
    for (const file of agentsFiles) {
      if (!claudeSet.has(file)) {
        findings.push({
          kind: "missing-in-tree",
          path: `${options.claudeSkillsDir}/${skill}/${file}`,
          detail: `present in ${options.agentsSkillsDir} but missing here`,
        });
      }
    }
    for (const file of claudeFiles) {
      if (!agentsSet.has(file)) continue;
      comparedFiles += 1;
      const claudeBytes = readFileSync(join(claudeDir, file));
      const agentsBytes = readFileSync(join(agentsDir, file));
      if (!claudeBytes.equals(agentsBytes)) {
        findings.push({
          kind: "content-drift",
          path: `${options.agentsSkillsDir}/${skill}/${file}`,
          detail: `differs byte-wise from its ${options.claudeSkillsDir} twin (public pairs carry no adaptations)`,
        });
      }
    }
  }

  return { ok: true, findings, comparedFiles };
}

export function renderParityReport(publicSkills: string[], result: ParityResult): string {
  if (!result.ok) {
    return `Environment error: ${result.environmentError}`;
  }
  const lines: string[] = [
    `public skills-parity check — ${String(publicSkills.length)} allowlisted skill(s), .claude/skills ↔ .agents/skills`,
    "",
  ];
  if (result.findings.length === 0) {
    lines.push(`OK: no drift (${String(result.comparedFiles)} file pairs byte-compared).`);
    return lines.join("\n");
  }
  for (const finding of result.findings) {
    lines.push(`  [${finding.kind}] ${finding.path}`);
    lines.push(`      ${finding.detail}`);
  }
  lines.push("");
  lines.push(`DRIFT: ${String(result.findings.length)} finding(s). Fix by hand — this checker never writes.`);
  return lines.join("\n");
}
