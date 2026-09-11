---
change_id: test-plan-stack-refresh
title: Reconcile test-plan.md §4 Stack with the repo's actual test tooling
status: new
created: 2026-09-10
updated: 2026-09-10
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

- [ ] diff touches only `context/foundation/test-plan.md`, only §4
- [ ] every changed cell is listed in the report with a source file + line
- [ ] versions match `package-lock.json`
- [ ] `checked:` dates were only bumped for things visible in files
- [ ] `npx prettier --check context/foundation/test-plan.md` passes
- [ ] `ci` job green on the PR
- [ ] each "kryterium porażki" checked individually and recorded below

### Failure-criteria outcome (fill in after the run)

| Predicted failure                      | Happened? | Note |
| -------------------------------------- | --------- | ---- |
| only the e2e row changed               |           |      |
| §3 / §5 / §6 rewritten "while at it"   |           |      |
| versions not sourced from package-lock |           |      |
| MCP `checked:` dates bumped blind      |           |      |
| (unpredicted)                          |           |      |

### Closing decision

What would have to change for this mode to be safe for the team?

_TBD after the run._
