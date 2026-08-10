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
