# Phase 2 — Live Verification Evidence (Progress 2.4 / 2.5)

Recorded from the live runs of 2026-08-05/06 (impl-review-phase-2 F6). Model
resolved from the local `.env` (`OPENROUTER_MODEL=z-ai/glm-4.6`) via the
documented override chain; API key redacted throughout.

## 2.4 — Schema-valid review with stable identity (general lens)

Command: `npm run dev` (reviews the simulated `getUserAge` unified diff).

Independent verification (scratch script, `reviewResultSchema.parse` re-parse
outside the SDK):

```
model: z-ai/glm-4.6, lens: general
PASS schema: reviewResultSchema.parse succeeded (4 findings)
PASS fields: every finding has file+category (schema-enforced); 4/4 carry startLine
keys: src/users.js:5 [critical/correctness], src/users.js:6 [minor/style],
      src/users.js:5 [minor/correctness], src/users.js:6 [minor/style]
```

Earlier `npm run dev` output (excerpt):

```
Summary: 1 critical bug found in getUserAge: off-by-one error causing array
overflow and undefined reads.
[critical/correctness] src/users.js:5
  Loop condition should be `< users.length` instead of `<= users.length`. ...
```

Fields required by 2.4 — `file`, `startLine`, `category` — present on every
finding; keys derive cleanly via `findingKey`.

## 2.5 — Security lens visibly shifts focus

Command: `npm run dev -- security` (same diff).

```
Summary: The added getUserAge function contains a critical out-of-bounds
access vulnerability due to an incorrect loop condition, and lacks input
validation and return value handling that could lead to undefined behavior.
[critical/security] src/users.js:5  (out-of-bounds access framing)
[critical/security] src/users.js:7  (unchecked element access)
[critical/security] src/users.js:5  (type-confusion via unvalidated params)
[critical/security] src/users.js:5  (implicit undefined return)
[critical/security] src/users.js:7  ('==' type-coercion framing)
```

Contrast with the general-lens run (`critical/correctness` + `minor/style`
mix): under the security lens every finding is re-categorized `security` and
re-framed in vulnerability vocabulary (out-of-bounds, type confusion,
coercion). The lens parameter demonstrably reaches the agent instructions.

Observed model-behavior notes (inputs for the promptfoo baseline):

- The security lens over-attributes — correctness issues return as
  `critical/security`.
- Three findings share identity `src/users.js:5` + `security`; the
  `mergeFindings` key+category dedup would collapse them to one (kept:
  highest severity, first on ties). Phase 3 tests pin this as the current
  contract.
