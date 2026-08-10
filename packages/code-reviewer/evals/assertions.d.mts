export interface AssertionResult {
  pass: boolean;
  score: number;
  reason: string;
  componentResults?: AssertionResult[];
}

export interface ExpectedIssue {
  label: string;
  patterns: unknown[];
}

export function reviewMustFail(output: unknown): AssertionResult;

export function scoreIssueRecall(
  output: unknown,
  context: { vars: { expectedIssues: ExpectedIssue[] } },
): AssertionResult;
