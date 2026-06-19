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

| Roadmap ID | Issue                                                            | Change ID                           | Status | Labels                                           |
| ---------- | ---------------------------------------------------------------- | ----------------------------------- | ------ | ------------------------------------------------ |
| F-01       | [#1](https://github.com/Piotr-Miller/lumina-clean-ai/issues/1)   | `photo-jobs-data-and-storage`       | ready  | `roadmap` `foundation` `status:ready`            |
| S-01       | [#2](https://github.com/Piotr-Miller/lumina-clean-ai/issues/2)   | `local-engine-enhance-flow`         | ready  | `roadmap` `slice` `status:ready`                 |
| S-02       | [#3](https://github.com/Piotr-Miller/lumina-clean-ai/issues/3)   | `account-access-and-password-reset` | ready  | `roadmap` `slice` `status:ready`                 |
| S-03       | [#4](https://github.com/Piotr-Miller/lumina-clean-ai/issues/4)   | `gated-cloud-upload`                | done   | `roadmap` `slice` `status:proposed`              |
| S-04 ⭐    | [#5](https://github.com/Piotr-Miller/lumina-clean-ai/issues/5)   | `cloud-ai-realtime-result`          | done   | `roadmap` `slice` `status:proposed` `north-star` |
| S-05       | [#6](https://github.com/Piotr-Miller/lumina-clean-ai/issues/6)   | `cloud-daily-cap`                   | done   | `roadmap` `slice` `status:proposed`              |
| S-06       | [#7](https://github.com/Piotr-Miller/lumina-clean-ai/issues/7)   | `account-session-ux`                | done   | `roadmap` `slice` `status:ready`                 |
| S-07       | [#8](https://github.com/Piotr-Miller/lumina-clean-ai/issues/8)   | `production-deployment`             | done   | `roadmap` `slice` `status:ready`                 |
| S-08       | [#9](https://github.com/Piotr-Miller/lumina-clean-ai/issues/9)   | `cloud-job-retention-cleanup`       | done   | `roadmap` `slice` `status:ready`                 |
| S-09       | [#12](https://github.com/Piotr-Miller/lumina-clean-ai/issues/12) | `cloud-source-url-ttl-fix`          | done   | `roadmap` `slice` `status:ready`                 |
| S-11       | [#51](https://github.com/Piotr-Miller/lumina-clean-ai/issues/51) | `bread-chroma-postpass`             | ready  | `roadmap` `slice` `status:ready` `phase:post-mvp` |
| S-12       | [#52](https://github.com/Piotr-Miller/lumina-clean-ai/issues/52) | `adaptive-enhancement-parameters`   | ready  | `roadmap` `slice` `status:ready` `phase:post-mvp` |

⭐ = north star (validation milestone).

> **S-06 (#7) + S-07 (#8) added 2026-06-03** (after S-04 archived) — two new MVP slices, both independent of and non-colliding with S-05. Created via `gh issue create --body-file` (labels `roadmap` `slice` `status:ready`, since prerequisites S-02/S-04 are done). Not part of the original 2026-05-26 batch documented above.
>
> **2026-06-03 (retrospective gaps from S-01→S-04):** added **S-08 (#9)** `cloud-job-retention-cleanup` — a privacy-NFR cleanup gap that F-01/S-03/S-04 each punted and none owned. Also **extended the bodies of #7** (folded in cross-device password reset, FR-015) and **#8** (folded in the S-04 `/callback` hardening cluster) via `gh issue edit --body-file`. All three remain independent of S-05.
>
> **2026-06-04 (promoted from Parked):** added **S-09 (#12)** `cloud-source-url-ttl-fix` — the cold-boot source signed-URL expiry (a Replicate cold boot >300s expires the source READ URL before the model fetches it → prediction fails at the source-fetch step). Previously a Parked bullet folded into S-07; promoted to its own v1 slice because it is a go-live prerequisite for the cloud path. Created via `gh issue create --body-file` (labels `roadmap` `slice` `status:ready`; prereq S-04 done). Issue number jumped to **#12** (#10/#11 were PRs — GitHub shares the issue/PR number space). Independent of S-07/S-08 (touches the source-signing path, not `/callback`); the `CLOUD_PIPELINE_ENABLED` flip-ON gate is now **S-05 + S-08 + S-09**. The S-07 body (#8) was synced the same day via `gh issue edit --body-file`: the TTL fix is now described as owned by S-09/#12 (a flip-ON prerequisite) rather than folded into #8, and the flip-ON gate in #8 was widened to **S-05 + S-08 + S-09**.

> **2026-06-05 (non-roadmap chore):** added **#13** `ci-wrangler-action-node24` — a CI maintenance follow-up to bump `cloudflare/wrangler-action@v3` to a Node.js 24-compatible version before GitHub's Node 20 deadline (forced 2026-06-16, removed 2026-09-16). Surfaced as a `deploy`-job deprecation annotation during the S-07 production-deployment go-live (run 27033884831). Not a roadmap slice, so it carries the new `chore` label (not `roadmap`/`slice`) and is intentionally absent from the roadmap→issue mapping table above. Change folder: `context/changes/ci-wrangler-action-node24/`.

> **2026-06-06 (non-roadmap chore):** added **#14** `disable-workers-dev-subdomain` — infra/branding follow-up to disable the default `workers.dev` route once `luminacleanai.com` (custom domain added 2026-06-06) is the established prod URL, so prod is served only at the branded domain. Deferred until after S-07 go-live testing (workers.dev still referenced during cutover). `chore` label; absent from the roadmap→issue table. Change folder: `context/changes/disable-workers-dev-subdomain/`.

> **2026-06-11 (non-roadmap chore):** added **#19** `jobs-rls-seed-flake` — test-hardening follow-up to make `tests/jobs.rls.test.ts` `seedJob` resilient to a transient Kong/PostgREST 502 (`An invalid response was received from the upstream server`) on its setup insert against the ephemeral local Supabase stack. Surfaced as a one-off `integration`-job failure on run 27338381004 (PR #18, docs-only — env, not code); passed on re-run. `chore` label; absent from the roadmap→issue table. Change folder: `context/changes/jobs-rls-seed-flake/`.

> **2026-06-18 (post-MVP UX/quality):** added **S-12 (#52)** `adaptive-enhancement-parameters` — add a responsive parameter panel beside the photo; expose Local `gamma`/blur and Bread `gamma`/`strength`; let Auto populate visible slider values and let the user override any value manually. Labels: `roadmap`, `slice`, `status:ready`, `phase:post-mvp`. Change folder: `context/changes/adaptive-enhancement-parameters/`.
> **2026-06-18 (post-MVP quality):** added **S-11 (#51)** `bread-chroma-postpass` — keep Bread/Replicate as the low-light enhancer, add an adaptive YCbCr chroma-denoise post-pass, and replace the hardcoded model-version hash with a controlled latest-version resolver that retains resolved-version telemetry and rollback. Labels: `roadmap`, `slice`, `status:ready`, `phase:post-mvp`. Change folder: `context/changes/bread-chroma-postpass/`.

## Status updates (post-creation)

Issue state is kept in sync as roadmap items archive (see "Reproduce / extend" note below).

| Date       | Roadmap ID | Issue                                                            | Action                                                                                                                                                                |
| ---------- | ---------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-29 | F-01       | [#1](https://github.com/Piotr-Miller/lumina-clean-ai/issues/1)   | closed on archive                                                                                                                                                     |
| 2026-05-29 | S-01       | [#2](https://github.com/Piotr-Miller/lumina-clean-ai/issues/2)   | closed on archive                                                                                                                                                     |
| 2026-05-30 | S-02       | [#3](https://github.com/Piotr-Miller/lumina-clean-ai/issues/3)   | closed on archive                                                                                                                                                     |
| 2026-05-31 | S-03       | [#4](https://github.com/Piotr-Miller/lumina-clean-ai/issues/4)   | closed on archive (commit 42d4141)                                                                                                                                    |
| 2026-06-02 | S-04       | [#5](https://github.com/Piotr-Miller/lumina-clean-ai/issues/5)   | closed on archive (commit bebad84)                                                                                                                                    |
| 2026-06-03 | S-06       | [#7](https://github.com/Piotr-Miller/lumina-clean-ai/issues/7)   | closed on archive                                                                                                                                                     |
| 2026-06-04 | S-05       | [#6](https://github.com/Piotr-Miller/lumina-clean-ai/issues/6)   | closed on archive (commit 0130a79)                                                                                                                                    |
| 2026-06-06 | S-07       | [#8](https://github.com/Piotr-Miller/lumina-clean-ai/issues/8)   | closed on archive                                                                                                                                                     |
| 2026-06-07 | S-09       | [#12](https://github.com/Piotr-Miller/lumina-clean-ai/issues/12) | closed on archive                                                                                                                                                     |
| 2026-06-07 | S-08       | [#9](https://github.com/Piotr-Miller/lumina-clean-ai/issues/9)   | closed on archive                                                                                                                                                     |
| 2026-06-11 | — (chore)  | [#13](https://github.com/Piotr-Miller/lumina-clean-ai/issues/13) | archived `ci-wrangler-action-node24` → `context/archive/2026-06-11-ci-wrangler-action-node24`; issue already closed on merge (wrangler-action@v4). Non-roadmap chore. |

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
