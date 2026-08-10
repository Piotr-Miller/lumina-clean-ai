const parseOutput = (output) => (typeof output === "string" ? JSON.parse(output) : output);

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
    const matched = patterns.some((pattern) => new RegExp(String(pattern), "iu").test(searchable));
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
