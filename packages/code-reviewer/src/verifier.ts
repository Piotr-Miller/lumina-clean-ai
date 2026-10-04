import { createOpenRouter, type OpenRouterChatSettings } from "@openrouter/ai-sdk-provider";
import { generateText, type StepResult, type ToolSet } from "ai";

import { MAX_OUTPUT_TOKENS, resolveConfig, resolveModels, resolveVerifierProviderRouting } from "./config.js";
import type { ExcerptBlock, ExcerptPlan } from "./excerpts.js";
import { extractJsonObject } from "./output-repair.js";
import {
  buildVerifierFormatRepairInstructions,
  buildVerifierFormatRepairPrompt,
  buildVerifierInstructions,
  buildVerifierPrompt,
  type VerifierPromptInput,
} from "./prompts.js";
import { asStepProvider } from "./provider-metadata.js";
import {
  verificationOutputSchema,
  type IdentifiedFinding,
  type VerificationOutput,
  type VerificationRecord,
} from "./schemas.js";

// The verification pass's model call and its verdict rules (change
// `finder-verification`, Phase 1 §3). Two arms share this code and differ only
// in the model id (R1): CONTROL = the finder's own model, MAIN = the judge's.
//
// THE CALL mirrors the judge's construction — tool-less, usage accounting on,
// SDK retries off (retry.ts's withOneRetry is the single retry authority) — but
// its request shape is the finder's: `reasoning: {enabled: false}` (R7), routing
// pinned to OPENROUTER_VERIFIER_PROVIDERS with `require_parameters: true`, and
// NO `response_format`. The format lives in the prompt; this module parses the
// answer strictly and allows exactly one model-side format repair, after which
// it throws VerifierOutputError — a technical failure, never a pass-through.
//
// THE RULES (`applyVerdicts`) are where publication is decided, in code: only a
// `confirmed` verdict whose quote is really in the excerpt it was given
// publishes. The model's word alone publishes nothing.

const MAX_REASON_CHARS = 300;
const capReason = (reason: string): string =>
  reason.length > MAX_REASON_CHARS ? `${reason.slice(0, MAX_REASON_CHARS)}…` : reason;

export type VerifierParseResult = { ok: true; output: VerificationOutput } | { ok: false; reason: string };

/**
 * Wrapper removal → `JSON.parse` → the strict `verificationOutputSchema`, and
 * nothing more — the finder's parser discipline (output-repair.ts). The reason
 * never quotes the rejected text: it reaches the log.
 */
export function parseVerifierOutput(text: string): VerifierParseResult {
  const json = extractJsonObject(text);
  if (json === undefined) return { ok: false, reason: "no complete JSON object in the response" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: "JSON.parse: the object is not valid JSON" };
  }
  const result = verificationOutputSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    return { ok: false, reason: capReason(`schema: ${issues.join("; ")}`) };
  }
  return { ok: true, output: result.data };
}

export interface VerifierOutputErrorDetails {
  /** The rejected model text — untrusted; the CLI prints it capped and escaped, never into comment.md. */
  text: string;
  provider?: string;
  finishReason?: string;
  validationError: string;
  repaired: boolean;
}

/**
 * The verifier's terminal format failure. Like FinderOutputError it is NOT
 * retryable (retry.ts matches neither its name nor its class): the one format
 * repair already took the re-roll's role.
 */
export class VerifierOutputError extends Error {
  readonly text: string;
  // `declare`: absent must mean absent (see FinderOutputError).
  declare readonly provider?: string;
  declare readonly finishReason?: string;
  readonly validationError: string;
  readonly repaired: boolean;

  constructor(details: VerifierOutputErrorDetails) {
    super(
      `Verifier output rejected (provider=${details.provider ?? "?"}, finish=${details.finishReason ?? "?"}, ` +
        `${details.repaired ? "after one format repair" : "no format repair attempted"}): ${details.validationError}`,
    );
    this.name = "VerifierOutputError";
    this.text = details.text;
    if (details.provider !== undefined) this.provider = details.provider;
    if (details.finishReason !== undefined) this.finishReason = details.finishReason;
    this.validationError = details.validationError;
    this.repaired = details.repaired;
  }
}

export interface VerifierOptions {
  /** OpenRouter model id; defaults to OPENROUTER_VERIFIER_MODEL env or DEFAULT_VERIFIER_MODEL. */
  model?: string;
  /** OpenRouter API key; defaults to OPENROUTER_API_KEY env. */
  apiKey?: string;
  /** Routing override; omitted → resolveVerifierProviderRouting(). */
  providerRouting?: OpenRouterChatSettings["provider"];
  /** Observes every request — the call and the format repair — as it completes. */
  onStepEnd?: (step: StepResult<ToolSet>) => void;
  /** Fires before the one format repair request is sent; `reason` is the validation error. */
  onOutputRepair?: (detail: { reason: string }) => void;
  /** TEST SEAM: replaces the provider's HTTP client so a test can read the wire. */
  fetch?: typeof fetch;
}

export interface VerifierCallOptions {
  abortSignal?: AbortSignal;
  /** Wall-clock budget for the whole verification call (call + repair), in milliseconds. */
  timeoutMs?: number;
}

/**
 * One budget for the whole pass, aborting with a DOMException named
 * `TimeoutError` — the name retry.ts treats as transient, as for the finder.
 */
function createBudget(callOptions: VerifierCallOptions): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const { abortSignal, timeoutMs } = callOptions;
  const timer =
    timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          controller.abort(
            new DOMException(`The verifier pass exceeded its ${String(timeoutMs)} ms budget`, "TimeoutError"),
          );
        }, timeoutMs);
  const forward = (): void => {
    controller.abort(abortSignal?.reason);
  };
  if (abortSignal?.aborted === true) forward();
  else abortSignal?.addEventListener("abort", forward, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      abortSignal?.removeEventListener("abort", forward);
    },
  };
}

/** Factory, throwing (never exiting) when no API key is resolvable — same contract as createJudge. */
export function createVerifier(options: VerifierOptions = {}) {
  const { apiKey } = resolveConfig({ apiKey: options.apiKey });
  const { verifierModel } = resolveModels({ verifierModel: options.model });
  const openrouter = createOpenRouter({ apiKey, ...(options.fetch === undefined ? {} : { fetch: options.fetch }) });
  const languageModel = openrouter(verifierModel, {
    usage: { include: true },
    // R7: no reasoning on either arm. Sent through `extraBody` for the same
    // reason as the finder's (reviewer.ts, Amendment A3).
    extraBody: { reasoning: { enabled: false } },
    provider: options.providerRouting ?? resolveVerifierProviderRouting(),
  });
  const instructions = buildVerifierInstructions();

  const complete = async (system: string, prompt: string, abortSignal: AbortSignal) => {
    const result = await generateText({
      model: languageModel,
      instructions: system,
      prompt,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      maxRetries: 0,
      abortSignal,
      onStepEnd: options.onStepEnd,
    });
    return {
      text: result.text,
      finishReason: result.finishReason,
      provider: asStepProvider(result.finalStep.providerMetadata),
    };
  };

  async function verify(
    input: VerifierPromptInput,
    callOptions: VerifierCallOptions = {},
  ): Promise<VerificationOutput> {
    const budget = createBudget(callOptions);
    try {
      const first = await complete(instructions, buildVerifierPrompt(input), budget.signal);
      const parsed = parseVerifierOutput(first.text);
      if (parsed.ok) return parsed.output;
      // No repair where it could only guess: no object at all, or a truncated answer.
      if (!first.text.includes("{") || first.finishReason === "length") {
        throw new VerifierOutputError({
          text: first.text,
          ...(first.provider === undefined ? {} : { provider: first.provider }),
          finishReason: first.finishReason,
          validationError: parsed.reason,
          repaired: false,
        });
      }
      options.onOutputRepair?.({ reason: parsed.reason });
      const repair = await complete(
        buildVerifierFormatRepairInstructions(),
        buildVerifierFormatRepairPrompt(first.text, parsed.reason),
        budget.signal,
      );
      const reparsed = parseVerifierOutput(repair.text);
      if (reparsed.ok) return reparsed.output;
      throw new VerifierOutputError({
        text: repair.text,
        ...(repair.provider === undefined ? {} : { provider: repair.provider }),
        finishReason: repair.finishReason,
        validationError: reparsed.reason,
        repaired: true,
      });
    } finally {
      budget.dispose();
    }
  }

  return { verify, model: verifierModel };
}

export type Verifier = ReturnType<typeof createVerifier>;

// --- Quote check ---

/** The minimum a quote must carry, in non-whitespace characters: `}` or `return` decides nothing. */
export const MIN_QUOTE_CHARS = 10;

// The rendered prefix of an excerpt line: `NNNN| ` or `NNNN>| ` (numbers padded with spaces).
const RENDERED_PREFIX = /^ *\d+>?\| ?/;

const trimLines = (lines: readonly string[]): string => lines.map((line) => line.trimEnd()).join("\n");

/** A block's raw code: every line with exactly its rendered prefix removed. */
const rawBlockText = (block: ExcerptBlock): string =>
  trimLines(block.text.split("\n").map((line) => line.replace(RENDERED_PREFIX, "")));

/**
 * A quote as the model wrote it, normalised: CRLF → LF, any line-number prefix
 * a model copied stripped from every line, trailing whitespace trimmed per
 * line, and leading or trailing empty lines dropped.
 */
export const normalizeQuote = (quote: string): string =>
  trimLines(
    quote
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.replace(RENDERED_PREFIX, "")),
  ).replace(/^\n+|\n+$/g, "");

const collapse = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * The quote check (gate.md Pre-registration §4): the normalised quote has at
 * least MIN_QUOTE_CHARS non-whitespace characters and is a substring of ONE
 * block's raw text (`exact`); failing that, the same test with every whitespace
 * run — indentation and line breaks included — collapsed to one space on both
 * sides (`whitespace`). Token order must still match. `undefined` = failed.
 *
 * A NECESSARY condition, never proof: a real line can be quoted under a false
 * claim. What it rules out is a confirmation backed by code that was never
 * delivered.
 */
export function checkQuote(quote: string, blocks: readonly ExcerptBlock[]): "exact" | "whitespace" | undefined {
  const normalized = normalizeQuote(quote);
  if ((normalized.match(/\S/g) ?? []).length < MIN_QUOTE_CHARS) return undefined;
  const raws = blocks.map(rawBlockText);
  if (raws.some((raw) => raw.includes(normalized))) return "exact";
  const collapsed = collapse(normalized);
  if (raws.some((raw) => collapse(raw).includes(collapsed))) return "whitespace";
  return undefined;
}

// --- Applying the verdicts ---

export interface AppliedVerdicts {
  /** Confirmed findings whose quote passed — the only ones the judge and the comment see. */
  published: IdentifiedFinding[];
  /** One record per finding, in finding order. */
  records: VerificationRecord[];
  unknownVerdictIds: string[];
}

const baseRecord = (finding: IdentifiedFinding, blockIds: string[]) => ({ ...finding, blockIds });

/**
 * Turns the verifier's verdicts into publication decisions, in code:
 *
 * - a finding the planner could not excerpt → `unverifiable` with the
 *   planner's reason (it was never sent);
 * - no verdict for a sent id → `unverifiable: no-verdict`; more than one →
 *   `unverifiable: duplicate-verdict`;
 * - `confirmed` with a quote that passes `checkQuote` → published, with
 *   `quoteMatch`; with one that fails (an empty quote included) →
 *   `unverifiable: quote-not-in-excerpt`, the model's verdict kept;
 * - `refuted` / `unsupported` → kept with quote and reason; `quoteVerified` is
 *   recorded for `refuted` (an empty quote → false);
 * - verdicts for ids that were never sent → `unknownVerdictIds`, ignored.
 *
 * Published findings keep their pre-verification ids (plan-review 3rd run F6):
 * nothing renumbers them, so `findings`, the judge's `findingIds` and these
 * records share one id space.
 */
export function applyVerdicts(input: {
  findings: readonly IdentifiedFinding[];
  plan: Pick<ExcerptPlan, "blocks" | "perFinding">;
  output: VerificationOutput;
}): AppliedVerdicts {
  const { findings, plan, output } = input;
  const byId = new Map<string, VerificationOutput["verdicts"]>();
  for (const verdict of output.verdicts) byId.set(verdict.id, [...(byId.get(verdict.id) ?? []), verdict]);

  const sent = new Set<string>();
  const published: IdentifiedFinding[] = [];
  const records: VerificationRecord[] = [];

  for (const finding of findings) {
    const entry = plan.perFinding[finding.id] as (typeof plan.perFinding)[string] | undefined;
    if (entry === undefined || !("blockIds" in entry)) {
      records.push({
        ...baseRecord(finding, []),
        state: "unverifiable",
        reasonCode: entry?.unverifiable ?? "no-locator",
        reason: entry?.detail ?? "no excerpt was planned for this finding",
      });
      continue;
    }
    sent.add(finding.id);
    const base = baseRecord(finding, entry.blockIds);
    const verdicts = byId.get(finding.id) ?? [];
    if (verdicts.length === 0) {
      records.push({
        ...base,
        state: "unverifiable",
        reasonCode: "no-verdict",
        reason: "the verifier gave no verdict",
      });
      continue;
    }
    if (verdicts.length > 1) {
      records.push({
        ...base,
        state: "unverifiable",
        reasonCode: "duplicate-verdict",
        reason: `the verifier gave ${String(verdicts.length)} verdicts for this finding`,
      });
      continue;
    }
    const [verdict] = verdicts;
    const blocks = plan.blocks.filter((block) => entry.blockIds.includes(block.blockId));
    const match = checkQuote(verdict.quote, blocks);
    if (verdict.verdict === "confirmed") {
      if (match === undefined) {
        records.push({
          ...base,
          state: "unverifiable",
          reasonCode: "quote-not-in-excerpt",
          modelVerdict: "confirmed",
          reason: verdict.reason,
          quote: verdict.quote,
          quoteVerified: false,
        });
        continue;
      }
      published.push(finding);
      records.push({
        ...base,
        state: "confirmed",
        reason: verdict.reason,
        quote: verdict.quote,
        quoteVerified: true,
        quoteMatch: match,
      });
      continue;
    }
    records.push({
      ...base,
      state: verdict.verdict,
      reason: verdict.reason,
      quote: verdict.quote,
      ...(verdict.verdict === "refuted" ? { quoteVerified: match !== undefined } : {}),
    });
  }

  const unknownVerdictIds = [...new Set(output.verdicts.map((verdict) => verdict.id))].filter((id) => !sent.has(id));
  return { published, records, unknownVerdictIds };
}
