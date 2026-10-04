import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_FINDER_PROVIDERS,
  DEFAULT_IMPL_REVIEW_MODEL,
  DEFAULT_JUDGE_MODEL,
  DEFAULT_MODEL,
  DEFAULT_VERIFIER_MODEL,
  DEFAULT_VERIFIER_PROVIDERS,
  resolveConfig,
  resolveModels,
  resolveVerifierProviderRouting,
} from "./config.js";

// Hermetic: scrub every OpenRouter env var so results don't depend on a
// developer's .env or shell (same pattern as reviewer.test.ts).
beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", undefined);
  vi.stubEnv("OPENROUTER_MODEL", undefined);
  vi.stubEnv("OPENROUTER_REVIEW_MODEL", undefined);
  vi.stubEnv("OPENROUTER_JUDGE_MODEL", undefined);
  vi.stubEnv("OPENROUTER_IMPL_REVIEW_MODEL", undefined);
  vi.stubEnv("OPENROUTER_VERIFIER_MODEL", undefined);
  vi.stubEnv("OPENROUTER_VERIFIER_PROVIDERS", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveModels — finder chain", () => {
  it("falls back to DEFAULT_MODEL when nothing is set", () => {
    expect(resolveModels().reviewModel).toBe(DEFAULT_MODEL);
  });

  // Literal, not a tautology: the assertion above passes whatever the constant
  // says, so it could not catch the checked-in default drifting away from the
  // model production actually runs. These pin the strings themselves — the
  // finder default must equal the OPENROUTER_REVIEW_MODEL repository variable,
  // because it is what takes over when that variable is unset or cleared
  // (impl-review-phase-4 F1). Update these ONLY together with that variable.
  it("defaults the finder to the model production runs", () => {
    expect(DEFAULT_MODEL).toBe("z-ai/glm-4.6");
  });

  it("defaults the judge to the model production runs", () => {
    expect(DEFAULT_JUDGE_MODEL).toBe("anthropic/claude-sonnet-5");
  });

  it("prefers the override over every env var", () => {
    vi.stubEnv("OPENROUTER_REVIEW_MODEL", "env/review");
    vi.stubEnv("OPENROUTER_MODEL", "env/legacy");
    expect(resolveModels({ reviewModel: "override/x" }).reviewModel).toBe("override/x");
  });

  it("prefers OPENROUTER_REVIEW_MODEL over legacy OPENROUTER_MODEL", () => {
    vi.stubEnv("OPENROUTER_REVIEW_MODEL", "env/review");
    vi.stubEnv("OPENROUTER_MODEL", "env/legacy");
    expect(resolveModels().reviewModel).toBe("env/review");
  });

  it("keeps the legacy OPENROUTER_MODEL fallback working", () => {
    vi.stubEnv("OPENROUTER_MODEL", "env/legacy");
    expect(resolveModels().reviewModel).toBe("env/legacy");
  });

  it("treats a set-but-empty OPENROUTER_REVIEW_MODEL as missing", () => {
    vi.stubEnv("OPENROUTER_REVIEW_MODEL", "");
    vi.stubEnv("OPENROUTER_MODEL", "env/legacy");
    expect(resolveModels().reviewModel).toBe("env/legacy");
  });
});

describe("resolveModels — judge chain", () => {
  it("falls back to DEFAULT_JUDGE_MODEL when nothing is set", () => {
    expect(resolveModels().judgeModel).toBe(DEFAULT_JUDGE_MODEL);
  });

  it("prefers the override over the env var", () => {
    vi.stubEnv("OPENROUTER_JUDGE_MODEL", "env/judge");
    expect(resolveModels({ judgeModel: "override/y" }).judgeModel).toBe("override/y");
  });

  it("resolves from OPENROUTER_JUDGE_MODEL", () => {
    vi.stubEnv("OPENROUTER_JUDGE_MODEL", "env/judge");
    expect(resolveModels().judgeModel).toBe("env/judge");
  });

  it("never falls back to legacy OPENROUTER_MODEL (finder-only knob)", () => {
    vi.stubEnv("OPENROUTER_MODEL", "env/legacy");
    expect(resolveModels().judgeModel).toBe(DEFAULT_JUDGE_MODEL);
  });

  it("treats a set-but-empty OPENROUTER_JUDGE_MODEL as missing", () => {
    vi.stubEnv("OPENROUTER_JUDGE_MODEL", "");
    expect(resolveModels().judgeModel).toBe(DEFAULT_JUDGE_MODEL);
  });
});

describe("resolveModels — implementation-review chain", () => {
  it("falls back to DEFAULT_IMPL_REVIEW_MODEL when nothing is set", () => {
    expect(resolveModels().implReviewModel).toBe(DEFAULT_IMPL_REVIEW_MODEL);
  });

  // Same literal pin as the finder and judge defaults: the assertion above
  // passes whatever the constant says, so only this one catches the checked-in
  // default drifting from the model production runs. Update ONLY together with
  // the OPENROUTER_IMPL_REVIEW_MODEL repository variable.
  it("defaults the implementation reviewer to the model production runs", () => {
    expect(DEFAULT_IMPL_REVIEW_MODEL).toBe("anthropic/claude-sonnet-5");
  });

  // Same string as the judge today, but a SEPARATE constant on purpose: the
  // two passes must be retunable apart, so retuning the judge must not silently
  // move the implementation reviewer with it.
  it("is an independent constant, not an alias of the judge default", () => {
    vi.stubEnv("OPENROUTER_JUDGE_MODEL", "env/judge");
    expect(resolveModels().implReviewModel).toBe(DEFAULT_IMPL_REVIEW_MODEL);
    expect(resolveModels().judgeModel).toBe("env/judge");
  });

  it("prefers the override over the env var", () => {
    vi.stubEnv("OPENROUTER_IMPL_REVIEW_MODEL", "env/impl");
    expect(resolveModels({ implReviewModel: "override/z" }).implReviewModel).toBe("override/z");
  });

  it("resolves from OPENROUTER_IMPL_REVIEW_MODEL", () => {
    vi.stubEnv("OPENROUTER_IMPL_REVIEW_MODEL", "env/impl");
    expect(resolveModels().implReviewModel).toBe("env/impl");
  });

  it("never falls back to legacy OPENROUTER_MODEL (finder-only knob)", () => {
    vi.stubEnv("OPENROUTER_MODEL", "env/legacy");
    expect(resolveModels().implReviewModel).toBe(DEFAULT_IMPL_REVIEW_MODEL);
  });

  it("treats a set-but-empty OPENROUTER_IMPL_REVIEW_MODEL as missing", () => {
    vi.stubEnv("OPENROUTER_IMPL_REVIEW_MODEL", "");
    expect(resolveModels().implReviewModel).toBe(DEFAULT_IMPL_REVIEW_MODEL);
  });
});

describe("resolveConfig", () => {
  it("still throws an actionable error without an API key", () => {
    expect(() => resolveConfig()).toThrow(/OPENROUTER_API_KEY/);
  });

  it("exposes the two-pass model fields alongside the legacy model", () => {
    vi.stubEnv("OPENROUTER_MODEL", "env/legacy");
    vi.stubEnv("OPENROUTER_JUDGE_MODEL", "env/judge");
    const config = resolveConfig({ apiKey: "test-key" });
    expect(config.model).toBe("env/legacy");
    expect(config.reviewModel).toBe("env/legacy");
    expect(config.judgeModel).toBe("env/judge");
  });
});

describe("DEFAULT_FINDER_PROVIDERS", () => {
  // Pinned like DEFAULT_MODEL: this list decides where every production finder
  // request may go. PROVISIONAL (a Phase 0 probe result, no gate status) until
  // Phase 5 of `finder-serialization-outage` replaces it with the endpoints
  // that passed gate.md — change it only alongside a measurement.
  it("is the provisional Phase 0 list", () => {
    expect(DEFAULT_FINDER_PROVIDERS).toEqual(["novita"]);
  });
});

describe("verifier model and routing (change `finder-verification`)", () => {
  // Pinned: the two arms differ ONLY in this id (R1). CONTROL until Phase 8
  // sets the admitted arm.
  it("defaults to the CONTROL arm, luna routed to openai only", () => {
    expect(DEFAULT_VERIFIER_MODEL).toBe("openai/gpt-6-luna");
    expect(DEFAULT_VERIFIER_PROVIDERS).toEqual(["openai"]);
    expect(resolveModels().verifierModel).toBe("openai/gpt-6-luna");
  });

  it("resolves override → OPENROUTER_VERIFIER_MODEL → default, an empty value falling through", () => {
    vi.stubEnv("OPENROUTER_VERIFIER_MODEL", "anthropic/claude-sonnet-5");
    expect(resolveModels().verifierModel).toBe("anthropic/claude-sonnet-5");
    expect(resolveModels({ verifierModel: "override/v" }).verifierModel).toBe("override/v");
    vi.stubEnv("OPENROUTER_VERIFIER_MODEL", "");
    expect(resolveModels().verifierModel).toBe(DEFAULT_VERIFIER_MODEL);
  });

  it("routes like the finder: only the listed endpoints, require_parameters always on", () => {
    expect(resolveVerifierProviderRouting()).toEqual({
      order: ["openai"],
      only: ["openai"],
      allow_fallbacks: true,
      require_parameters: true,
    });
    vi.stubEnv("OPENROUTER_VERIFIER_PROVIDERS", "anthropic");
    expect(resolveVerifierProviderRouting().only).toEqual(["anthropic"]);
  });

  it("falls back to the default on a malformed list, and says so naming the verifier", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv("OPENROUTER_VERIFIER_PROVIDERS", "Anthropic");
    expect(resolveVerifierProviderRouting().only).toEqual(["openai"]);
    expect(warn.mock.calls[0]?.[0]).toContain("OPENROUTER_VERIFIER_PROVIDERS is malformed");
    expect(warn.mock.calls[0]?.[0]).toContain("the verifier routes to the default [openai]");
    warn.mockRestore();
  });
});
