---
bootstrapped_at: 2026-05-24T19:01:13Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: lumina-clean-ai
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

Verbatim from `context/foundation/tech-stack.md`:

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: lumina-clean-ai
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: true
  has_ai: true
  has_background_jobs: true
```

### Why this stack

A solo after-hours build with a 3-week MVP budget, gated email+password auth,
real-time push of async results, private file storage with 24-hour retention,
and a Cloud AI image-processing step. 10x Astro Starter is the recommended
default for `(web, js)` and bundles every load-bearing capability in one
opinionated piece: Supabase covers auth, Postgres, private storage with RLS,
and the realtime channel that satisfies FR-010 without bolting on a delivery
subsystem; Astro + React + TypeScript + Tailwind handle the upload UI, the
before/after slider, and the client-side Local engine; Cloudflare Pages is the
cheapest path to first deploy. All four agent-friendly gates pass and
scaffolding confidence is first-class. One scaffolding-time watch-item: the
edge runtime constrains long-running tasks, so the Cloud AI denoising job will
need to run on an external worker (Cloudflare Worker, Fly machine, or
provider-hosted inference) with Supabase Realtime as the push channel back to
the page. CI lands on GitHub Actions with auto-deploy on merge — what the
starter ships with.

## Pre-scaffold verification

| Signal       | Value                                                          | Severity | Notes                                                                |
| ------------ | -------------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| npm package  | not run                                                        | n/a      | `cmd_template` starts with `git clone`; no npm CLI to query           |
| GitHub repo  | przeprogramowani/10x-astro-starter last pushed 2026-05-17      | fresh    | from card.docs_url; 7 days before bootstrap (< 3-month freshness bar) |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 22 top-level paths (3 of which were merged into the pre-existing empty `.vscode/` directory)
**Conflicts (.scaffold siblings)**: CLAUDE.md.scaffold
**.gitignore handling**: moved silently (cwd had no `.gitignore`; nothing to append-merge against)
**.bootstrap-scaffold cleanup**: deleted (after `.git/` strip and move-up)

Move detail:

- `CLAUDE.md` — existing wins; scaffold copy landed as `CLAUDE.md.scaffold` (3218 B) for the user to diff against the existing CLAUDE.md (10615 B).
- `.vscode/extensions.json`, `.vscode/launch.json`, `.vscode/settings.json` — moved into pre-existing empty `.vscode/` (no conflicts).
- `.env.example`, `.github/`, `.gitignore`, `.husky/`, `.nvmrc`, `.prettierrc.json`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `node_modules/`, `package.json`, `package-lock.json`, `public/`, `README.md`, `src/`, `supabase/`, `tsconfig.json`, `wrangler.jsonc` — moved silently (no matching path in cwd).
- `context/` — scaffold shipped no `context/` directory; cwd `context/` (PRD, foundation, this verification folder) preserved untouched.

Upstream `.git/` was deleted from the temp directory before move-up so the starter's history does not leak into the project.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/2/0 direct of total 0/1/9/0 (the 2 direct moderates are `@astrojs/check` and `wrangler`; the 1 HIGH is transitive)

#### CRITICAL findings

None.

#### HIGH findings

- **devalue** 5.6.3–5.8.0 — *transitive*. Advisory: GHSA-77vg-94rm-hx3p — "Svelte devalue: DoS via sparse array deserialization" (CVSS 7.5, CWE-770). Fix available; reachable via npm's suggested resolution chain (`npm audit fix` should pull it in).

#### MODERATE findings

- **@astrojs/check** ≥0.9.3 — *direct*. Via `@astrojs/language-server`. `fixAvailable.version: 0.9.2` (semver-major downgrade).
- **@astrojs/language-server** ≥2.14.0 — *transitive*. Via `volar-service-yaml`. Effects: `@astrojs/check`.
- **@cloudflare/vite-plugin** ≤0.0.0-fff677e35 || 0.0.7–1.37.2 — *transitive*. Via `miniflare`, `wrangler`, `ws`. Fix available.
- **miniflare** ≤0.0.0-fff677e35 || 3.20250204.0–4.20260518.0 — *transitive*. Via `ws`. Effects: `@cloudflare/vite-plugin`, `wrangler`. Fix available.
- **volar-service-yaml** ≤0.0.70 — *transitive*. Via `yaml-language-server`. Effects: `@astrojs/language-server`.
- **wrangler** ≤0.0.0-kickoff-demo || 3.108.0–4.93.0 — *direct*. Via `miniflare`. Effects: `@cloudflare/vite-plugin`. Fix available.
- **ws** 8.0.0–8.20.0 — *transitive*. Advisory GHSA-58qx-3vcg-4xpx — "ws: Uninitialized memory disclosure" (CVSS 4.4, CWE-908). Effects: `@cloudflare/vite-plugin`, `miniflare`. Fix available.
- **yaml** 2.0.0–2.8.2 — *transitive*. Advisory GHSA-48c2-rrv3-qjmp — "yaml is vulnerable to Stack Overflow via deeply nested YAML collections" (CVSS 4.3, CWE-674). Effects: `yaml-language-server`.
- **yaml-language-server** 1.11.1-08d5f7b.0–1.21.1-f1f5a94.0 || 1.22.1-0ae5603.0–1.22.1-fc5f874.0 — *transitive*. Via `yaml`. Effects: `volar-service-yaml`.

#### LOW / INFO findings

None.

Dependency totals from `metadata.dependencies`: 449 prod, 316 dev, 131 optional, 895 total.

`npm audit` exited with status 1 (vulnerabilities present); per the post-scaffold protocol this is informational, not a halt.

## Hints recorded but not acted on

| Hint                    | Value                  |
| ----------------------- | ---------------------- |
| bootstrapper_confidence | first-class            |
| quality_override        | false                  |
| path_taken              | standard               |
| self_check_answers      | null                   |
| team_size               | solo                   |
| deployment_target       | cloudflare-pages       |
| ci_provider             | github-actions         |
| ci_default_flow         | auto-deploy-on-merge   |
| has_auth                | true                   |
| has_payments            | false                  |
| has_realtime            | true                   |
| has_ai                  | true                   |
| has_background_jobs     | true                   |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Diff `CLAUDE.md` against `CLAUDE.md.scaffold` and decide which version (or which merger of the two) to keep — the existing CLAUDE.md carries 10xDevs course context, the scaffold copy carries starter-specific agent guidance.
- Address audit findings per your project's risk tolerance — `npm audit fix` resolves the HIGH `devalue` advisory and most of the moderate cluster; the `@astrojs/check → 0.9.2` semver-major downgrade is the one decision worth thinking about before running `npm audit fix --force`.
