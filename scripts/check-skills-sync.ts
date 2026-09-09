/**
 * Read-only parity check of the PUBLIC (git-tracked) skills between the two
 * managed trees (`.claude/skills` ↔ `.agents/skills`):
 *
 *   npm run check:skills                    # fail (exit 1) on drift
 *   npm run check:skills -- --report-only   # print findings, exit 0 anyway
 *
 * This repo publishes only an allowlist of skills — the course's 10x-Workflow
 * skills are local-only (restored by `ai-toolkit setup`; see AGENTS.md), with
 * `10x-impl-review-ci` as the explicitly permitted public exception. The full
 * course-workflow checker that used to sit beside this one in gitignored
 * `scripts/local/` was retired in #213; `ai-toolkit status` is what names an
 * edited or missing installed file now.
 *
 * Exit codes: 0 clean (or `--report-only`), 1 drift, 2 environment error.
 * The checker never writes; drift is fixed by hand.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkPublicSkillsParity, renderParityReport } from "./lib/public-skills-parity";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Skills tracked in the public repo — pairs must stay byte-identical. */
const PUBLIC_SKILLS = ["10x-impl-review-ci", "gauntlet-loop", "run-local-stack"];

function main(): void {
  const args = process.argv.slice(2);
  const reportOnly = args.includes("--report-only");
  const unknown = args.filter((arg) => arg !== "--report-only");
  if (unknown.length > 0) {
    console.error(`Unknown argument(s): ${unknown.join(", ")}. Usage: npm run check:skills [-- --report-only]`);
    process.exit(2);
  }

  const result = checkPublicSkillsParity(ROOT, PUBLIC_SKILLS, {
    claudeSkillsDir: ".claude/skills",
    agentsSkillsDir: ".agents/skills",
  });
  console.log(renderParityReport(PUBLIC_SKILLS, result));

  if (!result.ok) process.exit(2);
  if (result.findings.length > 0 && !reportOnly) process.exit(1);
}

try {
  main();
} catch (error: unknown) {
  console.error(`Environment error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
