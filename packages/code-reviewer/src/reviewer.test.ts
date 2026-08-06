import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_MODEL } from "./config.js";
import { createReviewer } from "./reviewer.js";

// Hermetic: scrub the OpenRouter env so results don't depend on a developer's
// .env or shell (vitest does not load .env, but a shell-exported key would
// otherwise leak in).
const scrubbed = ["OPENROUTER_API_KEY", "OPENROUTER_MODEL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(scrubbed.map((k) => [k, process.env[k]]));
  for (const k of scrubbed) delete process.env[k];
});

afterEach(() => {
  for (const k of scrubbed) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("createReviewer", () => {
  it("throws an actionable error when no API key is resolvable", () => {
    expect(() => createReviewer()).toThrow(/OPENROUTER_API_KEY/);
  });

  it("constructs offline with an explicit apiKey and exposes the contract", () => {
    const reviewer = createReviewer({ apiKey: "test-key" });
    expect(typeof reviewer.review).toBe("function");
    expect(reviewer.agent).toBeDefined();
    expect(reviewer.lens).toBe("general");
    expect(reviewer.model).toBe(DEFAULT_MODEL);
  });

  it("propagates lens and model overrides", () => {
    const reviewer = createReviewer({ apiKey: "test-key", lens: "security", model: "acme/model-x" });
    expect(reviewer.lens).toBe("security");
    expect(reviewer.model).toBe("acme/model-x");
  });

  it("resolves the model from OPENROUTER_MODEL when not overridden", () => {
    process.env.OPENROUTER_MODEL = "env/model-y";
    expect(createReviewer({ apiKey: "test-key" }).model).toBe("env/model-y");
  });

  it("is a factory, not a singleton", () => {
    const a = createReviewer({ apiKey: "test-key" });
    const b = createReviewer({ apiKey: "test-key" });
    expect(a.agent).not.toBe(b.agent);
  });

  it.each([0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects maxSteps=%s (cost guard)",
    (maxSteps) => {
      expect(() => createReviewer({ apiKey: "test-key", maxSteps })).toThrow(/positive integer/);
    },
  );
});
