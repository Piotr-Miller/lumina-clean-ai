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
