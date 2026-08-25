/**
 * Blind-comparison staging for the `gauntlet-loop` skill.
 *
 * WHY A MODULE AND NOT A SHELL SNIPPET. The procedure has to run identically in
 * this repo's two shells (PowerShell is primary; the Bash tool is Git Bash), and
 * `sha256sum` exists in only one of them. It also has to be impossible to get
 * subtly wrong — a staging bug does not fail loudly, it silently produces a
 * comparison that was never blind.
 *
 * THE MAPPING IS NEVER WRITTEN DOWN. An earlier design put `{"ours":"A"}` in a
 * sibling directory; a subagent shares the filesystem, so "the critic is not told
 * the path" is obscurity, not isolation. Instead nothing records which side is
 * ours: after the verdict the lead recovers it by hashing the two staged files
 * against the reference (`revealSide`). The answer is derivable but never stored.
 *
 * IT ONLY EVER WRITES UNDER `scratchpad/gauntlet/`. The round directory arrives as
 * a string an agent typed, and this helper's whole job is to copy files into it —
 * a slipped `--round` is a silent overwrite of `context/archive/` (immutable by
 * hard rule) or of the checkout itself. `resolveRoundDir` therefore resolves
 * symlinks before deciding, and refuses a directory that already holds files,
 * since the directory a critic is handed must contain exactly two.
 *
 * RESIDUAL LIMITATION, STATED HONESTLY: a critic with filesystem access can still
 * de-blind itself by hashing the staged files against the frozen reference it can
 * find on disk. Blinding here defends against a critic's incidental bias toward
 * work it recognises as "ours"; it is not a sandbox and does not survive an
 * adversarial critic. For that, run the critic where only the round directory is
 * reachable.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type Side = "A" | "B";

/** File-size disparity beyond this ratio is a tell on a directory listing. */
const SIZE_TELL_RATIO = 4;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The only tree this helper may write into. Gitignored — this repo is public. */
export const STAGING_ROOT = join(REPO_ROOT, "scratchpad", "gauntlet");

export const otherSide = (side: Side): Side => (side === "A" ? "B" : "A");

/**
 * Pick the side our artifact goes to. Injectable RNG for tests only — callers
 * must leave it unset so the choice stays unpredictable. Never derive this from
 * the round number: a critic told which round it is can infer an alternating
 * scheme and de-blind itself without touching the filesystem.
 */
export const chooseSide = (rng: () => number = Math.random): Side => (rng() < 0.5 ? "A" : "B");

export const hashFile = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");

/**
 * Resolve `path` through symlinks as far as it exists, keeping the not-yet-created
 * tail. A round directory usually does not exist yet, and `resolve()` alone judges
 * it by string: `scratchpad/gauntlet/x/round-1` where `x` is a link out of the tree
 * looks contained and is not — and `copyFileSync` follows the link, not the string.
 */
function realpathDeepest(path: string): string {
  const absolute = resolve(path);
  const tail: string[] = [];
  let current = absolute;

  for (;;) {
    try {
      return join(realpathSync.native(current), ...tail);
    } catch {
      const parent = dirname(current);
      if (parent === current) return absolute; // nothing along this path exists
      tail.unshift(basename(current));
      current = parent;
    }
  }
}

/** True when `target` is strictly inside `root` (case-insensitively on Windows). */
function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Validate a `--round` argument and return the real absolute directory to write.
 * Refuses, before anything is copied: any path outside `scratchpad/gauntlet/`
 * (traversal or symlink), the staging root itself, a non-directory, and a
 * directory that already holds files — which is both a sign of a re-used round
 * and the one thing a blind critic must never find.
 */
export function resolveRoundDir(roundDir: string): string {
  const root = realpathDeepest(STAGING_ROOT);
  const target = realpathDeepest(roundDir);

  if (!isInside(root, target)) {
    throw new Error(
      `Refusing to stage outside the staging area: "${roundDir}" resolves to ${target}, which is not below ${root}. ` +
        `Round directories look like scratchpad/gauntlet/<slug>/round-<n>/<piece>.`,
    );
  }

  if (existsSync(target)) {
    if (!statSync(target).isDirectory()) {
      throw new Error(`Refusing to stage: ${target} exists and is not a directory.`);
    }
    const entries = readdirSync(target);
    if (entries.length > 0) {
      throw new Error(
        `Refusing to stage into a directory that already contains ${entries.join(", ")}: ${target}. ` +
          `The critic is handed exactly two files, so every round gets its own empty directory.`,
      );
    }
  }

  return target;
}

export interface StageOptions {
  /** Our artifact for this round. */
  ours: string;
  /** The frozen reference it is judged against. */
  bar: string;
  /** Directory handed to the critic — an empty dir under `scratchpad/gauntlet/`. */
  roundDir: string;
  rng?: () => number;
}

export interface StageResult {
  /** The resolved, contained directory actually written to. */
  roundDir: string;
  /** The two paths to hand the critic, in A/B order. Says nothing about which is ours. */
  staged: [string, string];
  /** Non-fatal blinding leaks the caller must resolve or disclose. */
  warnings: string[];
}

/**
 * Copy both artifacts into `roundDir` as `A.<ext>` / `B.<ext>`, our side chosen
 * at random. Returns no mapping — by design.
 */
export function stageRound({ ours, bar, roundDir, rng }: StageOptions): StageResult {
  const target = resolveRoundDir(roundDir);
  const ext = extname(bar);

  if (extname(ours) !== ext) {
    throw new Error(
      `Blinding leak: extensions differ (ours "${extname(ours)}", bar "${ext}"). Export both the same way before staging.`,
    );
  }
  if (hashFile(ours) === hashFile(bar)) {
    throw new Error(
      "Cannot stage: our artifact is byte-identical to the reference, so the sides are indistinguishable.",
    );
  }

  const side = chooseSide(rng);
  mkdirSync(target, { recursive: true });
  copyFileSync(ours, join(target, `${side}${ext}`));
  copyFileSync(bar, join(target, `${otherSide(side)}${ext}`));

  const warnings: string[] = [];
  const [ourSize, barSize] = [statSync(ours).size, statSync(bar).size];
  const ratio = Math.max(ourSize, barSize) / Math.max(1, Math.min(ourSize, barSize));
  if (ratio > SIZE_TELL_RATIO) {
    warnings.push(
      `File sizes differ ${ratio.toFixed(1)}x (${ourSize} vs ${barSize} bytes) — a critic that lists the directory can guess. Re-export both at matching settings, or disclose the verdict as referee-grade.`,
    );
  }

  return { roundDir: target, staged: [join(target, `A${ext}`), join(target, `B${ext}`)], warnings };
}

export interface RevealOptions {
  /**
   * Our artifact as it was staged. Optional because by reveal time the next
   * builder may already have changed it — but WITHOUT it reveal can only prove
   * the reference side is intact: nothing it compares changes when the ours side
   * alone is edited. Pass it whenever the artifact has not moved on.
   */
  ours?: string;
}

/**
 * After the verdict: which staged side was OURS. Recovered by hashing, so the
 * answer never had to exist on disk while the critic was working.
 *
 * What it verifies: the directory holds exactly `A.<ext>` and `B.<ext>`, and
 * exactly one of them is the reference. Given `ours`, also that the other one is
 * still our artifact byte for byte — without it, an edit confined to the ours
 * side is invisible here. See `RevealOptions`.
 */
export function revealSide(roundDir: string, bar: string, { ours }: RevealOptions = {}): Side {
  const ext = extname(bar);
  const expected = [`A${ext}`, `B${ext}`];
  const found = readdirSync(roundDir).sort();

  if (found.length !== expected.length || !expected.every((name, i) => found[i] === name)) {
    throw new Error(
      `Cannot reveal: ${roundDir} should contain exactly ${expected.join(" and ")}, but contains ${found.join(", ") || "nothing"}. ` +
        `Either the wrong reference was passed, or the round directory was modified — in which case the critic did not judge what was staged.`,
    );
  }

  const barHash = hashFile(bar);
  const matches: Side[] = (["A", "B"] as const).filter((s) => hashFile(join(roundDir, `${s}${ext}`)) === barHash);
  if (matches.length !== 1) {
    throw new Error(
      `Cannot reveal: ${matches.length} of the staged files match the reference hash. The round directory was modified or the wrong reference was passed.`,
    );
  }

  const side = otherSide(matches[0]);
  if (ours !== undefined && hashFile(join(roundDir, `${side}${ext}`)) !== hashFile(ours)) {
    throw new Error(
      `Cannot reveal: staged side ${side} no longer matches "${ours}". Either the round directory was modified, or the artifact changed after staging — pass the file as it was staged, or drop it and record that only the reference side was verified.`,
    );
  }
  return side;
}
