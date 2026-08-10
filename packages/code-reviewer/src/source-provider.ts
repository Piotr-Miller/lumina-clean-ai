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
 * Post-change file paths from a unified diff: the `+++ b/<path>` lines.
 * Deletions never match (`+++ /dev/null` has no `b/` prefix) and git-quoted
 * paths (special characters → `+++ "b/..."`) are deliberately not collected —
 * they will be refused downstream (degrade, don't decode).
 */
export function parseDiffPaths(diff: string): Set<string> {
  const paths = new Set<string>();
  for (const rawLine of diff.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (!line.startsWith("+++ b/")) continue;
    const path = line.slice("+++ b/".length);
    if (path !== "") paths.add(path);
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
  const { allowedPaths, root, readFile, realpath, isRegularFile } = options;
  return (request) => {
    const { path, startLine, endLine } = request;
    if (!allowedPaths.has(path)) return refuseUnlisted(path, allowedPaths);
    let content: string;
    try {
      // Symlink-free containment: resolving the full path must change nothing
      // beyond resolving the root itself — the file being a symlink, or any
      // symlinked path component, breaks the equality.
      const resolved = realpath(join(root, path));
      if (resolved !== join(realpath(root), path) || !isRegularFile(resolved)) {
        return refuseUnreadable(path);
      }
      content = readFile(resolved);
    } catch {
      return refuseUnreadable(path);
    }
    if (content === "") return `"${path}" is empty.`;
    const lines = content.split("\n");
    // Defensive floors: the tool schema already enforces >= 1, but a negative
    // index must never turn into a from-the-end slice — a sub-1 startLine
    // reads from line 1, a sub-1 endLine yields the outside-range message.
    const first = startLine === undefined || startLine < 1 ? 1 : startLine;
    const last = endLine === undefined ? lines.length : endLine < 1 ? 0 : endLine;
    const slice = lines.slice(first - 1, last);
    if (slice.length === 0) {
      return `"${path}" has ${String(lines.length)} line(s); lines ${String(first)}-${String(last)} are outside that range.`;
    }
    return slice.join("\n");
  };
}
