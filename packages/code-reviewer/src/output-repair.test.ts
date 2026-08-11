import { NoObjectGeneratedError } from "ai";
import { describe, expect, it, vi } from "vitest";

import {
  REPAIRED_SUMMARY_PLACEHOLDER,
  repairParsedOutput,
  repairReviewResultShape,
  tolerantReviewOutput,
} from "./output-repair.js";
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
    const repaired = repairReviewResultShape(
      ladder.map((severity) => ({ ...DRIFTED_FINDING, severity })),
    ) as { findings: { severity: string }[] };
    expect(repaired.findings.map((f) => f.severity)).toEqual([
      "critical",
      "major",
      "minor",
      "nit",
      "major",
    ]);
  });

  it("never overwrites a file the model did supply", () => {
    const repaired = repairReviewResultShape([
      { ...DRIFTED_FINDING, file: "real.ts", path: "wrong.ts" },
    ]) as { findings: { file: string }[] };
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
    const result = await parse(
      JSON.stringify({ summary: "fine", findings: [CANONICAL_FINDING] }),
      onRepair,
    );
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
    await expect(parse(JSON.stringify([{ severity: "WARNING" }]))).rejects.toThrow(
      NoObjectGeneratedError,
    );
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
    expect(repairParsedOutput(schemaFailure(text), text)?.findings[0].file).toBe(
      "packages/code-reviewer/src/cli.ts",
    );
  });
});
