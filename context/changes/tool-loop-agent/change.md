---
change_id: tool-loop-agent
title: Convert code-reviewer into a modular ToolLoopAgent-based review library
status: implementing
created: 2026-08-05
updated: 2026-08-06
archived_at: null
issue: null
---

## Notes

`packages/code-reviewer/src/index.ts` currently is a single ~60-line file mixing
env validation (with `process.exit`), OpenRouter provider setup, the zod review
schema, the prompt, a `reviewCode()` helper, and a demo `main`. It works (live
smoke-tested against `anthropic/claude-sonnet-5` via OpenRouter, 2026-08-05) but
is neither modular nor importable without side effects.

This change converts it into a well-organized review **library** built on the
AI SDK's `ToolLoopAgent` (`ai@7`), so promptfoo evals can import a reviewer
factory later:

- Structured-output schemas, prompts, config, and the agent factory extracted
  into separate modules; `index.ts` becomes a pure barrel (no import-time side
  effects — promptfoo imports must not trigger env validation).
- **Single agent only** — deliberately a clean single-agent baseline to put
  under promptfoo first. No orchestration, fan-out, or verifier in this change.
- Multi-agent **seams** designed in so going multi-agent later is additive:
  - reviewer parameterized by **lens** (general default | security |
    performance | correctness | style) and **review unit** (diff | file | hunk);
  - `createReviewer` **factory** exported (not a singleton);
  - findings in a **normalized, mergeable schema** with stable file+line keys
    (`findingKey` + `mergeFindings` seam utilities);
  - the agent's one tool (`getFileContext`) backed by a **caller-injected
    source provider** — hermetic for evals, and the injection point doubles as
    an orchestration seam.

Eval environment (promptfoo config) is explicitly **not** part of this change.

## Future direction (recorded, not implemented here)

- **Deterministic code-level orchestration**: fan out one `createReviewer` per
  lens over the same review unit in plain TypeScript (no LLM router), merge
  results via `mergeFindings`/`findingKey`.
- **Optional verifier**: a second-pass agent that adversarially re-checks
  merged findings before reporting.
- **Context-tool capability boundary** (impl-review-phase-2 F1): derive an
  allowed-path set from each ReviewUnit (needs a canonical diff parser) and
  reject model-chosen paths outside it. Interim defense shipped in this
  change: range clamping + response-size caps in the tool, and a documented
  trust contract on `SourceProvider` (fs-backed providers must allowlist).
- **Promptfoo eval environment**: separate change; consumes the factory export
  from this one.
