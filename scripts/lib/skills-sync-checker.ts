/**
 * Pure logic for the skills-sync checker (`scripts/check-skills-sync.ts`).
 * Four read-only signals over the two managed skill trees, in order of value:
 *
 *   1. presence — recursive dir-diff of both trees + every manifest-listed
 *      file exists on disk
 *   2. hash — sha256 of raw bytes vs the `10x get` manifest baseline
 *      (INVERTED for locally-extended files: a manifest MATCH means the local
 *      extension was wiped)
 *   3. sentinel — extension marker phrases present in both trees
 *   4. parity — file pairs byte-equal, except allowlisted per-tool adaptation
 *      lines (exact 1:1 line substitutions)
 *
 * The repo root and contract data are injected as parameters (no process
 * state, no hardcoded paths) so every branch is unit-testable on temp-dir
 * fixtures. Findings (drift → exit 1 at the CLI) are distinct from
 * environment errors (missing tree / unreadable manifest → exit 2).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import type { AdaptedLinePair, SkillsSyncConfig } from "./skills-sync-config";

export type FileClass = "manifest-managed" | "lock-bootstrap" | "personal-manual";

export type FindingKind =
  | "missing-in-tree"
  | "missing-from-disk"
  | "unauthorized-edit"
  | "extension-wiped"
  | "missing-sentinel"
  | "content-drift"
  | "adaptation-missing";

export interface SyncFinding {
  signal: 1 | 2 | 3 | 4;
  kind: FindingKind;
  fileClass: FileClass;
  /** Repo-relative path of the offending file (posix separators). */
  path: string;
  detail: string;
}

export interface SyncStats {
  /** Files listed across both trees. */
  treeFiles: number;
  /** Files whose sha256 was compared against the manifest baseline. */
  hashedFiles: number;
  /** Files checked for extension sentinels. */
  sentinelFiles: number;
  /** File pairs compared across the trees. */
  comparedPairs: number;
}

export type SkillsSyncResult =
  | { ok: true; findings: SyncFinding[]; stats: SyncStats }
  | { ok: false; environmentError: string };

interface ParsedManifest {
  /** skill name → file (skill-relative) → sha256 of raw bytes. */
  skillHashes: Map<string, Map<string, string>>;
  /** prompt filename → sha256 of raw bytes. */
  promptHashes: Map<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function shorten(text: string, max = 72): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function parseManifest(rawJson: string): ParsedManifest {
  let data: unknown;
  try {
    data = JSON.parse(rawJson);
  } catch (error) {
    throw new Error(`not valid JSON (${errorMessage(error)})`);
  }

  const files = isRecord(data) ? data.files : undefined;
  const skills = isRecord(files) ? files.skills : undefined;
  if (!isRecord(files) || !isRecord(skills)) {
    throw new Error("no files.skills map found");
  }

  const skillHashes = new Map<string, Map<string, string>>();
  for (const [skill, entry] of Object.entries(skills)) {
    const contentHashes = isRecord(entry) ? entry.contentHashes : undefined;
    if (!isRecord(contentHashes)) {
      throw new Error(`skill entry "${skill}" has no contentHashes map`);
    }
    const hashes = new Map<string, string>();
    for (const [file, hash] of Object.entries(contentHashes)) {
      if (typeof hash !== "string") {
        throw new Error(`hash for "${skill}/${file}" is not a string`);
      }
      hashes.set(file, hash);
    }
    skillHashes.set(skill, hashes);
  }

  const promptHashes = new Map<string, string>();
  const rawPromptHashes = files.promptHashes;
  if (isRecord(rawPromptHashes)) {
    for (const [file, hash] of Object.entries(rawPromptHashes)) {
      if (typeof hash === "string") promptHashes.set(file, hash);
    }
  }

  return { skillHashes, promptHashes };
}

/** Recursively list a tree's files as sorted tree-relative posix paths. */
function listTreeFiles(treeRoot: string): string[] {
  const files: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else files.push(rel);
    }
  };
  walk(treeRoot, "");
  return files.sort();
}

export function runSkillsSyncCheck(root: string, config: SkillsSyncConfig): SkillsSyncResult {
  const claudeTreeRoot = join(root, config.claudeSkillsDir);
  const agentsTreeRoot = join(root, config.agentsSkillsDir);
  const manifestAbs = join(root, config.manifestPath);

  // Environment gate — anything failing here is exit-2 territory, not drift.
  for (const [label, dir] of [
    [config.claudeSkillsDir, claudeTreeRoot],
    [config.agentsSkillsDir, agentsTreeRoot],
  ] as const) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      return { ok: false, environmentError: `skills tree missing: ${label}` };
    }
  }
  if (!existsSync(manifestAbs)) {
    return { ok: false, environmentError: `manifest missing: ${config.manifestPath}` };
  }
  let manifest: ParsedManifest;
  try {
    manifest = parseManifest(readFileSync(manifestAbs, "utf8"));
  } catch (error) {
    return { ok: false, environmentError: `unreadable manifest ${config.manifestPath}: ${errorMessage(error)}` };
  }

  const findings: SyncFinding[] = [];
  const claudeFiles = listTreeFiles(claudeTreeRoot);
  const agentsFiles = listTreeFiles(agentsTreeRoot);
  const claudeSet = new Set(claudeFiles);
  const agentsSet = new Set(agentsFiles);
  const manifestSkills = new Set(manifest.skillHashes.keys());
  const manualParityPaths = new Set(config.manualParityFiles.map((file) => file.path));

  const classify = (treePath: string): FileClass => {
    if (manualParityPaths.has(treePath)) return "personal-manual";
    const skill = treePath.split("/")[0];
    if (manifestSkills.has(skill)) return "manifest-managed";
    if (config.lockBootstrapSkills.includes(skill)) return "lock-bootstrap";
    return "personal-manual";
  };

  // Signal 1 — presence: dir-diff of the full file sets of both trees.
  for (const file of claudeFiles) {
    if (!agentsSet.has(file)) {
      findings.push({
        signal: 1,
        kind: "missing-in-tree",
        fileClass: classify(file),
        path: `${config.agentsSkillsDir}/${file}`,
        detail: `present in ${config.claudeSkillsDir} but missing here`,
      });
    }
  }
  for (const file of agentsFiles) {
    if (!claudeSet.has(file)) {
      findings.push({
        signal: 1,
        kind: "missing-in-tree",
        fileClass: classify(file),
        path: `${config.claudeSkillsDir}/${file}`,
        detail: `present in ${config.agentsSkillsDir} but missing here`,
      });
    }
  }
  // Signal 1 — presence: every manifest-listed file exists in the .claude tree
  // (catches a file deleted from BOTH trees, which the dir-diff cannot see).
  for (const [skill, hashes] of manifest.skillHashes) {
    for (const file of hashes.keys()) {
      const rel = `${skill}/${file}`;
      if (!claudeSet.has(rel)) {
        findings.push({
          signal: 1,
          kind: "missing-from-disk",
          fileClass: "manifest-managed",
          path: `${config.claudeSkillsDir}/${rel}`,
          detail: "listed in the 10x-cli manifest but absent from the tree",
        });
      }
    }
  }

  // Signal 2 — hash-check of the .claude tree against the manifest baseline.
  const extendedPaths = new Set(config.extendedSkills.map((file) => file.path));
  let hashedFiles = 0;
  for (const [skill, hashes] of manifest.skillHashes) {
    for (const [file, expected] of hashes) {
      const rel = `${skill}/${file}`;
      if (!claudeSet.has(rel)) continue; // absence already reported by signal 1
      const repoPath = `${config.claudeSkillsDir}/${rel}`;
      const actual = sha256(readFileSync(join(claudeTreeRoot, rel)));
      hashedFiles += 1;
      if (extendedPaths.has(rel)) {
        if (actual === expected) {
          findings.push({
            signal: 2,
            kind: "extension-wiped",
            fileClass: "manifest-managed",
            path: repoPath,
            detail:
              "content matches the upstream manifest hash — the local extension was wiped (a healthy extended file MISMATCHES the manifest)",
          });
        }
      } else if (actual !== expected && actual !== config.acceptedLocalHashes[repoPath]) {
        findings.push({
          signal: 2,
          kind: "unauthorized-edit",
          fileClass: "manifest-managed",
          path: repoPath,
          detail:
            "sha256 matches neither the last `10x get` baseline nor an accepted-local pin — unauthorized local edit",
        });
      }
    }
  }
  for (const [file, expected] of manifest.promptHashes) {
    const abs = join(root, config.claudePromptsDir, file);
    const repoPath = `${config.claudePromptsDir}/${file}`;
    if (!existsSync(abs)) {
      findings.push({
        signal: 2,
        kind: "missing-from-disk",
        fileClass: "manifest-managed",
        path: repoPath,
        detail: "prompt listed in the 10x-cli manifest but absent from disk",
      });
      continue;
    }
    hashedFiles += 1;
    const actual = sha256(readFileSync(abs));
    if (actual !== expected && actual !== config.acceptedLocalHashes[repoPath]) {
      findings.push({
        signal: 2,
        kind: "unauthorized-edit",
        fileClass: "manifest-managed",
        path: repoPath,
        detail:
          "sha256 matches neither the last `10x get` baseline nor an accepted-local pin — unauthorized local edit",
      });
    }
  }

  // Signal 3 — extension sentinels present in BOTH trees.
  const sentinelFiles = [...config.extendedSkills, ...config.manualParityFiles];
  for (const { path: rel, sentinels } of sentinelFiles) {
    for (const [treeDir, treeRoot] of [
      [config.claudeSkillsDir, claudeTreeRoot],
      [config.agentsSkillsDir, agentsTreeRoot],
    ] as const) {
      const abs = join(treeRoot, rel);
      if (!existsSync(abs)) continue; // absence already reported by signal 1
      const text = readFileSync(abs, "utf8");
      for (const phrase of sentinels) {
        if (!text.includes(phrase)) {
          findings.push({
            signal: 3,
            kind: "missing-sentinel",
            fileClass: classify(rel),
            path: `${treeDir}/${rel}`,
            detail: `extension sentinel not found: ${JSON.stringify(shorten(phrase))}`,
          });
        }
      }
    }
  }

  // Signal 4 — pair parity: byte-equal, or 1:1 substitutions from the allowlist.
  const adaptedAllowlists = new Map(Object.entries(config.adaptedLines));
  let comparedPairs = 0;
  for (const rel of claudeFiles) {
    if (!agentsSet.has(rel)) continue;
    comparedPairs += 1;
    const claudeBytes = readFileSync(join(claudeTreeRoot, rel));
    const agentsBytes = readFileSync(join(agentsTreeRoot, rel));
    const allowlist = adaptedAllowlists.get(rel);
    const pairPath = `${config.agentsSkillsDir}/${rel}`;

    if (allowlist === undefined) {
      if (!claudeBytes.equals(agentsBytes)) {
        findings.push({
          signal: 4,
          kind: "content-drift",
          fileClass: classify(rel),
          path: pairPath,
          detail: `differs from its ${config.claudeSkillsDir} twin (file has no adaptation allowlist entry)`,
        });
      }
      continue;
    }

    const claudeLines = claudeBytes.toString("utf8").split("\n");
    const agentsLines = agentsBytes.toString("utf8").split("\n");
    if (claudeLines.length !== agentsLines.length) {
      findings.push({
        signal: 4,
        kind: "content-drift",
        fileClass: classify(rel),
        path: pairPath,
        detail: `line count differs from its twin (${String(claudeLines.length)} vs ${String(agentsLines.length)}) — adaptations must be 1:1 line substitutions`,
      });
      continue;
    }
    const observed = new Set<AdaptedLinePair>();
    for (let i = 0; i < claudeLines.length; i += 1) {
      if (claudeLines[i] === agentsLines[i]) continue;
      const match = allowlist.find((pair) => pair.claude === claudeLines[i] && pair.agents === agentsLines[i]);
      if (match === undefined) {
        findings.push({
          signal: 4,
          kind: "content-drift",
          fileClass: classify(rel),
          path: pairPath,
          detail: `line ${String(i + 1)} differs outside the adaptation allowlist: ${JSON.stringify(shorten(agentsLines[i]))}`,
        });
      } else {
        observed.add(match);
      }
    }
    for (const pair of allowlist) {
      if (!observed.has(pair)) {
        findings.push({
          signal: 4,
          kind: "adaptation-missing",
          fileClass: classify(rel),
          path: pairPath,
          detail: `expected per-tool adaptation not found: ${JSON.stringify(shorten(pair.agents))}`,
        });
      }
    }
  }

  return {
    ok: true,
    findings,
    stats: {
      treeFiles: claudeFiles.length + agentsFiles.length,
      hashedFiles,
      sentinelFiles: sentinelFiles.length,
      comparedPairs,
    },
  };
}

const FILE_CLASS_HEADERS: Record<FileClass, string> = {
  "manifest-managed": "Manifest-managed files (baseline: the 10x-cli manifest)",
  "lock-bootstrap": "Lock-bootstrap skills (from the starter's skills-lock.json — no hash baseline)",
  "personal-manual": "Personal skills + manual files (tree parity only)",
};

const NEXT_HINTS: Record<FindingKind, string> = {
  "missing-in-tree":
    "re-sync the file from the other tree (1:1 copy, then re-apply per-tool adaptations if it has any).",
  "missing-from-disk": "restore the file — re-run `10x get` for the current lesson, or recover it from git history.",
  "unauthorized-edit":
    "revert the local edit (`git checkout -- <path>`), or accept that the next `10x get` overwrites it.",
  "extension-wiped": "restore the local extension from git history using the fallback spec in AGENTS.md.",
  "missing-sentinel":
    "restore the extension block from the fallback spec in AGENTS.md — the phrase must exist in both trees.",
  "content-drift":
    "inspect the pair (`git diff --no-index .claude/skills .agents/skills`) and re-sync; extend the adaptation allowlist only for deliberate per-tool changes.",
  "adaptation-missing": "re-apply the per-tool adaptation to the `.agents` copy (a 1:1 copy likely overwrote it).",
};

export function renderSkillsSyncReport(result: SkillsSyncResult): string {
  if (!result.ok) {
    return `Environment error: ${result.environmentError}`;
  }

  const { findings, stats } = result;
  const lines: string[] = ["skills-sync check — .claude/skills ↔ .agents/skills", ""];
  if (findings.length === 0) {
    lines.push(
      `OK: no drift detected (${String(stats.treeFiles)} tree files, ${String(stats.comparedPairs)} pairs compared, ${String(stats.hashedFiles)} files hashed against the manifest, ${String(stats.sentinelFiles)} sentinel files).`,
    );
    return lines.join("\n");
  }

  for (const fileClass of ["manifest-managed", "lock-bootstrap", "personal-manual"] as const) {
    const group = findings.filter((finding) => finding.fileClass === fileClass);
    if (group.length === 0) continue;
    lines.push(`${FILE_CLASS_HEADERS[fileClass]}:`);
    for (const finding of group) {
      lines.push(`  [signal ${String(finding.signal)} · ${finding.kind}] ${finding.path}`);
      lines.push(`      ${finding.detail}`);
      lines.push(`      next: ${NEXT_HINTS[finding.kind]}`);
    }
    lines.push("");
  }
  lines.push(`DRIFT: ${String(findings.length)} finding(s). Fix by hand — this checker never writes.`);
  return lines.join("\n");
}
