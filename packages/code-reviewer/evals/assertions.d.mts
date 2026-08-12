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

/**
 * The slice of promptfoo's AssertionValueFunctionContext these assertions read.
 * `metadata` is promptfoo 0.122's shortcut to providerResponse.metadata, which
 * is where finder-provider.ts reports its tool telemetry — deliberately typed
 * loosely, because every assertion validates the shape at runtime and fails
 * closed on anything unexpected.
 */
export interface ToolAssertionContext {
  vars?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export function reviewMustFail(output: unknown): AssertionResult;

export function reviewMustPass(output: unknown): AssertionResult;

export function countToolCalls(output: unknown, context: ToolAssertionContext): AssertionResult;

export function requireToolContext(output: unknown, context: ToolAssertionContext): AssertionResult;

export function scoreIssueRecall(
  output: unknown,
  context: { vars: { expectedIssues: ExpectedIssue[] } },
): AssertionResult;
