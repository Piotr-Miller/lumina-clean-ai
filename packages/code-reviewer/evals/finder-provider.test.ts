import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveFixtureRoot } from "./finder-provider.js";

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
