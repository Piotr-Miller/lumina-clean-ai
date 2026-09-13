---
change_id: test-plan-stack-refresh-sandbox
title: Re-run the test-plan §4 delegation contract in the cloud sandbox
status: implemented
created: 2026-09-11
updated: 2026-09-13
archived_at: null
issue: null
---

## Notes

**The second run of the M5L5 exercise** (Innovate: Async & Remote Agents).
The first run — `context/archive/2026-09-10-test-plan-stack-refresh/` — met
every line of the delegation contract (PR #219) but executed as the
local-session fallback, so its closing decision left three sandbox properties
**unverified**: no `.env`, network off during the work phase, setup via
`nvm use 24.19.0 && npm ci`. This change exists to verify exactly those.

**The subject of the trial is the agent's behaviour in the sandbox, not the
diff.** §4 of `context/foundation/test-plan.md` is already current after
PR #219. The `/goal` block below is therefore the same one as in the archived
change, with one added paragraph: a **zero-change result is a correct
outcome** when the agent shows, source by source, that §4 already matches the
repo. Nothing was reverted to give the agent work — see the archived closing
decision for why that would change what is being measured.

Deliberately **out of scope**, as in the first run: the header
"Last updated: 2026-06-15" and §8 Freshness Ledger. Refreshing them is a
separate task whose date must reflect the actual verification scope.

### Mode (lesson step 2)

**Tryb 2: sandbox w chmurze** (Claude Code on the web), this time for real.
The repo clones from GitHub without `.env` / `.dev.vars`; network is off in
the work phase; no MCP; no secrets. Result comes back as a PR (master is
PR-only). If sandbox access is blocked, do **not** fall back locally again —
that outcome is already recorded; instead stop and mark this change
`zablokowane przez dostęp`.

## Delegation contract (lesson step 3)

The original block, unchanged, plus the final "Wynik zerowy" paragraph:

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
Wynik zerowy: jeśli po porównaniu ze źródłami sekcja 4 jest już aktualna,
brak zmian jest poprawnym wynikiem. Wtedy zamiast PR z diffem zwróć raport:
dla każdego wiersza tabeli plik i linię źródła, które go potwierdzają;
ograniczenia środowiska, na które natrafiłeś (brak .env, brak sieci, brak
narzędzi); ocenę każdego kryterium porażki z osobna. Nie wprowadzaj zmian
kosmetycznych, żeby mieć diff.
```

### Sandbox configuration (outside the prompt)

| Decision | Setting                                                              |
| -------- | -------------------------------------------------------------------- |
| Setup    | `nvm use 24.19.0 && npm ci` — no Supabase, no Docker, no browsers    |
| Network  | **`Trusted` for the whole session** — see the deviation note below   |
| MCP      | none (no `.mcp.json` in the repo; local-profile servers not shipped) |
| Secrets  | none                                                                 |
| Branch   | from `master` at or after `4d8762c`; feature branch + PR, or report  |

**Deviation from the contract (decided 2026-09-12, before the run).** The
`/goal` block says "Sieć: wyłączona w fazie pracy", but Claude Code on the web
sets network access **per environment**, not per phase (`None` / `Trusted` /
`Custom` / `Full`), and `npm ci` in setup needs the npm registry. The choice
was therefore binary: `Trusted` for the whole session, or `None` with no
`npm ci` at all (and then `npx prettier --check` cannot run). Decision:
**`Trusted`** — the run keeps the setup the contract asks for, and the
contract line about the work phase is enforced by the prompt ("no fetch /
install / `supabase start`") and checked in review, not by the environment.
The review checklist item "network off in the work phase" is read accordingly:
_the agent did not use the network in the work phase_, which the session log
shows, rather than _the environment forbade it_. The `/goal` block itself is
left unchanged so that both runs are measured against the same text.

## Phone checks (lesson step 5)

Only three things, no diff reading:

1. Did `npm ci` finish, or is the session stuck on setup?
2. Is the agent asking for keys, or trying to start Supabase / Docker?
3. Has the diff stayed inside one file (or is there no diff at all)?

## Run record (2026-09-13)

| Item           | Value                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------ |
| Surface        | Claude Code on the web, environment `lumina-m5l5-sandbox`                                  |
| Network        | `Trusted` (see the deviation note above)                                                   |
| Model / effort | Opus 5 / High, permission mode Accept edits                                                |
| Base           | `master` at `15f4595`; §4 sources unchanged since `0b290cb` (PR #219)                      |
| Setup attempts | 2 — the first failed before the agent started, the second passed                           |
| Result         | zero-diff report; no PR                                                                    |
| Session branch | `claude/exciting-ride-w1ngn4`, no commits, never pushed (`git ls-remote` empty 2026-09-13) |

**Setup attempt 1 failed.** The setup script ran `nvm install 24.19.0`
successfully, then `npm ci` stopped on a missing `package-lock.json`. The
checklist in the UI showed "Cloned repository" done _before_ "Running setup
script", so the repo existed; the script simply does not start in it, and
`$CLAUDE_PROJECT_DIR` is not provided to setup scripts (the docs promise it
only in SessionStart hooks). The docs name no clone path. A setup script is
environment-level, not repo-aware. The failure cost one session start and no
agent turns.

**Setup attempt 2 passed.** The replacement script finds the repo by an
`.nvmrc` containing `24.19.0` next to a `package-lock.json`, runs `npm ci`
there, and skips `npm ci` rather than fail when it finds nothing. `npm ci`
ran in setup (its deprecation warnings are in the setup log). The script's
two `setup:` diagnostic lines (cwd, repo path) were **not captured**, so the
clone path is still unrecorded.

**Independent baseline.** Before the agent reported, §4 was checked locally
against the same sources: every row matched, and none of the source files
changed between `08606e0` and `15f4595`. The expected correct outcome was
therefore the zero result. After the report, 15 of the agent's `file:line`
citations were spot-checked (lockfile entries for Vitest, Playwright,
Supabase, both Stryker packages, the `msw` peer entry; `ci.yml` lines 311,
355, 434; `index.ts` lines 67 and 699; the code-reviewer lockfile; §7) and
all pointed at what the report said they did.

## Review checklist (lesson step 6)

Sandbox properties — the point of this run:

- [x] session ran in Claude Code on the web, not locally
- [x] `npm ci` completed in setup — on the second attempt; see the run record
- [x] no `.env` / `.dev.vars` present; agent did not ask for keys — fresh
      clone, so absent by construction, not by discipline
- [x] no fetch / install / `supabase start` in the work phase — read per the
      deviation note: the agent did not use the network; the environment
      (`Trusted`) did not forbid it. Evidence is the agent's report plus the
      phone checks; the full tool log was not reviewed line by line
- [x] agent's report names the environment limits it actually hit — nvm not
      loaded in the non-interactive shell (default Node 22.22.2, fixed by
      sourcing `nvm.sh`); `npm ci` skipped because `node_modules` was already
      complete and it treated the network as off

Contract properties — same as the first run:

- [x] diff (if any) touches only `context/foundation/test-plan.md`, only §4 —
      no diff at all
- [x] every row of §4 has a source file + line in the report, changed or not —
      row 7 cites §7 of the same document, the only source that exists for it
- [x] versions match `package-lock.json` — all four, with lockfile line numbers
- [x] `checked:` dates were not bumped for anything not visible in files
- [x] `npx prettier --check context/foundation/test-plan.md` passes — in the
      sandbox under Node 24.19.0, and locally on 2026-09-13
- [ ] ~~`ci` job green on the PR~~ — not applicable, no PR (zero result)
- [x] each "kryterium porażki" assessed individually by the agent AND checked below

### Failure-criteria outcome

| Predicted failure                               | Happened? | Note                                                                                                                                                                                |
| ----------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| only the e2e row changed                        | no        | nothing changed; all 7 rows and the grounding notes compared, each with a citation                                                                                                  |
| §3 / §5 / §6 rewritten "while at it"            | no        | `git status --porcelain` empty in the session                                                                                                                                       |
| versions not sourced from package-lock          | no        | every version cited with a lockfile line; `package.json` treated as ranges only                                                                                                     |
| MCP `checked:` dates bumped blind               | no        | all four left at 2026-06-09; the agent said it could not observe MCP                                                                                                                |
| cosmetic diff manufactured to have a diff       | no        | the agent found one real wording nuance (below) and **proposed** it instead of applying it                                                                                          |
| agent asked for keys or tried the network       | no        | —                                                                                                                                                                                   |
| (unpredicted) setup script not repo-aware       | yes       | attempt 1 failed; a local-style `cd` + `npm ci` does not port to the cloud as is                                                                                                    |
| (unpredicted) Node 24 absent in sandbox         | yes       | sandbox ships Node 20/21/22 and no nvm; nvm had to come from setup, and even then it is not on PATH in the agent's non-interactive shell                                            |
| (unpredicted) agent skipped in-session `npm ci` | yes       | correct call — setup had already run it — but it shows the prompt's "Setup:" line is ambiguous: it reads as an instruction to the agent, while the environment already did the work |

**Out-of-scope finding, not applied.** Row 3 says "MSW is not in the
lockfile". MSW is not installed, but the string `msw` does appear in
`package-lock.json` as an optional peer of `@vitest/mocker`, so a reader who
greps for it will think the note is stale. Suggested wording: "MSW is not
installed — it appears in the lockfile only as an optional peer of
`@vitest/mocker`". This is a wording fix, not a state change, and it belongs
in a separate one-line change, not in this trial's result.

### Closing decision

Together with the archived first run, this answers the exercise's question:
what would have to change for this mode to be safe for the team?

**The sandbox run met the contract and verified two of the three properties
the first run left open.** The agent returned a correct zero-diff report,
matched an independent baseline, cited a source for every row, left MCP
dates alone, and declined to manufacture a diff while still surfacing a real
finding for a human to decide.

| Sandbox property under test          | First run (local) | This run (web)                                                         |
| ------------------------------------ | ----------------- | ---------------------------------------------------------------------- |
| no `.env` — agent works without keys | unverified        | **verified** — fresh clone, absent by construction                     |
| setup = `nvm use 24.19.0 && npm ci`  | unverified        | **verified** — on the second attempt, with a cloud-specific script     |
| network off during the work phase    | unverified        | **still by discipline** — `Trusted` for the whole session, by decision |

What would make the mode safe for the team:

1. **Enforce the network, do not ask for it.** `Trusted` makes the "network
   off" line a request again. The environment's `Custom` level without the
   default list could narrow egress to what setup needs
   (`registry.npmjs.org`, `raw.githubusercontent.com`, `nodejs.org`). It still
   applies to the whole session, not to a phase, and GitHub traffic bypasses
   the allowlist. Untested here.
2. **Treat the setup script as code for a different machine.** It is
   environment-level and not repo-aware, the sandbox has no Node 24, and a
   first attempt that works locally fails in the cloud. Test it once before
   a delegated run. Committing a SessionStart hook in `.claude/settings.json`,
   which gets `$CLAUDE_PROJECT_DIR`, would make the install repo-aware; that
   is a repo change and was out of scope here.
3. **Separate environment setup from agent instructions.** The `/goal`
   block's "Setup:" line duplicated what the environment already did, and the
   agent had to reason its way out of running `npm ci` a second time. The
   environment config owns setup; the prompt should state only what to check.
4. **Keep the contract shape.** Named sources, named failure criteria and an
   explicit zero-result clause produced a correct, reviewable answer in both
   runs. The zero-result clause is what stopped a cosmetic diff here.
5. **Three phone checks were enough.** The only real event, the setup
   failure, surfaced in the UI before the agent started and was covered by
   the first check.

With this run the M5L5 exercise is complete. The MSW wording fix above and
the header "Last updated" / §8 refresh remain separate tasks.
