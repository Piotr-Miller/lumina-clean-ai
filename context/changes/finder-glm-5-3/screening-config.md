# GLM finder screening — configuration and sanitized record (2026-10-11)

The reproducible configuration and per-response metadata of the screening summarised in `glm-screening-results.md`.
The raw artifacts (promptfoo exports, configs, wrappers, wire logs, endpoint snapshot) are kept outside git, at
`~/.cache/finder-glm-5-3/screening/`, because they carry absolute local paths (owner decision 5, `change.md`). Their
sha256 is listed at the end, so a kept copy can be matched to this record.

## Placeholders

| Placeholder | Meaning                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `<repo>`    | This repository's checkout. Pass 1 ran on master at `d4239b7`.                                                                        |
| `<fv-seal>` | A clean worktree of `9c85aa2` (`finder-verifier-frozen-sonnet`'s seal), which contains the two-stage finder (`802a1e0`, `15b3f71`).   |
| `<scratch>` | A scratch directory outside the repository holding the configs, wrappers and outputs below. `git status` of `<fv-seal>` stayed empty. |

## Environment

- promptfoo `0.122.0`, Node `v24.19.0`, linux x64; `PROMPTFOO_DISABLE_TEMPLATING=true` (from the config's `env`).
- Grader: `google/gemini-3.1-pro-preview` (the config's `defaultTest` grader, unchanged).
- Key: `OPENROUTER_API_KEY` from `<repo>/packages/code-reviewer/.env`, passed with `--env-file`.
- Routing env:
  - pass 1: none, so master's global `{require_parameters: true}` applied;
  - passes A–D: `OPENROUTER_FINDER_PROVIDERS=z-ai,fireworks,together` (honoured only by the two-stage finder's
    routing, `e5be9ff` / `b3a4a38`, present in `<fv-seal>`).

## Configs

Each screening config is the repository's `evals/promptfooconfig.yaml` with two edits:

1. every relative `file://./…` and `file://../../../…` reference rewritten to an absolute one (pass 1 into `<repo>`,
   passes A–D into `<fv-seal>`);
2. the `providers:` block replaced by the one below; `defaultTest`, the grader and `tests` are unchanged.

| Config         | Source config           | Provider id                        | Label                                 | `config`                                                         |
| -------------- | ----------------------- | ---------------------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| `screen.yaml`  | master (`d4239b7`)      | `<scratch>/glm-provider.ts`        | `glm-5.1-reasoning-off`               | `model: z-ai/glm-5.1`, `reasoning: {enabled: false}`             |
| `screen.yaml`  | same                    | `<scratch>/glm-provider.ts`        | `glm-5.3-reasoning-on`                | `model: z-ai/glm-5.3` (no `reasoning` key: provider default)     |
| `screen2.yaml` | `<fv-seal>` (`9c85aa2`) | `<scratch>/glm-provider-sealed.ts` | `glm-5.3-reasoning-on-twostage`       | `model: z-ai/glm-5.3`, `reasoning: {enabled: true}`              |
| `screen3.yaml` | same                    | `<scratch>/glm-provider-long.ts`   | `glm-5.3-reasoning-low-twostage-900s` | `model: z-ai/glm-5.3`, `reasoning: {enabled: true, effort: low}` |

## Wrappers

**The fetch patch** (`glm-provider.ts`; the two other wrappers are byte-identical apart from the import and the log
path). It extends the repository's `FinderProvider` unchanged and patches `globalThis.fetch`:

- For a request to `openrouter.ai/api/v1/chat/completions` whose `body.model` is a registered provider's model and
  whose provider config has a `reasoning` key, `body.reasoning` is **replaced** by that value. On the two-stage finder
  this overrides its `extraBody: {reasoning: {enabled: false}}`. The grader's requests (another model) and pass 1's
  glm-5.3 provider (no `reasoning` key) are sent unchanged.
- Every chat response is cloned and one line is appended to the wire log: time, model, the reasoning value sent, HTTP
  status, served `provider`, `finish_reason`, tool-call count, prompt / completion / reasoning tokens, `usage.cost`
  and an error message. No message text is logged. The `label` field is empty on finder lines and `?` on grader lines (the wrapper read
  `options.label`, which promptfoo does not pass), so lines are attributed to passes by time window below.

| Wrapper                  | Imports `FinderProvider` from              | Wire log      |
| ------------------------ | ------------------------------------------ | ------------- |
| `glm-provider.ts`        | `<repo>/packages/code-reviewer/evals/…`    | `wire.jsonl`  |
| `glm-provider-sealed.ts` | `<fv-seal>/packages/code-reviewer/evals/…` | `wire2.jsonl` |
| `glm-provider-long.ts`   | `<scratch>/finder-provider-long.ts`        | `wire3.jsonl` |

**The three-line wrapper delta** — `finder-provider-long.ts` against `9c85aa2:packages/code-reviewer/evals/finder-provider.ts`:

| Line | Sealed                                                            | Long                                                          |
| ---- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| 31   | `} from "../src/index.js";`                                       | `} from "<fv-seal>/packages/code-reviewer/src/index.js";`     |
| 134  | `const EVALS_DIR = dirname(fileURLToPath(import.meta.url));`      | `const EVALS_DIR = "<fv-seal>/packages/code-reviewer/evals";` |
| 487  | `reviewer.review(unit, { timeoutMs: DEFAULT_FINDER_TIMEOUT_MS })` | `reviewer.review(unit, { timeoutMs: 900_000 })`               |

The two relocations keep the copy pointing at `<fv-seal>`'s source and fixtures; only the budget changes behaviour.

## Commands

Run from `<repo>/packages/code-reviewer` (pass 1) or `<fv-seal>/packages/code-reviewer` (passes A–D):

```bash
# pass 1
npx promptfoo eval --config <scratch>/screen.yaml --env-file .env --no-cache --repeat 1 \
  --filter-pattern "Cross-hunk" -o <scratch>/pass1.json
# pass A
OPENROUTER_FINDER_PROVIDERS=z-ai,fireworks,together npx promptfoo eval --config <scratch>/screen2.yaml \
  --env-file <repo>/packages/code-reviewer/.env --no-cache --repeat 1 \
  --filter-pattern "Cross-hunk|Defect-free" -o <scratch>/passA.json
# pass B
OPENROUTER_FINDER_PROVIDERS=z-ai,fireworks,together npx promptfoo eval --config <scratch>/screen3.yaml \
  --env-file <repo>/packages/code-reviewer/.env --no-cache --repeat 1 \
  --filter-pattern "Cross-hunk|Defect-free" -o <scratch>/passB.json
# pass C
OPENROUTER_FINDER_PROVIDERS=z-ai,fireworks,together npx promptfoo eval --config <scratch>/screen3.yaml \
  --env-file <repo>/packages/code-reviewer/.env --no-cache --repeat 2 \
  --filter-pattern "Cross-hunk|Defect-free" -o <scratch>/passC.json
# pass D
OPENROUTER_FINDER_PROVIDERS=z-ai,fireworks,together npx promptfoo eval --config <scratch>/screen3.yaml \
  --env-file <repo>/packages/code-reviewer/.env --no-cache --repeat 1 \
  --filter-pattern "small JavaScript loop|React 16|Hardening diff" -o <scratch>/passD.json
```

Default concurrency (4) in every pass.

## Promptfoo eval ids and rows

| Pass | Eval id                        | Row (provider label → case)                                  | Pass  | Latency | Cost (export) |
| ---- | ------------------------------ | ------------------------------------------------------------ | ----- | ------- | ------------- |
| 1    | `eval-tON-2026-10-11T17:34:55` | `glm-5.1-reasoning-off` → Cross-hunk                         | fail  | 6.4 s   | $0.002723     |
| 1    | same                           | `glm-5.3-reasoning-on` → Cross-hunk (error: could not parse) | error | 114.1 s | $0.046590     |
| A    | `eval-URn-2026-10-11T17:38:32` | `glm-5.3-reasoning-on-twostage` → Cross-hunk (300 s budget)  | error | 402.9 s | $0.059358     |
| A    | same                           | same → Defect-free rename                                    | pass  | 175.5 s | $0.075192     |
| B    | `eval-o65-2026-10-11T17:53:06` | `glm-5.3-reasoning-low-twostage-900s` → Cross-hunk           | pass  | 44.0 s  | $0.015400     |
| B    | same                           | same → Defect-free rename                                    | pass  | 10.6 s  | $0.007462     |
| C    | `eval-44r-2026-10-11T17:54:10` | same → Cross-hunk                                            | pass  | 33.7 s  | $0.008289     |
| C    | same                           | same → Cross-hunk                                            | pass  | 41.0 s  | $0.009431     |
| C    | same                           | same → Defect-free rename                                    | pass  | 10.9 s  | $0.003123     |
| C    | same                           | same → Defect-free rename                                    | pass  | 8.8 s   | $0.002047     |
| D    | `eval-Mxt-2026-10-11T17:55:06` | same → JS loop                                               | pass  | 4.3 s   | $0.003364     |
| D    | same                           | same → React 16→19                                           | pass  | 23.7 s  | $0.009738     |
| D    | same                           | same → Hardening, defences present                           | pass  | 14.5 s  | $0.007417     |
| D    | same                           | same → Hardening, one genuine defect                         | pass  | 6.1 s   | $0.003791     |

Export cost is the finder's cost per row; grading is not included.

## Wire logs, per response

Rows run concurrently, so a response is attributed to its pass by time window, not to a row. `—` = not reported
(error response). Reasoning tokens are `usage.completion_tokens_details.reasoning_tokens`.

| Pass | Time (UTC)   | Model                           | Reasoning sent                 | Status | Provider | Finish     | Tools | Prompt | Completion | Reasoning | Cost      |
| ---- | ------------ | ------------------------------- | ------------------------------ | ------ | -------- | ---------- | ----- | ------ | ---------- | --------- | --------- |
| 1    | 17:35:01.763 | `z-ai/glm-5.1`                  | `{enabled: false}`             | 200    | Baidu    | stop       | 0     | 1798   | 326        | 0         | $0.002723 |
| 1    | 17:35:09.744 | `google/gemini-3.1-pro-preview` | —                              | 200    | Google   | stop       | 0     | 719    | 328        | 264       | $0.005374 |
| 1    | 17:35:46.209 | `z-ai/glm-5.3`                  | none (default)                 | 200    | AkashML  | tool_calls | 1     | 1804   | 3690       | 3983      | $0.016579 |
| 1    | 17:36:49.444 | `z-ai/glm-5.3`                  | none (default)                 | 200    | AkashML  | stop       | 0     | 6156   | 6555       | 6040      | $0.030012 |
| A    | 17:40:03.085 | `z-ai/glm-5.3`                  | `{enabled: true}`              | 200    | Z.AI     | tool_calls | 1     | 1804   | 3703       | 3668      | $0.018819 |
| A    | 17:40:04.762 | `z-ai/glm-5.3`                  | `{enabled: true}`              | 429    | —        | —          | 0     | —      | —          | —         | —         |
| A    | 17:40:32.525 | `z-ai/glm-5.3`                  | `{enabled: true}`              | 200    | Z.AI     | tool_calls | 1     | 1867   | 8804       | 8773      | $0.041351 |
| A    | 17:40:48.805 | `z-ai/glm-5.3`                  | `{enabled: true}`              | 200    | Z.AI     | stop       | 0     | 10874  | 1049       | 601       | $0.017723 |
| A    | 17:41:16.804 | `z-ai/glm-5.3`                  | `{enabled: true}`              | 200    | Z.AI     | tool_calls | 1     | 1804   | 2611       | 2576      | $0.011971 |
| A    | 17:41:27.850 | `z-ai/glm-5.3`                  | `{enabled: true}`              | 200    | Z.AI     | stop       | 0     | 2706   | 2802       | 2367      | $0.016117 |
| A    | 17:43:41.932 | `z-ai/glm-5.3`                  | `{enabled: true}`              | 200    | Z.AI     | stop       | 0     | 5063   | 5346       | 4501      | $0.028568 |
| A    | 17:45:15.305 | `z-ai/glm-5.3`                  | —                              | 200    | —        | —          | —     | —      | —          | —         | —         |
| B    | 17:53:11.370 | `z-ai/glm-5.3`                  | `{enabled: true, effort: low}` | 200    | Z.AI     | tool_calls | 1     | 1804   | 46         | 11        | $0.002728 |
| B    | 17:53:14.235 | `z-ai/glm-5.3`                  | same                           | 200    | Z.AI     | stop       | 0     | 1867   | 251        | 68        | $0.003718 |
| B    | 17:53:15.371 | `z-ai/glm-5.3`                  | same                           | 200    | Z.AI     | tool_calls | 1     | 2498   | 35         | 0         | $0.001608 |
| B    | 17:53:17.108 | `z-ai/glm-5.3`                  | same                           | 200    | Z.AI     | stop       | 0     | 2203   | 150        | 0         | $0.003744 |
| B    | 17:53:37.999 | `z-ai/glm-5.3`                  | same                           | 200    | Z.AI     | stop       | 0     | 2563   | 715        | 109       | $0.003889 |
| B    | 17:53:50.410 | `z-ai/glm-5.3`                  | same                           | 200    | Z.AI     | stop       | 0     | 3327   | 572        | 0         | $0.007175 |
| B    | 17:53:59.107 | `google/gemini-3.1-pro-preview` | —                              | 200    | Google   | stop       | 0     | 981    | 570        | 503       | $0.008802 |
| C    | 17:54:15.519 | `z-ai/glm-5.3`                  | `{enabled: true, effort: low}` | 200    | Z.AI     | tool_calls | 1     | 1804   | 46         | 11        | $0.000685 |
| C    | 17:54:17.412 | `z-ai/glm-5.3`                  | same                           | 200    | Z.AI     | stop       | 0     | 1867   | 155        | 31        | $0.001180 |
| C    | 17:54:18.565 | `z-ai/glm-5.3`                  | same                           | 200    | Z.AI     | tool_calls | 1     | 1804   | 130        | 95        | $0.001055 |
| C    | 17:54:18.744 | `z-ai/glm-5.3`                  | same                           | 200    | Z.AI     | stop       | 0     | 1867   | 254        | 53        | $0.001616 |
| C    | 17:54:19.469 | `z-ai/glm-5.3`                  | same                           | 200    | Z.AI     | stop       | 0     | 2144   | 29         | 0         | $0.000867 |
| C    | 17:54:21.561 | `z-ai/glm-5.3`                  | same                           | 200    | Z.AI     | stop       | 0     | 2221   | 150        | 0         | $0.001508 |
| C    | 17:54:27.694 | `z-ai/glm-5.3`                  | same                           | 200    | Z.AI     | stop       | 0     | 2498   | 397        | 0         | $0.003201 |
| C    | 17:54:35.300 | `z-ai/glm-5.3`                  | same                           | 200    | Z.AI     | stop       | 0     | 2582   | 522        | 70        | $0.003869 |
| C    | 17:54:44.414 | `z-ai/glm-5.3`                  | same                           | 200    | Z.AI     | stop       | 0     | 3045   | 695        | 60        | $0.004403 |
| C    | 17:54:51.640 | `z-ai/glm-5.3`                  | same                           | 200    | Z.AI     | stop       | 0     | 3100   | 718        | 123       | $0.004508 |
| C    | 17:54:52.898 | `google/gemini-3.1-pro-preview` | —                              | 200    | Google   | stop       | 0     | 1038   | 349        | 284       | $0.006264 |
| C    | 17:54:55.938 | `google/gemini-3.1-pro-preview` | —                              | 200    | Google   | stop       | 0     | 1009   | 255        | 191       | $0.005078 |
| D    | 17:55:10.942 | `z-ai/glm-5.3`                  | `{enabled: true, effort: low}` | 200    | Z.AI     | stop       | 0     | 1630   | 246        | 0         | $0.003364 |
| D    | 17:55:12.782 | `z-ai/glm-5.3`                  | same                           | 200    | Z.AI     | stop       | 0     | 1825   | 281        | 0         | $0.003791 |
| D    | 17:55:17.546 | `z-ai/glm-5.3`                  | same                           | 200    | Z.AI     | stop       | 0     | 2202   | 354        | 0         | $0.004640 |
| D    | 17:55:21.163 | `z-ai/glm-5.3`                  | same                           | 200    | Z.AI     | stop       | 0     | 871    | 354        | 0         | $0.002777 |
| D    | 17:55:30.426 | `z-ai/glm-5.3`                  | same                           | 200    | Z.AI     | stop       | 0     | 2405   | 1448       | 984       | $0.009738 |
| D    | 17:55:31.099 | `google/gemini-3.1-pro-preview` | —                              | 200    | Google   | stop       | 0     | 758    | 699        | 602       | $0.009904 |
| D    | 17:55:36.344 | `google/gemini-3.1-pro-preview` | —                              | 200    | Google   | stop       | 0     | 800    | 471        | 403       | $0.007252 |
| D    | 17:55:37.010 | `google/gemini-3.1-pro-preview` | —                              | 200    | Google   | stop       | 0     | 781    | 416        | 357       | $0.006554 |
| D    | 17:55:37.032 | `google/gemini-3.1-pro-preview` | —                              | 200    | Google   | stop       | 0     | 797    | 465        | 412       | $0.007174 |

Error messages: pass A 17:40:04 — `OpenRouter could not verify available credits for this request in time. Retry
shortly.` (an OpenRouter-side 429, not a provider rate limit); pass A 17:45:15 — `TimeoutError: The finder pass
exceeded its 300000 ms budget` (logged by the wrapper; no response body).

**Per-pass totals from the wire logs:**

| Pass | Finder responses         | Finder cost | Finder reasoning tokens | Grader responses | Grader cost | Providers (finder) |
| ---- | ------------------------ | ----------- | ----------------------- | ---------------- | ----------- | ------------------ |
| 1    | 3                        | $0.049313   | 10,023                  | 1                | $0.005374   | Baidu, AkashML     |
| A    | 8 (1 × 429, 1 × timeout) | $0.134550   | 22,486                  | 0                | $0          | Z.AI               |
| B    | 6                        | $0.022862   | 188                     | 1                | $0.008802   | Z.AI               |
| C    | 10                       | $0.022891   | 443                     | 2                | $0.011342   | Z.AI               |
| D    | 5                        | $0.024311   | 984                     | 4                | $0.030884   | Z.AI               |

Pass 1 = $0.054687, A = $0.134550, B–D = $0.121092 — the $0.0547, $0.1346 and $0.1211 of `glm-screening-results.md`.
Pass A undercounts: the timed-out row's last response has no logged cost.

## Endpoint snapshot

`glm53-endpoints.json` is `GET /api/v1/models/z-ai/glm-5.3/endpoints` at the time of the screening (40 endpoints;
`reasoning.mandatory: true`, `supported_efforts: ["max", "high", "low"]`, default `max`). Its relevant content is in
`research.md` § 6.

## Raw artifacts (kept outside git)

| File                      | sha256                                                             |
| ------------------------- | ------------------------------------------------------------------ |
| `finder-provider-long.ts` | `1b4618d9c8d6af5d953fb412b8afe1e94ab11d8b127353d390b417b2a0187c3b` |
| `glm-provider.ts`         | `3efa764c9cd163eb39ca537e22e83dc1935014c5a31aa4127d675f3bc0ba5a6e` |
| `glm-provider-sealed.ts`  | `7eebbef29f5b6eea13dc7a84d31a9a138ad88fcb3c5273d7ce85e02e7a2f2852` |
| `glm-provider-long.ts`    | `c1c40f82433edd083e23e140ace0d0c6c5973640dd85f427a826531fbf293af4` |
| `glm53-endpoints.json`    | `43b41246c5113dd20bf43eea61c28d6c0420a76fccf351c649992613c85206a3` |
| `pass1.json`              | `a96c234a0d89ffd1414b4a893c1ef1b6b9343f77ee18d5bf4721bc1b1bd8506e` |
| `passA.json`              | `f5d26b38d09bfb4ce58830e6ff1e829f71a29525217f960e97583265787d9aec` |
| `passB.json`              | `61869f0b69f6158e61635edb4c79631b877793a44e99b5667e461af5f59395f8` |
| `passC.json`              | `a1b375547b0e9b65d874762eaf343efc0418b2ee215411bc016b2567f7fcc0b0` |
| `passD.json`              | `7fa0a3bcf857bc700259ff2a709e8f85724d878880da859468baa53fb2db0b15` |
| `screen.yaml`             | `110582dc2a87771d4a798a06f25285a45577ecf91f18b9507b5d42cf38719e49` |
| `screen2.yaml`            | `ebf869fab7166495b9a7c79d0b1ea781ece54b0f8d781300ace919fe2b9642c6` |
| `screen3.yaml`            | `22aec710764f7db8283c1e4d3cc1e298854c61fad41edba5a16641613d6ec210` |
| `wire.jsonl`              | `3d34b74aaa4edd0e94bd3dcbbc9e4b47598644a9f3b6f7f601c165796745292a` |
| `wire2.jsonl`             | `096d740fb5dfa790018ae05ceceb354d2cbf86d01eda255fafaed740b2978494` |
| `wire3.jsonl`             | `29b53a39ce926ad175fa58dcd86868995ec7314654a6b970202dea6abb0db5ca` |
