import { MockLanguageModelV3 } from "ai/test";
import { MAX_OUTPUT_TOKENS } from "./config.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_JUDGE_MODEL } from "./config.js";
import { createJudge } from "./judge.js";
import { CRITERIA } from "./scorecard.js";
import type { IdentifiedFinding, Scores } from "./schemas.js";

// The OpenRouter provider is mocked at module level so the factory wires its
// agent to a test-controlled model. Construction-only tests get a benign
// default mock (never invoked); call tests set `currentModel` first.
let currentModel: MockLanguageModelV3 | undefined;
vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: () => () => currentModel ?? new MockLanguageModelV3({}),
}));

beforeEach(() => {
  currentModel = undefined;
  vi.stubEnv("OPENROUTER_API_KEY", undefined);
  vi.stubEnv("OPENROUTER_MODEL", undefined);
  vi.stubEnv("OPENROUTER_REVIEW_MODEL", undefined);
  vi.stubEnv("OPENROUTER_JUDGE_MODEL", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// WIRE fixture — what the MODEL returns, so scores are strings. The judge
// normalizes them to numbers on the way out, which is what the assertions below
// check. Keeping these two shapes distinct is the point: a single fixture serving
// both roles would hide the normalization entirely.
const wireJudgeOutput = (findingIds: Partial<Record<keyof Scores, string[]>> = {}) => ({
  scores: Object.fromEntries(
    CRITERIA.map(({ key }) => [key, { score: "8", justification: "j", findingIds: findingIds[key] ?? [] }]),
  ),
  verdict: "passed",
  verdictReason: "well-evidenced change",
  summary: "solid overall",
});

const textModel = (text: string): MockLanguageModelV3 =>
  new MockLanguageModelV3({
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: "text" as const, text }],
        // V3 finish reason is an object, not a bare string.
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        warnings: [],
      }),
  });

const findings: IdentifiedFinding[] = [
  {
    id: "F1",
    file: "src/a.ts",
    startLine: 5,
    severity: "major",
    crossUserAccess: false,
    category: "security",
    description: "d",
    suggestion: "s",
  },
];

const input = { findings, prTitle: "t", prBody: "b", diffStats: { files: 1, additions: 1, deletions: 0 } };

describe("createJudge", () => {
  it("throws an actionable error when no API key is resolvable", () => {
    expect(() => createJudge()).toThrow(/OPENROUTER_API_KEY/);
  });

  it("constructs offline with an explicit apiKey and exposes the contract", () => {
    const judge = createJudge({ apiKey: "test-key" });
    expect(typeof judge.judge).toBe("function");
    expect(judge.agent).toBeDefined();
    expect(judge.model).toBe(DEFAULT_JUDGE_MODEL);
  });

  it("resolves the model from OPENROUTER_JUDGE_MODEL when not overridden", () => {
    vi.stubEnv("OPENROUTER_JUDGE_MODEL", "env/judge-y");
    expect(createJudge({ apiKey: "test-key" }).model).toBe("env/judge-y");
  });

  it("prefers the model override over the env var", () => {
    vi.stubEnv("OPENROUTER_JUDGE_MODEL", "env/judge-y");
    expect(createJudge({ apiKey: "test-key", model: "override/z" }).model).toBe("override/z");
  });

  it("is a factory, not a singleton", () => {
    const a = createJudge({ apiKey: "test-key" });
    const b = createJudge({ apiKey: "test-key" });
    expect(a.agent).not.toBe(b.agent);
  });
});

describe("judge()", () => {
  it("returns the model-owned verdict fields with reference integrity applied", async () => {
    currentModel = textModel(JSON.stringify(wireJudgeOutput({ security_safety: ["F1", "F9"] })));
    const { judge } = createJudge({ apiKey: "test-key" });
    const result = await judge(input);
    expect(result.verdict).toBe("passed");
    expect(result.verdictReason).toBe("well-evidenced change");
    expect(result.summary).toBe("solid overall");
    // Unknown F9 stripped and counted; known F1 kept.
    expect(result.scores.security_safety.findingIds).toEqual(["F1"]);
    expect(result.droppedFindingIdRefs).toBe(1);
    // Normalized on the way out: the wire carried "8", consumers see 8.
    expect(result.scores.security_safety.score).toBe(8);
  });

  it("rejects on a schema-mismatching output (no silent repair)", async () => {
    currentModel = textModel(JSON.stringify({ scores: {}, verdict: "maybe" }));
    const { judge } = createJudge({ apiKey: "test-key" });
    await expect(judge(input)).rejects.toThrow();
  });

  // Uncapped, the provider requests the model maximum (65,536) and OpenRouter
  // reserves credit against that REQUESTED figure, not actual use — which killed
  // a whole review on a funded account ("can only afford 62849"). Pinned per
  // factory because the cap must reach every call, not just the one we checked.
  it("caps output tokens so the credit reservation matches real usage", () => {
    const agent = createJudge({ apiKey: "k" }).agent as unknown as {
      settings?: { maxOutputTokens?: number };
    };
    expect(agent.settings?.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS);
  });
});
