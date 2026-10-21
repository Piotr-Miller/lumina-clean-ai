// TEST SUPPORT ONLY — imported by *.test.ts, never by package code.
//
// A stand-in for OpenRouter's HTTP endpoint, plugged in through
// `ReviewerOptions.fetch`. It answers with canned chat-completion bodies and
// records every request body exactly as the SDK serialized it, so a test can
// assert on the wire (owner condition 1 of `finder-serialization-outage`) rather
// than on the settings the SDK was given.

export interface StubCompletion {
  /** Assistant text. */
  content?: string;
  /** Tool calls the model "makes"; `arguments` is serialized for the wire. */
  toolCalls?: { id: string; name: string; arguments: unknown }[];
  finish: "stop" | "length" | "tool_calls";
  /** Top-level `provider` of the response; omitted when undefined. */
  provider?: string;
  /** `usage.cost`; omitted when undefined. */
  cost?: number;
  /** Answer only after this many ms (a fake clock can drive it). */
  delayMs?: number;
  /** Never answer; reject when the request's signal aborts. */
  hang?: boolean;
}

export type WireBody = Record<string, unknown> & {
  messages: { role: string; content?: unknown; tool_calls?: unknown[] }[];
};

const completionBody = (completion: StubCompletion, index: number) => ({
  id: `gen-stub-${String(index)}`,
  object: "chat.completion",
  created: 0,
  model: "z-ai/glm-4.6",
  ...(completion.provider === undefined ? {} : { provider: completion.provider }),
  choices: [
    {
      index: 0,
      finish_reason: completion.finish,
      message: {
        role: "assistant",
        content: completion.content ?? "",
        ...(completion.toolCalls === undefined
          ? {}
          : {
              tool_calls: completion.toolCalls.map((call) => ({
                id: call.id,
                type: "function",
                function: { name: call.name, arguments: JSON.stringify(call.arguments) },
              })),
            }),
      },
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
    ...(completion.cost === undefined ? {} : { cost: completion.cost }),
  },
});

const abortReason = (signal: AbortSignal | null | undefined): Error => {
  const reason: unknown = signal?.reason;
  return reason instanceof Error ? reason : new DOMException("aborted", "AbortError");
};

/**
 * `responses` is consumed in order, one per request; the last entry repeats.
 * A function instead picks the answer from the request body.
 */
export function openRouterStub(responses: StubCompletion[] | ((body: WireBody, index: number) => StubCompletion)): {
  fetch: typeof fetch;
  bodies: WireBody[];
} {
  const bodies: WireBody[] = [];
  const stubFetch = (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as WireBody;
    const index = bodies.length;
    bodies.push(body);
    const completion =
      typeof responses === "function" ? responses(body, index) : responses[Math.min(index, responses.length - 1)];
    const signal = init?.signal;
    return new Promise<Response>((resolve, reject) => {
      if (signal?.aborted === true) {
        reject(abortReason(signal));
        return;
      }
      const answer = (): void => {
        resolve(
          new Response(JSON.stringify(completionBody(completion, index)), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      };
      const timer = completion.hang === true ? undefined : setTimeout(answer, completion.delayMs ?? 0);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(abortReason(signal));
        },
        { once: true },
      );
    });
  };
  return { fetch: stubFetch, bodies };
}

/** The canned review every "valid" stub answer carries. */
export const VALID_REVIEW_TEXT = JSON.stringify({ summary: "looks fine", findings: [] });
