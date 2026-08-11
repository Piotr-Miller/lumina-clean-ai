import { NoObjectGeneratedError, Output } from "ai";

import { reviewResultSchema, type ReviewResult } from "./schemas.js";

// Envelope repair for the finder's structured output.
//
// WHY: glm-4.6 running TOOL-ACTIVE drifts off `reviewResultSchema` in three
// ways at once — it emits a bare findings ARRAY instead of the wrapped
// object, names the path field `path` (the getFileContext tool's own input
// field) instead of `file`, and reaches for a report-style severity ladder
// (`WARNING`, `OBSERVATION`) instead of the enum. The findings themselves are
// well-formed; only the envelope is wrong, so the whole paid review died on a
// shape nit. Tool-less runs of the same diff pass, which is why this only
// began failing once --source-root shipped.
//
// The canonical `reviewResultSchema` stays STRICT — it is the vocabulary the
// judge, the evals (`review-result.schema.json`, additionalProperties: false)
// and every future orchestrator speak. Leniency lives here instead, at the
// single boundary where an untrusted model response enters, and every repair
// is re-validated against that same strict schema: a repair that doesn't
// produce a schema-valid result rethrows the original error rather than
// inventing data.

/** Marker used when the model returned findings with no summary at all. */
export const REPAIRED_SUMMARY_PLACEHOLDER = "(model returned findings without a summary)";

// Report-style ladders the model borrows from prose (our own impl-review
// documents ride along in reviewed diffs and use exactly these words). Mapped
// conservatively onto the canonical enum; anything unrecognized is left as-is
// so validation still rejects it.
const SEVERITY_SYNONYMS: Record<string, string> = {
  blocker: "critical",
  error: "critical",
  high: "major",
  warning: "major",
  medium: "major",
  low: "minor",
  observation: "minor",
  info: "nit",
  suggestion: "nit",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// `path` is the getFileContext input field; a tool-carrying model conflates it
// with the finding's `file`. Only fills `file` when it is actually absent, so
// a model that sends both keeps its own value.
function repairFinding(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const repaired = { ...value };
  if (typeof repaired.file !== "string" && typeof repaired.path === "string") {
    repaired.file = repaired.path;
    delete repaired.path;
  }
  if (typeof repaired.severity === "string") {
    const lowered = repaired.severity.toLowerCase();
    repaired.severity = SEVERITY_SYNONYMS[lowered] ?? lowered;
  }
  if (typeof repaired.category === "string") {
    repaired.category = repaired.category.toLowerCase();
  }
  return repaired;
}

/**
 * Best-effort normalization of a parsed model response toward
 * `reviewResultSchema`. Shape-only: it never invents a finding, never drops
 * one, and never rewrites description or suggestion text. Returns the input
 * untouched when there is nothing it knows how to repair.
 */
export function repairReviewResultShape(value: unknown): unknown {
  // Bare array → the wrapped object. The summary is synthesized rather than
  // guessed from the findings: a fabricated verdict sentence would read as
  // the model's own words in the PR comment.
  if (Array.isArray(value)) {
    return { summary: REPAIRED_SUMMARY_PLACEHOLDER, findings: value.map(repairFinding) };
  }
  if (!isRecord(value)) return value;
  const repaired = { ...value };
  if (typeof repaired.summary !== "string") repaired.summary = REPAIRED_SUMMARY_PLACEHOLDER;
  if (Array.isArray(repaired.findings)) repaired.findings = repaired.findings.map(repairFinding);
  return repaired;
}

/**
 * The recovery decision, pure so it can be tested without a provider: given
 * the failure the strict parse threw and the raw response text, return a
 * schema-valid result or `undefined` to mean "not repairable — rethrow".
 *
 * `undefined` covers every case this layer refuses to guess at: a failure
 * that isn't a schema/JSON mismatch (aborts, provider errors), a response
 * that isn't JSON, and a repaired shape that still fails validation.
 */
export function repairParsedOutput(error: unknown, text: string | undefined): ReviewResult | undefined {
  if (!NoObjectGeneratedError.isInstance(error)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text ?? "");
  } catch {
    return undefined;
  }
  const candidate = reviewResultSchema.safeParse(repairReviewResultShape(parsed));
  return candidate.success ? candidate.data : undefined;
}

export interface TolerantReviewOutputOptions {
  /**
   * Called when a repair rescued a response the strict parse rejected. The
   * drift is worth surfacing — a model that needs repairing every run is a
   * model-selection signal, not a steady state to hide.
   */
  onRepair?: (detail: { reason: string }) => void;
}

/**
 * `Output.object(reviewResultSchema)` with one recovery pass.
 *
 * The AI SDK's `experimental_repairText` hook exists only on
 * `generateObject`/`streamObject`; the `generateText` + `Output.object` path
 * that `ToolLoopAgent` uses has no repair seam (verified against the bundled
 * source of ai@7.0.52). `Output` is a plain interface, though, so composing
 * one is the supported extension point.
 */
export function tolerantReviewOutput(options: TolerantReviewOutputOptions = {}) {
  const base = Output.object<ReviewResult>({
    schema: reviewResultSchema,
    // Provider-side guidance: some providers surface the output name and
    // description to the model, which is the cheapest nudge back onto the
    // envelope.
    name: "review_result",
    description: "A single object with a `summary` string and a `findings` array — never a bare array.",
  });
  return {
    ...base,
    async parseCompleteOutput(
      ...args: Parameters<typeof base.parseCompleteOutput>
    ): Promise<ReviewResult> {
      const [parseOptions] = args;
      try {
        return await base.parseCompleteOutput(...args);
      } catch (error) {
        const repaired = repairParsedOutput(error, parseOptions.text);
        // Nothing this layer understands — surface the original failure
        // rather than a half-built object.
        if (repaired === undefined) throw error;
        options.onRepair?.({ reason: (error as Error).message });
        return repaired;
      }
    },
  };
}
