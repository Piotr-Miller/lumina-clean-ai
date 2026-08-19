import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_OUTPUT_TOKENS } from "./config.js";

import { DEFAULT_MODEL } from "./config.js";
import {
  createReviewer,
  fetchBoundedContext,
  MAX_CONTEXT_CHARS,
  MAX_CONTEXT_LINES,
  prepareFinalStep,
  type SourceProvider,
} from "./reviewer.js";

// Hermetic: scrub the OpenRouter env so results don't depend on a developer's
// .env or shell (vitest does not load .env, but a shell-exported key would
// otherwise leak in). vi.stubEnv(name, undefined) deletes with tracked restore.
beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", undefined);
  vi.stubEnv("OPENROUTER_MODEL", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createReviewer", () => {
  it("throws an actionable error when no API key is resolvable", () => {
    expect(() => createReviewer()).toThrow(/OPENROUTER_API_KEY/);
  });

  it("constructs offline with an explicit apiKey and exposes the contract", () => {
    const reviewer = createReviewer({ apiKey: "test-key" });
    expect(typeof reviewer.review).toBe("function");
    expect(reviewer.agent).toBeDefined();
    expect(reviewer.lens).toBe("general");
    expect(reviewer.model).toBe(DEFAULT_MODEL);
  });

  it("propagates lens and model overrides", () => {
    const reviewer = createReviewer({ apiKey: "test-key", lens: "security", model: "acme/model-x" });
    expect(reviewer.lens).toBe("security");
    expect(reviewer.model).toBe("acme/model-x");
  });

  it("resolves the model from OPENROUTER_MODEL when not overridden", () => {
    vi.stubEnv("OPENROUTER_MODEL", "env/model-y");
    expect(createReviewer({ apiKey: "test-key" }).model).toBe("env/model-y");
  });

  it("falls back to DEFAULT_MODEL when OPENROUTER_MODEL is set but empty", () => {
    vi.stubEnv("OPENROUTER_MODEL", "");
    expect(createReviewer({ apiKey: "test-key" }).model).toBe(DEFAULT_MODEL);
  });

  it("is a factory, not a singleton", () => {
    const a = createReviewer({ apiKey: "test-key" });
    const b = createReviewer({ apiKey: "test-key" });
    expect(a.agent).not.toBe(b.agent);
  });

  it.each([0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects maxSteps=%s (cost guard)", (maxSteps) => {
    expect(() => createReviewer({ apiKey: "test-key", maxSteps })).toThrow(/positive integer/);
  });

  it("forwards onStepEnd to each agent generate call (telemetry pass-through)", async () => {
    const onStepEnd = vi.fn();
    const reviewer = createReviewer({ apiKey: "test-key", source: () => "ctx", onStepEnd });
    const generate = vi
      .spyOn(reviewer.agent, "generate")
      .mockResolvedValue({ output: { summary: "s", findings: [] } } as never);
    await reviewer.review({ kind: "diff", diff: "+x" });
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ onStepEnd }));
  });

  it("disables tools on the final allowed step so the review always gets emitted", () => {
    const guard = prepareFinalStep(true, 5);
    expect(guard({ stepNumber: 0 })).toEqual({});
    expect(guard({ stepNumber: 3 })).toEqual({});
    expect(guard({ stepNumber: 4 })).toEqual({ activeTools: [] });
    // Tool-less reviewers never restrict anything — there is nothing to strip.
    expect(prepareFinalStep(false, 5)({ stepNumber: 4 })).toEqual({});
  });

  it("describes the getFileContext path in the allowlist's format (no a/ b/ prefix)", () => {
    const reviewer = createReviewer({ apiKey: "test-key", source: () => "ctx" });
    const tools = reviewer.agent.tools as unknown as {
      getFileContext: { inputSchema: { shape: { path: { description?: string } } } };
    };
    expect(tools.getFileContext.inputSchema.shape.path.description).toBe(
      "Repository-relative file path without git's a/ or b/ prefix (e.g. src/x.ts)",
    );
  });
});

describe("fetchBoundedContext (context-tool guardrails)", () => {
  it("returns the fixed fallback when no source is injected", async () => {
    await expect(fetchBoundedContext(undefined, { path: "a.ts" })).resolves.toBe("No additional context available.");
  });

  it("clamps oversized ranges to at most MAX_CONTEXT_LINES lines", async () => {
    let seen: { startLine?: number; endLine?: number } | undefined;
    const source: SourceProvider = (request) => {
      seen = request;
      return "ctx";
    };
    await fetchBoundedContext(source, { path: "a.ts", startLine: 1, endLine: 1000 });
    expect(seen?.endLine).toBe(MAX_CONTEXT_LINES);
    expect((seen?.endLine ?? 0) - (seen?.startLine ?? 0) + 1).toBe(MAX_CONTEXT_LINES);
  });

  it("passes coherent small ranges through unclamped", async () => {
    let seen: { endLine?: number } | undefined;
    const source: SourceProvider = (request) => {
      seen = request;
      return "ctx";
    };
    await fetchBoundedContext(source, { path: "a.ts", startLine: 5, endLine: 12 });
    expect(seen?.endLine).toBe(12);
  });

  it("truncates oversized responses with a visible marker", async () => {
    const oversized = "x".repeat(MAX_CONTEXT_CHARS + 500);
    const result = await fetchBoundedContext(() => oversized, { path: "a.ts" });
    expect(result.length).toBeLessThan(oversized.length);
    expect(result.endsWith("[...context truncated]")).toBe(true);
  });

  it("returns small responses untouched", async () => {
    await expect(fetchBoundedContext(() => "small", { path: "a.ts" })).resolves.toBe("small");
  });

  // Uncapped, the provider requests the model maximum (65,536) and OpenRouter
  // reserves credit against that REQUESTED figure, not actual use — which killed
  // a whole review on a funded account ("can only afford 62849"). Pinned per
  // factory because the cap must reach every call, not just the one we checked.
  it("caps output tokens so the credit reservation matches real usage", () => {
    const agent = createReviewer({ apiKey: "k" }).agent as unknown as {
      settings?: { maxOutputTokens?: number };
    };
    expect(agent.settings?.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS);
  });
});
