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
    // A mocked model reports no raw response, so every reported field is missing — never a stand-in.
    expect(metadata.requests).toEqual([
      {
        kind: "finalization",
        attempt: 1,
        provider: { value: null, source: "missing" },
        model: { value: null, source: "missing" },
        finishReason: "stop",
        reasoningTokens: { value: null, source: "missing" },
        cost: 0.002,
      },
    ]);
    expect(metadata.retries).toEqual([]);
    expect("finderFailureReason" in metadata).toBe(false);
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
    expect(metadata.requests.map((request) => request.kind)).toEqual(["finalization", "repair"]);
    expect(metadata.finderFailureReason).toBe("parse");
    expect(promptOf(response)).toContain("OUTPUT FORMAT");
  });

  it("before finalization: actualPrompt says so and shows the loop prompt under its own name", async () => {
    currentModel = new MockLanguageModelV3({
      doGenerate: vi
        .fn()
        .mockRejectedValue(new APICallError({ message: "HTTP 429", url: "u", requestBodyValues: {}, statusCode: 429 })),
    });
    // Tool-enabled, so the gathering loop runs first — and fails there, on
    // both tries of the production retry.
    const response = await retrying().callApi("", {
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

// --- Retries as in production (change finder-glm-5-3, owner decision 2026-10-13) ---

const http429 = () => new APICallError({ message: "HTTP 429", url: "u", requestBodyValues: {}, statusCode: 429 });
const noWait = vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve());
function retrying(): FinderProvider {
  return new FinderProvider({ id: "glm", config: { model: "z-ai/glm-5.3" } }, { retrySleep: noWait, random: () => 0 });
}

describe("FinderProvider production retry", () => {
  beforeEach(() => {
    noWait.mockClear();
  });

  it("429 → one retry → success is a passing row that records the retry and labels the request attempt 2", async () => {
    const doGenerate = vi
      .fn()
      .mockRejectedValueOnce(http429())
      .mockResolvedValueOnce(generation(VALID, priced("Z.AI", 0.002)));
    currentModel = new MockLanguageModelV3({ doGenerate });
    const response = await call(retrying());
    expect(response.error).toBeUndefined();
    const metadata = metadataOf(response);
    expect(metadata.retries).toEqual([{ error: "APICallError-429", delayMs: 10_000 }]);
    expect(noWait).toHaveBeenCalledWith(10_000);
    expect(doGenerate).toHaveBeenCalledTimes(2);
    expect(metadata.requests.map((request) => [request.kind, request.attempt])).toEqual([["finalization", 2]]);
  });

  it("429 twice is a failed row: the error persisted past the one retry", async () => {
    const doGenerate = vi.fn().mockRejectedValue(http429());
    currentModel = new MockLanguageModelV3({ doGenerate });
    const response = await call(retrying());
    expect(response.error).toContain("HTTP 429");
    expect(metadataOf(response).retries).toHaveLength(1);
    expect(doGenerate).toHaveBeenCalledTimes(2);
  });

  // Stop rule (b) of change finder-glm-5-3-high's screening, on fixture rows:
  // a retry, then a terminal finder error of class `timeout`.
  const finderTimeout = () => new DOMException("The finder pass exceeded its 300000 ms budget", "TimeoutError");

  it("a timeout, then a timeout on the retry: one retry and a terminal error of class timeout", async () => {
    currentModel = new MockLanguageModelV3({ doGenerate: vi.fn().mockRejectedValue(finderTimeout()) });
    const response = await call(retrying());
    expect(response.error).toContain("exceeded its 300000 ms budget");
    const metadata = metadataOf(response);
    expect(metadata.retries.map((retry) => retry.error)).toEqual(["timeout"]);
    expect(metadata.finderErrorClass).toBe("timeout");
  });

  it("a 5xx, then a timeout on the retry: the terminal class is timeout", async () => {
    const doGenerate = vi
      .fn()
      .mockRejectedValueOnce(
        new APICallError({ message: "HTTP 503", url: "u", requestBodyValues: {}, statusCode: 503 }),
      )
      .mockRejectedValueOnce(finderTimeout());
    currentModel = new MockLanguageModelV3({ doGenerate });
    const metadata = metadataOf(await call(retrying()));
    expect(metadata.retries.map((retry) => retry.error)).toEqual(["APICallError-503"]);
    expect(metadata.finderErrorClass).toBe("timeout");
  });

  it("a timeout the retry recovers leaves no terminal class: only the retry records it", async () => {
    const doGenerate = vi
      .fn()
      .mockRejectedValueOnce(finderTimeout())
      .mockResolvedValueOnce(generation(VALID, priced("Z.AI", 0.002)));
    currentModel = new MockLanguageModelV3({ doGenerate });
    const response = await call(retrying());
    expect(response.error).toBeUndefined();
    const metadata = metadataOf(response);
    expect(metadata.retries.map((retry) => retry.error)).toEqual(["timeout"]);
    expect("finderErrorClass" in metadata).toBe(false);
  });

  it("never retries a FinderOutputError, so format failures stay exposed", async () => {
    const doGenerate = vi
      .fn()
      .mockResolvedValueOnce(generation('{"summary": 1}', priced("Z.AI", 0.001)))
      .mockResolvedValueOnce(generation('{"summary": 2}', priced("Z.AI", 0.001)));
    currentModel = new MockLanguageModelV3({ doGenerate });
    const response = await call(retrying());
    expect(response.error).toContain("Finder output rejected");
    expect(metadataOf(response).retries).toEqual([]);
    expect(noWait).not.toHaveBeenCalled();
    expect(doGenerate).toHaveBeenCalledTimes(2); // finalization + its one format repair, no re-roll
  });
});

// Change finder-glm-5-3, owner decision 2026-10-14: the row carries the typed
// HTTP status of a finder error, never a status read from message text.
describe("FinderProvider error status", () => {
  it.each([401, 402])("records a finder %i from the APICallError's statusCode", async (statusCode) => {
    currentModel = new MockLanguageModelV3({
      doGenerate: vi
        .fn()
        .mockRejectedValue(new APICallError({ message: "no", url: "u", requestBodyValues: {}, statusCode })),
    });
    const response = await call(retrying());
    expect(response.error).toBeDefined();
    expect(metadataOf(response).finderErrorStatus).toBe(statusCode);
  });

  it("records the class of the error that ended the row, never its message", async () => {
    currentModel = new MockLanguageModelV3({
      doGenerate: vi
        .fn()
        .mockRejectedValue(
          new APICallError({ message: "secret body", url: "u", requestBodyValues: {}, statusCode: 402 }),
        ),
    });
    const metadata = metadataOf(await call(retrying()));
    expect(metadata.finderErrorClass).toBe("APICallError-402");
    expect(JSON.stringify(metadata)).not.toContain("secret body");
  });

  it("records no status for an error whose message merely mentions 401", async () => {
    currentModel = new MockLanguageModelV3({
      doGenerate: vi.fn().mockRejectedValue(new Error("can only afford 401 tokens")),
    });
    const response = await call(retrying());
    expect(response.error).toContain("401");
    expect("finderErrorStatus" in metadataOf(response)).toBe(false);
  });
});
