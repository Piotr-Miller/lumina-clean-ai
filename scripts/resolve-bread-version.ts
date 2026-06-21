/**
 * Resolve the current `mingcv/bread` version from Replicate and pin it into
 * `src/lib/services/bread.ts` (+ its test). A DELIBERATE, on-demand bump — never
 * run at deploy. Runtime always calls the committed hash; this script is how you
 * move it, reviewably, via a PR. Rollback = git-revert the pin commit.
 *
 *   REPLICATE_API_TOKEN=… npm run resolve:bread-version
 *
 * It fails closed: a malformed id, a drifted input schema (missing
 * image/gamma/strength), or an ambiguous text match throws BEFORE any file is
 * written. The historical Phase-0 spike (`scripts/spikes/bread-spike.ts`) is
 * intentionally NOT touched — it is frozen evidence, not a runtime pin.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BREAD_OWNER_MODEL,
  assertCompatibleInputSchema,
  extractLatestVersionId,
  prepareBreadVersionRewrite,
  type ReplicateModelResponse,
  type ReplicateVersionResponse,
} from "./lib/bread-version-resolver";
import { writeFilePairAtomically } from "./lib/atomic-file-writes";
import { fetchReplicateJson } from "./lib/replicate-json";

const REPLICATE_API = "https://api.replicate.com/v1";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BREAD_TS = resolve(ROOT, "src/lib/services/bread.ts");
const TEST_TS = resolve(ROOT, "tests/bread.test.ts");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) fail("Set REPLICATE_API_TOKEN (your Replicate API token) and re-run.");

  const model = await fetchReplicateJson(`${REPLICATE_API}/models/${BREAD_OWNER_MODEL}`, token, "model");
  const newHash = extractLatestVersionId(model as ReplicateModelResponse);

  // Fetch the EXACT resolved version and contract-check its input schema.
  const version = await fetchReplicateJson(
    `${REPLICATE_API}/models/${BREAD_OWNER_MODEL}/versions/${newHash}`,
    token,
    "version",
  );
  assertCompatibleInputSchema(version as ReplicateVersionResponse);

  const breadSource = readFileSync(BREAD_TS, "utf8");
  const testSource = readFileSync(TEST_TS, "utf8");
  const rewrite = prepareBreadVersionRewrite(breadSource, testSource, newHash);
  if (!rewrite.changed) {
    console.log(`Bread version already current (${newHash.slice(0, 12)}…) — no-op.`);
    return;
  }

  writeFilePairAtomically(
    {
      path: BREAD_TS,
      originalContents: breadSource,
      nextContents: rewrite.nextBreadSource,
    },
    {
      path: TEST_TS,
      originalContents: testSource,
      nextContents: rewrite.nextTestSource,
    },
  );

  console.log(`Bread version pinned: ${rewrite.oldHash} → ${newHash}`);
  console.log("Review the diff, open a PR; merge to master rebuilds the Worker + enhance function.");
}

void main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
