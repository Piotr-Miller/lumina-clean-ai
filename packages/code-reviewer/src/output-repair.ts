import { NoObjectGeneratedError, Output } from "ai";

import { judgeOutputSchema, reviewResultSchema, type JudgeOutputWire, type ReviewResult } from "./schemas.js";

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
  // The recorded live drift shape predates crossUserAccess. Default to the
  // bottom-rank value: a repaired-in value must never manufacture severity
  // (pre-registered pattern, finder-severity-structural-retry Arm B).
  if (typeof repaired.crossUserAccess !== "boolean") {
    repaired.crossUserAccess = false;
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

// --- Judge envelope repair ---
//
// WHY, and why it is shaped differently from the finder's: the judge shipped
// with NO repair on the stated grounds that "the judge runs the same sonnet
// model without it and has never needed it". That assumption was falsified on
// PR #127 — four consecutive AI_NoObjectGeneratedError failures across two runs
// (31707888975 and its re-run), which killed the whole review at exit 1.
//
// The finder's repair maps three drift modes that were directly OBSERVED. The
// judge's drift was not: the run log records the error class, never the text.
// So this layer deliberately does NOT guess at field-level drift. It only
// recovers JSON that is *present but wrapped* — fenced in Markdown, or sitting
// inside surrounding prose — which is the one class that can be undone without
// inventing anything. Everything else rethrows.
//
// Ruled out by measurement rather than assumed: a mid-generation timeout abort
// surfaces as TimeoutError, not NoObjectGeneratedError (3/3 forced 20s aborts),
// so CI's parse failures are genuinely malformed output and not truncation.

/**
 * The JSON object inside a response that may be fenced or surrounded by prose.
 *
 * Scans for the first balanced top-level `{...}`, respecting strings and
 * escapes so a brace inside a justification cannot end the scan early. Returns
 * `undefined` when there is no balanced object — never a partial slice, because
 * a truncated object would parse as valid-looking nonsense.
 */
export function extractJsonObject(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  const start = text.indexOf("{");
  if (start === -1) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return undefined;
}

/**
 * Recovery decision for the judge, pure so it is testable without a provider:
 * a schema-valid `JudgeOutput`, or `undefined` meaning "rethrow the original".
 *
 * Re-validated against the STRICT `judgeOutputSchema` — the same discipline as
 * the finder's: a repair that does not produce a schema-valid result is not a
 * repair.
 */
export function repairParsedJudgeOutput(error: unknown, text: string | undefined): JudgeOutputWire | undefined {
  if (!NoObjectGeneratedError.isInstance(error)) return undefined;
  const json = extractJsonObject(text);
  if (json === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  const candidate = judgeOutputSchema.safeParse(parsed);
  return candidate.success ? candidate.data : undefined;
}

/** `Output.object(judgeOutputSchema)` with the same one recovery pass the finder gets. */
export function tolerantJudgeOutput(options: TolerantReviewOutputOptions = {}) {
  const base = Output.object<JudgeOutputWire>({
    schema: judgeOutputSchema,
    name: "judge_scorecard",
    description: "A single JSON object with `scores`, `verdict`, `verdictReason`, and `summary` — no prose around it.",
  });
  return {
    ...base,
    async parseCompleteOutput(...args: Parameters<typeof base.parseCompleteOutput>): Promise<JudgeOutputWire> {
      const [parseOptions] = args;
      try {
        return await base.parseCompleteOutput(...args);
      } catch (error) {
        const repaired = repairParsedJudgeOutput(error, parseOptions.text);
        if (repaired === undefined) throw error;
        options.onRepair?.({ reason: (error as Error).message });
        return repaired;
      }
    },
  };
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
