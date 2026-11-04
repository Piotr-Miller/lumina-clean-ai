/**
 * Docs-only classification for the CI `integration` and `e2e` jobs.
 *
 * A pull request whose every changed path sits under `context/` (change
 * folders, archives, foundation notes) cannot affect anything those two jobs
 * exercise: no test, spec, build input or migration reads that tree. For such a
 * PR the jobs keep running (they are required status checks, so they must
 * report) but skip their Docker / Supabase / Playwright steps.
 *
 * The allowlist is deliberately a PATH PREFIX, not a file extension. "Only
 * `.md`" would be wrong in this repository: `.claude/skills/**` Markdown is
 * pinned by a parity test, `.github/ai-review-rules.md` feeds the reviewer and
 * `AGENTS.md` steers agents. Widen the list only for a tree that no CI job
 * reads.
 *
 * Single files outside such a tree go in `DOCS_ONLY_FILES` and match EXACTLY,
 * never as a prefix, so `temp_steps.md` does not also admit `temp_steps.md.bak`
 * or `temp_steps.md/x`. Today that is only `temp_steps.md`: the owner's
 * hand-off notes at the repo root, read by no test, build step or agent rule.
 *
 * Fail-closed by construction: an empty list, a blank-only list or any path
 * outside the allowlist yields `false` (run everything). A path Git had to
 * quote (it starts with `"`) never matches a prefix, so it also runs
 * everything.
 *
 * Run as a script (Node 24 strips the types): reads newline-separated paths
 * from stdin and prints `true` or `false`.
 *
 *   git diff --name-only --no-renames HEAD^1 HEAD | node scripts/lib/docs-only.ts
 *
 * Unit-tested in `tests/docs-only.test.ts`.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Repo-relative path prefixes whose changes no `integration` / `e2e` step reads. */
export const DOCS_ONLY_PREFIXES: readonly string[] = ["context/"];

/** Repo-relative single files, matched exactly, whose changes no `integration` / `e2e` step reads. */
export const DOCS_ONLY_FILES: readonly string[] = ["temp_steps.md"];

/** Split `git diff --name-only` output into paths, dropping blank lines (incl. CRLF endings). */
export function parseChangedPaths(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line !== "");
}

/** True for one changed path that is an allowlisted file or sits under an allowlisted prefix. */
function isDocsOnlyPath(path: string): boolean {
  if (path.split("/").includes("..")) return false;
  return DOCS_ONLY_FILES.includes(path) || DOCS_ONLY_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** True only when at least one path changed and every changed path is allowlisted. */
export function isDocsOnlyChange(paths: readonly string[]): boolean {
  return paths.length > 0 && paths.every(isDocsOnlyPath);
}

const invokedPath = process.argv.at(1);
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  process.stdout.write(`${String(isDocsOnlyChange(parseChangedPaths(readFileSync(0, "utf8"))))}\n`);
}
