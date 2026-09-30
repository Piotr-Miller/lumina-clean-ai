import { NoObjectGeneratedError } from "ai";
import { describe, expect, it } from "vitest";

import { extractJsonObject, FinderOutputError, parseFinderOutput, repairParsedJudgeOutput } from "./output-repair.js";
import { isRetryableError } from "./retry.js";
import { CRITERIA } from "./scorecard.js";

const CANONICAL_FINDING = {
  file: "src/a.ts",
  startLine: 3,
  severity: "major",
  category: "correctness",
  description: "off-by-one",
  suggestion: "use <=",
};
const VALID = JSON.stringify({ summary: "one real issue", findings: [CANONICAL_FINDING] });

// The live drift the former envelope repair rescued (glm-4.6, tool-active,
// under response_format): each of its moves is now a failure, never a fix.
const DRIFTED_FINDING = {
  severity: "WARNING",
  path: "packages/code-reviewer/src/cli.ts",
  startLine: 89,
  category: "security",
  description: "model-chosen paths reach the log",
  suggestion: "sanitize them",
};

const reasonOf = (text: string): string => {
  const parsed = parseFinderOutput(text);
  if (parsed.ok) throw new Error("expected a rejection");
  return parsed.reason;
};

// One case per row of the plan's Definitions table (change
// finder-serialization-outage): only the wrapper may be removed.
describe("parseFinderOutput", () => {
  it("accepts a bare canonical object", () => {
    expect(parseFinderOutput(VALID)).toEqual({ ok: true, result: JSON.parse(VALID) as unknown });
  });

  it("accepts an object inside a markdown code fence (the wrapper)", () => {
    expect(parseFinderOutput(`\`\`\`json\n${VALID}\n\`\`\``).ok).toBe(true);
  });

  it("accepts an object with prose before and after it (the wrapper)", () => {
    expect(parseFinderOutput(`Here is the review:\n${VALID}\nHope that helps.`).ok).toBe(true);
  });

  it('accepts an explicit {"summary": …, "findings": []} as no findings', () => {
    expect(parseFinderOutput('{"summary": "nothing worth reporting", "findings": []}')).toEqual({
      ok: true,
      result: { summary: "nothing worth reporting", findings: [] },
    });
  });

  it("rejects a bare findings array instead of wrapping it", () => {
    expect(parseFinderOutput(JSON.stringify([CANONICAL_FINDING])).ok).toBe(false);
  });

  it("rejects `path` without `file` instead of renaming it", () => {
    // `file: undefined` is dropped by JSON.stringify, leaving only `path`.
    const text = JSON.stringify({
      summary: "s",
      findings: [{ ...CANONICAL_FINDING, file: undefined, path: "src/a.ts" }],
    });
    expect(reasonOf(text)).toContain("findings.0.file");
  });

  it('rejects severity "WARNING" instead of mapping it onto the enum', () => {
    const text = JSON.stringify({ summary: "s", findings: [{ ...CANONICAL_FINDING, severity: "WARNING" }] });
    expect(reasonOf(text)).toContain("findings.0.severity");
  });

  it("rejects a lowercase-able category spelled in capitals instead of lowercasing it", () => {
    const text = JSON.stringify({ summary: "s", findings: [{ ...CANONICAL_FINDING, category: "Security" }] });
    expect(parseFinderOutput(text).ok).toBe(false);
  });

  it("rejects a missing summary instead of synthesizing one", () => {
    expect(reasonOf(JSON.stringify({ findings: [CANONICAL_FINDING] }))).toContain("summary");
  });

  it("rejects the whole live drift shape at once", () => {
    expect(parseFinderOutput(JSON.stringify([DRIFTED_FINDING])).ok).toBe(false);
  });

  it('rejects prose with no object ("No issues found.") — never findings: []', () => {
    expect(parseFinderOutput("No issues found.")).toEqual({
      ok: false,
      reason: "no complete JSON object in the response",
    });
  });

  it("rejects a truncated object rather than completing it", () => {
    expect(parseFinderOutput('{"summary": "x", "findings": [{"file": "a.ts"').ok).toBe(false);
  });

  it("takes the FIRST object: an example {} before the real one is rejected and goes to repair", () => {
    const text = `The format is {} like this:\n${VALID}`;
    expect(reasonOf(text)).toMatch(/^schema: /u);
  });

  it("names a JSON syntax error by position, without quoting the rejected text", () => {
    // The Phase 0 A2 failure: an invalid escape inside a string.
    expect(reasonOf('{"summary": "use \\` here", "findings": []}')).toMatch(/^JSON\.parse: Bad escaped character/u);
    const reason = reasonOf('{"summary": tru}');
    expect(reason).toContain("(the object is not valid JSON)");
    expect(reason).not.toContain("tru}");
  });

  it("never lets a received value or a control character into the reason", () => {
    const text = JSON.stringify({ summary: "s", findings: [{ ...CANONICAL_FINDING, severity: "\u001b[31mWARNING" }] });
    const reason = reasonOf(text);
    expect(reason).not.toContain("WARNING");
    expect(reason).not.toMatch(/\p{Cc}/u);
  });

  it("caps a long reason", () => {
    const many = Array.from({ length: 50 }, () => ({ ...CANONICAL_FINDING, severity: "bad" }));
    expect(reasonOf(JSON.stringify({ summary: "s", findings: many })).length).toBeLessThanOrEqual(301);
  });
});

describe("FinderOutputError", () => {
  it("carries the fields and names provider, finish and the validation error in its message", () => {
    const error = new FinderOutputError({
      text: "prose",
      provider: "Novita",
      finishReason: "stop",
      validationError: "no complete JSON object in the response",
      repaired: false,
    });
    expect(error.name).toBe("FinderOutputError");
    expect(error).toMatchObject({ text: "prose", provider: "Novita", finishReason: "stop", repaired: false });
    expect(error.message).toBe(
      "Finder output rejected (provider=Novita, finish=stop, no format repair attempted): no complete JSON object in the response",
    );
  });

  it("is not a NoObjectGeneratedError, so the pipeline's single retry never re-rolls it", () => {
    const error = new FinderOutputError({ text: "", validationError: "v", repaired: true });
    expect(NoObjectGeneratedError.isInstance(error)).toBe(false);
    expect(isRetryableError(error)).toBe(false);
    expect("provider" in error).toBe(false);
    expect(error.message).toContain("provider=?, finish=?, after one format repair");
  });
});

const schemaFailure = (text: string): NoObjectGeneratedError =>
  new NoObjectGeneratedError({
    message: "No object generated: response did not match schema.",
    text,
    response: { id: "r", timestamp: new Date(0), modelId: "m" },
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokenDetails: { textTokens: 1, reasoningTokens: 0 },
    },
    finishReason: "stop",
  });

describe("extractJsonObject", () => {
  it("returns a bare object unchanged", () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it("unwraps a Markdown-fenced object", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("extracts an object buried in surrounding prose", () => {
    expect(extractJsonObject('Here is my scorecard:\n{"a":1}\nHope that helps!')).toBe('{"a":1}');
  });

  // A brace inside a justification string must not end the scan early — the
  // judge writes prose, and prose contains braces.
  it("ignores braces inside strings and escapes", () => {
    const text = '{"j":"use {this} and \\"that\\"","k":2}';
    expect(extractJsonObject(text)).toBe(text);
  });

  it("handles nested objects", () => {
    expect(extractJsonObject('noise {"a":{"b":{"c":1}}} tail')).toBe('{"a":{"b":{"c":1}}}');
  });

  // A truncated object must NOT come back as a partial slice: half an object
  // parses as valid-looking nonsense and would be scored as a real verdict.
  it("returns undefined for an unbalanced object rather than a partial slice", () => {
    expect(extractJsonObject('{"a":1, "b":')).toBeUndefined();
  });

  it("returns undefined when there is no object at all", () => {
    expect(extractJsonObject("I cannot produce that.")).toBeUndefined();
    expect(extractJsonObject(undefined)).toBeUndefined();
  });
});

describe("repairParsedJudgeOutput", () => {
  const validJudge = () => ({
    scores: Object.fromEntries(CRITERIA.map(({ key }) => [key, { score: "7", justification: "j", findingIds: [] }])),
    verdict: "passed",
    verdictReason: "fine",
    summary: "s",
  });

  // The SDK error needs response/usage/finishReason, not just a message.
  const noObjectError = schemaFailure;

  it("rescues a fenced scorecard", () => {
    const text = "```json\n" + JSON.stringify(validJudge()) + "\n```";
    expect(repairParsedJudgeOutput(noObjectError(text), text)?.verdict).toBe("passed");
  });

  it("rescues a scorecard wrapped in prose", () => {
    const text = `Here you go:\n${JSON.stringify(validJudge())}\nLet me know.`;
    expect(repairParsedJudgeOutput(noObjectError(text), text)?.verdict).toBe("passed");
  });

  // The strict schema stays the authority: a repair that does not validate is
  // not a repair, and must rethrow rather than invent a verdict.
  it("refuses output that is well-formed JSON but not a scorecard", () => {
    const text = '{"verdict":"passed"}';
    expect(repairParsedJudgeOutput(noObjectError(text), text)).toBeUndefined();
  });

  it("refuses a truncated scorecard", () => {
    const text = JSON.stringify(validJudge()).slice(0, 80);
    expect(repairParsedJudgeOutput(noObjectError(text), text)).toBeUndefined();
  });

  // Only NoObjectGeneratedError is a repair candidate — a timeout or provider
  // error has no text to salvage, and measurement showed aborts surface as
  // TimeoutError, never as this class.
  it("ignores non-schema failures", () => {
    const text = JSON.stringify(validJudge());
    expect(repairParsedJudgeOutput(new Error("boom"), text)).toBeUndefined();
  });
});
