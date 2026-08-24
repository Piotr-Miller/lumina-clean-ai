import { NoObjectGeneratedError } from "ai";
import { describe, expect, it, vi } from "vitest";

import {
  extractJsonObject,
  REPAIRED_SUMMARY_PLACEHOLDER,
  repairParsedJudgeOutput,
  repairParsedOutput,
  repairReviewResultShape,
  tolerantReviewOutput,
} from "./output-repair.js";
import { CRITERIA } from "./scorecard.js";
import { reviewResultSchema } from "./schemas.js";

// The live drift this layer exists for (glm-4.6, tool-active): a bare findings
// ARRAY, `path` where the schema says `file`, and a report-style severity
// ladder. Recorded verbatim from the failing CI run so the fix is pinned to
// the real shape, not an imagined one.
const DRIFTED_FINDING = {
  severity: "WARNING",
  path: "packages/code-reviewer/src/cli.ts",
  startLine: 89,
  endLine: 98,
  category: "security",
  description: "model-chosen paths reach the log",
  suggestion: "sanitize them",
};

const CANONICAL_FINDING = {
  file: "src/a.ts",
  startLine: 3,
  severity: "major",
  category: "correctness",
  description: "off-by-one",
  suggestion: "use <=",
};

describe("repairReviewResultShape", () => {
  it("wraps a bare findings array into the schema envelope", () => {
    const repaired = repairReviewResultShape([DRIFTED_FINDING]);
    const parsed = reviewResultSchema.safeParse(repaired);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.summary).toBe(REPAIRED_SUMMARY_PLACEHOLDER);
    expect(parsed.data?.findings).toHaveLength(1);
  });

  it("renames the tool's `path` field onto the schema's `file`", () => {
    const repaired = repairReviewResultShape([DRIFTED_FINDING]) as {
      findings: Record<string, unknown>[];
    };
    expect(repaired.findings[0].file).toBe("packages/code-reviewer/src/cli.ts");
    expect(repaired.findings[0]).not.toHaveProperty("path");
  });

  it("maps report-style severities onto the canonical enum", () => {
    const ladder = ["CRITICAL", "WARNING", "OBSERVATION", "info", "Major"];
    const repaired = repairReviewResultShape(ladder.map((severity) => ({ ...DRIFTED_FINDING, severity }))) as {
      findings: { severity: string }[];
    };
    expect(repaired.findings.map((f) => f.severity)).toEqual(["critical", "major", "minor", "nit", "major"]);
  });

  it("never overwrites a file the model did supply", () => {
    const repaired = repairReviewResultShape([{ ...DRIFTED_FINDING, file: "real.ts", path: "wrong.ts" }]) as {
      findings: { file: string }[];
    };
    expect(repaired.findings[0].file).toBe("real.ts");
  });

  it("leaves an already-canonical result untouched", () => {
    const canonical = { summary: "looks fine", findings: [CANONICAL_FINDING] };
    expect(repairReviewResultShape(canonical)).toEqual(canonical);
  });

  it("leaves an unrecognized severity alone so validation still rejects it", () => {
    const repaired = repairReviewResultShape([{ ...DRIFTED_FINDING, severity: "spicy" }]);
    expect(reviewResultSchema.safeParse(repaired).success).toBe(false);
  });

  it("supplies the placeholder when only the summary is missing", () => {
    const repaired = repairReviewResultShape({ findings: [CANONICAL_FINDING] }) as {
      summary: string;
    };
    expect(repaired.summary).toBe(REPAIRED_SUMMARY_PLACEHOLDER);
  });
});

const schemaFailure = (text: string): NoObjectGeneratedError =>
  new NoObjectGeneratedError({
    message: "No object generated: response did not match schema.",
    text,
    response: { id: "r", timestamp: new Date(0), modelId: "m" },
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokenDetails: { textTokens: 1, reasoningTokens: 0 },
    },
    finishReason: "stop",
  });

// parseCompleteOutput's second argument is provider metadata the repair path
// never reads; one shared stub keeps the tests about shape, not plumbing.
const CONTEXT = {
  response: { id: "r", timestamp: new Date(0), modelId: "m" },
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  finishReason: "stop",
} as unknown as Parameters<ReturnType<typeof tolerantReviewOutput>["parseCompleteOutput"]>[1];

const parse = (text: string, onRepair?: (detail: { reason: string }) => void) =>
  tolerantReviewOutput({ onRepair }).parseCompleteOutput({ text }, CONTEXT);

describe("tolerantReviewOutput", () => {
  it("parses a canonical response without reporting a repair", async () => {
    const onRepair = vi.fn();
    const result = await parse(JSON.stringify({ summary: "fine", findings: [CANONICAL_FINDING] }), onRepair);
    expect(result.summary).toBe("fine");
    expect(onRepair).not.toHaveBeenCalled();
  });

  it("rescues the live drift and reports the repair", async () => {
    const onRepair = vi.fn();
    const result = await parse(JSON.stringify([DRIFTED_FINDING]), onRepair);
    expect(result.findings[0].file).toBe("packages/code-reviewer/src/cli.ts");
    expect(result.findings[0].severity).toBe("major");
    expect(onRepair).toHaveBeenCalledTimes(1);
  });

  it("rethrows when the response is not JSON at all", async () => {
    await expect(parse("I cannot review this.")).rejects.toThrow(NoObjectGeneratedError);
  });

  it("rethrows when a repair still cannot satisfy the schema", async () => {
    // Findings missing required fields are not something this layer invents.
    await expect(parse(JSON.stringify([{ severity: "WARNING" }]))).rejects.toThrow(NoObjectGeneratedError);
  });

  it("refuses to repair a failure that is not a schema mismatch", () => {
    // Aborts and provider errors must propagate untouched, never be treated
    // as a drifted envelope worth rescuing.
    expect(repairParsedOutput(new Error("aborted"), JSON.stringify([CANONICAL_FINDING]))).toBeUndefined();
  });

  it("refuses to repair a non-JSON response", () => {
    expect(repairParsedOutput(schemaFailure("I cannot review this."), "I cannot review this.")).toBeUndefined();
  });

  it("repairs the live drift through the pure decision function", () => {
    const text = JSON.stringify([DRIFTED_FINDING]);
    expect(repairParsedOutput(schemaFailure(text), text)?.findings[0].file).toBe("packages/code-reviewer/src/cli.ts");
  });
});

describe("extractJsonObject", () => {
  it("returns a bare object unchanged", () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it("unwraps a Markdown-fenced object", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("extracts an object buried in surrounding prose", () => {
    expect(extractJsonObject('Here is my scorecard:\n{"a":1}\nHope that helps!')).toBe('{"a":1}');
  });

  // A brace inside a justification string must not end the scan early — the
  // judge writes prose, and prose contains braces.
  it("ignores braces inside strings and escapes", () => {
    const text = '{"j":"use {this} and \\"that\\"","k":2}';
    expect(extractJsonObject(text)).toBe(text);
  });

  it("handles nested objects", () => {
    expect(extractJsonObject('noise {"a":{"b":{"c":1}}} tail')).toBe('{"a":{"b":{"c":1}}}');
  });

  // A truncated object must NOT come back as a partial slice: half an object
  // parses as valid-looking nonsense and would be scored as a real verdict.
  it("returns undefined for an unbalanced object rather than a partial slice", () => {
    expect(extractJsonObject('{"a":1, "b":')).toBeUndefined();
  });

  it("returns undefined when there is no object at all", () => {
    expect(extractJsonObject("I cannot produce that.")).toBeUndefined();
    expect(extractJsonObject(undefined)).toBeUndefined();
  });
});

describe("repairParsedJudgeOutput", () => {
  const validJudge = () => ({
    scores: Object.fromEntries(CRITERIA.map(({ key }) => [key, { score: "7", justification: "j", findingIds: [] }])),
    verdict: "passed",
    verdictReason: "fine",
    summary: "s",
  });

  // Reuses the same construction the finder's tests use — the SDK error needs
  // response/usage/finishReason, not just a message.
  const noObjectError = schemaFailure;

  it("rescues a fenced scorecard", () => {
    const text = "```json\n" + JSON.stringify(validJudge()) + "\n```";
    expect(repairParsedJudgeOutput(noObjectError(text), text)?.verdict).toBe("passed");
  });

  it("rescues a scorecard wrapped in prose", () => {
    const text = `Here you go:\n${JSON.stringify(validJudge())}\nLet me know.`;
    expect(repairParsedJudgeOutput(noObjectError(text), text)?.verdict).toBe("passed");
  });

  // The strict schema stays the authority: a repair that does not validate is
  // not a repair, and must rethrow rather than invent a verdict.
  it("refuses output that is well-formed JSON but not a scorecard", () => {
    const text = '{"verdict":"passed"}';
    expect(repairParsedJudgeOutput(noObjectError(text), text)).toBeUndefined();
  });

  it("refuses a truncated scorecard", () => {
    const text = JSON.stringify(validJudge()).slice(0, 80);
    expect(repairParsedJudgeOutput(noObjectError(text), text)).toBeUndefined();
  });

  // Only NoObjectGeneratedError is a repair candidate — a timeout or provider
  // error has no text to salvage, and measurement showed aborts surface as
  // TimeoutError, never as this class.
  it("ignores non-schema failures", () => {
    const text = JSON.stringify(validJudge());
    expect(repairParsedJudgeOutput(new Error("boom"), text)).toBeUndefined();
  });
});
