/**
 * Unit tests for the gauntlet-loop blind staging helper.
 *
 * The properties under test are the ones whose failure is SILENT: a staging bug
 * does not throw, it produces a comparison that was never blind and a verdict
 * that means nothing. So the assertions are about what the round directory
 * reveals, not about the copying mechanics.
 *
 * Containment is tested against the REAL staging root rather than an injected
 * one. An escape hatch that only tests use is still an escape hatch, and the
 * property that matters — "a slipped --round cannot write into the checkout" —
 * is exactly the one a fake root would stop measuring. Round directories are
 * therefore made inside `scratchpad/gauntlet/` (gitignored) and removed after.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { chooseSide, hashFile, otherSide, revealSide, stageRound, STAGING_ROOT } from "../scripts/lib/gauntlet-staging";

/** Windows refuses plain dir symlinks without privileges; junctions it allows. */
const LINK_TYPE = process.platform === "win32" ? "junction" : "dir";

let source: string;
let sandbox: string;
let ours: string;
let bar: string;

const write = (name: string, content: string): string => {
  const path = join(source, name);
  writeFileSync(path, content);
  return path;
};

/** A fresh empty round directory inside the real staging area. */
const roundDir = (name = "piece"): string => join(sandbox, name);

beforeEach(() => {
  source = mkdtempSync(join(tmpdir(), "gauntlet-src-"));
  mkdirSync(STAGING_ROOT, { recursive: true });
  sandbox = mkdtempSync(join(STAGING_ROOT, "test-"));
  ours = write("our-render.png", "OUR OUTPUT");
  bar = write("reference.png", "THE REFERENCE");
});

afterEach(() => {
  for (const dir of [source, sandbox]) rmSync(dir, { recursive: true, force: true });
});

describe("stageRound", () => {
  it("writes exactly two neutrally-named files and nothing else", () => {
    const result = stageRound({ ours, bar, roundDir: roundDir() });

    // Anything else in this directory is something the critic can read.
    expect(readdirSync(result.roundDir).sort()).toEqual(["A.png", "B.png"]);
    expect(result.staged).toEqual([join(result.roundDir, "A.png"), join(result.roundDir, "B.png")]);
  });

  it("never records which side is ours — not in the return value, not on disk", () => {
    const result = stageRound({ ours, bar, roundDir: roundDir("hero"), rng: () => 0 });

    // The whole point: a mapping that exists anywhere in the shared workspace
    // is a mapping a subagent can read.
    expect(JSON.stringify(result)).not.toMatch(/"ours"|\bA\b(?=")/);
    const tree = readdirSync(sandbox, { recursive: true }).map((entry) => String(entry).replaceAll("\\", "/"));
    expect(tree.sort()).toEqual(["hero", "hero/A.png", "hero/B.png"]);
  });

  it("puts ours on the side the coin picked", () => {
    const low = stageRound({ ours, bar, roundDir: roundDir("low"), rng: () => 0 }).roundDir;
    const high = stageRound({ ours, bar, roundDir: roundDir("high"), rng: () => 0.99 }).roundDir;

    expect(readFileSync(join(low, "A.png"), "utf8")).toBe("OUR OUTPUT");
    expect(readFileSync(join(high, "B.png"), "utf8")).toBe("OUR OUTPUT");
  });

  it("refuses a mismatched export, which would identify the sides before anyone looks", () => {
    const jpg = write("our-render.jpg", "OUR OUTPUT");
    expect(() => stageRound({ ours: jpg, bar, roundDir: roundDir() })).toThrow(/extensions differ/i);
  });

  it("refuses to stage identical artifacts, which cannot be told apart afterwards", () => {
    const clone = write("clone.png", readFileSync(bar, "utf8"));
    expect(() => stageRound({ ours: clone, bar, roundDir: roundDir() })).toThrow(/byte-identical/i);
  });

  it("warns when file size alone would give the sides away", () => {
    const heavy = write("heavy.png", "X".repeat(10_000));
    const result = stageRound({ ours: heavy, bar, roundDir: roundDir() });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/sizes differ/i);
  });

  it("stays quiet when the two artifacts are comparably sized", () => {
    expect(stageRound({ ours, bar, roundDir: roundDir() }).warnings).toEqual([]);
  });
});

/**
 * `--round` is a string an agent typed, and staging COPIES INTO it. Every case
 * below is a plausible slip that would otherwise overwrite real files: the
 * archive is immutable by hard rule, and the checkout is the work itself.
 */
describe("stageRound containment", () => {
  const expectRefused = (target: string, pattern = /outside the staging area/i): void => {
    expect(() => stageRound({ ours, bar, roundDir: target })).toThrow(pattern);
  };

  it("refuses a path that traverses out of the staging area into the archive", () => {
    const archive = join(STAGING_ROOT, "..", "..", "context", "archive", "gauntlet-containment-probe");

    expectRefused(archive);
    expect(existsSync(archive), "refused, so nothing may have been created").toBe(false);
  });

  it("refuses the repo root and anywhere else in the checkout", () => {
    expectRefused(join(STAGING_ROOT, "..", ".."));
    expectRefused(join(STAGING_ROOT, "..", "..", "src"));
  });

  it("refuses a path outside the repo entirely", () => {
    const outside = join(tmpdir(), "gauntlet-escape");

    expectRefused(outside);
    expect(existsSync(outside)).toBe(false);
  });

  it("refuses the staging root itself — a round needs its own directory", () => {
    expectRefused(STAGING_ROOT);
  });

  it("refuses a symlink that points out of the staging area", () => {
    const escape = mkdtempSync(join(tmpdir(), "gauntlet-escape-"));
    const link = join(sandbox, "link");
    try {
      symlinkSync(escape, link, LINK_TYPE);
    } catch {
      return; // no privilege to create links here; the string-level cases still cover the rule
    }

    try {
      // Contained by string, outside on disk — and copyFileSync follows the link.
      expectRefused(join(link, "round-1"));
      expect(readdirSync(escape)).toEqual([]);
    } finally {
      rmSync(link, { recursive: true, force: true });
      rmSync(escape, { recursive: true, force: true });
    }
  });

  it("refuses a round directory that already holds files", () => {
    const reused = roundDir("reused");
    stageRound({ ours, bar, roundDir: reused });

    // Re-staging over a judged round is how two rounds get silently conflated —
    // and a leftover third file is something the critic would read.
    expectRefused(reused, /already contains/i);
    expect(readdirSync(reused).sort()).toEqual(["A.png", "B.png"]);
  });

  it("accepts a directory that was created ahead of time but left empty", () => {
    const prepared = roundDir("prepared");
    mkdirSync(prepared, { recursive: true });

    expect(() => stageRound({ ours, bar, roundDir: prepared })).not.toThrow();
  });
});

describe("revealSide", () => {
  it("recovers our side after the verdict, from hashes rather than a stored mapping", () => {
    for (const [name, rng] of [
      ["low", () => 0],
      ["high", () => 0.99],
    ] as const) {
      const { roundDir: dir } = stageRound({ ours, bar, roundDir: roundDir(name), rng });
      const revealed = revealSide(dir, bar);

      expect(readFileSync(join(dir, `${revealed}.png`), "utf8")).toBe("OUR OUTPUT");
    }
  });

  it("refuses to guess when both staged files are the reference", () => {
    const dir = roundDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "A.png"), "THE REFERENCE");
    writeFileSync(join(dir, "B.png"), "THE REFERENCE");

    expect(() => revealSide(dir, bar)).toThrow(/2 of the staged files match/i);
  });

  it("refuses when the round directory gained or lost a file", () => {
    const { roundDir: dir } = stageRound({ ours, bar, roundDir: roundDir() });
    writeFileSync(join(dir, "critic-notes.md"), "a file the critic could read");

    expect(() => revealSide(dir, bar)).toThrow(/exactly A\.png and B\.png/i);
  });

  it("catches an edit confined to our side only when it is given the artifact", () => {
    const { roundDir: dir } = stageRound({ ours, bar, roundDir: roundDir(), rng: () => 0 });
    writeFileSync(join(dir, "A.png"), "OUR OUTPUT, quietly improved after the critic looked");

    // Documented limit, pinned so nobody restates the guarantee too strongly:
    // the bar-side hash is untouched, so the cheap check still passes...
    expect(revealSide(dir, bar)).toBe("A");
    // ...and only the full unordered check sees it.
    expect(() => revealSide(dir, bar, { ours })).toThrow(/no longer matches/i);
  });

  it("passes the full check when nothing was touched", () => {
    const { roundDir: dir } = stageRound({ ours, bar, roundDir: roundDir() });

    expect(() => revealSide(dir, bar, { ours })).not.toThrow();
  });
});

describe("primitives", () => {
  it("chooseSide splits on the coin, and otherSide is its inverse", () => {
    expect(chooseSide(() => 0.49)).toBe("A");
    expect(chooseSide(() => 0.5)).toBe("B");
    expect(otherSide(chooseSide(() => 0.49))).toBe("B");
  });

  it("hashFile is content-addressed, so a reference can be pinned without committing it", () => {
    expect(hashFile(bar)).toBe(hashFile(write("copy.png", "THE REFERENCE")));
    expect(hashFile(bar)).not.toBe(hashFile(ours));
    expect(hashFile(bar)).toMatch(/^[0-9a-f]{64}$/);
  });
});
