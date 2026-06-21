import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BREAD_GAMMA, BREAD_STRENGTH } from "@/lib/services/bread";
import { writeFileAtomically, writeFilePairAtomically } from "../scripts/lib/atomic-file-writes";
import { fetchReplicateJson } from "../scripts/lib/replicate-json";
import {
  assertCompatibleInputSchema,
  extractLatestVersionId,
  prepareBreadVersionRewrite,
  readCurrentVersion,
  rewriteBreadVersion,
  rewriteTestHash,
  type ReplicateVersionResponse,
} from "../scripts/lib/bread-version-resolver";

const HASH_A = "057a4e073829a8c50f2622206f71a8ed25331cd07a520bc264469389c7c11e54";
const HASH_B = "a".repeat(64);

const breadSource = `export const BREAD_VERSION = "${HASH_A}";\n`;
const testSource = `    expect(BREAD_VERSION).toBe("${HASH_A}");\n`;

function schemaWith(props: Record<string, unknown>): ReplicateVersionResponse {
  return { id: HASH_A, openapi_schema: { components: { schemas: { Input: { properties: props } } } } };
}
const compatibleSchema = schemaWith({
  image: { type: "string", format: "uri" },
  gamma: { type: "number", minimum: 0, maximum: 1.5 },
  strength: { type: "number", minimum: 0, maximum: 0.2 },
});

describe("extractLatestVersionId", () => {
  it("returns a valid 64-hex latest_version.id", () => {
    expect(extractLatestVersionId({ latest_version: { id: HASH_A } })).toBe(HASH_A);
  });

  it("throws on a missing id", () => {
    expect(() => extractLatestVersionId({ latest_version: null })).toThrow();
    expect(() => extractLatestVersionId({})).toThrow();
  });

  it("throws on a malformed (non-64-hex) id", () => {
    expect(() => extractLatestVersionId({ latest_version: { id: "not-a-hash" } })).toThrow();
    expect(() => extractLatestVersionId({ latest_version: { id: "ABC123" } })).toThrow();
  });
});

describe("assertCompatibleInputSchema", () => {
  it("accepts a schema exposing image/gamma/strength", () => {
    expect(() => {
      assertCompatibleInputSchema(compatibleSchema);
    }).not.toThrow();
  });

  it("fails closed when a required input field is missing", () => {
    expect(() => {
      assertCompatibleInputSchema(
        schemaWith({
          image: { type: "string", format: "uri" },
          gamma: { type: "number" },
        }),
      );
    }).toThrow(/strength/);
    expect(() => {
      assertCompatibleInputSchema(
        schemaWith({
          gamma: { type: "number" },
          strength: { type: "number" },
        }),
      );
    }).toThrow(/image/);
    expect(() => {
      assertCompatibleInputSchema(
        schemaWith({
          image: { type: "string", format: "uri" },
          strength: { type: "number" },
        }),
      );
    }).toThrow(/gamma/);
  });

  it("fails closed when an input field has an incompatible type or format", () => {
    expect(() => {
      assertCompatibleInputSchema(
        schemaWith({
          image: { type: "boolean" },
          gamma: { type: "number" },
          strength: { type: "number" },
        }),
      );
    }).toThrow(/image/);
    expect(() => {
      assertCompatibleInputSchema(
        schemaWith({
          image: { type: "string", format: "uri" },
          gamma: { type: "string" },
          strength: { type: "number" },
        }),
      );
    }).toThrow(/gamma/);
    expect(() => {
      assertCompatibleInputSchema(
        schemaWith({
          image: { type: "string", format: "uri" },
          gamma: { type: "number" },
          strength: { type: "object" },
        }),
      );
    }).toThrow(/strength/);
  });

  it("fails closed when numeric constraints reject the configured defaults", () => {
    expect(() => {
      assertCompatibleInputSchema(
        schemaWith({
          image: { type: "string", format: "uri" },
          gamma: { type: "number", maximum: BREAD_GAMMA - 0.1 },
          strength: { type: "number" },
        }),
      );
    }).toThrow(/gamma/);
    expect(() => {
      assertCompatibleInputSchema(
        schemaWith({
          image: { type: "string", format: "uri" },
          gamma: { type: "number" },
          strength: { type: "number", minimum: BREAD_STRENGTH + 0.01 },
        }),
      );
    }).toThrow(/strength/);
  });

  it("fails closed when the schema shape is unreadable", () => {
    expect(() => {
      assertCompatibleInputSchema({ id: HASH_A, openapi_schema: {} });
    }).toThrow();
    expect(() => {
      assertCompatibleInputSchema({ id: HASH_A });
    }).toThrow();
  });
});

describe("readCurrentVersion", () => {
  it("reads the pinned hash from bread.ts source", () => {
    expect(readCurrentVersion(breadSource)).toBe(HASH_A);
  });

  it("throws when the constant is absent", () => {
    expect(() => readCurrentVersion("const X = 1;\n")).toThrow();
  });
});

describe("rewriteBreadVersion", () => {
  it("rewrites exactly one BREAD_VERSION constant", () => {
    expect(rewriteBreadVersion(breadSource, HASH_B)).toBe(`export const BREAD_VERSION = "${HASH_B}";\n`);
  });

  it("throws when there is no match", () => {
    expect(() => rewriteBreadVersion("nothing here", HASH_B)).toThrow(/exactly one/);
  });

  it("throws when there are multiple matches (ambiguous)", () => {
    expect(() => rewriteBreadVersion(breadSource + breadSource, HASH_B)).toThrow(/found 2/);
  });

  it("throws on a non-hex new hash", () => {
    expect(() => rewriteBreadVersion(breadSource, "xyz")).toThrow();
  });
});

describe("rewriteTestHash", () => {
  it("rewrites exactly one asserted hash literal", () => {
    expect(rewriteTestHash(testSource, HASH_A, HASH_B)).toBe(`    expect(BREAD_VERSION).toBe("${HASH_B}");\n`);
  });

  it("throws when the old hash is not present", () => {
    expect(() => rewriteTestHash("no hash here", HASH_A, HASH_B)).toThrow(/exactly one/);
  });

  it("does not rewrite an unrelated occurrence of the old hash", () => {
    expect(() => rewriteTestHash(`const unrelated = "${HASH_A}";\n`, HASH_A, HASH_B)).toThrow(/exactly one/);
  });

  it("throws when the old hash appears more than once", () => {
    expect(() => rewriteTestHash(testSource + testSource, HASH_A, HASH_B)).toThrow(/found 2/);
  });
});

describe("prepareBreadVersionRewrite", () => {
  it("validates both targets and returns a no-op when the pin is already current", () => {
    expect(prepareBreadVersionRewrite(breadSource, testSource, HASH_A)).toEqual({
      oldHash: HASH_A,
      changed: false,
      nextBreadSource: breadSource,
      nextTestSource: testSource,
    });
  });

  it("fails closed on an ambiguous target even when the pin is already current", () => {
    expect(() => prepareBreadVersionRewrite(breadSource + breadSource, testSource, HASH_A)).toThrow(/found 2/);
    expect(() => prepareBreadVersionRewrite(breadSource, testSource + testSource, HASH_A)).toThrow(/found 2/);
  });
});

describe("writeFilePairAtomically", () => {
  it("restores the first file when replacing the second file fails", () => {
    const directory = mkdtempSync(join(tmpdir(), "bread-version-write-"));
    const breadPath = join(directory, "bread.ts");
    const testPath = join(directory, "bread.test.ts");
    writeFileSync(breadPath, breadSource, "utf8");
    writeFileSync(testPath, testSource, "utf8");
    let writeCount = 0;

    try {
      expect(() => {
        writeFilePairAtomically(
          {
            path: breadPath,
            originalContents: breadSource,
            nextContents: rewriteBreadVersion(breadSource, HASH_B),
          },
          {
            path: testPath,
            originalContents: testSource,
            nextContents: rewriteTestHash(testSource, HASH_A, HASH_B),
          },
          (path, contents) => {
            writeCount += 1;
            if (writeCount === 2) throw new Error("simulated second write failure");
            writeFileAtomically(path, contents);
          },
        );
      }).toThrow(/simulated second write failure/);

      expect(readFileSync(breadPath, "utf8")).toBe(breadSource);
      expect(readFileSync(testPath, "utf8")).toBe(testSource);
      expect(readdirSync(directory).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("fetchReplicateJson", () => {
  it("returns parsed JSON for a successful response", async () => {
    const fetchImpl = (): Promise<Response> => Promise.resolve(Response.json({ ok: true }));

    await expect(fetchReplicateJson("https://example.test/model", "secret", "model", fetchImpl, 50)).resolves.toEqual({
      ok: true,
    });
  });

  it("surfaces a bounded timeout message", async () => {
    const fetchImpl = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> =>
      await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("request timed out", "TimeoutError"));
        });
      });

    await expect(fetchReplicateJson("https://example.test/model", "secret", "model", fetchImpl, 1)).rejects.toThrow(
      "Replicate model fetch timed out after 1ms.",
    );
  });
});
