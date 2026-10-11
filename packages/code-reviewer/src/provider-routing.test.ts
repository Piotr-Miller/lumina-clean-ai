/**
 * provider-routing.test.ts — every structured model call must land on an
 * endpoint that ENFORCES its json_schema, and the finder (which sends none
 * since `finder-serialization-outage`) only on its own measured endpoints.
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
import {
  DEFAULT_FINDER_PROVIDERS,
  DEFAULT_PROVIDER_ROUTING,
  resolveFinderProviderRouting,
  resolveProviderRouting,
} from "./config.js";

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
  vi.stubEnv("OPENROUTER_FINDER_PROVIDERS", undefined);
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

/** The finder's default routing, spelled out: a change to it must be deliberate. */
const FINDER_DEFAULT = { order: ["novita"], only: ["novita"], allow_fallbacks: true, require_parameters: true };

describe("resolveFinderProviderRouting", () => {
  it("defaults to the provisional endpoint list, fallbacks only within it", () => {
    expect(resolveFinderProviderRouting()).toEqual(FINDER_DEFAULT);
  });

  it("OPENROUTER_FINDER_PROVIDERS pins the gate's endpoint", () => {
    vi.stubEnv("OPENROUTER_FINDER_PROVIDERS", "deepinfra");
    expect(resolveFinderProviderRouting()).toEqual({
      order: ["deepinfra"],
      only: ["deepinfra"],
      allow_fallbacks: true,
      require_parameters: true,
    });
  });

  it("a list keeps its order, trims whitespace and drops duplicates", () => {
    vi.stubEnv("OPENROUTER_FINDER_PROVIDERS", " z-ai , novita,z-ai, deepinfra/fp8 ");
    const routing = resolveFinderProviderRouting();
    expect(routing.order).toEqual(["z-ai", "novita", "deepinfra/fp8"]);
    expect(routing.only).toEqual(routing.order);
  });

  // Blank is "not set", not "route anywhere": the default must win.
  it.each([undefined, "", " , ", ",", "   "])("an unset or blank value %o uses the default, silently", (value) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv("OPENROUTER_FINDER_PROVIDERS", value);
    expect(resolveFinderProviderRouting()).toEqual(FINDER_DEFAULT);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  // A malformed entry must never yield unfiltered routing or a partial list, and a
  // gate run that meant to pin an endpoint must not measure the default in silence.
  it.each(["Novita", "deepinfra,Bad Slug", "*", "novita;venice", "-z-ai", "novita,,deepinfra", "novita,", " , novita"])(
    "a malformed value %o uses the default and says so",
    (value) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      vi.stubEnv("OPENROUTER_FINDER_PROVIDERS", value);
      expect(resolveFinderProviderRouting()).toEqual(FINDER_DEFAULT);
      expect(warn).toHaveBeenCalledTimes(1);
      const message = String(warn.mock.calls[0]?.[0]);
      expect(message).toContain("OPENROUTER_FINDER_PROVIDERS is malformed");
      expect(message).toContain("NOT to the endpoints you listed");
      warn.mockRestore();
    },
  );

  // Impl-review F1 (p3): an empty entry in a populated list is a typo, and
  // dropping it would route a gate run to a shorter list than the one meant.
  it.each(["novita,,deepinfra", "novita,"])('an empty entry in %o is named as "" in the warning', (value) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv("OPENROUTER_FINDER_PROVIDERS", value);
    expect(resolveFinderProviderRouting()).toEqual(FINDER_DEFAULT);
    expect(String(warn.mock.calls[0]?.[0])).toContain('(""');
    warn.mockRestore();
  });

  // Amendment A3: require_parameters is what refuses an endpoint that cannot
  // honour `reasoning: {enabled: false}`, so the judge's escape hatch must not reach it.
  it("OPENROUTER_REQUIRE_PARAMETERS=false leaves the finder's require_parameters in place", () => {
    vi.stubEnv("OPENROUTER_REQUIRE_PARAMETERS", "false");
    expect(resolveFinderProviderRouting()).toEqual(FINDER_DEFAULT);
  });

  it("hands out a fresh list each time, so a caller cannot mutate the default", () => {
    resolveFinderProviderRouting().order.push("venice");
    expect(DEFAULT_FINDER_PROVIDERS).toEqual(["novita"]);
    expect(resolveFinderProviderRouting()).toEqual(FINDER_DEFAULT);
  });
});

describe("each pass requests its own routing", () => {
  it("finder: its own endpoint list, not the judge's", () => {
    createReviewer({ apiKey: "k" });
    expect(lastProvider()).toEqual(FINDER_DEFAULT);
  });

  it("finder: OPENROUTER_FINDER_PROVIDERS reaches the request settings", () => {
    vi.stubEnv("OPENROUTER_FINDER_PROVIDERS", "deepinfra");
    createReviewer({ apiKey: "k" });
    expect(lastProvider()).toEqual(expect.objectContaining({ only: ["deepinfra"], order: ["deepinfra"] }));
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

  it("the escape hatch removes the key entirely from the judge and the implementation review", () => {
    vi.stubEnv("OPENROUTER_REQUIRE_PARAMETERS", "false");
    createJudge({ apiKey: "k" });
    expect(captured.at(-1)?.settings).not.toHaveProperty("provider");
    createImplReviewer({ apiKey: "k" });
    expect(captured.at(-1)?.settings).not.toHaveProperty("provider");
  });

  it("the escape hatch does not reach the finder (Amendment A3)", () => {
    vi.stubEnv("OPENROUTER_REQUIRE_PARAMETERS", "false");
    createReviewer({ apiKey: "k" });
    expect(lastProvider()).toEqual(FINDER_DEFAULT);
  });

  it("an explicit pin also beats OPENROUTER_FINDER_PROVIDERS", () => {
    vi.stubEnv("OPENROUTER_FINDER_PROVIDERS", "deepinfra");
    createReviewer({ apiKey: "k", providerRouting: { order: ["venice"] } });
    expect(lastProvider()).toEqual({ order: ["venice"] });
  });

  it("the escape hatch does not disable an explicit pin", () => {
    vi.stubEnv("OPENROUTER_REQUIRE_PARAMETERS", "false");
    createReviewer({ apiKey: "k", providerRouting: { order: ["venice"] } });
    expect(lastProvider()).toEqual({ order: ["venice"] });
  });
});
