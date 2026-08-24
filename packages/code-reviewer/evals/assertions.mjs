const parseOutput = (output) => (typeof output === "string" ? JSON.parse(output) : output);

// Vocabulary from severitySchema (src/schemas.ts), worst first.
const SEVERITY_ORDER = ["critical", "major", "minor", "nit"];

// Finder-side proxy for "this review would fail the change": at least one
// finding at critical or major severity.
export function reviewMustFail(output) {
  let review;
  try {
    review = parseOutput(output);
  } catch (error) {
    return {
      pass: false,
      score: 0,
      reason: "Reviewer output is not JSON: " + (error instanceof Error ? error.message : String(error)),
    };
  }

  const findings = Array.isArray(review?.findings) ? review.findings : [];
  if (findings.length === 0) {
    return { pass: false, score: 0, reason: "Review contains no findings" };
  }

  const highest = SEVERITY_ORDER.find((severity) => findings.some((finding) => finding?.severity === severity));
  if (highest === undefined) {
    return { pass: false, score: 0, reason: "No finding carries a recognized severity" };
  }

  const pass = highest === "critical" || highest === "major";
  return {
    pass,
    score: pass ? 1 : 0,
    reason: "Highest severity found: " + highest,
  };
}

// Inverse of reviewMustFail, for the defect-free case: a review that
// manufactures a critical or major finding on a clean change is over-reporting,
// which is what the tool-enabled clean case measures. Minor and nit are
// tolerated — a reviewer noting a nit on a healthy diff is not a false alarm.
export function reviewMustPass(output) {
  let review;
  try {
    review = parseOutput(output);
  } catch (error) {
    return {
      pass: false,
      score: 0,
      reason: "Reviewer output is not JSON: " + (error instanceof Error ? error.message : String(error)),
    };
  }

  // A missing findings array is a broken envelope, not a clean review — the
  // drifted bare-ARRAY output glm-4.6 produces under tool-attachment would
  // otherwise be scored as "no false alarms" (see output-repair.ts).
  if (!Array.isArray(review?.findings)) {
    return { pass: false, score: 0, reason: "Review carries no findings array" };
  }

  const falseAlarms = review.findings.filter(
    (finding) => finding?.severity === "critical" || finding?.severity === "major",
  );
  if (falseAlarms.length === 0) {
    return {
      pass: true,
      score: 1,
      reason: "No critical/major findings on a defect-free change (" + String(review.findings.length) + " total)",
    };
  }
  const listed = falseAlarms
    .map((finding) => String(finding.severity) + " on " + String(finding.file ?? "(no file)"))
    .join("; ");
  return {
    pass: false,
    score: 0,
    reason: "Manufactured " + String(falseAlarms.length) + " critical/major finding(s): " + listed,
  };
}

// --- Tool-loop telemetry -----------------------------------------------------
// finder-provider.ts reports per-run tool telemetry through promptfoo provider
// metadata, on the success AND the error path. Reading it from here is what
// keeps the closed review-result schema untouched — nothing new rides on the
// model's own output. promptfoo 0.122 exposes providerResponse.metadata as
// context.metadata.

const asPathList = (value) => (Array.isArray(value) ? value.filter((path) => typeof path === "string") : []);

// Returns {telemetry} or {reason}. Every unreadable shape FAILS CLOSED: a
// broken instrument must never be mistaken for an observed zero-call run.
function readToolTelemetry(context) {
  const metadata = context?.metadata;
  if (metadata === null || typeof metadata !== "object") {
    return { reason: "No provider metadata on this row, so tool usage is unobservable" };
  }
  if (metadata.toolEnabled !== true) {
    return { reason: "Row ran tool-less; this assertion belongs on a case that declares a fixtureRoot" };
  }
  // Integer + non-negative, not merely `typeof === "number"`: NaN, Infinity and
  // a negative count are all broken instruments, and NaN in particular would
  // poison tool_calls' average for the whole model (impl-review-phase-2 F1).
  if (!Number.isInteger(metadata.toolCalls) || metadata.toolCalls < 0) {
    return { reason: "Provider metadata carries no usable toolCalls count: " + String(metadata.toolCalls) };
  }
  return {
    telemetry: {
      toolCalls: metadata.toolCalls,
      requestedPaths: asPathList(metadata.requestedPaths),
      deliveredPaths: asPathList(metadata.deliveredPaths),
      refusedPaths: asPathList(metadata.refusedPaths),
    },
  };
}

const listPaths = (paths) => (paths.length === 0 ? "none" : paths.join(", "));

/**
 * Observational tool-usage metric. `score` is the RAW CALL COUNT, refusals
 * included — not a 0-1 ratio — because promptfoo averages a named metric across
 * rows, so `tool_calls` reads as "average getFileContext invocations per row"
 * for each model. It gates nothing: a model may legitimately answer a small
 * diff without fetching, and `tool_required` is where that becomes a failure.
 */
export function countToolCalls(output, context) {
  const read = readToolTelemetry(context);
  if (read.telemetry === undefined) {
    return { pass: false, score: 0, reason: read.reason };
  }

  const { toolCalls, deliveredPaths, refusedPaths } = read.telemetry;
  return {
    pass: true,
    score: toolCalls,
    reason:
      String(toolCalls) +
      " getFileContext call(s) — delivered: " +
      listPaths(deliveredPaths) +
      "; refused: " +
      listPaths(refusedPaths),
  };
}

/**
 * Gate for a case whose defect is knowable ONLY from outside the hunk: the
 * model must have RECEIVED the out-of-hunk file, not merely asked for it.
 * Invocation alone is not evidence — createDiffScopedSource answers an unlisted
 * path, a containment failure or an unreadable file with a model-facing refusal
 * STRING, so from the model's side a refused call looks like a successful fetch.
 * The path comes from the case's `requiredContextPath` var and must be spelled
 * exactly as the diff's `+++ b/<path>` names it (the allowlist is exact-match).
 */
export function requireToolContext(output, context) {
  const requiredPath = context?.vars?.requiredContextPath;
  if (typeof requiredPath !== "string" || requiredPath.length === 0) {
    return { pass: false, score: 0, reason: "No requiredContextPath configured for this case" };
  }

  const read = readToolTelemetry(context);
  if (read.telemetry === undefined) {
    return { pass: false, score: 0, reason: read.reason };
  }

  const { toolCalls, requestedPaths, deliveredPaths, refusedPaths } = read.telemetry;
  const invoked = toolCalls > 0;
  const delivered = deliveredPaths.includes(requiredPath);
  const refused = refusedPaths.includes(requiredPath);
  const requested = requestedPaths.includes(requiredPath);
  // Delivery counts as evidence only when the rest of the telemetry agrees with
  // it. finder-provider.ts records the request and its outcome in the SAME
  // callback, and a delivery cannot happen without a call — so "delivered, but
  // zero calls" or "delivered, but never requested" means the instrument
  // contradicts itself, and reading the optimistic half would let a broken
  // instrument report adoption (impl-review-phase-2 F1).
  const consistent = invoked && requested;

  const contradiction =
    "Telemetry contradicts itself: " +
    requiredPath +
    " is reported delivered, but the run reports " +
    String(toolCalls) +
    " call(s)" +
    (requested ? "" : " and no request for it");

  const componentResults = [
    {
      pass: invoked,
      score: invoked ? 1 : 0,
      reason: invoked ? "Called getFileContext " + String(toolCalls) + " time(s)" : "Never called getFileContext",
    },
    {
      pass: delivered && consistent,
      score: delivered && consistent ? 1 : 0,
      reason: delivered
        ? consistent
          ? "Received content for " + requiredPath
          : contradiction
        : refused
          ? "Asked for " + requiredPath + " but the source refused it, so no context reached the model"
          : "Never received " + requiredPath + " (requested: " + listPaths(requestedPaths) + ")",
    },
  ];

  // The component split exists to tell "never asked" from "asked and refused"
  // from "the instrument disagrees with itself".
  const pass = delivered && consistent;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? "Out-of-hunk context delivered: " + requiredPath
      : delivered
        ? contradiction
        : "Out-of-hunk context never delivered: " + requiredPath,
    componentResults,
  };
}

// --- Hardening fixtures ------------------------------------------------------
// The defect under study: the finder asserting that a defence PRESENT in the
// diff is MISSING ("no validation", "not sanitized", "not provided"). Every
// fabricated finding on PR #127 had that shape — one flagged a line two below
// the comment explaining the very defence it called absent.
//
// THE FABRICATION METRIC ITSELF IS NOT HERE. It is the `no_fabricated_absence`
// llm-rubric in promptfooconfig.yaml, judged by the neutral grader.
//
// A deterministic matcher held that job through seven review rounds and was
// retired on 2026-08-14 without ever passing. The pattern never broke: each round
// fixed its named cases and broke adjacent ones. Demoted to a high-precision
// cross-check, it still raised false alarms on 16 of 20 clean adversarial
// sentences — "No further validation is necessary because OBJECT_KEY is
// anchored", "OBJECT_KEY rejects unvalidated input", "The test fails to validate
// malformed fixtures" — and precision was by then the ONLY property it needed. A
// cross-check that must be second-guessed is not one, so it was deleted rather
// than patched an eighth time.
//
// If a deterministic signal is ever wanted here again, the lesson is in
// context/foundation/lessons.md: negation scope, clause attachment and
// approving-but-negative phrasing are not reachable lexically, and each guard
// added to catch one class opened another.
//
// What remains: the over-suppression guard and the quote-fidelity metric. Both
// are narrow, both name their own subject, and neither judges natural-language
// negation.

/** Shared JSON gate for the graders below, so each stays readable. */
function readReview(output) {
  try {
    return { review: parseOutput(output) };
  } catch (error) {
    return { reason: "Reviewer output is not JSON: " + (error instanceof Error ? error.message : String(error)) };
  }
}

/**
 * The ONLY fields these graders read. `evidence` is excluded on purpose: from
 * Phase 3 it carries a verbatim source quote, so a grader searching the whole
 * finding would match the quoted defence and score a fabrication as a correct
 * report (plan review F2 — the reason scoreIssueRecall is not reused here).
 * `summary` is excluded because a per-finding verdict needs a per-finding
 * subject.
 */
const findingProse = (finding) =>
  [finding?.description, finding?.suggestion].filter((part) => typeof part === "string" && part.length > 0).join("\n");

function compilePatterns(patterns) {
  const list = Array.isArray(patterns) ? patterns : [];
  if (list.length === 0) return { reason: "no patterns" };
  try {
    return { compiled: list.map((pattern) => new RegExp(String(pattern), "iu")) };
  } catch {
    return { reason: "invalid pattern" };
  }
}

// Negation cues, kept as a source string so every call compiles a FRESH regex —
// a shared /g/ regex carries lastIndex between calls and would skip matches.
// Absence detection is TEMPLATE-based, not cue-based, because a negation near a
// defence says nothing about what the negation attaches to. Reviewers routinely
// use negative wording to APPROVE a defence — "no path traversal is possible
// because parseObjectKey rejects dot segments" — and a nearby-cue heuristic
// scores every one of those as a fabrication (Phase 1 manual review, 1.14).
//
// So a negation only counts when it attaches to a MECHANISM: the thing a defence
// IS. "no traversal check exists" claims an absence; "no traversal is possible"
// asserts the opposite. The templates below encode that direction.

// The nouns a defence is. Deliberately excludes attack nouns (traversal,
// injection, XSS): those are what a defence PREVENTS, and negating them is
// approval.
const oneLine = (text, limit = 160) => {
  const flat = text.replace(/\s+/gu, " ").trim();
  return flat.length <= limit ? flat : flat.slice(0, limit) + "…";
};

/**
 * Over-suppression guard for the paired vulnerable fixture: the planted defect
 * must be REPORTED, not merely quoted.
 *
 * Deliberately not scoreIssueRecall, which regex-tests JSON.stringify(review) —
 * once findings carry an `evidence` quote of the vulnerable line, that search
 * matches the quote and passes while the finding text says nothing about the
 * vulnerability (plan review F2). This grader reads findingProse only, and
 * requires the SAME finding to carry critical or major severity, so a defect
 * mentioned in passing as a nit does not clear the guard.
 *
 * Reads the case's `expectedDefect` var: { label, patterns[] }.
 */
export function requireDefectReported(output, context) {
  const read = readReview(output);
  if (read.review === undefined) return { pass: false, score: 0, reason: read.reason };
  const review = read.review;

  const defect = context?.vars?.expectedDefect;
  if (defect === null || typeof defect !== "object" || Array.isArray(defect)) {
    return { pass: false, score: 0, reason: "No expectedDefect configured for this case" };
  }
  const label = String(defect.label ?? "(unlabelled)");
  const compiled = compilePatterns(defect.patterns);
  if (compiled.compiled === undefined) {
    return { pass: false, score: 0, reason: compiled.reason + " for " + label };
  }

  if (!Array.isArray(review?.findings)) {
    return { pass: false, score: 0, reason: "Review carries no findings array" };
  }

  const matching = review.findings.filter((finding) =>
    compiled.compiled.some((pattern) => pattern.test(findingProse(finding))),
  );
  if (matching.length === 0) {
    return {
      pass: false,
      score: 0,
      reason:
        "No finding reports " +
        label +
        " in its description or suggestion (" +
        String(review.findings.length) +
        " finding(s); evidence and summary are not searched)",
    };
  }

  const escalated = matching.filter((finding) => finding?.severity === "critical" || finding?.severity === "major");
  if (escalated.length === 0) {
    const severities = matching.map((finding) => String(finding?.severity)).join(", ");
    return {
      pass: false,
      score: 0,
      reason: "Reported " + label + " only below major severity: " + severities,
    };
  }

  return {
    pass: true,
    score: 1,
    reason: "Reported " + label + " at " + String(escalated[0].severity) + " severity",
  };
}

const collapse = (text) => text.replace(/\s+/gu, " ").trim();

// Diff headers first, THEN marker stripping: "--- a/x" and "+++ b/x" both start
// with a marker character and would otherwise survive as content.
const canonicalDiffBody = (diff) =>
  collapse(
    diff
      .split(/\r?\n/u)
      .filter((line) => !/^(?:diff --git |index |--- |\+\+\+ |@@)/u.test(line))
      .map((line) => line.replace(/^[+\- ]/u, ""))
      .join("\n"),
  );

const canonicalQuote = (text) =>
  collapse(
    text
      .split(/\r?\n/u)
      .map((line) => line.replace(/^\s*[+\-]\s?/u, ""))
      .join("\n"),
  );

/**
 * Observational quote-fidelity metric. Gates nothing; the number is the point.
 *
 * The schema can only require `evidence` to be non-empty — it cannot prove the
 * string is a real quote (plan review F4), and enforcing that in a superRefine
 * would reject a whole review over one bad quote. So fidelity is MEASURED here:
 * the share of offered evidence strings that appear verbatim in the diff after
 * canonicalization (diff markers stripped, whitespace collapsed).
 *
 * The denominator is evidence OFFERED, not findings, and a run with no evidence
 * at all scores 1 as "not applicable". That keeps pre-intervention baseline rows
 * — where the field does not exist yet — from dragging the average, and makes
 * the metric read as "of the quotes offered, how many are real".
 */
export function scoreEvidenceFidelity(output, context) {
  const read = readReview(output);
  if (read.review === undefined) return { pass: false, score: 0, reason: read.reason };
  const review = read.review;

  const diff = context?.vars?.diff;
  if (typeof diff !== "string" || diff.length === 0) {
    return { pass: false, score: 0, reason: "No diff var on this row, so quotes are unverifiable" };
  }
  if (!Array.isArray(review?.findings)) {
    return { pass: false, score: 0, reason: "Review carries no findings array" };
  }

  const offered = review.findings
    .map((finding, index) => ({
      index,
      evidence: typeof finding?.evidence === "string" ? finding.evidence.trim() : "",
    }))
    .filter((entry) => entry.evidence.length > 0);

  if (offered.length === 0) {
    return {
      pass: true,
      score: 1,
      reason:
        "Not applicable: no finding carries an evidence field (" + String(review.findings.length) + " finding(s))",
    };
  }

  const body = canonicalDiffBody(diff);
  const invented = offered.filter((entry) => !body.includes(canonicalQuote(entry.evidence)));
  const score = (offered.length - invented.length) / offered.length;

  return {
    pass: true,
    score,
    reason:
      String(offered.length - invented.length) +
      " of " +
      String(offered.length) +
      " evidence string(s) quote the diff verbatim" +
      (invented.length === 0
        ? ""
        : " — not found: " +
          invented.map((entry) => "#" + String(entry.index) + ' "' + oneLine(entry.evidence, 80) + '"').join("; ")),
  };
}

export function scoreIssueRecall(output, context) {
  let review;
  try {
    review = parseOutput(output);
  } catch (error) {
    return {
      pass: false,
      score: 0,
      reason: "Reviewer output is not JSON: " + (error instanceof Error ? error.message : String(error)),
    };
  }

  const expectedIssues = context.vars.expectedIssues;
  if (!Array.isArray(expectedIssues) || expectedIssues.length === 0) {
    return { pass: false, score: 0, reason: "No expected issues configured" };
  }

  const searchable = JSON.stringify(review).toLowerCase();
  const componentResults = expectedIssues.map((issue) => {
    const patterns = Array.isArray(issue.patterns) ? issue.patterns : [];
    let compiledPatterns;
    try {
      compiledPatterns = patterns.map((pattern) => new RegExp(String(pattern), "iu"));
    } catch {
      return {
        pass: false,
        score: 0,
        reason: "invalid pattern for " + String(issue.label),
      };
    }
    const matched = compiledPatterns.some((pattern) => pattern.test(searchable));
    return {
      pass: matched,
      score: matched ? 1 : 0,
      reason: (matched ? "Found: " : "Missing: ") + String(issue.label),
    };
  });
  const hits = componentResults.filter((result) => result.pass).length;
  const score = hits / componentResults.length;
  // Integer hit-count is authoritative for pass/fail: a rounded ratio threshold
  // (score >= 0.67) would silently demand 3-of-3, because 2/3 = 0.666...
  const requiredHits = Math.ceil((componentResults.length * 2) / 3);

  return {
    pass: hits >= requiredHits,
    score,
    reason:
      "Found " +
      String(hits) +
      " of " +
      String(componentResults.length) +
      " expected issues (need " +
      String(requiredHits) +
      ")",
    componentResults,
  };
}
