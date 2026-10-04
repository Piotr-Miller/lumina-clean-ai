// The R4 recall guard on #240 (change `finder-verification`, plan.md Phase 2 §3;
// rule in context/changes/finder-verification/plan.md, Definitions "R4 recall
// guard"). Free: it reads files, it calls nothing.
//
// For each owner-listed defect K the finder RAISED in k ≥ 1 valid attempts —
// judged on the PRE-verification findings — K must be PUBLISHED in at least
// floor(k/2) + 1 of those k attempts. K counts as raised in an attempt when at
// least one of its pre-verification findings matches K, and as published when
// at least one finding matched to K is published (plan-review 3rd run F5). A
// match maps one finding to a LIST of defect ids, so one broad finding can
// raise several defects.
//
// The matches are proposed by the agent and APPROVED BY THE OWNER before this
// runs; the script only does the arithmetic. It refuses a matches table that
// leaves a pre-verification finding of ANY recorded attempt without an entry,
// or that names a defect, an attempt or a finding it does not know: a silently
// unmatched finding would read as "not raised". It refuses a series file that
// is not ONE PR series (stages finder,verifier,judge; one identity) or that
// records an attempt id or number twice, which would count an attempt twice
// (impl-review phase 2 F7).
//
// Verdict: `PASS`, `FAIL` (a raised defect under its majority), or
// `NOT PROVEN` — no defect listed, or none raised. NOT PROVEN can never be PASS
// (owner, 2026-10-04). Whole-pipeline detection — K published in x of ALL the
// series' attempts, valid or not — is reported for information.
//
// Usage (from packages/code-reviewer):
//   node scripts/recall-guard.mjs <defects.json> <matches.json> <series.jsonl>
//
//   defects.json  [{ "id": "K1", ... }, ...]   (the owner's list from gate.md)
//   matches.json  { "<attempt id>": { "<finding id>": ["K1", ...] } }   ([] = none)
//   series.jsonl  the runner's records (finder-gate.mjs)
//
// Exit code: 0 on PASS, 1 on FAIL or NOT PROVEN, 2 on a usage or input error.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** The majority a raised defect needs: floor(k/2) + 1 of the k attempts that raised it. */
export const required = (k) => Math.floor(k / 2) + 1;

/** A valid attempt: G1-valid and not a measurement error (Definitions). */
const isValid = (record) => record.g1Pass === true && (record.measurementError ?? null) === null;

/** Attempt records of a series file; `started` markers are skipped. */
export function attemptsOf(seriesText) {
  return seriesText
    .split("\n")
    .filter((line) => line !== "")
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`series line ${String(index + 1)} is not JSON`);
      }
    })
    .filter((entry) => entry.kind === "attempt");
}

/** The stage set of a PR series (plan.md Phase 2 §1); G2 runs `finder,verifier`. */
export const PR_SERIES_STAGES = "finder,verifier,judge";

// The series-identity fields every runner line carries (finder-gate-core.mjs,
// seriesIdentity).
const IDENTITY_FIELDS = [
  "stages",
  "model",
  "endpoint",
  "verifierModel",
  "verifierEndpoint",
  "case",
  "n",
  "diffSha256",
  "rulesSha256",
  "sourceRootTree",
];
const identityOf = (record) => JSON.stringify(IDENTITY_FIELDS.map((field) => record[field] ?? null));

/**
 * Throws unless the records are ONE PR series with each attempt recorded once
 * (impl-review phase 2 F7): a duplicate id would be counted twice in k, and a
 * G2 file or a mix of series is not the #240 series the guard is about.
 */
export function assertOnePrSeries(attempts) {
  const ids = new Set();
  const numbers = new Set();
  for (const record of attempts) {
    if (typeof record.id !== "string" || record.id === "") throw new Error("an attempt record has no id");
    if (ids.has(record.id)) throw new Error(`attempt id ${record.id} is recorded twice; refusing to count it twice`);
    ids.add(record.id);
    if (numbers.has(record.attempt)) {
      throw new Error(`attempt ${String(record.attempt)} is recorded twice; refusing to count it twice`);
    }
    numbers.add(record.attempt);
    if (record.stages !== PR_SERIES_STAGES) {
      throw new Error(
        `${record.id} has stages ${JSON.stringify(record.stages ?? null)}, not ${PR_SERIES_STAGES}: not a PR series`,
      );
    }
  }
  const identities = new Set(attempts.map(identityOf));
  if (identities.size > 1) throw new Error("the records belong to more than one series; refusing to mix them");
}

/** Pre-verification finding ids of an attempt, and the published ones. */
function findingsOf(record) {
  const verdicts = Array.isArray(record.verification?.verdicts) ? record.verification.verdicts : [];
  const published = Array.isArray(record.findings) ? record.findings : [];
  return {
    pre: verdicts.map((v) => v.id),
    published: new Set(published.map((f) => f.id)),
  };
}

/**
 * The guard over one PR series. Throws on an input the owner has not fully
 * matched; returns `{verdict, perDefect, attempts, valid}` otherwise.
 */
export function evaluateRecall({ defects, matches, attempts }) {
  if (!Array.isArray(defects)) throw new Error("defects must be a JSON array of { id }");
  const ids = new Set();
  for (const defect of defects) {
    if (typeof defect?.id !== "string" || defect.id === "") throw new Error("every defect needs a non-empty id");
    if (ids.has(defect.id)) throw new Error(`duplicate defect id ${defect.id}`);
    ids.add(defect.id);
  }
  if (typeof matches !== "object" || matches === null || Array.isArray(matches)) {
    throw new Error("matches must be an object keyed by attempt id");
  }

  assertOnePrSeries(attempts);
  const valid = attempts.filter(isValid);
  const byId = new Map(attempts.map((record) => [record.id, record]));
  for (const [attemptId, perFinding] of Object.entries(matches)) {
    const record = byId.get(attemptId);
    if (record === undefined) throw new Error(`matches name attempt ${attemptId}, which the series does not hold`);
    const { pre } = findingsOf(record);
    for (const [findingId, list] of Object.entries(perFinding)) {
      if (!pre.includes(findingId)) {
        throw new Error(`matches name ${attemptId}/${findingId}, which is not a pre-verification finding`);
      }
      if (!Array.isArray(list)) throw new Error(`${attemptId}/${findingId}: a match must be a list of defect ids`);
      for (const defectId of list) {
        if (!ids.has(defectId)) throw new Error(`${attemptId}/${findingId} names unknown defect ${String(defectId)}`);
      }
    }
  }
  // Every recorded attempt, valid or not: detection is reported over all of
  // them, so an invalid attempt's findings need their match entries too.
  for (const record of attempts) {
    for (const findingId of findingsOf(record).pre) {
      if (!Array.isArray(matches[record.id]?.[findingId])) {
        throw new Error(
          `${record.id}/${findingId} has no owner-approved match entry ([] means none); refusing to read it as unmatched`,
        );
      }
    }
  }

  // K raised / published in one attempt (plan-review 3rd run F5).
  const stateIn = (record, id) => {
    const { pre, published } = findingsOf(record);
    const matched = pre.filter((findingId) => matches[record.id]?.[findingId]?.includes(id) === true);
    return { raised: matched.length > 0, published: matched.some((findingId) => published.has(findingId)) };
  };
  const perDefect = defects.map(({ id }) => {
    const inValid = valid.map((record) => stateIn(record, id)).filter((state) => state.raised);
    const k = inValid.length;
    const p = inValid.filter((state) => state.published).length;
    const raised = k > 0;
    return {
      id,
      k,
      p,
      required: raised ? required(k) : null,
      pass: raised ? p >= required(k) : null,
      // Informational (F7): K published in x of ALL the series' attempts,
      // valid or not — numerator and denominator over the same set.
      detection: {
        x: attempts.filter((record) => stateIn(record, id).published).length,
        of: attempts.length,
        over: "all attempts",
      },
      note: raised ? null : "not raised — no evidence about the verifier",
    };
  });

  const raised = perDefect.filter((d) => d.k > 0);
  const verdict = raised.some((d) => d.pass === false)
    ? "FAIL"
    : defects.length === 0 || raised.length === 0
      ? "NOT PROVEN"
      : "PASS";
  return { verdict, perDefect, attempts: attempts.length, valid: valid.length };
}

function main(args) {
  if (args.length !== 3) {
    console.error("usage: node scripts/recall-guard.mjs <defects.json> <matches.json> <series.jsonl>");
    return 2;
  }
  let result;
  try {
    result = evaluateRecall({
      defects: JSON.parse(readFileSync(args[0], "utf8")),
      matches: JSON.parse(readFileSync(args[1], "utf8")),
      attempts: attemptsOf(readFileSync(args[2], "utf8")),
    });
  } catch (error) {
    console.error(`recall-guard: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  for (const d of result.perDefect) {
    console.log(
      d.k === 0
        ? `${d.id}: k=0 — ${d.note}; detection (published, all attempts) ${String(d.detection.x)}/${String(d.detection.of)}`
        : `${d.id}: raised k=${String(d.k)}, published p=${String(d.p)} (valid attempts), needs ${String(d.required)} → ` +
            `${d.pass ? "PASS" : "FAIL"}; detection (published, all attempts) ${String(d.detection.x)}/${String(d.detection.of)}`,
    );
  }
  if (result.perDefect.length === 0) console.log("no known defect listed — the guard cannot be PASS");
  console.log(`valid attempts: ${String(result.valid)}/${String(result.attempts)}`);
  console.log(`R4: ${result.verdict}`);
  console.log(`SUMMARY ${JSON.stringify(result)}`);
  return result.verdict === "PASS" ? 0 : 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
