// Lazy, throwing config resolution — usable from library context. No
// module-level env reads and never process.exit: promptfoo (and any other
// embedder) must be able to import the barrel side-effect-free; only demo.ts
// may exit the process.

export const DEFAULT_MODEL = "anthropic/claude-sonnet-5";

export interface ConfigOverrides {
  apiKey?: string;
  model?: string;
}

export interface ResolvedConfig {
  apiKey: string;
  model: string;
}

export function resolveConfig(overrides: ConfigOverrides = {}): ResolvedConfig {
  const apiKey = overrides.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is missing — get a key at https://openrouter.ai/keys and put it in packages/code-reviewer/.env, or pass { apiKey } to createReviewer().",
    );
  }
  // `||` (not `??`): a set-but-empty OPENROUTER_MODEL= must fall back to the
  // default instead of sending "" to the provider (impl-review-full F3).
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string IS the missing case here
  const model = overrides.model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  return { apiKey, model };
}
