import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_VERIFIER_MODEL } from "./config.js";
import type { ExcerptBlock, ExcerptPlan } from "./excerpts.js";
import { openRouterStub } from "./openrouter-stub.js";
import { isRetryableError } from "./retry.js";
import type { IdentifiedFinding, VerificationOutput } from "./schemas.js";
import {
  applyVerdicts,
  checkQuote,
  createVerifier,
  MIN_QUOTE_CHARS,
  normalizeQuote,
  parseVerifierOutput,
  VerifierOutputError,
} from "./verifier.js";

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", undefined);
  vi.stubEnv("OPENROUTER_VERIFIER_MODEL", undefined);
  vi.stubEnv("OPENROUTER_VERIFIER_PROVIDERS", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const block = (blockId: string, startLine: number, code: string[], cited: number[] = []): ExcerptBlock => {
  const width = String(startLine + code.length).length;
  return {
    blockId,
    path: "src/a.ts",
    startLine,
    endLine: startLine + code.length - 1,
    text: code
      .map((line, index) => {
        const n = startLine + index;
        return `${String(n).padStart(width)}${cited.includes(n) ? ">" : ""}| ${line}`;
      })
      .join("\n"),
  };
};

const B1 = block(
  "B1",
  1,
  ["function load(items) {", "  for (let i = 0; i <= items.length; i++) {", "    use(items[i]);", "  }", "}"],
  [2],
);
const B2 = block("B2", 40, ["export function other() {", "  return guardedCall();", "}"]);

const finding = (id: string, overrides: Partial<IdentifiedFinding> = {}): IdentifiedFinding => ({
  id,
  file: "src/a.ts",
  startLine: 2,
  severity: "major",
  category: "correctness",
  description: "off by one",
  suggestion: "use <",
  ...overrides,
});

const planFor = (perFinding: ExcerptPlan["perFinding"]): Pick<ExcerptPlan, "blocks" | "perFinding"> => ({
  blocks: [B1, B2],
  perFinding,
});

const verdict = (
  id: string,
  kind: VerificationOutput["verdicts"][number]["verdict"],
  quote: string,
  reason = "because",
): VerificationOutput["verdicts"][number] => ({ id, verdict: kind, quote, reason });

describe("checkQuote — the quote check", () => {
  it("passes an exact substring of one block, as `exact`", () => {
    expect(checkQuote("for (let i = 0; i <= items.length; i++) {", [B1])).toBe("exact");
  });

  it("strips a copied line-number prefix (with or without the cited marker) from every quote line", () => {
    expect(checkQuote(" 2>|   for (let i = 0; i <= items.length; i++) {\n 3|     use(items[i]);", [B1])).toBe("exact");
  });

  it("normalises CRLF and trailing whitespace", () => {
    expect(checkQuote("  for (let i = 0; i <= items.length; i++) {   \r\n    use(items[i]);", [B1])).toBe("exact");
  });

  it(`refuses a quote with fewer than ${String(MIN_QUOTE_CHARS)} non-whitespace characters`, () => {
    expect(checkQuote("use(items)", [block("B9", 1, ["use(items)"])])).toBe("exact");
    expect(checkQuote("use(item)", [block("B9", 1, ["use(item)"])])).toBeUndefined();
    expect(checkQuote("}", [B1])).toBeUndefined();
    expect(checkQuote("", [B1])).toBeUndefined();
  });

  it("refuses a quote spanning two blocks", () => {
    expect(checkQuote("}\nexport function other() {", [B1, B2])).toBeUndefined();
  });

  it("passes a re-indented multi-line quote as `whitespace`", () => {
    expect(checkQuote("for (let i = 0; i <= items.length; i++) {\nuse(items[i]);", [B1])).toBe("whitespace");
  });

  it("passes a tabs-for-spaces quote as `whitespace`", () => {
    expect(checkQuote("\tfor (let i = 0;\ti <= items.length; i++) {", [B1])).toBe("whitespace");
  });

  it("fails the same tokens in another order, under both comparisons", () => {
    expect(checkQuote("use(items[i]);\nfor (let i = 0; i <= items.length; i++) {", [B1])).toBeUndefined();
  });

  it("fails a fabricated line", () => {
    expect(checkQuote("for (let i = 0; i < items.length + 1; i++) {", [B1])).toBeUndefined();
  });

  it("normalizeQuote drops leading and trailing empty lines", () => {
    expect(normalizeQuote("\n\n 3| use(items[i]);\n\n")).toBe("use(items[i]);");
  });
});

describe("applyVerdicts — publication in code", () => {
  it("publishes a confirmed verdict whose quote passes, keeping the finding's id and recording the match", () => {
    const result = applyVerdicts({
      findings: [finding("F2")],
      plan: planFor({ F2: { blockIds: ["B1"] } }),
      output: { verdicts: [verdict("F2", "confirmed", "i <= items.length; i++")] },
    });
    expect(result.published.map((f) => f.id)).toEqual(["F2"]);
    expect(result.records[0]).toMatchObject({
      id: "F2",
      state: "confirmed",
      quoteVerified: true,
      quoteMatch: "exact",
      blockIds: ["B1"],
    });
  });

  it("does not publish a confirmed verdict with a fabricated quote: unverifiable, the model's verdict kept", () => {
    const result = applyVerdicts({
      findings: [finding("F1")],
      plan: planFor({ F1: { blockIds: ["B1"] } }),
      output: { verdicts: [verdict("F1", "confirmed", "items.forEach((item) => drop(item));")] },
    });
    expect(result.published).toEqual([]);
    expect(result.records[0]).toMatchObject({
      state: "unverifiable",
      reasonCode: "quote-not-in-excerpt",
      modelVerdict: "confirmed",
      quoteVerified: false,
    });
  });

  it("does not accept a quote taken from a block the finding was not given", () => {
    const result = applyVerdicts({
      findings: [finding("F1")],
      plan: planFor({ F1: { blockIds: ["B1"] } }),
      output: { verdicts: [verdict("F1", "confirmed", "return guardedCall();")] },
    });
    expect(result.records[0]).toMatchObject({ state: "unverifiable", reasonCode: "quote-not-in-excerpt" });
  });

  it("handles an empty quote per finding: one bad confirmed does not take the others down (plan-review 3rd run F1)", () => {
    const result = applyVerdicts({
      findings: [finding("F1"), finding("F2"), finding("F3")],
      plan: planFor({ F1: { blockIds: ["B1"] }, F2: { blockIds: ["B1"] }, F3: { blockIds: ["B2"] } }),
      output: {
        verdicts: [
          verdict("F1", "confirmed", ""),
          verdict("F2", "confirmed", "use(items[i]);"),
          verdict("F3", "refuted", ""),
        ],
      },
    });
    expect(result.published.map((f) => f.id)).toEqual(["F2"]);
    expect(result.records.map((r) => [r.id, r.state, r.reasonCode, r.quoteVerified])).toEqual([
      ["F1", "unverifiable", "quote-not-in-excerpt", false],
      ["F2", "confirmed", undefined, true],
      ["F3", "refuted", undefined, false],
    ]);
  });

  it("keeps refuted and unsupported with quote and reason, recording quoteVerified for refuted only", () => {
    const result = applyVerdicts({
      findings: [finding("F1"), finding("F2")],
      plan: planFor({ F1: { blockIds: ["B2"] }, F2: { blockIds: ["B1"] } }),
      output: {
        verdicts: [
          verdict("F1", "refuted", "return guardedCall();", "guarded"),
          verdict("F2", "unsupported", "", "lib"),
        ],
      },
    });
    expect(result.published).toEqual([]);
    expect(result.records[0]).toMatchObject({ state: "refuted", quoteVerified: true, reason: "guarded" });
    expect(result.records[1]).toMatchObject({ state: "unsupported", quote: "", reason: "lib" });
    expect(result.records[1]).not.toHaveProperty("quoteVerified");
  });

  it("marks a sent finding without a verdict no-verdict, and one with two verdicts duplicate-verdict", () => {
    const result = applyVerdicts({
      findings: [finding("F1"), finding("F2")],
      plan: planFor({ F1: { blockIds: ["B1"] }, F2: { blockIds: ["B1"] } }),
      output: {
        verdicts: [verdict("F2", "confirmed", "use(items[i]);"), verdict("F2", "confirmed", "use(items[i]);")],
      },
    });
    expect(result.published).toEqual([]);
    expect(result.records.map((r) => r.reasonCode)).toEqual(["no-verdict", "duplicate-verdict"]);
  });

  it("records verdicts for ids that were never sent and ignores them", () => {
    const result = applyVerdicts({
      findings: [finding("F1"), finding("F2")],
      plan: planFor({ F1: { blockIds: ["B1"] }, F2: { unverifiable: "review-budget", detail: "over" } }),
      output: {
        verdicts: [
          verdict("F1", "confirmed", "use(items[i]);"),
          verdict("F2", "confirmed", "use(items[i]);"),
          verdict("F99", "confirmed", "use(items[i]);"),
        ],
      },
    });
    expect(result.published.map((f) => f.id)).toEqual(["F1"]);
    expect(result.unknownVerdictIds).toEqual(["F2", "F99"]);
  });

  it("carries a planner's unverifiable reason and detail into the record, with no blocks", () => {
    for (const reasonCode of ["excerpt-over-limit", "review-budget", "source-refused", "no-locator"] as const) {
      const result = applyVerdicts({
        findings: [finding("F1")],
        plan: planFor({ F1: { unverifiable: reasonCode, detail: `detail of ${reasonCode}` } }),
        output: { verdicts: [] },
      });
      expect(result.records[0]).toMatchObject({
        state: "unverifiable",
        reasonCode,
        reason: `detail of ${reasonCode}`,
        blockIds: [],
      });
    }
  });

  it("no path publishes anything but a confirmed verdict with a checked quote", () => {
    const kinds = ["confirmed", "refuted", "unsupported"] as const;
    const quotes = ["", "}", "use(items[i]);", "not in any block at all"];
    for (const kind of kinds) {
      for (const quote of quotes) {
        const result = applyVerdicts({
          findings: [finding("F1")],
          plan: planFor({ F1: { blockIds: ["B1"] } }),
          output: { verdicts: [verdict("F1", kind, quote)] },
        });
        const shouldPublish = kind === "confirmed" && quote === "use(items[i]);";
        expect(result.published.length).toBe(shouldPublish ? 1 : 0);
      }
    }
  });
});

describe("parseVerifierOutput", () => {
  it("accepts a fenced object and an empty quote", () => {
    const parsed = parseVerifierOutput(
      '```json\n{"verdicts":[{"id":"F1","verdict":"unsupported","quote":"","reason":"library"}]}\n```',
    );
    expect(parsed.ok).toBe(true);
  });

  it("refuses an unknown verdict, a missing field and prose, naming the problem without quoting the text", () => {
    const bad = parseVerifierOutput('{"verdicts":[{"id":"F1","verdict":"maybe","quote":"secret","reason":"r"}]}');
    expect(bad).toMatchObject({ ok: false });
    expect(bad.ok ? "" : bad.reason).not.toContain("secret");
    expect(parseVerifierOutput('{"verdicts":[{"id":"F1","verdict":"confirmed","reason":"r"}]}').ok).toBe(false);
    expect(parseVerifierOutput("All findings look right.")).toEqual({
      ok: false,
      reason: "no complete JSON object in the response",
    });
  });
});

describe("createVerifier — the request on the wire", () => {
  const valid = JSON.stringify({
    verdicts: [{ id: "F1", verdict: "confirmed", quote: "use(items[i]);", reason: "r" }],
  });
  const input = { findings: [finding("F1")], blocks: [B1], perFinding: { F1: { blockIds: ["B1"] } } };

  it("is tool-less, reasoning-off, routed to the verifier providers only, with no response_format", async () => {
    const stub = openRouterStub([{ content: valid, finish: "stop" }]);
    const verifier = createVerifier({ apiKey: "k", fetch: stub.fetch });
    expect(verifier.model).toBe(DEFAULT_VERIFIER_MODEL);
    await verifier.verify(input);
    expect(stub.bodies).toHaveLength(1);
    const [body] = stub.bodies;
    expect(body.model).toBe(DEFAULT_VERIFIER_MODEL);
    expect(body.reasoning).toEqual({ enabled: false });
    expect(body.provider).toEqual({
      order: ["openai"],
      only: ["openai"],
      allow_fallbacks: true,
      require_parameters: true,
    });
    expect(body.usage).toEqual({ include: true });
    expect(body).not.toHaveProperty("response_format");
    expect(body).not.toHaveProperty("tools");
  });

  it("honours OPENROUTER_VERIFIER_MODEL and OPENROUTER_VERIFIER_PROVIDERS", async () => {
    vi.stubEnv("OPENROUTER_VERIFIER_MODEL", "anthropic/claude-sonnet-5");
    vi.stubEnv("OPENROUTER_VERIFIER_PROVIDERS", "anthropic");
    const stub = openRouterStub([{ content: valid, finish: "stop" }]);
    await createVerifier({ apiKey: "k", fetch: stub.fetch }).verify(input);
    expect(stub.bodies[0].model).toBe("anthropic/claude-sonnet-5");
    expect(stub.bodies[0].provider).toMatchObject({ only: ["anthropic"] });
  });

  it("sends one format repair after a strict-parse failure and returns the repaired verdicts", async () => {
    const repairs: string[] = [];
    const stub = openRouterStub([
      { content: '{"verdicts":[{"id":"F1","verdict":"yes","quote":"q","reason":"r"}]}', finish: "stop" },
      { content: valid, finish: "stop" },
    ]);
    const output = await createVerifier({
      apiKey: "k",
      fetch: stub.fetch,
      onOutputRepair: ({ reason }) => repairs.push(reason),
    }).verify(input);
    expect(output.verdicts[0].verdict).toBe("confirmed");
    expect(stub.bodies).toHaveLength(2);
    expect(repairs).toHaveLength(1);
  });

  it("throws a non-retryable VerifierOutputError after the repair also fails", async () => {
    const stub = openRouterStub([{ content: '{"verdicts": "nope"}', finish: "stop", provider: "OpenAI" }]);
    const error = await createVerifier({ apiKey: "k", fetch: stub.fetch })
      .verify(input)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(VerifierOutputError);
    expect(error).toMatchObject({ repaired: true, provider: "OpenAI" });
    expect(isRetryableError(error)).toBe(false);
  });

  it("does not repair prose with no object at all", async () => {
    const stub = openRouterStub([{ content: "Everything is confirmed.", finish: "stop" }]);
    const error = await createVerifier({ apiKey: "k", fetch: stub.fetch })
      .verify(input)
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ name: "VerifierOutputError", repaired: false });
    expect(stub.bodies).toHaveLength(1);
  });

  it("aborts with a retryable TimeoutError when the pass exceeds its budget", async () => {
    const stub = openRouterStub([{ hang: true, finish: "stop" }]);
    const error = await createVerifier({ apiKey: "k", fetch: stub.fetch })
      .verify(input, { timeoutMs: 20 })
      .catch((caught: unknown) => caught);
    expect(isRetryableError(error)).toBe(true);
  });
});
