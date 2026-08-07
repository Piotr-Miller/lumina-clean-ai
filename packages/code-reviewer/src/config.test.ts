import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_JUDGE_MODEL, DEFAULT_MODEL, resolveConfig, resolveModels } from "./config.js";

// Hermetic: scrub every OpenRouter env var so results don't depend on a
// developer's .env or shell (same pattern as reviewer.test.ts).
beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", undefined);
  vi.stubEnv("OPENROUTER_MODEL", undefined);
  vi.stubEnv("OPENROUTER_REVIEW_MODEL", undefined);
  vi.stubEnv("OPENROUTER_JUDGE_MODEL", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveModels — finder chain", () => {
  it("falls back to DEFAULT_MODEL when nothing is set", () => {
    expect(resolveModels().reviewModel).toBe(DEFAULT_MODEL);
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
