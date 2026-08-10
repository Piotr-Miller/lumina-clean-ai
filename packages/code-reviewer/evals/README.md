# Finder model eval

This eval sends the production finder prompt, including the trusted `.github/ai-review-rules.md`, through `createReviewer()` to three OpenRouter models. It is paid, on-demand, and intentionally not part of CI.

From `packages/code-reviewer`:

```powershell
npm run eval -- --env-file .env --no-cache --repeat 3
npm run eval:view
```

`OPENROUTER_API_KEY` must be available in the environment. The command above loads it from the package's `.env` file; omit `--env-file .env` when the variable is already exported. `--no-cache --repeat 3` is the useful first comparison: it exposes structured-output flakes as well as issue recall.

This first suite isolates the finder and makes one model call per row. It does not run the judge, the pipeline retry, or a file-context tool. Add cases before treating its score as a model-selection decision.
