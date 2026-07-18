/**
 * Read-only consistency check of the two managed skill trees
 * (`.claude/skills` ↔ `.agents/skills`). Run it after every `10x get` and
 * after any manual re-sync:
 *
 *   npm run check:skills                    # fail (exit 1) on drift
 *   npm run check:skills -- --report-only   # print findings, exit 0 anyway
 *
 * Four signals: tree dir-diff, sha256 vs `.claude/.10x-cli-manifest.json`
 * (INVERTED for locally-extended skills — a manifest MATCH means the
 * extension was wiped), extension sentinels in both trees, and pair parity
 * with the per-tool adaptation allowlist. Exit codes: 0 clean (or
 * `--report-only`), 1 drift, 2 environment error (missing tree / unreadable
 * manifest — exit 2 even under `--report-only`). The checker never writes;
 * drift is fixed by hand (see AGENTS.md → "10x-cli profile & workflow").
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderSkillsSyncReport, runSkillsSyncCheck } from "./lib/skills-sync-checker";
import { SKILLS_SYNC_CONFIG } from "./lib/skills-sync-config";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function main(): void {
  const args = process.argv.slice(2);
  const reportOnly = args.includes("--report-only");
  const unknown = args.filter((arg) => arg !== "--report-only");
  if (unknown.length > 0) {
    console.error(`Unknown argument(s): ${unknown.join(", ")}. Usage: npm run check:skills [-- --report-only]`);
    process.exit(2);
  }

  const result = runSkillsSyncCheck(ROOT, SKILLS_SYNC_CONFIG);
  console.log(renderSkillsSyncReport(result));
  if (!result.ok) process.exit(2);
  if (result.findings.length > 0 && !reportOnly) process.exit(1);
}

try {
  main();
} catch (error: unknown) {
  console.error(`Environment error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
