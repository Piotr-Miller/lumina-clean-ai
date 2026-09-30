import { NoObjectGeneratedError, Output } from "ai";

import { judgeOutputSchema, reviewResultSchema, type JudgeOutputWire, type ReviewResult } from "./schemas.js";

// --- The finder's parser ---
//
// WHY it is ours: since 2026-09-20 the only endpoint OpenRouter routed a
// `json_schema` request to for glm-4.6 (Venice) stopped applying
// `response_format`, and 35/35 finder runs failed to parse
// (context/changes/finder-serialization-outage/frame.md). The finder therefore
// no longer asks the provider for structured output: the format is carried in
// the prompt, and this parser is the only thing that decides whether the
// response is a review.
//
// History: this file used to hold an ENVELOPE REPAIR for the finder
// (`repairReviewResultShape` / `tolerantReviewOutput`). glm-4.6 running
// tool-active under `response_format` drifted into a bare array, `path` for
// `file`, and a `WARNING`/`OBSERVATION` ladder, and the repair rescued those by
// synthesizing a summary and mapping the words onto the enum. It is gone on
// the owner's decision (change `finder-serialization-outage`, condition 3):
// the only thing code may remove is the WRAPPER — a markdown fence or prose
// around exactly one object. Anything else is a failure, which goes to one
// model-side format repair (reviewer.ts) and then to FinderOutputError.

// V8 phrases one JSON.parse failure as `Unexpected token 'x', "<the input>" is
// not valid JSON` — it quotes the rejected text. The reason travels into
// FinderOutputError's message, which the CLI prints raw and also writes to the
// step summary, where the rejected text must never go. So the quote is dropped,
// control characters are neutralised (the text is untrusted and the log public)
// and the length is capped. Position-style messages carry no text and pass
// through.
const MAX_REASON_CHARS = 300;
const capReason = (reason: string): string =>
  reason.length > MAX_REASON_CHARS ? `${reason.slice(0, MAX_REASON_CHARS)}…` : reason;
const describeJsonParseError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  const withoutQuote = message.replace(/, ".*" is not valid JSON$/su, " (the object is not valid JSON)");
  return capReason(withoutQuote.replace(/\p{Cc}/gu, "?"));
};

/** The finder's verdict on one response: a strictly valid review, or why not. */
export type FinderParseResult = { ok: true; result: ReviewResult } | { ok: false; reason: string };

/**
 * Wrapper removal → `JSON.parse` → the unchanged strict `reviewResultSchema`,
 * and nothing more. A bare array, `path` for `file`, `severity: "WARNING"` or a
 * missing `summary` are invalid here and stay invalid: filling in data on our
 * side would put words in the model's mouth. Prose with no object at all
 * ("No issues found.") is a failure too, never `findings: []` — an empty list
 * is valid only when the model wrote it.
 */
export function parseFinderOutput(text: string): FinderParseResult {
  const json = extractJsonObject(text);
  if (json === undefined) return { ok: false, reason: "no complete JSON object in the response" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return { ok: false, reason: `JSON.parse: ${describeJsonParseError(error)}` };
  }
  const result = reviewResultSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    // zod names the schema's own paths and expectations, never the received
    // value, so nothing of the rejected text rides along; only capped, because
    // a long findings list can fail on every entry.
    return { ok: false, reason: capReason(`schema: ${issues.join("; ")}`) };
  }
  return { ok: true, result: result.data };
}

export interface FinderOutputErrorDetails {
  /** The rejected model text — untrusted; the CLI prints it capped and escaped, never into comment.md. */
  text: string;
  /** The upstream that served the rejected response, when OpenRouter reported it. */
  provider?: string;
  /** How the rejected generation ended (`stop`, `length`, …). */
  finishReason?: string;
  /** Why parseFinderOutput refused the text. */
  validationError: string;
  /** Whether the one format repair was attempted before giving up. */
  repaired: boolean;
}

/**
 * The finder's terminal format failure. Deliberately NOT a
 * `NoObjectGeneratedError`: retry.ts re-rolls that class, and a re-roll of the
 * whole pass is exactly what the one format repair replaced — the frame saw
 * both attempts fail identically on every post-break run. The message names
 * the provider, the finish reason and the validation error, so one log line
 * attributes the failure.
 */
export class FinderOutputError extends Error {
  readonly text: string;
  // `declare`: an ordinary optional field is DEFINED as undefined under
  // ES2022 class fields, so `"provider" in error` would be true for a response
  // that reported no provider. Absent must mean absent.
  declare readonly provider?: string;
  declare readonly finishReason?: string;
  readonly validationError: string;
  readonly repaired: boolean;

  constructor(details: FinderOutputErrorDetails) {
    super(
      `Finder output rejected (provider=${details.provider ?? "?"}, finish=${details.finishReason ?? "?"}, ` +
        `${details.repaired ? "after one format repair" : "no format repair attempted"}): ${details.validationError}`,
    );
    this.name = "FinderOutputError";
    this.text = details.text;
    if (details.provider !== undefined) this.provider = details.provider;
    if (details.finishReason !== undefined) this.finishReason = details.finishReason;
    this.validationError = details.validationError;
    this.repaired = details.repaired;
  }
}

// --- Judge envelope repair ---
//
// WHY: the judge shipped
// with NO repair on the stated grounds that "the judge runs the same sonnet
// model without it and has never needed it". That assumption was falsified on
// PR #127 — four consecutive AI_NoObjectGeneratedError failures across two runs
// (31707888975 and its re-run), which killed the whole review at exit 1.
//
// The judge's drift was never observed: the run log recorded the error class,
// never the text. So this layer deliberately does NOT guess at field-level drift. It only
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
 * Re-validated against the STRICT `judgeOutputSchema`: a repair that does not
 * produce a schema-valid result is not a repair.
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

/** `Output.object(judgeOutputSchema)` with one recovery pass: the wrapper is removed, nothing else. */
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
