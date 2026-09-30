# Review follow-ups — finder-serialization-outage

Deferred items from phase reviews and acceptance, to fold into a later phase.

## From Phase 1 manual acceptance (2026-09-29)

- [x] **T1 — the rejected-output line always prints `provider=?` for `NoObjectGeneratedError`** (fold into Phase 2).
      Seen in the 1.4 acceptance run (owner's ai-toolkit scratchpad, `p1-cli/run.log`). `formatRejectedOutputLine`
      (`packages/code-reviewer/src/cli.ts`) reads `provider` off the error, and the SDK's `NoObjectGeneratedError`
      has no such field, so the one line meant to attribute a failure omits the endpoint — the step lines above it
      carry `provider=`, but a reader has to correlate them by hand. Two candidate sources, owner's suggestion:
      (a) the **last observed step**: `describeFinderStep` already yields `provider` for it, so the pipeline/CLI
      can remember the last step's provider and pass it into the failure line; (b) **`error.response`**: its type
      is `Omit<LanguageModelResponseMetadata, "messages">`, which declares an optional `body` (`ai/dist/index.d.ts`,
      `LanguageModelResponseMetadata`); OpenRouter's chat-completion body carries a top-level `provider`, but
      whether the SDK populates `body` on this error path is **unverified** — check before relying on it, and
      narrow it with the `asStepProvider` discipline (absent, never `""`/`"unknown"`). Scope note: from Phase 2
      on, the finder throws `FinderOutputError` with its own `provider` field, so after Phase 2 this gap remains
      for the judge's `NoObjectGeneratedError` (and for any label that must not claim a pass it cannot see — keep
      the error-class label). Tests: a `NoObjectGeneratedError` with a provider-bearing source → `provider=<slug>`;
      a malformed or absent source → still `provider=?`.
      **Resolved in Phase 2 (2026-09-30).** Source (b) checked first and ruled out: `NoObjectGeneratedError.response`
      is the last step's response, and ai@7.0.52 sets its `body` only under `include.responseBody` (default `false`;
      `ai/dist/index.js:5256`, `:5896`), which no pass enables. So source (a): the CLI remembers the provider of the
      last observed request (`onFinderStep`, plus a new silent `PipelineInput.onJudgeStep`) and
      `formatRejectedOutputLine(error, fallbackProvider)` uses it only when the error carries none; a request that
      reported no provider resets it, so an older slug is never inherited. The finder's own `FinderOutputError`
      carries the provider of the request whose text it rejects. Tests: `cli.test.ts` (fallback present → slug,
      own provider wins, control characters escaped; end-to-end via `onJudgeStep` with a provider and with absent
      metadata → `provider=?`) and `pipeline.test.ts` (`onJudgeStep` narrows a malformed slug to absent).
