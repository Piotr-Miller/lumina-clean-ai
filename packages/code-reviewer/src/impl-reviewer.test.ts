import type { ProviderMetadata, StepResult, ToolSet } from "ai";
import { MAX_OUTPUT_TOKENS } from "./config.js";
import { MockLanguageModelV3 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_IMPL_REVIEW_MODEL } from "./config.js";
import { createImplReviewer, identifyImplFindings, MAX_IMPL_FINDINGS } from "./impl-reviewer.js";
import type { ImplFinding, ImplGrades } from "./schemas.js";

// Captures what the factory hands the provider so the model id and the
// usage-accounting flag are pinned at the construction boundary.
let capturedModelId: string | undefined;
let capturedSettings: unknown;
let currentModel: MockLanguageModelV3 | undefined;

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: () => (modelId: string, settings: unknown) => {
    capturedModelId = modelId;
    capturedSettings = settings;
    if (!currentModel) throw new Error("currentModel not set in this test");
    return currentModel;
  },
}));

beforeEach(() => {
  capturedModelId = undefined;
  capturedSettings = undefined;
  currentModel = undefined;
  vi.stubEnv("OPENROUTER_API_KEY", undefined);
  vi.stubEnv("OPENROUTER_MODEL", undefined);
  vi.stubEnv("OPENROUTER_JUDGE_MODEL", undefined);
  vi.stubEnv("OPENROUTER_IMPL_REVIEW_MODEL", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const grades = (): ImplGrades => ({
  plan_adherence: "PASS",
  scope_discipline: "PASS",
  safety_quality: "PASS",
  architecture: "PASS",
  pattern_consistency: "PASS",
  test_coverage: "PASS",
  success_criteria: "PASS",
});

// Defaults to the `absent` locus — the variant with no extra required fields.
// Overrides are a full ImplFinding so a partial cannot smuggle in an invalid
// locus/field combination, which is the whole point of the union.
const implFinding = (overrides: Partial<Omit<ImplFinding, "locus">> = {}): ImplFinding => ({
  locus: "absent",
  dimension: "plan_adherence",
  severity: "WARNING",
  impact: "LOW",
  title: "t",
  detail: "d",
  fix: "f",
  ...overrides,
});

describe("createImplReviewer construction", () => {
  it("throws an actionable error when no API key is resolvable", () => {
    expect(() => createImplReviewer()).toThrow(/OPENROUTER_API_KEY/);
  });

  it("constructs offline with an explicit apiKey and exposes the contract", () => {
    currentModel = new MockLanguageModelV3();
    const reviewer = createImplReviewer({ apiKey: "test-key" });
    expect(typeof reviewer.implReview).toBe("function");
    expect(reviewer.agent).toBeDefined();
    expect(reviewer.model).toBe(DEFAULT_IMPL_REVIEW_MODEL);
    expect(capturedModelId).toBe(DEFAULT_IMPL_REVIEW_MODEL);
  });

  // Usage accounting is opt-in: without this flag the provider reports no
  // `usage` block, so the exact billed cost is permanently undefined and every
  // cost reading silently becomes "free" — the blind spot #119 shipped with,
  // and the one that would make phase 4's cost criterion unverifiable
  // (plan-review F3). Nothing else in the package would notice its absence.
  it("enables provider usage accounting so per-run cost is observable", () => {
    currentModel = new MockLanguageModelV3();
    createImplReviewer({ apiKey: "test-key" });
    expect(capturedSettings).toEqual({ usage: { include: true } });
  });

  it("honours an explicit model override and the env var", () => {
    currentModel = new MockLanguageModelV3();
    expect(createImplReviewer({ apiKey: "k", model: "override/x" }).model).toBe("override/x");
    vi.stubEnv("OPENROUTER_IMPL_REVIEW_MODEL", "env/impl");
    expect(createImplReviewer({ apiKey: "k" }).model).toBe("env/impl");
  });

  // The seam exists so a later, probe-gated change is a wiring change rather
  // than a redesign — but until that probe runs, passing a source must NOT
  // quietly turn this pass into a tool loop and forfeit its one-call ceiling.
  it("accepts a source and ignores it — the pass stays tool-less", () => {
    currentModel = new MockLanguageModelV3();
    const reviewer = createImplReviewer({
      apiKey: "test-key",
      source: () => "some file content",
    });
    // Not an empty tool set — no tool set at all. (The SDK types `tools` as
    // non-nullish, but the factory never passes the option, so it is genuinely
    // undefined at runtime.)
    expect(reviewer.agent.tools).toBeUndefined();
  });
});

describe("identifyImplFindings", () => {
  it("assigns P1..Pn in code, ignoring anything the model may have supplied", () => {
    const identified = identifyImplFindings([implFinding({ title: "a" }), implFinding({ title: "b" })]);
    expect(identified.map((f) => f.id)).toEqual(["P1", "P2"]);
  });

  // Cap enforced in code: a model asked to cap its own list ignores the cap
  // under load, the same reason finding ids are not model-assigned.
  it("caps the list at MAX_IMPL_FINDINGS", () => {
    const many = Array.from({ length: MAX_IMPL_FINDINGS + 7 }, (_, i) => implFinding({ title: `t${String(i)}` }));
    expect(identifyImplFindings(many)).toHaveLength(MAX_IMPL_FINDINGS);
  });

  // Truncation must only ever discard the least severe findings — dropping a
  // CRITICAL to make room for an OBSERVATION would invert the whole point.
  it("orders by severity so the cap can never discard a CRITICAL", () => {
    const many = [
      ...Array.from({ length: MAX_IMPL_FINDINGS }, () => implFinding({ severity: "OBSERVATION" })),
      implFinding({ severity: "CRITICAL", title: "the critical one" }),
      implFinding({ severity: "WARNING", title: "the warning one" }),
    ];
    const identified = identifyImplFindings(many);
    expect(identified).toHaveLength(MAX_IMPL_FINDINGS);
    expect(identified.at(0)).toMatchObject({ id: "P1", severity: "CRITICAL", title: "the critical one" });
    expect(identified.at(1)).toMatchObject({ id: "P2", severity: "WARNING" });
    expect(identified.some((f) => f.severity === "CRITICAL")).toBe(true);
  });

  it("returns an empty list unchanged", () => {
    expect(identifyImplFindings([])).toEqual([]);
  });
});

describe("implReview call", () => {
  const respondWith = (output: unknown, providerMetadata?: ProviderMetadata): MockLanguageModelV3 =>
    new MockLanguageModelV3({
      doGenerate: () =>
        Promise.resolve({
          content: [{ type: "text" as const, text: JSON.stringify(output) }],
          // V3 finish reason is an object, not a bare string, and usage is
          // nested — mirroring judge.test.ts's textModel helper.
          finishReason: { unified: "stop" as const, raw: "stop" },
          usage: {
            inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 5, text: 5, reasoning: 0 },
          },
          warnings: [],
          ...(providerMetadata === undefined ? {} : { providerMetadata }),
        }),
    });

  const passingOutput = () => ({
    grades: grades(),
    verdict: "APPROVED",
    verdictReason: "nothing to report",
    findings: [],
  });

  /** The exact metadata path pipeline.ts's asStepCost reads. */
  const costOf = (step: StepResult<ToolSet> | undefined): unknown =>
    (step?.providerMetadata as { openrouter?: { usage?: { cost?: unknown } } } | undefined)?.openrouter?.usage?.cost;

  const collectSteps = (): { steps: StepResult<ToolSet>[]; onStepEnd: (step: StepResult<ToolSet>) => void } => {
    const steps: StepResult<ToolSet>[] = [];
    return { steps, onStepEnd: (step) => steps.push(step) };
  };

  it("returns validated output with ids assigned and forwards onStepEnd", async () => {
    currentModel = respondWith({
      // Coherent by construction: a CRITICAL plan_adherence finding forces that
      // dimension to FAIL and the verdict to REJECTED (schemas.ts consistency
      // rules, impl-review-phase-2 F4).
      grades: { ...grades(), plan_adherence: "FAIL" },
      verdict: "REJECTED",
      verdictReason: "one planned change is missing",
      findings: [implFinding({ severity: "CRITICAL", title: "missing migration" })],
    });
    const { steps, onStepEnd } = collectSteps();
    const reviewer = createImplReviewer({ apiKey: "test-key", onStepEnd });
    const result = await reviewer.implReview({ plan: "## Phase 1", diff: "diff --git a/x b/x" });

    expect(result.verdict).toBe("REJECTED");
    expect(result.grades.plan_adherence).toBe("FAIL");
    expect(result.findings).toHaveLength(1);
    expect(result.findings.at(0)?.id).toBe("P1");
    // Tool-less: exactly one generation per attempt, which is what makes the
    // cost ceiling a hard one call rather than one-to-N.
    expect(steps).toHaveLength(1);
    // onStepEnd firing proves nothing if the usage it carries is empty — the
    // step is the only carrier of per-run spend (impl-review-phase-2 F2).
    expect(steps.at(0)?.usage.inputTokens).toBe(10);
    expect(steps.at(0)?.usage.outputTokens).toBe(5);
  });

  it("carries the provider-reported cost through to the emitted step", async () => {
    currentModel = respondWith(passingOutput(), { openrouter: { usage: { cost: 0.0123 } } });
    const { steps, onStepEnd } = collectSteps();
    const reviewer = createImplReviewer({ apiKey: "test-key", onStepEnd });
    await reviewer.implReview({ plan: "p", diff: "d" });
    expect(costOf(steps.at(0))).toBe(0.0123);
  });

  // Absent must stay distinguishable from a genuine 0, or an un-instrumented
  // run reads as "this model was free" — the same contract asStepCost keeps.
  it("leaves the cost undefined when the provider reports no usage accounting", async () => {
    currentModel = respondWith(passingOutput());
    const { steps, onStepEnd } = collectSteps();
    const reviewer = createImplReviewer({ apiKey: "test-key", onStepEnd });
    await reviewer.implReview({ plan: "p", diff: "d" });
    expect(steps).toHaveLength(1);
    expect(costOf(steps.at(0))).toBeUndefined();
  });

  it("rejects output whose verdict is outside the vocabulary", async () => {
    currentModel = respondWith({
      grades: grades(),
      verdict: "LGTM",
      verdictReason: "r",
      findings: [],
    });
    const reviewer = createImplReviewer({ apiKey: "test-key" });
    // Matched on the schema-validation message specifically: a bare
    // .toThrow() also passes on "No output generated", which is what a
    // mis-shaped test mock produces — so it would report a green schema guard
    // while proving nothing about the schema.
    await expect(reviewer.implReview({ plan: "p", diff: "d" })).rejects.toThrow(/did not match schema/);
  });

  it("rejects output missing a dimension grade", async () => {
    const partial: Record<string, string> = { ...grades() };
    delete partial.architecture;
    currentModel = respondWith({
      grades: partial,
      verdict: "APPROVED",
      verdictReason: "r",
      findings: [],
    });
    const reviewer = createImplReviewer({ apiKey: "test-key" });
    await expect(reviewer.implReview({ plan: "p", diff: "d" })).rejects.toThrow(/did not match schema/);
  });

  // Uncapped, the provider requests the model maximum (65,536) and OpenRouter
  // reserves credit against that REQUESTED figure, not actual use — which killed
  // a whole review on a funded account ("can only afford 62849"). Pinned per
  // factory because the cap must reach every call, not just the one we checked.
  it("caps output tokens so the credit reservation matches real usage", () => {
    currentModel = new MockLanguageModelV3();
    const agent = createImplReviewer({ apiKey: "test-key" }).agent as unknown as {
      settings?: { maxOutputTokens?: number };
    };
    expect(agent.settings?.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS);
  });
});
