import type { ProviderMetadata } from "ai";

import type { Reported } from "./schemas.js";

// Narrowers for OpenRouter's per-response metadata bag. Shared by the pipeline
// (step telemetry) and the reviewer (the provider a FinderOutputError names),
// so they live below both.

/**
 * The serving upstream out of the provider's metadata bag, narrowed with the
 * same discipline as `asStepCost` below. A missing, empty or non-string value
 * is `undefined` — never `""` or `"unknown"`, which would read as a real slug.
 */
export const asStepProvider = (metadata: ProviderMetadata | undefined): string | undefined => {
  const openrouter: unknown = metadata?.openrouter;
  if (typeof openrouter !== "object" || openrouter === null) return undefined;
  if (!("provider" in openrouter)) return undefined;
  const provider: unknown = openrouter.provider;
  return typeof provider === "string" && provider !== "" ? provider : undefined;
};

/**
 * Exact per-step cost out of the provider's metadata bag.
 *
 * `providerMetadata` is typed `Record<string, JSONObject>` — the SDK makes no
 * promise about the value shape, so narrow every hop instead of trusting it,
 * same discipline as `asFileContextTarget` in pipeline.ts. Absent metadata, a provider
 * that reports no cost, or a non-finite value all degrade to `undefined`
 * rather than a fabricated 0, which would read as "this step was free".
 */
export const asStepCost = (metadata: ProviderMetadata | undefined): number | undefined => {
  const openrouter: unknown = metadata?.openrouter;
  if (typeof openrouter !== "object" || openrouter === null) return undefined;
  if (!("usage" in openrouter)) return undefined;
  const usage: unknown = openrouter.usage;
  if (typeof usage !== "object" || usage === null) return undefined;
  if (!("cost" in usage)) return undefined;
  const cost: unknown = usage.cost;
  return typeof cost === "number" && Number.isFinite(cost) ? cost : undefined;
};

/** The three response fields the finder records per request — and the only three it ever keeps. */
export interface ReportedResponseFields {
  model: Reported<string>;
  provider: Reported<string>;
  reasoningTokens: Reported<number>;
}

const MISSING = { value: null, source: "missing" } as const;

/** What a request whose response could not be read records: everything `missing`, nothing guessed. */
export const MISSING_RESPONSE_FIELDS: ReportedResponseFields = {
  model: MISSING,
  provider: MISSING,
  reasoningTokens: MISSING,
};

const reportedString = (value: unknown): Reported<string> =>
  typeof value === "string" && value !== "" ? { value, source: "reported" } : MISSING;

const reportedCount = (value: unknown): Reported<number> =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? { value, source: "reported" } : MISSING;

const field = (object: unknown, key: string): unknown =>
  typeof object === "object" && object !== null && key in object ? (object as Record<string, unknown>)[key] : undefined;

/**
 * Picks `model`, `provider` and `usage.completion_tokens_details.reasoning_tokens`
 * out of a parsed chat-completion body, and nothing else. Pure, so the
 * narrowing is testable without a wire.
 *
 * Read from the RAW body on purpose: the SDK's `response.modelId` falls back to
 * the REQUESTED id when the body has no `model`, and its reasoning-token count
 * falls back to 0, so SDK-level values cannot tell "reported" from "absent"
 * (assumption A3 of change `finder-glm-5-3`).
 */
export function readReportedResponseFields(body: unknown): ReportedResponseFields {
  return {
    model: reportedString(field(body, "model")),
    provider: reportedString(field(body, "provider")),
    reasoningTokens: reportedCount(field(field(field(body, "usage"), "completion_tokens_details"), "reasoning_tokens")),
  };
}

/**
 * A fetch wrapper for the finder's OpenRouter client that remembers the three
 * reported fields of the most recent response, for `take()` to hand to the
 * request's step callback.
 *
 * Requests of one review are strictly sequential — each loop step, then the
 * finalization, then the repair — so "the most recent response" is the one the
 * step callback is about. The slot is cleared when a request starts and again
 * when it is taken, so a request whose response was never read cannot inherit
 * an older one's fields.
 *
 * REASONING STAYS OUT: the body is parsed in memory, the three fields are
 * copied, and the parsed body is dropped. Nothing else from it is stored,
 * logged or returned. A non-JSON or failed response yields `missing` for all
 * three. `base` defaults to the global fetch, resolved per request.
 */
export function createResponseObserver(base?: typeof fetch): {
  fetch: typeof fetch;
  take: () => ReportedResponseFields;
} {
  let last: ReportedResponseFields = MISSING_RESPONSE_FIELDS;
  const read = async (response: Response): Promise<ReportedResponseFields> => {
    if (!response.ok) return MISSING_RESPONSE_FIELDS;
    try {
      return readReportedResponseFields(JSON.parse(await response.clone().text()));
    } catch {
      return MISSING_RESPONSE_FIELDS;
    }
  };
  const observed = async (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
    last = MISSING_RESPONSE_FIELDS;
    const response = await (base ?? globalThis.fetch)(input, init);
    last = await read(response);
    return response;
  };
  return {
    fetch: observed,
    take: () => {
      const taken = last;
      last = MISSING_RESPONSE_FIELDS;
      return taken;
    },
  };
}
