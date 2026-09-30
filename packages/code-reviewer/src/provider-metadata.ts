import type { ProviderMetadata } from "ai";

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
