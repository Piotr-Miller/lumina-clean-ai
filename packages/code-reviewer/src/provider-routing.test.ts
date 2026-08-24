/**
 * provider-routing.test.ts — every structured model call must land on an
 * endpoint that ENFORCES its json_schema.
 *
 * Structured-output support on OpenRouter is per ENDPOINT, not per model, and
 * providers silently ignore parameters they cannot honour — so a strict-schema
 * request routed to a non-enforcing upstream returns free-form text that fails
 * the parse. Measured twice here: 4/4 campaign calibration failures with three
 * distinct malformed envelopes (Amendment A1), and a live advisory review that
 * died with 55 output tokens (run 32665515420).
 *
 * These assertions are cheap and the failure they guard is expensive and
 * intermittent — exactly the kind that "worked when I tried it" hides.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { DEFAULT_PROVIDER_ROUTING, resolveProviderRouting } from "./config.js";

/** Captures the settings each factory hands the provider. */
const captured: { settings: Record<string, unknown> | undefined }[] = [];

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: () => (_modelId: string, settings: Record<string, unknown> | undefined) => {
    captured.push({ settings });
    return new MockLanguageModelV3();
  },
}));

const { createReviewer } = await import("./reviewer.js");
const { createJudge } = await import("./judge.js");
const { createImplReviewer } = await import("./impl-reviewer.js");

beforeEach(() => {
  captured.length = 0;
  vi.stubEnv("OPENROUTER_API_KEY", undefined);
  vi.stubEnv("OPENROUTER_MODEL", undefined);
  vi.stubEnv("OPENROUTER_REQUIRE_PARAMETERS", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const lastProvider = () => captured.at(-1)?.settings?.provider;

describe("resolveProviderRouting", () => {
  it("defaults to require_parameters so a strict-schema call cannot reach a non-enforcing endpoint", () => {
    expect(resolveProviderRouting()).toEqual({ require_parameters: true });
  });

  it("is disabled ONLY by the exact string 'false'", () => {
    vi.stubEnv("OPENROUTER_REQUIRE_PARAMETERS", "false");
    expect(resolveProviderRouting()).toBeUndefined();
  });

  // A typo must not silently restore the failure mode — the safer default wins
  // for every value that is not exactly "false".
  it.each(["", "FALSE", "0", "no", "true", "yes"])("keeps the default for %o", (value) => {
    vi.stubEnv("OPENROUTER_REQUIRE_PARAMETERS", value);
    expect(resolveProviderRouting()).toEqual(DEFAULT_PROVIDER_ROUTING);
  });

  // Copying the campaign's measurement pin here would trade an occasional
  // malformed envelope for an outage whenever that one upstream is unavailable.
  it("does NOT hard-pin a single upstream: fallbacks stay available", () => {
    const routing = resolveProviderRouting();
    expect(routing).not.toHaveProperty("order");
    expect(routing).not.toHaveProperty("allow_fallbacks");
    expect(routing).not.toHaveProperty("quantizations");
  });
});

describe("every structured pass requests schema-enforcing routing", () => {
  it("finder", () => {
    createReviewer({ apiKey: "k" });
    expect(lastProvider()).toEqual({ require_parameters: true });
  });

  it("judge", () => {
    createJudge({ apiKey: "k" });
    expect(lastProvider()).toEqual({ require_parameters: true });
  });

  it("implementation review", () => {
    createImplReviewer({ apiKey: "k" });
    expect(lastProvider()).toEqual({ require_parameters: true });
  });

  it("keeps usage accounting on — routing must not displace the cost signal", () => {
    createReviewer({ apiKey: "k" });
    expect(captured.at(-1)?.settings?.usage).toEqual({ include: true });
  });
});

describe("overrides and the escape hatch", () => {
  // The campaign probe pins {order:["venice"], allow_fallbacks:false, …} to keep
  // measurements within one endpoint. That MUST still win, or the instrument
  // would silently stop measuring what it claims to.
  it("an explicit providerRouting pin beats the default (campaign tooling)", () => {
    const pin = { order: ["venice"], allow_fallbacks: false, require_parameters: true, quantizations: ["fp4"] };
    createReviewer({ apiKey: "k", providerRouting: pin });
    expect(lastProvider()).toEqual(pin);
  });

  it("the escape hatch removes the key entirely, restoring pre-feature requests", () => {
    vi.stubEnv("OPENROUTER_REQUIRE_PARAMETERS", "false");
    createReviewer({ apiKey: "k" });
    expect(captured.at(-1)?.settings).not.toHaveProperty("provider");
  });

  it("the escape hatch does not disable an explicit pin", () => {
    vi.stubEnv("OPENROUTER_REQUIRE_PARAMETERS", "false");
    createReviewer({ apiKey: "k", providerRouting: { order: ["venice"] } });
    expect(lastProvider()).toEqual({ order: ["venice"] });
  });
});
