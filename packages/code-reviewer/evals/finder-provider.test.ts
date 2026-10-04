import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { APICallError } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scoreIssueRecall } from "./assertions.mjs";
import FinderProvider, {
  asOpenRouterReasoningTokens,
  resolveFixtureRoot,
  type FinderTelemetry,
} from "./finder-provider.js";

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
    expect(metadata.stepReasoningTokens).toEqual([null]);
    expect(metadata.stepReasoningTextChars).toEqual([0]);
    expect(metadata.reasoningLeak).toBe(false);
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
    expect(metadata.stepReasoningTokens).toEqual([null, null]);
    expect(metadata.repairs).toBe(1);
    expect(promptOf(response)).toContain("OUTPUT FORMAT");
  });

  it("records each request's reasoning tokens, so a reasoning run cannot pass as reasoning-off (A3)", async () => {
    currentModel = new MockLanguageModelV3({
      doGenerate: vi.fn().mockResolvedValue({
        ...generation(VALID, priced("Novita", 0.002)),
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 40, text: 10, reasoning: 30 },
        },
      }),
    });
    const metadata = metadataOf(await call(provider()));
    expect(metadata.stepReasoningTokens).toEqual([30]);
  });

  // A3 rejects reasoning tokens OR reasoning text (impl-review-phase-4 F1): a
  // response can carry reasoning text while reporting zero or no tokens.
  it.each([
    ["zero", { total: 40, text: 40, reasoning: 0 }],
    ["absent", { total: 40, text: 40, reasoning: undefined }],
  ])("flags reasoning TEXT as a leak when the token count is %s", async (_label, outputTokens) => {
    currentModel = new MockLanguageModelV3({
      doGenerate: vi.fn().mockResolvedValue({
        ...generation(VALID, priced("Novita", 0.002)),
        content: [
          { type: "reasoning" as const, text: "Let me think about the diff first." },
          { type: "text" as const, text: VALID },
        ],
        usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens },
      }),
    });
    const metadata = metadataOf(await call(provider()));
    expect(metadata.stepReasoningTextChars).toEqual(["Let me think about the diff first.".length]);
    expect(metadata.reasoningLeak).toBe(true);
  });

  it("flags OpenRouter's own reasoning-token count when the SDK usage reports none", async () => {
    currentModel = new MockLanguageModelV3({
      doGenerate: vi.fn().mockResolvedValue(
        generation(VALID, {
          openrouter: { provider: "Novita", usage: { cost: 0.002, completionTokensDetails: { reasoningTokens: 12 } } },
        }),
      ),
    });
    const metadata = metadataOf(await call(provider()));
    expect(metadata.stepReasoningTokens).toEqual([null]);
    expect(metadata.stepOpenRouterReasoningTokens).toEqual([12]);
    expect(metadata.reasoningLeak).toBe(true);
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

// --- Retries as in production (change finder-model-swap, gate.md §4) ---

const http429 = () => new APICallError({ message: "HTTP 429", url: "u", requestBodyValues: {}, statusCode: 429 });
const noWait = vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve());
function retrying(): FinderProvider {
  return new FinderProvider({ id: "glm", config: { model: "z-ai/glm-4.6" } }, { retrySleep: noWait, random: () => 0 });
}

describe("FinderProvider production retry", () => {
  beforeEach(() => {
    noWait.mockClear();
  });

  it("429 → one retry → success is a passing row that records retry=1 and the production delay", async () => {
    const doGenerate = vi
      .fn()
      .mockRejectedValueOnce(http429())
      .mockResolvedValueOnce(generation(VALID, priced("Novita", 0.002)));
    currentModel = new MockLanguageModelV3({ doGenerate });
    const response = await call(retrying());
    expect(response.error).toBeUndefined();
    const metadata = metadataOf(response);
    expect(metadata.retries).toEqual([{ error: "APICallError-429", delayMs: 10_000 }]);
    expect(noWait).toHaveBeenCalledWith(10_000);
    expect(doGenerate).toHaveBeenCalledTimes(2);
    expect(metadata.stepProviders).toEqual(["Novita"]);
  });

  it("429 twice is a failed row: the error persisted past the one retry", async () => {
    const doGenerate = vi.fn().mockRejectedValue(http429());
    currentModel = new MockLanguageModelV3({ doGenerate });
    const response = await call(retrying());
    expect(response.error).toContain("HTTP 429");
    expect(metadataOf(response).retries).toHaveLength(1);
    expect(doGenerate).toHaveBeenCalledTimes(2);
  });

  it("never retries a FinderOutputError, so format failures stay exposed", async () => {
    const doGenerate = vi
      .fn()
      .mockResolvedValueOnce(generation('{"summary": 1}', priced("Novita", 0.001)))
      .mockResolvedValueOnce(generation('{"summary": 2}', priced("Novita", 0.001)));
    currentModel = new MockLanguageModelV3({ doGenerate });
    const response = await call(retrying());
    expect(response.error).toContain("Finder output rejected");
    expect(metadataOf(response).retries).toEqual([]);
    expect(noWait).not.toHaveBeenCalled();
    expect(doGenerate).toHaveBeenCalledTimes(2); // finalization + its one format repair, no re-roll
  });

  it("a row without a retry reports an empty list, never an absent field", async () => {
    currentModel = new MockLanguageModelV3({
      doGenerate: vi.fn().mockResolvedValue(generation(VALID, priced("Novita", 0.002))),
    });
    expect(metadataOf(await call(retrying())).retries).toEqual([]);
  });
});

describe("asOpenRouterReasoningTokens", () => {
  it.each([
    ["absent metadata", undefined],
    ["no usage", { openrouter: { provider: "Novita" } }],
    ["no details", { openrouter: { usage: { cost: 1 } } }],
    ["a non-number", { openrouter: { usage: { completionTokensDetails: { reasoningTokens: "5" } } } }],
  ])("returns null for %s, never a fabricated 0", (_label, metadata) => {
    expect(asOpenRouterReasoningTokens(metadata)).toBeNull();
  });

  it("returns the reported count, including an explicit 0", () => {
    expect(
      asOpenRouterReasoningTokens({ openrouter: { usage: { completionTokensDetails: { reasoningTokens: 0 } } } }),
    ).toBe(0);
  });
});

// --- Verifier rows (change finder-verification, plan.md Phase 2 §2) ---

const USERS_DIFF = [
  "diff --git a/src/users.js b/src/users.js",
  "index 3f1c2aa..9be51d7 100644",
  "--- a/src/users.js",
  "+++ b/src/users.js",
  "@@ -1,3 +1,9 @@",
  " export function listUsers(users) {",
  "   return users.map((u) => u.name);",
  " }",
  "+",
  "+export function getUserAge(users, id) {",
  "+  for (var i = 0; i <= users.length; i++) {",
  "+    if (users[i].id == id) return users[i].age;",
  "+  }",
  "+}",
].join("\n");
const PLANTED_LINE = "for (var i = 0; i <= users.length; i++) {";
const EXPECTED_ISSUES = [
  {
    label: "out-of-bounds loop condition",
    patterns: ["off[- ]by[- ]one", "out[- ]of[- ]bounds", "i <= users\\.length", "i < users\\.length"],
  },
];
const OFF_BY_ONE = {
  file: "src/users.js",
  startLine: 6,
  severity: "major",
  category: "correctness",
  description: "Off-by-one: `i <= users.length` reads past the end of the array.",
  suggestion: "Use `i < users.length`.",
};
const finderSaying = (summary: string, findings: unknown[]) => JSON.stringify({ summary, findings });
const verdicts = (verdict: "confirmed" | "refuted", quote = PLANTED_LINE) =>
  JSON.stringify({ verdicts: [{ id: "F1", verdict, quote, reason: "the loop bound is shown" }] });

const verifying = () =>
  new FinderProvider(
    {
      id: "control-luna-verify",
      config: { model: "openai/gpt-6-luna", verifier: { model: "openai/gpt-6-luna", providers: ["openai"] } },
    },
    { retrySleep: noWait, random: () => 0 },
  );
const callRow = (provider: FinderProvider, vars: Record<string, unknown> = {}) =>
  provider.callApi("", {
    vars: { diff: USERS_DIFF, projectContext: "", verifierRoot: "./fixtures/js-loop", ...vars },
  } as never);
const recallOf = (output: unknown) =>
  scoreIssueRecall(String(output), { vars: { expectedIssues: EXPECTED_ISSUES } }).pass;
interface VerifierRowMetadata {
  verifier: { called: boolean; requests: { provider: string | null; cost: number | null }[]; reasoningLeak: boolean };
  verification: { status: string; finderSummary: string; publishedIds: string[]; verdicts: { quote?: string }[] };
}
const rowMetadata = (response: Awaited<ReturnType<typeof callRow>>) =>
  response.metadata as unknown as VerifierRowMetadata;

describe("FinderProvider verifier rows — graded output is {summary, findings: published} only", () => {
  it("a quote carrying the planted line, kept in metadata, does not make issue_recall pass", async () => {
    currentModel = new MockLanguageModelV3({
      doGenerate: vi
        .fn()
        .mockResolvedValueOnce(generation(finderSaying("one finding", [OFF_BY_ONE]), priced("OpenAI", 0.001)))
        .mockResolvedValueOnce(generation(verdicts("refuted"), priced("OpenAI", 0.0005))),
    });
    const response = await callRow(verifying());
    expect(response.error).toBeUndefined();
    expect(JSON.parse(String(response.output))).toEqual({
      summary: "0 findings published after verification",
      findings: [],
    });
    const metadata = rowMetadata(response);
    // The planted line IS in the record — only outside the graded output.
    expect(metadata.verification.verdicts[0]?.quote).toBe(PLANTED_LINE);
    expect(recallOf(response.output)).toBe(false);
  });

  it("a confirmed finding is published, ids stripped, and issue_recall passes on it", async () => {
    currentModel = new MockLanguageModelV3({
      doGenerate: vi
        .fn()
        .mockResolvedValueOnce(generation(finderSaying("one finding", [OFF_BY_ONE]), priced("OpenAI", 0.001)))
        .mockResolvedValueOnce(generation(verdicts("confirmed"), priced("OpenAI", 0.0005))),
    });
    const response = await callRow(verifying());
    const output = JSON.parse(String(response.output)) as { summary: string; findings: Record<string, unknown>[] };
    expect(output.summary).toBe("1 findings published after verification");
    expect(output.findings).toEqual([OFF_BY_ONE]);
    expect(rowMetadata(response).verification.publishedIds).toEqual(["F1"]);
    expect(recallOf(response.output)).toBe(true);
  });

  it("a finder summary naming the planted flaw, with nothing published, fails issue_recall", async () => {
    const doGenerate = vi
      .fn()
      .mockResolvedValueOnce(
        generation(finderSaying("Off-by-one: i <= users.length reads out of bounds.", []), priced("OpenAI", 0.001)),
      );
    currentModel = new MockLanguageModelV3({ doGenerate });
    const response = await callRow(verifying());
    expect(recallOf(response.output)).toBe(false);
    const metadata = rowMetadata(response);
    expect(metadata.verification.finderSummary).toContain("Off-by-one");
    expect(metadata.verification.status).toBe("no-findings");
    // Nothing to verify: no verifier request, and it says so.
    expect(metadata.verifier.called).toBe(false);
    expect(doGenerate).toHaveBeenCalledTimes(1);
  });

  it("the published output satisfies review-result.schema.json (schema_validity), keys included", async () => {
    currentModel = new MockLanguageModelV3({
      doGenerate: vi
        .fn()
        .mockResolvedValueOnce(generation(finderSaying("one finding", [OFF_BY_ONE]), priced("OpenAI", 0.001)))
        .mockResolvedValueOnce(generation(verdicts("confirmed"), priced("OpenAI", 0.0005))),
    });
    const response = await callRow(verifying());
    const schema = JSON.parse(readFileSync(resolve(import.meta.dirname, "review-result.schema.json"), "utf8")) as {
      required: string[];
      properties: Record<string, unknown> & { findings: { items: { required: string[]; properties: object } } };
    };
    const output = JSON.parse(String(response.output)) as Record<string, unknown> & {
      findings: Record<string, unknown>[];
    };
    // additionalProperties: false at both levels — exactly what promptfoo's is-json enforces.
    expect(Object.keys(output).every((key) => key in schema.properties)).toBe(true);
    expect(schema.required.every((key) => key in output)).toBe(true);
    for (const finding of output.findings) {
      expect(Object.keys(finding).every((key) => key in schema.properties.findings.items.properties)).toBe(true);
      expect(schema.properties.findings.items.required.every((key) => key in finding)).toBe(true);
    }
  });

  it("records the verifier's provider and cost per request, separately from the finder's G4 cost", async () => {
    currentModel = new MockLanguageModelV3({
      doGenerate: vi
        .fn()
        .mockResolvedValueOnce(generation(finderSaying("one finding", [OFF_BY_ONE]), priced("OpenAI", 0.001)))
        .mockResolvedValueOnce(generation(verdicts("confirmed"), priced("OpenAI", 0.0005))),
    });
    const response = await callRow(verifying());
    expect(rowMetadata(response).verifier).toMatchObject({
      called: true,
      requests: [{ provider: "OpenAI", cost: 0.0005 }],
      reasoningLeak: false,
    });
    expect(metadataOf(response).cost).toBe(0.001);
  });

  it("a row with no root at all records skipped-no-source rather than verifying", async () => {
    currentModel = new MockLanguageModelV3({
      doGenerate: vi
        .fn()
        .mockResolvedValueOnce(generation(finderSaying("one finding", [OFF_BY_ONE]), priced("OpenAI", 0.001))),
    });
    const response = await callRow(verifying(), { verifierRoot: undefined });
    expect(rowMetadata(response).verification.status).toBe("skipped-no-source");
  });

  it("sends the finder the same request with a verifierRoot as without one: no tool, the same messages", async () => {
    const promptsOf = async (vars: Record<string, unknown>) => {
      const doGenerate = vi
        .fn()
        .mockResolvedValueOnce(generation(finderSaying("nothing", []), priced("OpenAI", 0.001)));
      currentModel = new MockLanguageModelV3({ doGenerate });
      await callRow(verifying(), vars);
      const options = doGenerate.mock.calls[0]?.[0] as { prompt: unknown; tools?: unknown[] };
      return { prompt: options.prompt, tools: options.tools ?? [] };
    };
    const withRoot = await promptsOf({});
    const without = await promptsOf({ verifierRoot: undefined });
    expect(withRoot.tools).toEqual([]);
    expect(withRoot).toEqual(without);
  });

  it.each([
    ["a parent-directory walk", "../../.."],
    ["package source", "./fixtures/../../src"],
  ])("refuses a verifierRoot outside evals/fixtures (%s), before any model call", async (_label, verifierRoot) => {
    const doGenerate = vi.fn();
    currentModel = new MockLanguageModelV3({ doGenerate });
    const response = await callRow(verifying(), { verifierRoot });
    expect(response.error).toMatch(/verifierRoot .* INSIDE evals\/fixtures/u);
    expect(doGenerate).not.toHaveBeenCalled();
  });

  it("rejects a verifier config without a model or providers", () => {
    expect(() => new FinderProvider({ config: { model: "m", verifier: { providers: ["openai"] } } })).toThrow(
      /verifier.model/u,
    );
    expect(() => new FinderProvider({ config: { model: "m", verifier: { model: "v", providers: [] } } })).toThrow(
      /verifier.providers/u,
    );
  });
});
