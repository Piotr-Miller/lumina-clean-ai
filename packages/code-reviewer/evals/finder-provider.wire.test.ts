// The adapter against the OpenRouter wire stub, not a mocked model: what G3
// reads off a row (change `finder-glm-5-3`, owner decisions 2026-10-13) must
// come from the request bodies actually sent and the raw responses actually
// received.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FINDER_REASONING } from "../src/config.js";
import { openRouterStub, STUB_MODEL, VALID_REVIEW_TEXT, type StubCompletion } from "../src/openrouter-stub.js";
import FinderProvider, { reasoningKeyOf, type FinderTelemetry } from "./finder-provider.js";

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const DIFF = "diff --git a/src/x.ts b/src/x.ts\n+export const x = 1;\n";
const noWait = () => Promise.resolve();

const row = async (responses: StubCompletion[]) => {
  const stub = openRouterStub(responses);
  const provider = new FinderProvider(
    { id: "candidate-glm-5.3", config: { model: "z-ai/glm-5.3" } },
    { fetch: stub.fetch, retrySleep: noWait, random: () => 0 },
  );
  const response = await provider.callApi("", { vars: { diff: DIFF, projectContext: "" } } as never);
  return { response, metadata: response.metadata as unknown as FinderTelemetry, bodies: stub.bodies };
};

describe("FinderProvider on the wire", () => {
  it("captures the reasoning key of every outgoing request, the repair included, and nothing else of the body", async () => {
    const { response, metadata, bodies } = await row([
      { content: '{"summary": 1}', finish: "stop", provider: "Z.AI", cost: 0.001, reasoningTokens: 30 },
      { content: VALID_REVIEW_TEXT, finish: "stop", provider: "Fireworks", cost: 0.001, reasoningTokens: 12 },
    ]);
    expect(response.error).toBeUndefined();
    expect(bodies).toHaveLength(2);
    expect(metadata.requestReasoning).toEqual([FINDER_REASONING, FINDER_REASONING]);
    // Only the key: no messages, no model, no routing.
    expect(JSON.stringify(metadata.requestReasoning)).not.toContain("messages");
  });

  it("records each request's raw reported provider, model and reasoning tokens, missing where absent", async () => {
    const { metadata } = await row([
      { content: '{"summary": 1}', finish: "stop", provider: "Z.AI", cost: 0.001, reasoningTokens: 30 },
      { content: VALID_REVIEW_TEXT, finish: "stop", provider: "Together", model: null, cost: 0.002 },
    ]);
    expect(metadata.requests).toEqual([
      {
        kind: "finalization",
        attempt: 1,
        provider: { value: "Z.AI", source: "reported" },
        model: { value: STUB_MODEL, source: "reported" },
        finishReason: "stop",
        reasoningTokens: { value: 30, source: "reported" },
        cost: 0.001,
      },
      {
        kind: "repair",
        attempt: 1,
        provider: { value: "Together", source: "reported" },
        // The SDK would substitute the requested id; the row must not.
        model: { value: null, source: "missing" },
        finishReason: "stop",
        reasoningTokens: { value: null, source: "missing" },
        cost: 0.002,
      },
    ]);
  });

  it("an inline-reasoning response fails the row with its reason, and its text appears nowhere in the row", async () => {
    const { response, metadata } = await row([
      { content: "<think>REASONING-SENTINEL-g3</think>{}", finish: "stop", provider: "Z.AI", cost: 0.001 },
    ]);
    expect(response.error).toContain("reason=inline-reasoning");
    expect(metadata.finderFailureReason).toBe("inline-reasoning");
    expect(JSON.stringify(response)).not.toContain("REASONING-SENTINEL");
  });
});

describe("reasoningKeyOf", () => {
  it.each([
    ["a non-string body", undefined],
    ["a non-JSON body", "not json"],
    ["a body without the key", JSON.stringify({ model: "m" })],
    ["a JSON scalar", "42"],
  ])("returns null for %s", (_label, body) => {
    expect(reasoningKeyOf(body)).toBeNull();
  });

  it("returns a copy of the key's value", () => {
    expect(reasoningKeyOf(JSON.stringify({ reasoning: { enabled: true, effort: "high" }, messages: [] }))).toEqual({
      enabled: true,
      effort: "high",
    });
  });
});
