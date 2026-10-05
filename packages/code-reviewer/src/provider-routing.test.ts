/**
 * provider-routing.test.ts — every structured model call must land on an
 * endpoint that ENFORCES its json_schema, and the finder only on the one
 * endpoint its admission measured (change `finder-sonnet`).
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
  DEFAULT_PROVIDER_ROUTING,
  FINDER_PROVIDER_ROUTING,
  resolveFinderProviderRouting,
  resolveProviderRouting,
} from "./config.js";

/** Captures the settings each factory hands the provider. */
const captured: { settings: Record<string, unknown> | undefined }[] = [];

/**
 * When set, the factory builds the REAL OpenRouter model with this fetch, so a
 * test can read the request body that would go on the wire — the settings
 * object alone does not prove the provider serializes `provider` unchanged.
 */
let wireFetch: typeof fetch | undefined;

vi.mock("@openrouter/ai-sdk-provider", async (importActual) => {
  const actual = await importActual<typeof import("@openrouter/ai-sdk-provider")>();
  return {
    createOpenRouter:
      (providerOptions: Parameters<typeof actual.createOpenRouter>[0]) =>
      (modelId: string, settings: Record<string, unknown> | undefined) => {
        captured.push({ settings });
        return wireFetch === undefined
          ? new MockLanguageModelV3()
          : actual.createOpenRouter({ ...providerOptions, fetch: wireFetch })(modelId, settings);
      },
  };
});

const { createReviewer } = await import("./reviewer.js");
const { createJudge } = await import("./judge.js");
const { createImplReviewer } = await import("./impl-reviewer.js");

beforeEach(() => {
  captured.length = 0;
  vi.stubEnv("OPENROUTER_API_KEY", undefined);
  vi.stubEnv("OPENROUTER_MODEL", undefined);
  vi.stubEnv("OPENROUTER_REQUIRE_PARAMETERS", undefined);
  // Not read by this package — the `finder-serialization-outage` override is
  // deliberately not ported. Scrubbed so a developer's shell cannot leak in.
  vi.stubEnv("OPENROUTER_FINDER_PROVIDERS", undefined);
  wireFetch = undefined;
});

afterEach(() => {
  vi.unstubAllEnvs();
  wireFetch = undefined;
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

/** The finder's pin, spelled out: a change to it must be deliberate. */
const FINDER_PIN = { only: ["anthropic"], order: ["anthropic"], allow_fallbacks: false, require_parameters: true };

describe("resolveFinderProviderRouting", () => {
  it("pins the finder to the anthropic endpoint, no fallbacks", () => {
    expect(resolveFinderProviderRouting()).toEqual(FINDER_PIN);
    expect(FINDER_PROVIDER_ROUTING).toEqual(FINDER_PIN);
  });

  // The owner's condition: no CI setting may move or remove the pin.
  it.each([
    ["OPENROUTER_REQUIRE_PARAMETERS", "false"],
    ["OPENROUTER_FINDER_PROVIDERS", "novita"],
    ["OPENROUTER_FINDER_PROVIDERS", "deepinfra,venice"],
  ])("ignores %s=%o", (name, value) => {
    vi.stubEnv(name, value);
    expect(resolveFinderProviderRouting()).toEqual(FINDER_PIN);
  });

  it("hands out fresh lists, so a caller cannot mutate the pin", () => {
    resolveFinderProviderRouting().only.push("venice");
    expect(resolveFinderProviderRouting()).toEqual(FINDER_PIN);
  });
});

describe("each pass requests its own routing", () => {
  it("finder: the anthropic pin, not the judge's routing", () => {
    createReviewer({ apiKey: "k" });
    expect(lastProvider()).toEqual(FINDER_PIN);
  });

  it.each([
    ["OPENROUTER_REQUIRE_PARAMETERS", "false"],
    ["OPENROUTER_FINDER_PROVIDERS", "novita"],
  ])("finder: %s=%o does not reach the request settings", (name, value) => {
    vi.stubEnv(name, value);
    createReviewer({ apiKey: "k" });
    expect(lastProvider()).toEqual(FINDER_PIN);
  });

  // The settings object is only what we hand the provider; this is what it
  // sends. The fetch fails on purpose (maxRetries: 0, so one request), which
  // keeps the test about the body and needs no valid model response.
  it.each([
    ["(no override)", undefined, undefined],
    ["OPENROUTER_REQUIRE_PARAMETERS", "OPENROUTER_REQUIRE_PARAMETERS", "false"],
    ["OPENROUTER_FINDER_PROVIDERS", "OPENROUTER_FINDER_PROVIDERS", "novita"],
  ])("finder: the request body carries exactly the pin %s", async (_label, name, value) => {
    if (name !== undefined) vi.stubEnv(name, value);
    const bodies: unknown[] = [];
    wireFetch = (_input, init) => {
      // The provider sends a JSON string body; anything else fails the test loudly.
      if (typeof init?.body !== "string") throw new Error("expected a JSON string request body");
      bodies.push(JSON.parse(init.body));
      return Promise.resolve(new Response("{}", { status: 500 }));
    };
    const reviewer = createReviewer({ apiKey: "k" });
    await expect(reviewer.review({ kind: "diff", diff: "+x" })).rejects.toThrow();
    expect(bodies).toHaveLength(1);
    expect((bodies[0] as { provider?: unknown }).provider).toEqual(FINDER_PIN);
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

  it("the judge's routing is unchanged by the finder's pin", () => {
    createReviewer({ apiKey: "k" });
    createJudge({ apiKey: "k" });
    expect(lastProvider()).toEqual(DEFAULT_PROVIDER_ROUTING);
  });

  it("the escape hatch does not disable an explicit pin", () => {
    vi.stubEnv("OPENROUTER_REQUIRE_PARAMETERS", "false");
    createReviewer({ apiKey: "k", providerRouting: { order: ["venice"] } });
    expect(lastProvider()).toEqual({ order: ["venice"] });
  });
});
