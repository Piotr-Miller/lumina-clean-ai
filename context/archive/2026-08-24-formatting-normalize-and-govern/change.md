# Normalize formatting once, then govern it repo-wide

**Status:** ready
**Opened:** 2026-08-24

## The premise that was wrong

The first framing of this was "`npm run format` is repo-hostile — mirror the
ESLint/tsc graph boundary in `.prettierignore` so the command means _format the
Astro app_." That was rejected on review, correctly:

- `npm run format` is **intentionally repository-wide**.
- `.prettierignore` exists to protect **immutable or byte-sensitive** artifacts,
  not to scope a command.
- **Prettier does not depend on the ESLint/tsc project graph.** Those tools need
  a project to resolve types; prettier parses files. So a graph exclusion is not
  a reason to leave maintained source unformatted — the two exclusions are
  answering different questions.
- Neither excluded subtree had a formatting gate of its own.
- Ignoring them would have **hidden the drift rather than fixed it**.

This is an **enforcement gap**, not a missing boundary. The fix follows from
that: normalize once, then govern.

## What was actually drifting, and why

Root `eslint --fix` already applies prettier through `eslint-plugin-prettier`,
so everything inside the root ESLint project stayed formatted. The 28 files a
plain `npm run format` rewrote were exactly the paths no gate maintained:

| Count | Path                                                                                                                                                   | Why it drifted                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| 21    | `packages/code-reviewer/**`                                                                                                                            | own eslint config with no prettier rule, own CI job |
| 2     | `supabase/functions/enhance/**`                                                                                                                        | Deno subtree, outside the Astro graphs              |
| 5     | `WRANGLER.md`, `context/foundation/{prd,shape-notes}.md`, `context/changes/bootstrap-verification/verification.md`, `supabase/templates/recovery.html` | extensions no hook covered                          |

That last row is five, not four — `recovery.html` is easy to miss reading an
extension histogram, since it is the only non-`.md` file in the group.

## Change

**Commit 1 — normalization.** Pure `npm run format` output, isolated so the
enforcement below carries a reviewable diff instead of hiding behind 28 files
of whitespace. No logic, no config, no content edits.

**Commit 2 — enforcement.**

- `npm run format:check` (`prettier --check .`), wired into the `ci` job. It
  reaches every path `.prettierignore` does not protect, so **both** excluded
  subtrees are governed by one explicit check.
- `lint-staged` now runs `prettier --write` on `*.{ts,tsx,astro}` after
  `eslint --fix` — a no-op inside the ESLint project, the actual formatter
  outside it — and covers `mjs`/`html`/`yml`/`yaml`, which no hook touched.
  Without this the new gate would fail CI on files the commit hook never
  offered to fix.
- **No prettier dependency added to `packages/code-reviewer`.** The root check
  already reaches it, so a subtree formatter is not needed; root `format` may
  delegate to one later if a subtree ever needs different rules.

`.prettierignore` stays **narrow on purpose** — only immutable or byte-stable
artifacts: `.claude/` + `.agents/` (manifest-hashed skill trees) and
`context/archive/` (immutable, and several archives pin sha256 hashes of their
own ground truth — a prettier pass landing after a hash is taken is precisely
the freeze violation `assertGroundTruthFrozen` guards). `AGENTS.md` now records
that a subtree must **never** be added there to silence drift.

## Verification

- [x] **The gate was verified by deliberate break, not by a passing run.** A
      green check that never fails proves nothing. A malformed line in
      `packages/code-reviewer/src/findings.ts` fails it; so does one in
      `supabase/functions/enhance/source-sign.ts`; one under `.agents/` does
      **not** (byte-stable, correctly still ignored). All three restored.
- [x] `npm run format:check` clean on the normalized tree
- [x] workflow still parses (`js-yaml`), and `format:check` is present in the
      `ci` job's step list — re-checked after lint-staged's new `yml` glob
      reformatted `ci.yml` on commit
- [x] root: lint (0 errors), typecheck, `test:unit` — 28 files / 345 tests
- [x] package: lint, typecheck — 21 files / 608 tests
- [x] `AGENTS.md` corrected: the `code-reviewer` job is that package's only
      **lint/type/test** coverage, but no longer its formatting coverage

---

**Archived 2026-08-24.** Shipped in PR #185.
