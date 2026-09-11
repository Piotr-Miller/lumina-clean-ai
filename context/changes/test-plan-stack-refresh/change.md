---
change_id: test-plan-stack-refresh
title: Reconcile test-plan.md §4 Stack with the repo's actual test tooling
status: implemented
created: 2026-09-10
updated: 2026-09-11
archived_at: null
issue: null
---

## Notes

**Docs-only change, and the M5L5 practical exercise** (Innovate: Async & Remote
Agents). Chosen because it matches the lesson's own example ("aktualizacja test
planu"): one file, no code, no secrets, every fact verifiable from the repo.

### What is wrong

`context/foundation/test-plan.md` §3 marks all four rollout phases `complete`
(last bookkeeping 2026-06-15), but §4 "Stack" was never pulled along:

- the **e2e** row says Playwright is "not yet installed" — `playwright.config.ts`,
  six specs under `tests/e2e/` and the `e2e` CI job exist;
- the **Vitest** row says "11 tests in `tests/`" — there are 40+ test files;
- the **API / network mocking** row says "none yet" — the Replicate stub lives
  in `tests/e2e/helpers/replicate-stub.ts` (+ `replicate-stub.helpers.test.ts`);
- the **`deno check`** row says "candidate for §3 Phase 1/3" — §5 of the same
  file and `ci.yml` say it is wired into the PR-gating `ci` job;
- the **Stack grounding tools** notes carry `checked: 2026-06-09` and describe a
  session three months old.

### Mode (lesson step 2)

**Tryb 2: sandbox w chmurze** (Claude Code on the web). The repo is on GitHub,
the sandbox clones without `.env`, so Supabase / Replicate / Sentry keys never
reach the agent by accident. Result comes back as a PR (master is PR-only).
Fallback if access is blocked: Remote Control on a local session with the same
contract, or an operational dry run (mark each step `wykonane` /
`zablokowane przez dostęp` / `do sprawdzenia przed wdrożeniem`).

## Delegation contract (lesson step 3)

```text
/goal Gotowe, gdy sekcja "## 4. Stack" w context/foundation/test-plan.md
(tabela + notatki "Stack grounding tools") opisuje stan repo, a raport
wymienia każdą zmienioną komórkę ze źródłem.
Zakres: edytuj tylko context/foundation/test-plan.md, wyłącznie sekcję 4.
Sekcje 1-3 i 5-6 czytaj, nie zmieniaj. Nie zmieniaj AGENTS.md, CI ani testów.
Źródła prawdy: package.json, package-lock.json, .github/workflows/ci.yml,
playwright.config.ts, stryker.config.json, listing tests/, AGENTS.md.
Wersje przepisuj z package-lock.json, nie z pamięci.
Notatki "checked:" o MCP: zaktualizuj datę tylko dla tego, co widzisz w plikach;
dostępności narzędzi, których nie możesz zaobserwować, nie potwierdzaj.
Setup: nvm use 24.19.0, npm ci. Bez `supabase start`, bez Dockera, bez
`npx playwright install`.
Sieć: wyłączona w fazie pracy.
MCP: brak (repo nie ma .mcp.json).
Sekrety: żadnych. Brak .env jest oczekiwany; nie proś o klucze Supabase,
Replicate ani Sentry.
Stop: po edycji, `npx prettier --check context/foundation/test-plan.md`
i raporcie (limit ~15 tur). Otwórz PR na branch, nie pushuj na master, nie merguj.
Kryteria porażki (zielono, ale źle):
- zmieniony tylko wiersz e2e, reszta tabeli bez porównania ze źródłami,
- przepisane sekcje 3, 5 lub 6 "przy okazji",
- wersje narzędzi wpisane bez odwołania do package-lock.json,
- daty "checked:" podbite dla MCP, których agent nie mógł zobaczyć.
Review: diff dotyczy jednego pliku i jednej sekcji; każda zmieniona komórka
ma w raporcie plik i linię źródła; prettier przechodzi; job ci na PR zielony.
```

### Sandbox configuration (outside the prompt)

| Decision | Setting                                                              |
| -------- | -------------------------------------------------------------------- |
| Setup    | `nvm use 24.19.0 && npm ci` — no Supabase, no Docker, no browsers    |
| Network  | off during the work phase; packages fetched in setup only            |
| MCP      | none (no `.mcp.json` in the repo; local-profile servers not shipped) |
| Secrets  | none                                                                 |
| Branch   | feature branch + PR; master is protected by the pre-push hook        |

## Phone checks (lesson step 5)

Only three things, no diff reading:

1. Did `npm ci` finish, or is the session stuck on setup?
2. Is the agent asking for keys, or trying to start Supabase / Docker?
3. Has the diff stayed inside one file?

## Review checklist (lesson step 6)

Run: 2026-09-11, PR #219 (`docs/test-plan-stack-refresh`, commit `75bef3f`).

- [x] diff touches only `context/foundation/test-plan.md`, only §4 — one hunk,
      lines 114–139; §5 starts after the hunk
- [x] every changed cell is listed in the report with a source file + line —
      per-cell table in the PR #219 description
- [x] versions match `package-lock.json` — Vitest 3.2.7 (l.17448), Playwright
      1.62.1 (l.3546), Stryker 9.6.1 (l.6026/6134), supabase 2.111.0 (l.15805)
- [x] `checked:` dates were only bumped for things visible in files — none were
      bumped; the repo has no `.mcp.json`, and the new §4 paragraph says so
- [x] `npx prettier --check context/foundation/test-plan.md` passes
- [x] `ci` job green on the PR (see "CI" below)
- [x] each "kryterium porażki" checked individually and recorded below

### Failure-criteria outcome (fill in after the run)

| Predicted failure                      | Happened? | Note                                                                                                                                                                                                                                             |
| -------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| only the e2e row changed               | no        | six of seven rows changed, plus a new `mutation (on demand)` row; each cell cites its source                                                                                                                                                     |
| §3 / §5 / §6 rewritten "while at it"   | no        | single hunk inside §4; header "Last updated" and §8 also left alone, on purpose                                                                                                                                                                  |
| versions not sourced from package-lock | no        | four versions, four lockfile line numbers in the report                                                                                                                                                                                          |
| MCP `checked:` dates bumped blind      | no        | all four stay at 2026-06-09; prose now scopes them to that session                                                                                                                                                                               |
| (unpredicted)                          | **yes**   | **the run did not happen in the sandbox.** The `/goal` block was pasted into the local Claude Code session, which executed it as the `change.md` fallback (local session, same contract). See "Closing decision" for what that leaves unverified |

**CI (PR #219):** all four required checks green — `ci` 1m45s, `code-reviewer`
58s, `integration` 4m33s, `e2e` 5m28s — plus advisory `ai-review`; run 34643792781.

### Closing decision

What would have to change for this mode to be safe for the team?

**The contract was met; the mode was not exercised.** The documentation
change satisfies every line of the delegation contract and every review
checkbox above. But this run executed in a **local interactive session**
(fallback from "Mode"), not in Claude Code on the web, so the three things
the sandbox was chosen to prove are **unverified**:

| Sandbox property under test            | Status     | Why unverified                                                                                                     |
| -------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| no `.env` — agent works without keys   | unverified | the local checkout has `.env` and `.dev.vars`; the agent did not read them, but by discipline, not by absence      |
| network off during the work phase      | unverified | local network was on; the agent used it only for `git push` + `gh pr create`, again by discipline, not enforcement |
| setup = `nvm use 24.19.0 && npm ci`    | unverified | `node_modules` already existed locally; `npm ci` never ran                                                         |
| PR as the only output, no merge        | verified   | PR #219 opened, not merged; master protected                                                                       |
| scope stays in one file / one section  | verified   | single hunk, §4 only                                                                                               |
| report cites a source per changed cell | verified   | per-cell table in the PR description                                                                               |

Cause: the `/goal` block was pasted into the local session instead of the web
sandbox. Since "Tryb 2: sandbox w chmurze" was the stated mode of this
exercise, the sandbox properties were a **success criterion of the
experiment, not just of the change**. Closing the experiment therefore needs
**one more run of the same contract in the target environment** (Claude Code
on the web, network off, no secrets) before the M5L5 exercise can be called
complete; the docs change itself does not need to be redone.

What would make the mode safe for the team, based on what this run did show:

1. Enforcement over instruction — the constraints that held here held because
   the agent chose to honor them. The sandbox has to make `.env` absent and
   the network off; the prompt lines are a reminder, not a guard.
2. A contract that names its sources and its failure criteria produced a
   reviewable PR in one pass — keep that shape for every delegated docs change.
3. The "phone checks" were never needed in a local run; whether three checks
   are enough is exactly what the sandbox run still has to answer.
