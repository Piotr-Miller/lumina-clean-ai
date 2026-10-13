// Preloaded ONLY by `scripts/glm-gate.mjs run --dry-run` (NODE_OPTIONS
// --import), never by a paid step. It replaces globalThis.fetch with canned
// OpenRouter chat-completion answers, so the REAL production CLI — finder,
// judge, telemetry, review.json, comment.md — runs end to end with no key and
// no network (change `finder-glm-5-3`, plan.md Phase 3 "stubbed dry run").
// Every other URL is refused, so a dry run can never spend.
//
// The answers carry what a paid run's would: `model`, `provider`, cost and
// reasoning tokens. With GLM_GATE_DRY_RUN_FINDINGS=1 the finalization
// publishes one file-level finding on the first file of the diff (one citing
// bread-spike.ts when the diff has it), so the hand-read sheet has a row.
const CHAT = "https://openrouter.ai/api/v1/chat/completions";
const withFinding = process.env.GLM_GATE_DRY_RUN_FINDINGS === "1";
const CRITERIA = [
  "implementation_correctness",
  "idiomaticity",
  "complexity",
  "test_risk_coverage",
  "documentation",
  "security_safety",
];
let served = 0;

const textOf = (body) =>
  body.messages
    .map((message) =>
      typeof message.content === "string"
        ? message.content
        : Array.isArray(message.content)
          ? message.content.map((part) => part?.text ?? "").join("")
          : "",
    )
    .join("\n");

function finalization(body) {
  if (!withFinding) return JSON.stringify({ summary: "dry run: nothing to report", findings: [] });
  const paths = [...textOf(body).matchAll(/^\+\+\+ b\/(\S+)$/gmu)].map((match) => match[1]);
  const file = paths.find((path) => path.includes("bread-spike.ts")) ?? paths[0] ?? "unknown";
  return JSON.stringify({
    summary: "dry run: one canned finding",
    findings: [
      {
        file,
        severity: "minor",
        category: "correctness",
        description: "Dry-run finding: canned by scripts/glm-gate-dry-run-stub.mjs, not a model's output.",
        suggestion: "None — this row exists only to show the hand-read sheet's format.",
      },
    ],
  });
}

const judge = () =>
  JSON.stringify({
    scores: Object.fromEntries(CRITERIA.map((key) => [key, { score: "8", justification: "dry run", findingIds: [] }])),
    verdict: "passed",
    verdictReason: "dry run",
    summary: "dry run: canned judge answer",
  });

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url !== CHAT)
    throw new Error(`glm-gate dry run: refused a request to ${url} — the dry run never leaves the process`);
  const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}");
  served += 1;
  const isJudge = "response_format" in body;
  const content = isJudge ? judge() : "tools" in body ? "dry run: no file context needed" : finalization(body);
  return new Response(
    JSON.stringify({
      id: `gen-dry-run-${String(served)}`,
      object: "chat.completion",
      created: 0,
      model: isJudge ? body.model : "z-ai/glm-5.3",
      provider: isJudge ? "Anthropic" : "Z.AI",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
        cost: 0,
        completion_tokens_details: { reasoning_tokens: isJudge ? 0 : 16 },
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
};
