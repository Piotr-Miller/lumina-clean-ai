import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import {
  createDiffScopedSource,
  createDiffScopedSourceForDiff,
  MAX_LISTED_PATHS,
  parseDiffPaths,
} from "./source-provider.js";

// Hermetic: every fs primitive is injected, so the security invariants
// (exact-match allowlist, symlink-free containment, never-throw) are pinned
// without touching a real filesystem. Absolute paths are built with join() so
// the expectations hold on both POSIX and Windows separators.

const diffFor = (lines: string[]): string => lines.join("\n");

describe("parseDiffPaths", () => {
  it("collects the post-change path of a modified file", () => {
    const diff = diffFor([
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,2 +1,3 @@",
      " context",
      "+added",
    ]);
    expect(parseDiffPaths(diff)).toEqual(new Set(["src/a.ts"]));
  });

  it("collects an added file (--- /dev/null)", () => {
    const diff = diffFor(["diff --git a/new.ts b/new.ts", "--- /dev/null", "+++ b/new.ts", "+x"]);
    expect(parseDiffPaths(diff)).toEqual(new Set(["new.ts"]));
  });

  it("excludes a deleted file (+++ /dev/null)", () => {
    const diff = diffFor(["diff --git a/old.ts b/old.ts", "--- a/old.ts", "+++ /dev/null", "-x"]);
    expect(parseDiffPaths(diff)).toEqual(new Set());
  });

  it("collects the new path of a rename with edits", () => {
    const diff = diffFor([
      "diff --git a/src/old.ts b/src/renamed.ts",
      "rename from src/old.ts",
      "rename to src/renamed.ts",
      "--- a/src/old.ts",
      "+++ b/src/renamed.ts",
      "@@ -1 +1 @@",
      "-x",
      "+y",
    ]);
    expect(parseDiffPaths(diff)).toEqual(new Set(["src/renamed.ts"]));
  });

  it("does not collect git-quoted paths (degrade, don't decode)", () => {
    const diff = diffFor(['--- "a/sp ace.ts"', '+++ "b/sp ace.ts"', "+x"]);
    expect(parseDiffPaths(diff)).toEqual(new Set());
  });

  it("keeps real git's trailing tab on a space-bearing path (impl-review F5)", () => {
    // Real git does NOT c-quote a plain space: it emits `+++ b/sp ace.ts<TAB>`.
    // The tab stays part of the entry, so the clean name misses the exact-match
    // set downstream and the file degrades to no-context — no decoding, same
    // contract as the quoted-path case above.
    const diff = diffFor(["--- a/sp ace.ts\t", "+++ b/sp ace.ts\t", "@@ -1 +1 @@", "+x"]);
    expect(parseDiffPaths(diff)).toEqual(new Set(["sp ace.ts\t"]));
  });

  it("strips a trailing CR from CRLF diffs", () => {
    expect(parseDiffPaths("+++ b/src/a.ts\r\n+x\r")).toEqual(new Set(["src/a.ts"]));
  });

  it("does not collect a header forged by hunk content (impl-review F1)", () => {
    // An ADDED line whose content is `++ b/.git/config` renders as
    // `+++ b/.git/config` inside the hunk body — it must not widen the
    // allowlist to an existing repo file.
    const diff = diffFor([
      "diff --git a/safe.ts b/safe.ts",
      "--- a/safe.ts",
      "+++ b/safe.ts",
      "@@ -1,1 +1,2 @@",
      " x",
      "+++ b/.git/config",
      "diff --git a/next.ts b/next.ts",
      "--- a/next.ts",
      "+++ b/next.ts",
      "@@ -1 +1 @@",
      "-y",
      "+++ b/etc/passwd",
    ]);
    expect(parseDiffPaths(diff)).toEqual(new Set(["safe.ts", "next.ts"]));
  });

  it("still collects headers after a forged line once a new file block starts", () => {
    const diff = diffFor([
      "diff --git a/a.ts b/a.ts",
      "+++ b/a.ts",
      "@@ -1 +1 @@",
      "+++ b/forged.ts",
      "diff --git a/b.ts b/b.ts",
      "+++ b/b.ts",
      "@@ -1 +1 @@",
      "+z",
    ]);
    expect(parseDiffPaths(diff)).toEqual(new Set(["a.ts", "b.ts"]));
  });

  it("rejects traversal-bearing header paths — allowlist-side defense-in-depth (impl-review F1)", () => {
    // Real git can't emit these in CI, but parseDiffPaths is exported and a
    // `../secret` allowlist entry would pass containment (join() collapses
    // `..` on both sides of the realpath equality).
    const diff = diffFor([
      "+++ b/../secret",
      "+++ b/src/../a.ts",
      "+++ b/./a.ts",
      "+++ b//etc/passwd",
      "+++ b/..\\secret",
      "+++ b/trailing/",
      "+++ b/src/ok.ts",
    ]);
    expect(parseDiffPaths(diff)).toEqual(new Set(["src/ok.ts"]));
  });

  it("returns an empty set for an empty diff", () => {
    expect(parseDiffPaths("")).toEqual(new Set());
  });
});

const ROOT = join("/repo");

interface FakeFs {
  /** Content keyed by ABSOLUTE resolved path. */
  files?: Record<string, string>;
  /** realpath overrides keyed by input path; identity for everything else. */
  resolves?: Record<string, string>;
  /** Inputs on which realpath throws (e.g. a path missing from the checkout). */
  realpathThrows?: string[];
  /** Resolved paths that are NOT regular files (directories, sockets...). */
  notRegular?: string[];
  /** Records every readFile call for reads-the-verified-path assertions. */
  reads?: string[];
}

const makeSource = (allowed: string[], fs: FakeFs = {}) =>
  createDiffScopedSource({
    allowedPaths: new Set(allowed),
    root: ROOT,
    realpath: (path) => {
      if (fs.realpathThrows?.includes(path)) throw new Error("ENOENT");
      return fs.resolves?.[path] ?? path;
    },
    isRegularFile: (path) => !(fs.notRegular ?? []).includes(path),
    readFile: (path) => {
      fs.reads?.push(path);
      const content = fs.files?.[path];
      if (content === undefined) throw new Error("ENOENT");
      return content;
    },
  });

describe("createDiffScopedSource — allowlisted reads", () => {
  const fs = (): FakeFs => ({ files: { [join(ROOT, "src/a.ts")]: "l1\nl2\nl3" } });

  it("serves the whole file when no range is given", () => {
    expect(makeSource(["src/a.ts"], fs())({ path: "src/a.ts" })).toBe("l1\nl2\nl3");
  });

  it("slices ranges 1-based inclusive", () => {
    expect(makeSource(["src/a.ts"], fs())({ path: "src/a.ts", startLine: 2, endLine: 3 })).toBe("l2\nl3");
  });

  it("reads from startLine to end of file when endLine is missing", () => {
    expect(makeSource(["src/a.ts"], fs())({ path: "src/a.ts", startLine: 2 })).toBe("l2\nl3");
  });

  it("reads from line 1 when only endLine is given", () => {
    expect(makeSource(["src/a.ts"], fs())({ path: "src/a.ts", endLine: 2 })).toBe("l1\nl2");
  });

  it("answers an out-of-range request with the file's line count, never a throw", () => {
    const result = makeSource(["src/a.ts"], fs())({ path: "src/a.ts", startLine: 10 });
    expect(result).toContain("3 line(s)");
    expect(result).toContain('"src/a.ts"');
  });

  it("answers an inverted range with the outside-that-range message", () => {
    expect(makeSource(["src/a.ts"], fs())({ path: "src/a.ts", startLine: 3, endLine: 1 })).toContain(
      "outside that range",
    );
  });

  it("names an empty file instead of returning empty content", () => {
    const source = makeSource(["src/a.ts"], { files: { [join(ROOT, "src/a.ts")]: "" } });
    expect(source({ path: "src/a.ts" })).toBe('"src/a.ts" is empty.');
  });

  it("reads the VERIFIED resolved path — a canonicalized root still serves content", () => {
    // The root itself resolves elsewhere (e.g. /repo is a symlink to its real
    // location): containment equality holds and the read targets the
    // canonical path, never the raw join.
    const canonical = join("/real/repo");
    const reads: string[] = [];
    const source = makeSource(["src/a.ts"], {
      resolves: { [ROOT]: canonical, [join(ROOT, "src/a.ts")]: join(canonical, "src/a.ts") },
      files: { [join(canonical, "src/a.ts")]: "canonical content" },
      reads,
    });
    expect(source({ path: "src/a.ts" })).toBe("canonical content");
    expect(reads).toEqual([join(canonical, "src/a.ts")]);
  });
});

describe("createDiffScopedSource — refusals", () => {
  it("refuses a path outside the diff, repeating the required format and the allowed paths", () => {
    const result = makeSource(["src/a.ts", "src/b.ts"])({ path: "src/other.ts" });
    expect(result).toContain('"src/other.ts" is not part of the reviewed diff');
    expect(result).toContain("without git's a/ or b/ prefix");
    expect(result).toContain("src/a.ts, src/b.ts");
  });

  it.each(["../etc/passwd", "/etc/passwd", "src\\a.ts", "b/src/a.ts", "src/../src/a.ts", ""])(
    "refuses %j via exact-match set miss — no normalization grants access",
    (path) => {
      const fs: FakeFs = { files: { [join(ROOT, "src/a.ts")]: "x" }, reads: [] };
      const result = makeSource(["src/a.ts"], fs)({ path });
      expect(result).toContain("not part of the reviewed diff");
      expect(fs.reads).toEqual([]);
    },
  );

  it("refuses the clean name of a tab-suffixed space-bearing entry (impl-review F5)", () => {
    // The allowlist entry real git produces carries a trailing tab, so the
    // requestable name never matches: degrade-only, never a decoded guess.
    const fs: FakeFs = { files: { ["/repo/sp ace.ts"]: "x" }, reads: [] };
    expect(makeSource(["sp ace.ts\t"], fs)({ path: "sp ace.ts" })).toContain("not part of the reviewed diff");
    expect(fs.reads).toEqual([]);
  });

  it("caps the refusal's path listing deterministically and counts the omitted rest", () => {
    const allowed = Array.from({ length: MAX_LISTED_PATHS + 5 }, (_, i) => {
      const n = String(i).padStart(2, "0");
      return `src/p${n}.ts`;
    });
    // Shuffled insertion order — the listing must still come out sorted.
    const result = makeSource([...allowed].reverse())({ path: "nope.ts" });
    expect(result).toContain("src/p00.ts");
    expect(result).toContain(`src/p${String(MAX_LISTED_PATHS - 1)}.ts`);
    expect(result).not.toContain(`src/p${String(MAX_LISTED_PATHS)}.ts,`);
    expect(result).toContain("(and 5 more)");
  });

  it("names no paths when the allowlist is empty", () => {
    expect(makeSource([])({ path: "src/a.ts" })).toContain("Reviewable paths: (none)");
  });

  it("refuses an allowlisted name that is a symlink to an in-root target, without reading it", () => {
    // The PR added `src/evil.ts -> ../.git/config`: the NAME is in the diff,
    // the resolved target is still inside the root — containment alone would
    // pass, the realpath equality must not.
    const reads: string[] = [];
    const source = makeSource(["src/evil.ts"], {
      resolves: { [join(ROOT, "src/evil.ts")]: join(ROOT, ".git/config") },
      files: { [join(ROOT, ".git/config")]: "[credential] secret" },
      reads,
    });
    expect(source({ path: "src/evil.ts" })).toBe(
      '"src/evil.ts" could not be read from the checkout, so no context is available for it.',
    );
    expect(reads).toEqual([]);
  });

  it("refuses a symlink to an out-of-root target", () => {
    const source = makeSource(["src/evil.ts"], {
      resolves: { [join(ROOT, "src/evil.ts")]: join("/etc/passwd") },
    });
    expect(source({ path: "src/evil.ts" })).toContain("could not be read");
  });

  it("refuses when any path component is a symlink", () => {
    const source = makeSource(["src/a.ts"], {
      resolves: { [join(ROOT, "src/a.ts")]: join(ROOT, "lib/a.ts") },
    });
    expect(source({ path: "src/a.ts" })).toContain("could not be read");
  });

  it("refuses a resolved target that is not a regular file", () => {
    const source = makeSource(["src"], {
      files: { [join(ROOT, "src")]: "" },
      notRegular: [join(ROOT, "src")],
    });
    expect(source({ path: "src" })).toContain("could not be read");
  });

  it("turns a realpath error into a refusal, never a throw", () => {
    const source = makeSource(["src/gone.ts"], { realpathThrows: [join(ROOT, "src/gone.ts")] });
    expect(() => source({ path: "src/gone.ts" })).not.toThrow();
    expect(source({ path: "src/gone.ts" })).toContain("could not be read");
  });

  it("turns a readFile error into a refusal, never a throw", () => {
    const source = makeSource(["src/a.ts"]); // no files registered → readFile throws
    expect(() => source({ path: "src/a.ts" })).not.toThrow();
    expect(source({ path: "src/a.ts" })).toContain("could not be read");
  });

  it("never throws across hostile request shapes", () => {
    const source = makeSource(["src/a.ts"], { files: { [join(ROOT, "src/a.ts")]: "l1\nl2" } });
    const requests = [
      { path: "src/a.ts", startLine: -5, endLine: 0 },
      { path: "src/a.ts", startLine: Number.MAX_SAFE_INTEGER },
      { path: "src/a.ts", startLine: 1, endLine: Number.MAX_SAFE_INTEGER },
      { path: "\0", startLine: 1 },
      { path: "CON", endLine: 3 },
    ];
    // A negative endLine must NOT slice from the end of the file.
    expect(source({ path: "src/a.ts", endLine: -1 })).toContain("outside that range");
    for (const request of requests) {
      expect(() => source(request)).not.toThrow();
      expect(typeof source(request)).toBe("string");
    }
  });
});

describe("createDiffScopedSourceForDiff — the shared CI/eval assembly", () => {
  const MODIFIED = diffFor([
    "diff --git a/src/a.ts b/src/a.ts",
    "index 111..222 100644",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,2 +1,2 @@",
    "-old",
    "+new",
  ]);
  const DELETED_ONLY = diffFor([
    "diff --git a/src/gone.ts b/src/gone.ts",
    "deleted file mode 100644",
    "--- a/src/gone.ts",
    "+++ /dev/null",
    "@@ -1,2 +0,0 @@",
    "-old",
  ]);

  const build = (diff: string, fs: FakeFs = {}) =>
    createDiffScopedSourceForDiff({
      diff,
      root: ROOT,
      realpath: (path) => fs.resolves?.[path] ?? path,
      isRegularFile: (path) => !(fs.notRegular ?? []).includes(path),
      readFile: (path) => {
        const content = fs.files?.[path];
        if (content === undefined) throw new Error("ENOENT");
        return content;
      },
    });

  it("serves a path the diff declares, through the same containment as createDiffScopedSource", () => {
    const source = build(MODIFIED, { files: { [join(ROOT, "src/a.ts")]: "l1\nl2" } });
    expect(source?.({ path: "src/a.ts" })).toBe("l1\nl2");
  });

  it("refuses a path the diff does not declare", () => {
    const source = build(MODIFIED, { files: { [join(ROOT, "src/secret.ts")]: "shh" } });
    expect(source?.({ path: "src/secret.ts" })).toContain("not part of the reviewed diff");
  });

  it("returns undefined for a diff with no post-change paths, so the caller stays tool-less", () => {
    // A tool that can only ever refuse would still burn loop steps — the
    // deletions-only diff must produce no source at all, not an empty one.
    expect(build(DELETED_ONLY)).toBeUndefined();
    expect(build("")).toBeUndefined();
  });
});

describe("createDiffScopedSource — outcome reporting (impl-review-phase-1 F4)", () => {
  const results: { path: string; delivered: boolean }[] = [];
  const sourceWith = (fs: FakeFs) =>
    createDiffScopedSource({
      allowedPaths: new Set(["src/a.ts"]),
      root: ROOT,
      realpath: (path) => fs.resolves?.[path] ?? path,
      isRegularFile: (path) => !(fs.notRegular ?? []).includes(path),
      readFile: (path) => {
        const content = fs.files?.[path];
        if (content === undefined) throw new Error("ENOENT");
        return content;
      },
      onResult: (result) => results.push(result),
    });

  beforeEach(() => {
    results.length = 0;
  });

  it("reports delivered for real content", () => {
    expect(sourceWith({ files: { [join(ROOT, "src/a.ts")]: "l1\nl2" } })({ path: "src/a.ts" })).toBe("l1\nl2");
    expect(results).toEqual([{ path: "src/a.ts", delivered: true }]);
  });

  it("reports delivered even when the content itself looks like a refusal", () => {
    // The exact collision that killed the string-sniffing approach: a file
    // whose first line is the quoted requested path.
    const content = `"src/a.ts" is not part of the reviewed diff, so no context is available for it.`;
    const result = sourceWith({ files: { [join(ROOT, "src/a.ts")]: content } })({ path: "src/a.ts" });
    expect(result).toBe(content);
    expect(results).toEqual([{ path: "src/a.ts", delivered: true }]);
  });

  const refusalCases: [string, { path: string; startLine?: number }, FakeFs][] = [
    ["an unlisted path", { path: "src/other.ts" }, {}],
    ["an unreadable file", { path: "src/a.ts" }, {}],
    ["a non-regular file", { path: "src/a.ts" }, { notRegular: [join(ROOT, "src/a.ts")] }],
    // Neither of these puts evidence in front of the model, so neither counts
    // as proof that the model read anything.
    ["an empty file", { path: "src/a.ts" }, { files: { [join(ROOT, "src/a.ts")]: "" } }],
    ["an out-of-range slice", { path: "src/a.ts", startLine: 9 }, { files: { [join(ROOT, "src/a.ts")]: "l1" } }],
  ];

  it.each(refusalCases)("reports refused for %s", (_label, request, fs) => {
    expect(typeof sourceWith(fs)(request)).toBe("string");
    expect(results).toEqual([{ path: request.path, delivered: false }]);
  });

  it("stays optional — a source without onResult still serves and refuses", () => {
    const source = makeSource(["src/a.ts"], { files: { [join(ROOT, "src/a.ts")]: "l1" } });
    expect(source({ path: "src/a.ts" })).toBe("l1");
    expect(source({ path: "nope.ts" })).toContain("not part of the reviewed diff");
  });
});
