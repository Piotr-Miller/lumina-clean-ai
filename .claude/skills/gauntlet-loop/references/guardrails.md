# Guardrails

A Gauntlet Loop runs unattended for a long time and is told to keep going. That is exactly the shape of
process that turns a small mistake into an expensive one. These are the limits it may not cross.

## 1. Money and the global cloud cap

Cloud AI ops cost real Replicate money and are protected by a **global daily cap across all users** —
`CLOUD_DAILY_CAP`, set conservatively to **3** in production (`0` is the kill-switch, reset 00:00 UTC).

- **Never point a loop at production.** Not to sample outputs, not to "check one photo".
- **Never let a round submit a real cloud job**, from a test or otherwise. The E2E suite stubs the
  Replicate pipeline for this reason.
- **Freeze cloud reference outputs once**, then loop against the frozen files (see `bars.md` §B). A loop
  that regenerates its own bar every round is both unbounded spend and a moving target.
- Model calls in the code-reviewer domain are likewise paid. State the ceiling before the first call and
  record actual spend in the workbench.

## 2. Production is not a laboratory

- No loop writes to, deploys to, or measures against the live environment. Local Supabase
  (`npx supabase start`) and a local served build only.
- Two seams are **local/CI-only and must never appear in production config**:
  - `E2E_ALLOWED_OUTPUT_ORIGIN` — widens the Edge Function's SSRF output-fetch allowlist;
  - `ALLOW_WEBHOOKLESS_PREDICTION` — lets `/start` create a prediction with no webhook, which in
    production restores the silent-stall failure the HTTPS-callback guard exists to prevent.
- Supabase migrations are **not** applied by the CI deploy. Merging deploys the Worker and the Edge
  Function only. A loop must never assume a schema change is live somewhere.

## 3. Serving the app for visual judgement

- Use a **production build on workerd**: `npm run build` then `npx wrangler dev --port 4321` (this is
  what `npm run test:e2e:serve` does). `npm run dev` is Node/Vite and is not the deploy runtime.
- **Not `astro dev`** for anything the critic will look at: the Vite SSR dep-optimizer race (issue #15)
  makes the enhance page fail with "more than one copy of React".
- Local gotcha: run `npm run build` **detached**. A foreground build has been observed to fail on the
  prerender loopback even with the sandbox off.
- One `wrangler dev` on :4321, one local Supabase, the fixture server pinned to 8787 — serialize any
  round that needs them.

## 4. Immutability and freezes

- **Never write under `context/archive/`.** If a resolved target path starts with `context/archive/`,
  abort with: "This change is archived. Open a new change with `/10x-new` instead."
- Correcting a record inside `context/archive/` does **not** correct `context/foundation/roadmap.md`.
  If a fact changed, the live tracking file is the one to fix.
- A frozen bar stays frozen for the run. Hash it, and **check the hash before spending**, not after —
  a hash written next to the thing it hashes always matches.
- `.prettierignore` is deliberately narrow: only `.claude/` + `.agents/` (manifest-hashed skill trees)
  and `context/archive/` (immutable, hash-pinned). **Do not add a subtree there to silence a formatting
  finding** — format the files instead. `npm run format:check` is repo-wide and gates the `ci` job.

## 5. Git

- **Never commit and never push.** Both are the user's, always, unless they explicitly ask this run to
  do it.
- `master` is PR-only and server-side protected (`ci`, `integration`, `e2e`, `code-reviewer` required,
  `enforce_admins: true`). Start on a branch: `git switch -c gauntlet/<slug>`.
- If the user does ask for a commit: run it in the **foreground** — a backgrounded `git commit` hangs on
  the husky pre-commit hook with no output. A commit touching `.ts` / `.tsx` / `.astro` may need up to a
  10-minute timeout, because the pre-commit ESLint cold-builds the TypeScript program.
- Skill trees: touching `.claude/skills/` or `.agents/skills/` means running `npm run check:skills` —
  public pairs are byte-identical and the allowlist lives in `scripts/check-skills-sync.ts`.

## 6. Honesty about the run

- Report gate failures with the output, not a summary of the output. If a round was skipped, say so.
- Do not report "the piece now beats the bar" on a critic verdict you did not actually receive, and do
  not average away a `BLOCKED`.
- If the loop hit the stop condition mid-improvement, say that plainly — "still improving when stopped"
  is a legitimate and useful result, and it is what the method predicts.
- Long or fiddly commands belong in a small script with a short invocation; pasted one-liners break on
  line-wrap in this environment.
- On Windows, a killed background task can leave a surviving process tree — check for a stray
  `wrangler` / `supabase` / `vitest` before starting the next round.
