# Finder model eval

This eval sends the production finder prompt, including the trusted `.github/ai-review-rules.md`, through `createReviewer()` to four OpenRouter models. It is paid, on-demand, and intentionally not part of CI.

## The matrix

Providers (all via `finder-provider.ts`, one provider attempt each — pipeline schema-retry deliberately bypassed so `--repeat --no-cache` exposes flakes):

| Label                     | Model                             | Round | Role                         |
| ------------------------- | --------------------------------- | ----- | ---------------------------- |
| `baseline-glm-4.6`        | `z-ai/glm-4.6`                    | 1 + 2 | production baseline (anchor) |
| `cheap-deepseek-v3.2`     | `deepseek/deepseek-v3.2`          | 1     | cheap tier                   |
| `mid-claude-haiku-4.5`    | `anthropic/claude-haiku-4.5`      | 1     | middle tier                  |
| `premium-claude-sonnet-5` | `anthropic/claude-sonnet-5`       | 1     | premium tier                 |
| `cheap-deepseek-v4-flash` | `deepseek/deepseek-v4-flash-0731` | 2     | round-2 candidate            |
| `mid-glm-5.2`             | `z-ai/glm-5.2`                    | 2     | round-2 candidate            |

**Six providers are registered, so an UNFILTERED run is 6 models × 4 cases × 3 repeats = 72 finder calls**, not the 48 of round 1. The round-2 providers were added for the second decision cycle and kept registered for reproducibility. Use `--filter-providers` to run one round at a time rather than paying for both (commands below).

`cheap-qwen3-coder-flash` and `middle-gpt-5.4-mini` were dropped after the 2026-08-10 run. Their failures were **structural, not quality**: qwen lacks `structured_outputs`, degrades to `json_object`, and Alibaba then rejects a prompt that does not contain the literal word "json"; OpenAI strict structured outputs demands every property appear in `required`, while `startLine`/`endLine` are `.optional()` for Anthropic compatibility (`src/schemas.ts`). Neither ever reached a model, and `gpt-5.4` would hit the identical wall — keeping them only added known-dead error rows to the decision snapshot.

Cases:

1. **JS loop canary** — a small diff with one indisputable defect (out-of-bounds loop condition). Checks schema validity + issue recall.
2. **React 16→19 migration** (`fixtures/react-migration.diff`) — a class-to-function migration with three planted flaws on distinct post-change lines: stale closure (line 25), lost subscription cleanup (line 24), unsafe HTML via `dangerouslySetInnerHTML` (line 39). On top of schema + recall, three per-flaw `llm-rubric` assertions report which flaw was missed by name, and a deterministic `reviewMustFail` check verifies the review carries at least one critical/major finding.
3. **Cross-hunk contract violation** (`fixtures/cross-hunk.diff`, TOOL-ENABLED) — the diff adds a `flattenForUpload` that re-encodes at a hardcoded `0.5`, while the module header and the `JPEG_QUALITY` constant that forbid exactly that live **outside** the hunk. Nothing in the hunk or its context names the constant, so the defect is unknowable without fetching the file. Beyond schema + recall + a rubric, it carries `tool_required`: the gate passes only when the model actually **received** `src/lib/engines/canvas-helpers.ts`.
4. **Defect-free mechanical rename** (`fixtures/clean-change.diff`, TOOL-ENABLED) — a local-variable rename plus an explanatory comment, with no planted flaw and no `expectedIssues`. Graded on precision alone (`no_false_alarms`): critical/major findings are manufactured, minor/nit are tolerated. It is tool-enabled on purpose, because the risk it measures is tool-INDUCED over-reporting — without a `fixtureRoot` the tool is dropped entirely and the case would measure nothing of the kind.

**Tool-enablement is per CASE, not per model**: a case's `fixtureRoot` var switches the finder from a single generation to a real `getFileContext` loop over the production `createDiffScopedSourceForDiff` (same allowlist derivation and symlink containment as CI), at the CI step budget of 5. `finder-provider.ts` reports `{toolCalls, requestedPaths, deliveredPaths, refusedPaths, steps, repairs}` plus exact OpenRouter cost as promptfoo provider **metadata**, which is where the tool assertions read it from — nothing new rides on the closed `review-result.schema.json`.

Model-graded rubrics are judged by `openrouter:google/gemini-3.1-pro-preview` — deliberately not one of the four candidates, so no model grades itself. If Google retires the preview id, fall back to `openrouter:google/gemini-2.5-pro` in `defaultTest.options.provider`.

`schema_validity` validates only the serialized output of successful provider calls; measure model schema reliability by the provider-error row count, not by this metric.

### Metrics

| Metric            | Kind          | Meaning                                                                                         |
| ----------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| `schema_validity` | gate          | Serialized output validates against `review-result.schema.json` (successful calls only)         |
| `issue_recall`    | gate          | Integer hit-count over the case's `expectedIssues`; needs ⌈2n/3⌉ hits                           |
| `review_fails`    | gate          | The review carries at least one critical/major finding (severity proxy)                         |
| `no_false_alarms` | gate          | The review manufactures NO critical/major finding on the defect-free case                       |
| `tool_required`   | gate          | The out-of-hunk file was **delivered** — an invocation the source refused does not count        |
| `tool_calls`      | observational | RAW `getFileContext` invocation count, refusals included; averages to "calls per row" per model |

`tool_calls` is the one metric whose score is a **count, not a 0–1 ratio**, so a tool-enabled row's aggregate score column is not a ratio either — read the named metric, not the row score. It gates nothing (a model may legitimately answer a small diff without fetching); `tool_required` is the adoption gate. Every tool assertion **fails closed** on missing or tool-less metadata: a broken instrument must never read as an observed zero-call run.

## Running

From `packages/code-reviewer`:

```powershell
# Free hermetic gates first — a broken grader must never cost a paid row:
npm test
node evals/recall-selfcheck.mjs

# Cheap smoke next (one provider, all cases — validates all wiring):
npm run eval -- --env-file .env --no-cache --filter-providers baseline-glm-4.6

# Round 1 only (4 models x 4 cases x 3 repeats = 48 finder calls + 48 grader calls):
npm run eval -- --env-file .env --no-cache --repeat 3 `
  --filter-providers "baseline-glm-4.6|cheap-deepseek-v3.2|mid-claude-haiku-4.5|premium-claude-sonnet-5"

# Round 2 only (anchor + the two round-2 candidates = 36 finder calls):
npm run eval -- --env-file .env --no-cache --repeat 3 `
  --filter-providers "baseline-glm-4.6|cheap-deepseek-v4-flash|mid-glm-5.2"

# EVERYTHING (6 models x 4 cases x 3 repeats = 72 finder calls + graders) — costs roughly
# $1.50-2.00, mostly sonnet-5. Prefer one of the filtered commands above.
npm run eval -- --env-file .env --no-cache --repeat 3

npm run eval:view
```

`OPENROUTER_API_KEY` must be available in the environment. The commands above load it from the package's `.env` file; omit `--env-file .env` when the variable is already exported. `--no-cache --repeat 3` is the useful comparison: it exposes structured-output flakes as well as issue recall, and every tool-enabled cell becomes a RATE over three rows rather than a single value. A provider `error` row is signal, not breakage — it counts against that model's reliability and deliberately carries no per-assertion metrics, but its telemetry still lands (a row that died after burning four tool-loop steps cost real money).

**Cost** (measured, not estimated): round 1 cost **$0.6263** in finder calls plus ~51k grader tokens; round 2 cost roughly **$0.08** (its three models are all cheap). An unfiltered six-provider run is therefore about **$1.50–2.00**, and sonnet-5 alone is ~$0.17 of every sweep. Every run is paid and manual; never wire this into CI.

In the viewer, the row-detail dialog shows **"Prompt"** (the config's raw `{{diff}}` template, never rendered — templating is disabled) and **"Actual Prompt Sent"** (what the provider actually sent). Only the latter is the real prompt; it is where you can see the tool-enabled instruction variant on tool-enabled cases.

## Exporting a decision snapshot

Run results live in promptfoo's local SQLite history (`~/.promptfoo`), which stays out of the repo. To make a comparison citable, export it into the change folder (never under `packages/`):

```powershell
npx promptfoo export eval latest -o ../../context/changes/finder-tool-loop-evals/results/<date>-tool-loop-matrix.json
```

Inspect the export before committing — prompts and full model outputs land in it verbatim.

## Scope

This suite is a decision-grade comparison of finder models: recall, per-flaw identification, failure-worthiness, precision on a clean diff, schema reliability under repeats, and — since the tool-enabled cases landed — real `getFileContext` adoption and cost. It still isolates the finder: no judge pass, no pipeline retry, no line-number or severity-calibration scoring. It informs the production finder-model decision (recorded in `context/changes/finder-tool-loop-evals/decision.md`); it does not make it. A fixture win is not by itself grounds to change what runs on every PR — the flip is gated on a live observation.

**Outcome of the first decision cycle (2026-08-12): no change. `z-ai/glm-4.6` stays the production finder.** Six models were evaluated across two matrix rounds and four were live-probed on a real PR. Only `anthropic/claude-sonnet-5` converted out-of-hunk context into a correct verdict live, at a matched-baseline **57.6×** the production cost per review, and that premium was declined. `claude-haiku-4.5` and `deepseek-v4-flash-0731` both cleared the fixture adoption bar and then failed live; `glm-5.2` never fetched in fixtures and was not probed.

Take the warning seriously before trusting this harness again: **fixture tool-adoption did not predict live tool-adoption.** `deepseek-v4-flash-0731` fetched on 6/6 tool-enabled fixture rows and 0/3 live runs. Passing the cross-hunk case here is necessary, not sufficient — a live scratch-PR probe is the actual gate.

## Gotchas

- `env.PROMPTFOO_DISABLE_TEMPLATING` is set in the config: the React fixture contains literal `{{` (JSX `dangerouslySetInnerHTML={{ ... }}`), which otherwise crashes promptfoo's Nunjucks var rendering. The finder provider builds its own prompt from vars, and grader templates use a separate engine unaffected by this switch.
- `review-result.schema.json` must stay on JSON Schema draft-07 — promptfoo's bundled Ajv doesn't load the 2020-12 meta-schema.
- `evals/fixtures/**` is excluded from BOTH `tsconfig.json` and `eslint.config.js`. Fixtures are data, not source: they must stay byte-for-byte consistent with the diff that names them, so never "fix" a fixture to appease a lint or type rule — that silently breaks the diff↔disk contract and the tool starts serving content the diff contradicts.
- A case's `fixtureRoot` is confined to `evals/fixtures/**` by `resolveFixtureRoot`, checked on the realpath of both sides. The root decides which files may be handed to an external model, so an absolute path or a `../` walk is rejected rather than resolved.
- `scoreIssueRecall` must stay OFF `defaultTest.assert`: promptfoo prepends default assertions to every case, and the recall assertion fails when `expectedIssues` is absent — as a default it would fail the clean-diff case by construction.
