import { resolve } from "node:path";

import { APICallError } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FinderProvider, { resolveFixtureRoot, type FinderTelemetry } from "./finder-provider.js";

// The adapter builds the real reviewer; only the model is replaced, so the
// finalization, the repair and the step telemetry all run for real.
let currentModel: MockLanguageModelV3 | undefined;
vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: () => () => {
    if (!currentModel) throw new Error("currentModel not set in this test");
    return currentModel;
  },
}));

beforeEach(() => {
  currentModel = undefined;
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// The fixture root decides which files the diff-scoped allowlist can be joined
// against, i.e. which files may be handed to an external model. These are the
// containment invariants (impl-review-phase-1 F2) — free to run, no API key.

const FIXTURES = resolve(import.meta.dirname, "fixtures");

describe("resolveFixtureRoot", () => {
  it("resolves a case's relative root to the fixture directory", () => {
    expect(resolveFixtureRoot("./fixtures/cross-hunk")).toBe(resolve(FIXTURES, "cross-hunk"));
  });

  it("resolves relative to the evals directory, not the process cwd", () => {
    // promptfoo is normally run from the package root, so a cwd-relative
    // resolution would silently miss the tree.
    expect(resolveFixtureRoot("fixtures/clean-change")).toBe(resolve(FIXTURES, "clean-change"));
  });

  it.each([
    ["a parent-directory walk to the repo root", "../../.."],
    ["a walk that lands just outside the tree", "./fixtures/../.."],
    ["a walk back into package source", "./fixtures/../../src"],
  ])("rejects %s", (_label, raw) => {
    expect(() => resolveFixtureRoot(raw)).toThrow(/INSIDE evals\/fixtures/u);
  });

  it("rejects an absolute path outside the fixture tree", () => {
    expect(() => resolveFixtureRoot(resolve(import.meta.dirname, "..", "src"))).toThrow(/INSIDE evals\/fixtures/u);
  });

  it("rejects the fixtures directory itself, which would expose every case's tree", () => {
    expect(() => resolveFixtureRoot("./fixtures")).toThrow(/INSIDE evals\/fixtures/u);
  });

  it("rejects a root that does not exist, rather than resolving a phantom path", () => {
    expect(() => resolveFixtureRoot("./fixtures/not-a-real-case")).toThrow(/does not exist/u);
  });

  it("accepts an absolute path that genuinely points inside the tree", () => {
    const inside = resolve(FIXTURES, "cross-hunk");
    expect(resolveFixtureRoot(inside)).toBe(inside);
  });
});

// --- Metadata the Phase 4 gate reads (change finder-serialization-outage) ---

const generation = (text: string, providerMetadata?: unknown) => ({
  content: [{ type: "text" as const, text }],
  finishReason: { unified: "stop" as const },
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  warnings: [],
  ...(providerMetadata === undefined ? {} : { providerMetadata }),
});
const priced = (provider: string, cost: number) => ({ openrouter: { provider, usage: { cost } } });
const VALID = '{"summary": "fine", "findings": []}';
const DIFF = "diff --git a/src/x.ts b/src/x.ts\n+export const x = 1;\n";

const call = (provider: FinderProvider) => provider.callApi("", { vars: { diff: DIFF, projectContext: "" } } as never);
// ProviderResponse.prompt is typed string | Prompt; the adapter always sends a string.
const promptOf = (response: Awaited<ReturnType<typeof call>>): string =>
  typeof response.prompt === "string" ? response.prompt : JSON.stringify(response.prompt);
const metadataOf = (response: Awaited<ReturnType<typeof call>>) => response.metadata as unknown as FinderTelemetry;

describe("FinderProvider metadata and prompt", () => {
  const provider = () => new FinderProvider({ id: "glm", config: { model: "z-ai/glm-4.6" } });

  it("on success: one provider slug and one cost flag per step, and the finalization prompt as actualPrompt", async () => {
    currentModel = new MockLanguageModelV3({
      doGenerate: vi.fn().mockResolvedValue(generation(VALID, priced("Novita", 0.002))),
    });
    const response = await call(provider());
    expect(response.error).toBeUndefined();
    const metadata = metadataOf(response);
    expect(metadata.stepProviders).toEqual(["Novita"]);
    expect(metadata.stepCostReported).toEqual([true]);
    expect(metadata.repairs).toBe(0);
    const prompt = JSON.parse(promptOf(response)) as { role: string; content: string }[];
    expect(prompt.map((message) => message.role)).toEqual(["system", "user"]);
    expect(prompt[0]?.content).toContain("OUTPUT FORMAT");
    expect(prompt[1]?.content).toContain("export const x = 1;");
  });

  it("on error: a missing slug stays null, an unpriced step is flagged, and the repair request is counted", async () => {
    currentModel = new MockLanguageModelV3({
      doGenerate: vi
        .fn()
        .mockResolvedValueOnce(generation('{"summary": 1}', priced("Novita", 0.001)))
        .mockResolvedValueOnce(generation('{"summary": 2}')),
    });
    const response = await call(provider());
    expect(response.error).toContain("Finder output rejected");
    const metadata = metadataOf(response);
    expect(metadata.steps).toBe(2);
    expect(metadata.stepProviders).toEqual(["Novita", null]);
    expect(metadata.stepCostReported).toEqual([true, false]);
    expect(metadata.repairs).toBe(1);
    expect(promptOf(response)).toContain("OUTPUT FORMAT");
  });

  it("before finalization: actualPrompt says so and shows the loop prompt under its own name", async () => {
    currentModel = new MockLanguageModelV3({
      doGenerate: vi
        .fn()
        .mockRejectedValue(new APICallError({ message: "HTTP 429", url: "u", requestBodyValues: {}, statusCode: 429 })),
    });
    // Tool-enabled, so the gathering loop runs first — and fails there.
    const response = await provider().callApi("", {
      vars: {
        diff: [
          "diff --git a/src/lib/format-bytes.ts b/src/lib/format-bytes.ts",
          "--- a/src/lib/format-bytes.ts",
          "+++ b/src/lib/format-bytes.ts",
          "@@ -1 +1 @@",
          "+x",
          "",
        ].join("\n"),
        projectContext: "",
        fixtureRoot: "./fixtures/clean-change",
      },
    } as never);
    expect(response.error).toContain("HTTP 429");
    const prompt = JSON.parse(promptOf(response)) as {
      finalizationReached: boolean;
      loopPrompt?: { role: string; content: string }[];
    };
    expect(prompt.finalizationReached).toBe(false);
    expect(prompt.loopPrompt?.[0]?.content).toContain("getFileContext");
    expect(promptOf(response)).not.toContain("OUTPUT FORMAT");
    expect(metadataOf(response).stepProviders).toEqual([]);
  });
});
