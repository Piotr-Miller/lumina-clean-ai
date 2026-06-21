/**
 * Pure logic for the Bread version resolve-and-pin bump
 * (`scripts/resolve-bread-version.ts`). No fs, no network, no DOM — plain
 * objects/strings in, strings out — so every branch is unit-testable under
 * Node/Vitest. The CLI does I/O and delegates all validation + rewriting here,
 * so a malformed/incompatible/ambiguous update fails closed BEFORE any file is
 * written.
 */

import { BREAD_GAMMA, BREAD_STRENGTH } from "../../src/lib/services/bread";

export const BREAD_OWNER_MODEL = "mingcv/bread";

const HEX64 = /^[0-9a-f]{64}$/;

/** The single source-of-truth pin in `src/lib/services/bread.ts`. */
const PIN_RE = /(export const BREAD_VERSION = ")[0-9a-f]{64}(";)/;

export interface ReplicateModelResponse {
  latest_version?: { id?: string } | null;
}

export interface ReplicateVersionResponse {
  id?: string;
  openapi_schema?: unknown;
}

export interface BreadVersionRewrite {
  oldHash: string;
  changed: boolean;
  nextBreadSource: string;
  nextTestSource: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertHex(hash: string): void {
  if (!HEX64.test(hash)) {
    throw new Error(`Not a 64-hex Bread version hash: ${JSON.stringify(hash)}.`);
  }
}

/** Read + validate `latest_version.id` (64-hex). Throws on missing/malformed. */
export function extractLatestVersionId(model: ReplicateModelResponse): string {
  const id = model.latest_version?.id;
  if (typeof id !== "string" || !HEX64.test(id)) {
    throw new Error(`Replicate model response has no valid latest_version.id (got ${JSON.stringify(id)}).`);
  }
  return id;
}

function extractInputProperties(schema: unknown): Record<string, unknown> {
  // OpenAPI shape: components.schemas.Input.properties
  const components = isRecord(schema) ? schema.components : undefined;
  const schemas = isRecord(components) ? components.schemas : undefined;
  const input = isRecord(schemas) ? schemas.Input : undefined;
  const props = isRecord(input) ? input.properties : undefined;
  if (isRecord(props)) return props;
  throw new Error(
    "Bread version openapi_schema has no components.schemas.Input.properties — cannot validate the input contract.",
  );
}

function extractProperty(props: Record<string, unknown>, field: string): Record<string, unknown> {
  const property = props[field];
  if (!isRecord(property)) {
    throw new Error(`Bread version input schema is missing required field "${field}" — refusing to pin.`);
  }
  return property;
}

function assertStringUriProperty(property: Record<string, unknown>, field: string): void {
  if (property.type !== "string" || property.format !== "uri") {
    throw new Error(`Bread version input field "${field}" must be a string URI — refusing to pin (contract drift).`);
  }
}

function assertNumericPropertyAccepts(property: Record<string, unknown>, field: string, value: number): void {
  if (property.type !== "number") {
    throw new Error(`Bread version input field "${field}" must be numeric — refusing to pin (contract drift).`);
  }

  const minimum = property.minimum;
  const maximum = property.maximum;
  if ((typeof minimum === "number" && value < minimum) || (typeof maximum === "number" && value > maximum)) {
    throw new Error(
      `Bread version input field "${field}" does not accept the configured value ${String(value)} — refusing to pin.`,
    );
  }
}

/**
 * Fail closed unless the resolved version still exposes the `image` / `gamma` /
 * `strength` input fields the pipeline sends. A mechanically-bumped hash whose
 * input contract drifted must NOT be pinned.
 */
export function assertCompatibleInputSchema(version: ReplicateVersionResponse): void {
  const props = extractInputProperties(version.openapi_schema);
  assertStringUriProperty(extractProperty(props, "image"), "image");
  assertNumericPropertyAccepts(extractProperty(props, "gamma"), "gamma", BREAD_GAMMA);
  assertNumericPropertyAccepts(extractProperty(props, "strength"), "strength", BREAD_STRENGTH);
}

function replaceExactlyOnce(source: string, pattern: RegExp, replacement: string, label: string): string {
  const counter = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  const count = source.match(counter)?.length ?? 0;
  if (count !== 1) {
    throw new Error(`Expected exactly one ${label}, found ${count} — refusing to rewrite.`);
  }
  const single = new RegExp(pattern.source, pattern.flags.replace("g", ""));
  return source.replace(single, replacement);
}

/** Read the currently-pinned hash from `bread.ts` source. Throws if absent. */
export function readCurrentVersion(breadSource: string): string {
  const match = /export const BREAD_VERSION = "([0-9a-f]{64})";/.exec(breadSource);
  if (!match) {
    throw new Error("Could not find the BREAD_VERSION constant in bread.ts.");
  }
  return match[1];
}

/** Rewrite the single `BREAD_VERSION` constant. Throws unless exactly one match. */
export function rewriteBreadVersion(breadSource: string, newHash: string): string {
  assertHex(newHash);
  return replaceExactlyOnce(breadSource, PIN_RE, `$1${newHash}$2`, "BREAD_VERSION constant in bread.ts");
}

/** Rewrite the single asserted hash literal in the test. Throws unless exactly one match. */
export function rewriteTestHash(testSource: string, oldHash: string, newHash: string): string {
  assertHex(oldHash);
  assertHex(newHash);
  const assertion = new RegExp(`(expect\\(BREAD_VERSION\\)\\.toBe\\()(["'])${oldHash}\\2(\\))`);
  return replaceExactlyOnce(testSource, assertion, `$1$2${newHash}$2$3`, "pinned-hash assertion in bread.test.ts");
}

/**
 * Validate and prepare both target files before the CLI decides whether the
 * resolved version is already current. This keeps the no-op path fail-closed
 * when either target is missing or ambiguous.
 */
export function prepareBreadVersionRewrite(
  breadSource: string,
  testSource: string,
  newHash: string,
): BreadVersionRewrite {
  const oldHash = readCurrentVersion(breadSource);
  const nextBreadSource = rewriteBreadVersion(breadSource, newHash);
  const nextTestSource = rewriteTestHash(testSource, oldHash, newHash);

  return {
    oldHash,
    changed: oldHash !== newHash,
    nextBreadSource,
    nextTestSource,
  };
}
