# Roadmap → GitHub Issues — Process Log

> Record of how `context/foundation/roadmap.md` (v1) was turned into GitHub Issues
> using the `gh` CLI, on 2026-05-26. Reproducible runbook + the actual run's outcome.

## Summary

- **Source:** `context/foundation/roadmap.md` (v1) — 1 foundation (F-01) + 5 slices (S-01…S-05).
- **Target repo:** `Piotr-Miller/lumina-clean-ai` (private).
- **Result:** 6 issues created (`#1`–`#6`), one per roadmap item, each carrying the full roadmap detail. 6 supporting labels created.
- **Tool:** GitHub CLI (`gh`), authenticated as `Piotr-Miller` with `repo` scope.

## Step 0 — Preflight checks

Verified auth, remote, and target repo before any write to the remote:

```bash
gh auth status
git remote -v
gh repo view --json nameWithOwner,visibility
```

Confirmed:
- Logged in to github.com as `Piotr-Miller` (token scopes include `repo`, `workflow`).
- `origin` → `https://github.com/Piotr-Miller/lumina-clean-ai.git`.
- Repo `Piotr-Miller/lumina-clean-ai`, visibility `PRIVATE`.

Listed existing labels (`gh label list`) — only GitHub defaults existed, so roadmap labels had to be created.

## Step 1 — Create labels

```bash
gh label create roadmap        --color 5319e7 --description "Roadmap item from context/foundation/roadmap.md" --force
gh label create foundation     --color 1d76db --description "Cross-cutting enabler (F-NN)"                     --force
gh label create slice          --color 0e8a16 --description "Vertical user-visible slice (S-NN)"              --force
gh label create "status:ready" --color 1a7f37 --description "Prerequisites met; ready for /10x-plan"          --force
gh label create "status:proposed" --color fbca04 --description "Awaiting prerequisites"                       --force
gh label create "north-star"   --color d93f0b --description "Validation milestone"                            --force
```

`--force` makes the command idempotent (create-or-update), so re-running is safe.

## Step 2 — Write issue bodies to temp files

One markdown file per roadmap item was written to a temp dir
(`%LOCALAPPDATA%\Temp\lumina-issues\{F-01,S-01,S-02,S-03,S-04,S-05}.md`).

Rationale: bodies contain multi-line markdown and unicode (`→`, `—`, `⭐`); passing them
via `--body-file` avoids shell-escaping problems (especially under PowerShell on Windows).
Temp dir is outside the repo so it never shows up in `git status`.

Each body was lifted faithfully from the matching roadmap entry and laid out as:
`Roadmap ID · Change ID · Type · Status` header, then **Outcome**, **PRD refs**,
**Unlocks** (foundations only), **Dependencies** (Prerequisites / Parallel with /
Blockers / Unknowns), **Risk**, **Stream**, and a **Next** line with the
`/10x-plan <change-id>` step. Prerequisites are cross-referenced by Roadmap ID +
Change ID (issue numbers aren't known until creation).

## Step 3 — Create the issues

Titles use the roadmap's "Suggested issue title" prefixed with the Roadmap ID. The `→`
arrow was dropped from the S-01 title (kept it in the body) to avoid shell-quoting issues.

```bash
D="C:/Users/prmi/AppData/Local/Temp/lumina-issues"

gh issue create --title "F-01: Private photo storage + job records with RLS" \
  --label roadmap --label foundation --label "status:ready" --body-file "$D/F-01.md"

gh issue create --title "S-01: Local (Canvas) engine — upload, enhance, compare, download" \
  --label roadmap --label slice --label "status:ready" --body-file "$D/S-01.md"

gh issue create --title "S-02: Complete account access incl. password reset" \
  --label roadmap --label slice --label "status:ready" --body-file "$D/S-02.md"

gh issue create --title "S-03: Gated engine toggle + Cloud AI submission" \
  --label roadmap --label slice --label "status:proposed" --body-file "$D/S-03.md"

gh issue create --title "S-04: Async Cloud AI pipeline + Realtime result delivery" \
  --label roadmap --label slice --label "status:proposed" --label "north-star" --body-file "$D/S-04.md"

gh issue create --title "S-05: Global daily cap on Cloud AI requests" \
  --label roadmap --label slice --label "status:proposed" --body-file "$D/S-05.md"
```

### Hiccup: transient 502 on the 6th create

The batch printed URLs for `#1`–`#5`, then the 6th (S-05) failed with
`HTTP 502: 502 Bad Gateway (https://api.github.com/graphql)` — a transient GitHub-side error.

**Recovery (verify-before-retry, to avoid duplicates):**

```bash
# Confirm S-05 was NOT created
gh issue list --limit 20 --state all --json number,title,labels \
  --jq '.[] | "\(.number)\t\(.title)\t[\([.labels[].name] | join(", "))]"'

# Only #1–#5 existed → safe to retry just S-05
gh issue create --title "S-05: Global daily cap on Cloud AI requests" \
  --label roadmap --label slice --label "status:proposed" \
  --body-file "C:/Users/prmi/AppData/Local/Temp/lumina-issues/S-05.md"
# → https://github.com/Piotr-Miller/lumina-clean-ai/issues/6
```

## Step 4 — Cleanup

Attempted to remove the temp body dir (`rm -rf .../lumina-issues`); the command was
declined in this session. Harmless — the files live in the OS temp folder, outside the
repo. They can be deleted manually at any time.

## Final mapping (roadmap item → issue)

| Roadmap ID | Issue | Change ID                          | Status   | Labels |
| ---------- | ----- | ---------------------------------- | -------- | ------ |
| F-01       | [#1](https://github.com/Piotr-Miller/lumina-clean-ai/issues/1) | `photo-jobs-data-and-storage`       | ready    | `roadmap` `foundation` `status:ready` |
| S-01       | [#2](https://github.com/Piotr-Miller/lumina-clean-ai/issues/2) | `local-engine-enhance-flow`         | ready    | `roadmap` `slice` `status:ready` |
| S-02       | [#3](https://github.com/Piotr-Miller/lumina-clean-ai/issues/3) | `account-access-and-password-reset` | ready    | `roadmap` `slice` `status:ready` |
| S-03       | [#4](https://github.com/Piotr-Miller/lumina-clean-ai/issues/4) | `gated-cloud-upload`                | done     | `roadmap` `slice` `status:proposed` |
| S-04 ⭐    | [#5](https://github.com/Piotr-Miller/lumina-clean-ai/issues/5) | `cloud-ai-realtime-result`          | done     | `roadmap` `slice` `status:proposed` `north-star` |
| S-05       | [#6](https://github.com/Piotr-Miller/lumina-clean-ai/issues/6) | `cloud-daily-cap`                   | proposed | `roadmap` `slice` `status:proposed` |

⭐ = north star (validation milestone).

## Status updates (post-creation)

Issue state is kept in sync as roadmap items archive (see "Reproduce / extend" note below).

| Date       | Roadmap ID | Issue | Action |
| ---------- | ---------- | ----- | ------ |
| 2026-05-29 | F-01       | [#1](https://github.com/Piotr-Miller/lumina-clean-ai/issues/1) | closed on archive |
| 2026-05-29 | S-01       | [#2](https://github.com/Piotr-Miller/lumina-clean-ai/issues/2) | closed on archive |
| 2026-05-30 | S-02       | [#3](https://github.com/Piotr-Miller/lumina-clean-ai/issues/3) | closed on archive |
| 2026-05-31 | S-03       | [#4](https://github.com/Piotr-Miller/lumina-clean-ai/issues/4) | closed on archive (commit 42d4141) |
| 2026-06-02 | S-04       | [#5](https://github.com/Piotr-Miller/lumina-clean-ai/issues/5) | closed on archive (commit bebad84) |

> The F-01/S-01/S-02 rows are recorded for completeness based on their archive dates; this log section was introduced with the S-03 archive (2026-05-31).

## Not done (optional follow-ups)

- **Milestones per stream** (Cloud AI path / Local engine / Account access) — not created.
- **Native issue dependency links** ("blocked by" relationships) via the GraphQL API —
  not created; dependencies are currently expressed as text in each issue body.

## Reproduce / extend

- Re-running label creation is safe (`--force`).
- If the roadmap changes, prefer editing existing issues (`gh issue edit <n> --body-file …`)
  over creating duplicates; match on the Roadmap ID / Change ID in the title and body.
- `/10x-archive` is the canonical writer that flips roadmap items to `done`; keep the
  issue state in sync with the roadmap's `Status` when an item is archived.
