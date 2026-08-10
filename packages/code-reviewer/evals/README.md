# Finder model eval

This eval sends the production finder prompt, including the trusted `.github/ai-review-rules.md`, through `createReviewer()` to four OpenRouter models. It is paid, on-demand, and intentionally not part of CI.

## The matrix

Providers (all via `finder-provider.ts`, one provider attempt each — pipeline schema-retry deliberately bypassed so `--repeat --no-cache` exposes flakes):

| Label                     | Model                       | Role                                                                       |
| ------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| `baseline-glm-4.6`        | `z-ai/glm-4.6`              | production baseline (anchor)                                               |
| `cheap-qwen3-coder-flash` | `qwen/qwen3-coder-flash`    | cheap tier; no `structured_outputs` support — expected schema-flake source |
| `middle-gpt-5.4-mini`     | `openai/gpt-5.4-mini`       | middle tier                                                                |
| `premium-claude-sonnet-5` | `anthropic/claude-sonnet-5` | premium tier                                                               |

Cases:

1. **JS loop canary** — a small diff with one indisputable defect (out-of-bounds loop condition). Checks schema validity + issue recall.
2. **React 16→19 migration** (`fixtures/react-migration.diff`) — a class-to-function migration with three planted flaws on distinct post-change lines: stale closure (line 25), lost subscription cleanup (line 24), unsafe HTML via `dangerouslySetInnerHTML` (line 39). On top of schema + recall, three per-flaw `llm-rubric` assertions report which flaw was missed by name, and a deterministic `reviewMustFail` check verifies the review carries at least one critical/major finding.

Model-graded rubrics are judged by `openrouter:google/gemini-3.1-pro-preview` — deliberately not one of the four candidates, so no model grades itself. If Google retires the preview id, fall back to `openrouter:google/gemini-2.5-pro` in `defaultTest.options.provider`.

## Running

From `packages/code-reviewer`:

```powershell
# Cheap smoke first (one provider, both cases — validates all wiring):
npm run eval -- --env-file .env --no-cache --filter-providers baseline-glm-4.6

# Full matrix (4 models x 2 cases x 3 repeats = 24 finder calls + 36 grader calls):
npm run eval -- --env-file .env --no-cache --repeat 3

npm run eval:view
```

`OPENROUTER_API_KEY` must be available in the environment. The commands above load it from the package's `.env` file; omit `--env-file .env` when the variable is already exported. `--no-cache --repeat 3` is the useful comparison: it exposes structured-output flakes as well as issue recall. A provider `error` row is signal, not breakage — it counts against that model's reliability and deliberately carries no per-assertion metrics.

**Cost**: a full matrix run is roughly $0.30–0.60 (finder calls + Gemini rubric grading). Every run is paid and manual; never wire this into CI.

## Exporting a decision snapshot

Run results live in promptfoo's local SQLite history (`~/.promptfoo`), which stays out of the repo. To make a comparison citable, export it into the change folder (never under `packages/`):

```powershell
npx promptfoo export eval latest -o ../../context/changes/code-review-evals/results/<date>-first-matrix.json
```

Inspect the export before committing — prompts and full model outputs land in it verbatim.

## Scope

This suite is a first decision-grade comparison of finder models: recall, per-flaw identification, failure-worthiness, and schema reliability under repeats. It still isolates the finder — no judge pass, no pipeline retry, no file-context tool — and swapping the production finder model remains a separate decision to be made from this data, not by this harness.

## Gotchas

- `env.PROMPTFOO_DISABLE_TEMPLATING` is set in the config: the React fixture contains literal `{{` (JSX `dangerouslySetInnerHTML={{ ... }}`), which otherwise crashes promptfoo's Nunjucks var rendering. The finder provider builds its own prompt from vars, and grader templates use a separate engine unaffected by this switch.
- `review-result.schema.json` must stay on JSON Schema draft-07 — promptfoo's bundled Ajv doesn't load the 2020-12 meta-schema.
