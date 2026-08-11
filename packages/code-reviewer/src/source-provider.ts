import { join } from "node:path";

import type { SourceProvider } from "./reviewer.js";

// Diff-scoped file-context delivery for the CI finder: parse the reviewable
// path set from the unified diff, then serve bounded file content for exactly
// those paths and refuse everything else. Pure over injected fs primitives so
// the whole module is hermetically testable.
//
// SECURITY MODEL: requested paths are model-chosen and untrusted (see the
// SourceProvider seam doc in reviewer.ts). The exact-match allowlist is the
// name gate — requests containing `..`, absolute paths, or backslashes simply
// miss the set and get refused; requested paths are NEVER normalized, because
// normalization is where traversal bugs live. The allowlist only guarantees
// the requested NAME is in the diff, not that the content served is that
// file: a PR can add a symlink (`evil.ts -> ../.git/config` — an in-root
// target, so containment alone is insufficient), so after an allowlist hit
// the provider verifies the resolved target — no symlink in the file or any
// path component (realpath equality) and a regular file — and reads the
// VERIFIED resolved path. Any verification or read failure returns a
// model-facing refusal string; the provider never throws (a tool `execute`
// throw would error the whole paid run).
//
// Merge-ref vs head nuance: in CI the checkout is the PR merge commit while
// diff line numbers refer to the head commit. Content is identical for diffed
// files unless master touched the same file after branching — rare and
// low-impact (slightly stale context), documented rather than engineered
// around.

/**
 * Post-change file paths from a unified diff: the `+++ b/<path>` HEADER
 * lines. Deletions never match (`+++ /dev/null` has no `b/` prefix) and
 * git-quoted paths (special characters → `+++ "b/..."`) are deliberately not
 * collected — they will be refused downstream (degrade, don't decode).
 *
 * Structure-aware, not line-based (impl-review-phase-1 F1): an ADDED line
 * whose content starts `++ b/` renders in a hunk body as `+++ b/<path>` and
 * would forge an allowlist entry for any existing repo file (reproduced with
 * `.git/config`). Hunk-body lines always carry a marker prefix (space, `+`,
 * `-`, `\`), so literal `diff --git ` and `@@` lines cannot be forged from
 * content — headers are therefore only accepted OUTSIDE hunk bodies, between
 * a file block's `diff --git` line and its first `@@`.
 */
// Defense-in-depth (impl-review F1): allowlist entries must themselves be
// clean relative paths. Real git cannot emit a traversal-bearing `+++ b/`
// header, but parseDiffPaths is exported and other consumers may feed
// hand-crafted diff text — a `../secret` entry would pass the containment
// check because join() collapses `..` on BOTH sides of the realpath
// equality. Empty/`.`/`..` segments on either separator are rejected
// (covers leading `/` / `\` and trailing separators too).
const hasUnsafeSegment = (path: string): boolean =>
  path.split(/[/\\]/).some((s) => s === "" || s === "." || s === "..");

export function parseDiffPaths(diff: string): Set<string> {
  const paths = new Set<string>();
  let inHunkBody = false;
  for (const rawLine of diff.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith("diff --git ")) {
      inHunkBody = false;
      continue;
    }
    if (line.startsWith("@@")) {
      inHunkBody = true;
      continue;
    }
    if (inHunkBody || !line.startsWith("+++ b/")) continue;
    const path = line.slice("+++ b/".length);
    if (!hasUnsafeSegment(path)) paths.add(path);
  }
  return paths;
}

/** Cap on the allowed-path listing inside the unlisted-path refusal message. */
export const MAX_LISTED_PATHS = 20;

export interface DiffScopedSourceOptions {
  /** Literal post-change paths parsed from the diff — the exact-match allowlist. */
  allowedPaths: Set<string>;
  /** Checkout root the allowlisted paths are relative to. */
  root: string;
  /** Reads a file as UTF-8; called only with the verified resolved path. */
  readFile: (path: string) => string;
  realpath: (path: string) => string;
  isRegularFile: (path: string) => boolean;
  /**
   * Observes the OUTCOME of each request, reported from here because this is
   * the only place that knows it for certain. `delivered` is true only when
   * real file content was returned; an unlisted path, a failed containment
   * check, an unreadable or empty file, and an out-of-range slice are all
   * `false` — no evidence reached the model in any of those cases.
   *
   * Consumers must not re-derive this by inspecting the returned string: the
   * refusals are prose aimed at the model, and a file whose first line happens
   * to look like one would be misread (impl-review-phase-1 F4). Purely
   * observational — the model-facing return value is unchanged.
   */
  onResult?: (result: { path: string; delivered: boolean }) => void;
}

// The refusal repeats the required format and enumerates a deterministic,
// capped listing of the allowed paths so the model can self-correct on its
// next loop step instead of burning the budget on repeated misses.
function refuseUnlisted(path: string, allowedPaths: Set<string>): string {
  const sorted = [...allowedPaths].sort();
  const listed = sorted.slice(0, MAX_LISTED_PATHS);
  const omitted = sorted.length - listed.length;
  const listing = listed.length === 0 ? "(none)" : listed.join(", ");
  return [
    `"${path}" is not part of the reviewed diff, so no context is available for it.`,
    "Request a repository-relative path exactly as listed in the diff, without git's a/ or b/ prefix (e.g. src/x.ts).",
    `Reviewable paths: ${listing}${omitted > 0 ? ` (and ${String(omitted)} more)` : ""}.`,
  ].join(" ");
}

// One opaque refusal for every verification/read failure (symlink, not a
// regular file, fs error): the message must not become an oracle for probing
// the checkout.
const refuseUnreadable = (path: string): string =>
  `"${path}" could not be read from the checkout, so no context is available for it.`;

/**
 * A SourceProvider serving 1-based-inclusive line ranges of exactly the
 * allowlisted files (missing startLine → line 1; missing endLine → end of
 * file). Range/size caps stay `fetchBoundedContext`'s job — its range clamp
 * fires only when BOTH bounds are present, so single-sided requests arrive
 * here unclamped and MAX_CONTEXT_CHARS bounds the response.
 */
export function createDiffScopedSource(options: DiffScopedSourceOptions): SourceProvider {
  const { allowedPaths, root, readFile, realpath, isRegularFile, onResult } = options;
  // Every exit goes through one of these two, so a future return path cannot
  // silently skip the outcome report.
  const refuse = (path: string, message: string): string => {
    onResult?.({ path, delivered: false });
    return message;
  };
  const deliver = (path: string, content: string): string => {
    onResult?.({ path, delivered: true });
    return content;
  };
  return (request) => {
    const { path, startLine, endLine } = request;
    if (!allowedPaths.has(path)) return refuse(path, refuseUnlisted(path, allowedPaths));
    let content: string;
    try {
      // Symlink-free containment: resolving the full path must change nothing
      // beyond resolving the root itself — the file being a symlink, or any
      // symlinked path component, breaks the equality.
      const resolved = realpath(join(root, path));
      if (resolved !== join(realpath(root), path) || !isRegularFile(resolved)) {
        return refuse(path, refuseUnreadable(path));
      }
      content = readFile(resolved);
    } catch {
      return refuse(path, refuseUnreadable(path));
    }
    if (content === "") return refuse(path, `"${path}" is empty.`);
    const lines = content.split("\n");
    // Defensive floors: the tool schema already enforces >= 1, but a negative
    // index must never turn into a from-the-end slice — a sub-1 startLine
    // reads from line 1, a sub-1 endLine yields the outside-range message.
    const first = startLine === undefined || startLine < 1 ? 1 : startLine;
    const last = endLine === undefined ? lines.length : endLine < 1 ? 0 : endLine;
    const slice = lines.slice(first - 1, last);
    if (slice.length === 0) {
      return refuse(
        path,
        `"${path}" has ${String(lines.length)} line(s); lines ${String(first)}-${String(last)} are outside that range.`,
      );
    }
    return deliver(path, slice.join("\n"));
  };
}

/**
 * The full assembly of a diff-scoped source, shared by every consumer so the
 * allowlist is always derived the same way: post-change paths out of the
 * diff, then the containment wiring above.
 *
 * `undefined` means "no source" rather than an empty allowlist: a diff with no
 * post-change paths (deletions only) has nothing the tool could ever serve,
 * and attaching a tool that can only refuse would cost loop steps for nothing
 * — the caller should stay tool-less instead.
 *
 * Deliberately still pure over injected fs primitives, like the rest of this
 * module: the CLI passes its `CliIo` members (kept hermetic by cli.test.ts),
 * the promptfoo provider passes `node:fs`. Sharing THIS function is what keeps
 * a future hardening of the allowlist derivation from reaching CI but not the
 * evals.
 */
export function createDiffScopedSourceForDiff(
  options: Omit<DiffScopedSourceOptions, "allowedPaths"> & {
    /** Unified diff the allowlist is derived from — pass the FULL diff, never a truncated one. */
    diff: string;
  },
): SourceProvider | undefined {
  const { diff, ...fs } = options;
  const allowedPaths = parseDiffPaths(diff);
  if (allowedPaths.size === 0) return undefined;
  return createDiffScopedSource({ allowedPaths, ...fs });
}
