<!-- PLAN-REVIEW-REPORT -->

# Plan Review: GitHub Packages Skill Distribution

- **Plan**: `context/changes/github-packages-skill-distribution/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-03
- **Verdict**: REVISE → **SOUND** after triage (2026-09-03: F1–F6 fixed in plan, F7 dismissed)
- **Findings**: 2 critical, 4 warnings, 1 observation

Both FAIL dimensions trace to bounded, phase-local corrections — not to the approach. The
private-package + explicit-CLI + two-channel design is sound, so RETHINK would be miscalibrated.

## Verdicts

| Dimension             | Verdict | After triage                      |
| --------------------- | ------- | --------------------------------- |
| End-State Alignment   | WARNING | PASS (F3)                         |
| Lean Execution        | PASS    | PASS                              |
| Architectural Fitness | FAIL    | PASS (F1, F5)                     |
| Blind Spots           | FAIL    | PASS (F2, F4 fixed; F7 dismissed) |
| Plan Completeness     | WARNING | PASS (F6)                         |

## Grounding

11/11 paths ✓, 4/4 symbols ✓, brief↔plan ✓, Progress format ✓ (8/8 phase headings matched,
47 items, no stray checkboxes outside `## Progress`). `docs/reference/contract-surfaces.md`
absent — opt-in contract-surface check skipped.

Two notes that produced no finding:

- `AGENTS.md:110`'s claim that `10x-impl-review-ci` "powers the public CI reviewer" is not
  literally true. `packages/code-reviewer/src/prompts.ts:145-153` states the content is vendored
  rather than read at runtime, and no workflow or composite action touches the directory. This
  makes Phase 8's removal safer than the plan assumes; the stale claim is carried as a pointer in F6.
- Lean Execution passed. Every phase was tested against "if I removed this, would the end state
  still be achievable?" — none is removable.

## Findings

### F1 — Phase 3 packages git-tracked files Phase 8 never untracks

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architectural Fitness
- **Location**: Phase 3 §1–2 vs Phase 8 §2; Phase 2 §3
- **Detail**: Phase 3 §1 packages "repo-owned helper files required by those skills" —
  `scripts/gauntlet-stage.ts` and `scripts/lib/gauntlet-staging.ts`, both git-tracked. Phase 3 §2
  packages "Phase 1-approved reproducible Codex configuration" — `.codex/` is tracked too
  (`config.toml`, `hooks.json`, `hooks/*.ps1`, `environments/environment.toml`). Phase 8 §2's
  removal list names only the eight skill trees, `scripts/check-skills-sync.ts`, the parity
  helper/tests, gauntlet contract tests, and the `package.json` script. Neither set gets untracked.
  Two consequences, one root cause:
  (a) Reconciliation adopts "byte-identical pre-existing targets", so first `setup` claims tracked
  files; a later upgrade rewrites them → dirty tree, contradicting SC 8.3 and Phase 7's "no tracked
  application files changed unexpectedly". Phase 2 §3's preflight rejects overlap with the 10x
  manifest but has no git-tracking check.
  (b) `tests/gauntlet-staging.test.ts:29` imports `../scripts/lib/gauntlet-staging` and runs under
  `test:unit` (`vitest.config.ts:9`, `package.json:17`) in the CI `ci` job; `tsconfig.json:3`
  `include:["**/*"]` has no `scripts` exclusion. Phase 3 §5 migrates "staging helper behavior" tests
  to the toolkit but Phase 8 §2 never removes this one. A fresh public clone has neither the file nor
  the private package → TS2307 + unresolved import, so SC 8.2 ("fresh public Lumina CI passes without
  registry auth") cannot pass.
- **Fix A ⭐ Recommended**: Restrict both payloads to untracked targets, and add "target is
  git-tracked in the consumer repo" as a preflight rejection class in Phase 2 §3.
  - Strength: One rule settles both consequences and keeps Lumina's authored, tested tooling where
    its tests already live; the preflight generalizes beyond these three paths.
  - Tradeoff: The gauntlet skill prose ships in the package while its helper stays in Lumina — skill
    and helper are then versioned separately.
  - Confidence: HIGH — tracking status verified by `git ls-files`; the CI break is pinned to a
    specific import and vitest include.
  - Blind spot: Whether any of the eight skills has a helper dependency beyond gauntlet's.
- **Fix B**: Extend Phase 8 §2 to untrack `.codex/**` and both gauntlet helpers, and move
  `tests/gauntlet-staging.test.ts` to the toolkit.
  - Strength: Keeps skill + helper in one versioned unit.
  - Tradeoff: Lumina loses lint coverage of the helper (see F7), and `.codex/**` — currently public,
    working, and unrelated to course content — becomes owner-auth-gated.
  - Confidence: MEDIUM — workable, but widens the private surface for files with no privacy reason
    to be private.
  - Blind spot: Effect on Codex users cloning the public repo is untested.
- **Decision**: FIXED — Fix A with two amendments: (1) Phase 2 §3 preflight rejects the _write_, not the path — byte-identical adoption of a tracked target is allowed and reported `tracked — pending untrack`; byte-changing writes to tracked files are hard rejections (edge cases for no-repo / no-git specified). (2) Phase 1 §3 gains a fourth channel `consumer-owned` (`.codex/**`, gauntlet helpers + their test stay tracked in Lumina); Phase 4 §5 asserts inventory-claimed tracked paths == Phase 8 §2 untrack set (new SC 4.6, manual renumbered 4.7).

### F2 — Overlay derivation diffs against a newer official base

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Phase 1 §4 (vs Phase 1 §1)
- **Detail**: Phase 1 §4 defines `overlay = diff(official base, reviewed workspace)`, with official
  input from an authenticated `10x sync --all` — which pulls the LATEST unlocked content. The
  workspace is not on that pointer: `.claude/.10x-cli-manifest.json` says `lessonId: m5l4`
  (lastApplied 2026-09-02); the mirror at `/home/piotrmiller/Source/10x-toolkit/workspace/.claude/.10x-cli-manifest.json`
  says `m5l5` (2026-09-01). Phase 1 §1 surfaces exactly this discrepancy but Phase 1 §4 never feeds
  it into derivation. A two-way diff cannot distinguish "we extended this" from "upstream advanced
  and we are behind": every upstream advance between the workspace's bundle and today is committed
  as an overlay that permanently re-reverts it on every future refresh — silently, and in the one
  artifact the plan designates as authoritative. The only mitigation is a human approval gate over a
  66-entry / 176-file tree with no partitioning or sizing.
- **Fix A ⭐ Recommended**: Three-way derivation against the base the workspace was actually built
  from (re-fetch at the recorded `lessonId` first), then re-base onto latest as a separate reviewed
  step.
  - Strength: Makes the overlay set mean "our deltas" by construction; re-basing surfaces upstream
    advances as their own reviewable diff instead of burying them in the overlays.
  - Tradeoff: Requires the CLI to fetch a specific past lesson, and adds a second derivation pass to
    Phase 1.
  - Confidence: HIGH — the m5l4/m5l5 split is confirmed in both manifests.
  - Blind spot: Whether `10x get <ref>` can reproduce an older bundle exactly; if not, Fix B is the
    fallback.
- **Fix B**: Keep the two-way diff but require every hunk classified local-extension vs
  upstream-advance, with a pre-committed review budget.
  - Strength: No dependency on re-fetching an older bundle.
  - Tradeoff: Correctness rests on eyeballing every hunk; the plan gives no budget or partition.
  - Confidence: MEDIUM — works, but it is the review-harder answer to a structural problem.
  - Blind spot: Hunk count unmeasured — the course-owned content trees are currently byte-identical
    between workspace and mirror, so the real overlay volume is unknown.
- **Decision**: FIXED (different approach). Premise corrected: the m5l4/m5l5 split is pointer-only — `lessonId`/`lastApplied`/`lessons.m5l4.appliedAt` differ because `10x get m5l4` was re-run on 09-02 after the 09-01 `sync --all` snapshot; the 28-lesson set, every `catalogContentHash`, and all 106 `files` hash leaves are identical (re-verified during triage). Tree is 65 entries / 94 declared / 74 hashed, not 66/176. The hazard class (future upstream advance encoded as an overlay) is real, so Phase 1 §4 now runs a three-way partition against the manifest's recorded per-file sha256 base — untouched / pure upstream advance / pure local delta / ambiguous — with `ambiguous` as a hard gate (empty, or each member resolved and recorded). No old-bundle re-fetch dependency (Fix A's blind spot) and no review budget (Fix B). Phase 1 §1 now records the disposition as pointer-only and excludes last-applied metadata from the comparison so the rollback tag is not blocked on a non-issue. SC 1.1/1.3 reworded.

### F3 — No authoring loop for the two repo-owned managed skills

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Desired End State; Phase 3 §1; Phase 8
- **Detail**: `gauntlet-loop` and `run-local-stack` are authored in this repo (`AGENTS.md:110`,
  "authored here, not fetched from any registry"). After cutover the package owns their installed
  paths, and reconciliation turns any in-repo edit into a preserved-and-reported conflict — so
  `status` never returns clean until the edit round-trips through the private toolkit repo and a new
  release. No phase defines that loop; Desired End State and Phase 8 are silent on it. It bites
  immediately: gauntlet-loop's own `SKILL.md:209-210` and `references/guardrails.md:62` point at
  `scripts/gauntlet-stage.ts`, `tests/gauntlet-staging.test.ts` and `npm run check:skills` —
  pointers Phase 8 §3 must correct, in files that by then are managed payload Lumina can no longer edit.
- **Fix A ⭐ Recommended**: Narrow the managed channel to the six registry-sourced skills; leave
  `gauntlet-loop` and `run-local-stack` tracked in Lumina.
  - Strength: Repo-owned skills stay where they are authored, tested
    (`tests/gauntlet-loop-skill.test.ts`) and reviewed; the package distributes what it did not
    author. Removes the payload-edits-its-own-docs ordering problem outright.
  - Tradeoff: Fresh-machine setup no longer delivers those two skills; they arrive with the clone
    instead — arguably correct, since a Lumina clone is already a prerequisite.
  - Confidence: HIGH — the plan's rationale for including them is "currently public", not an
    ownership argument.
  - Blind spot: Whether the user values one uniform channel more than correct ownership.
- **Fix B**: Keep all eight and add an explicit authoring-loop contract plus documentation.
  - Strength: One uniform managed channel; single setup command.
  - Tradeoff: Every skill-prose edit becomes a private release cycle, and Phase 8 §3's doc rewrite
    must ship from the toolkit repo before Lumina's cutover commit.
  - Confidence: MEDIUM — workable but adds a sequencing constraint the plan does not carry.
  - Blind spot: Release cadence for what are currently one-line edits.
- **Decision**: FIXED via Fix A. Managed channel = six non-repo-authored skills (`10x-impl-review-ci` + five registry-sourced); `gauntlet-loop` + `run-local-stack` trees (both surfaces) and `tests/gauntlet-loop-skill.test.ts` join the `consumer-owned` class from F1. Follow-through applied: since those two still live in both consumer trees, Phase 8 §2 now _narrows_ the `check:skills` parity gate (PUBLIC_SKILLS + `.gitignore` re-includes: 8 → 2) instead of removing it. Overview, approach bullet, Desired End State, Phase 1 §3, Phase 3 §1/§5, Phase 8 §2 updated.

### F4 — Seed delta is recovery-only, so managed update is never exercised

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §5, Phase 6 §1, Phase 7 §2
- **Detail**: The sole preregistered delta lives in `scripts/local/**` — the recovery channel. So
  Phase 7's `rc.1 → stable → rc.1 → stable` cycle applies zero managed bytes; managed is exercised
  only for conflict preservation (step 2). A managed-channel update-in-place bug is invisible to the
  very proof built to catch it, and `plan-brief.md` names "vacuous transition proof" as Phase 6's key
  risk. `context/foundation/lessons.md` ("A guard metric that only exists on success cannot detect
  failure"): state the failure a guard must catch, then check it can see that failure. Secondary: the
  chosen delta — teaching the local checker to reject toolkit/10x manifest ownership overlap —
  duplicates a guarantee Phase 2 §3 already builds into the CLI, inside a component Phase 8 §4
  schedules for removal.
- **Fix**: Extend the preregistered delta with one managed-channel byte change (a managed skill file)
  so the cycle applies and reverts bytes in both channels. Phase 6's "sole logical change" rule still
  holds — it becomes one change with two targets.
  - Strength: Closes the hole with no new phase and no new mechanism.
  - Tradeoff: Phase 6's scope-review gate must accept a two-target delta.
  - Confidence: HIGH — the gap follows directly from the channel of the only registered delta.
  - Blind spot: Which managed file is the least disruptive carrier.
- **Decision**: FIXED (different carrier). A managed _skill_ file is the wrong carrier: after F3 the managed channel is six third-party skills whose attribution bytes must not change, and under F2's derivation a byte edit to a vendored file becomes a permanent self-perpetuating overlay. Carrier chosen instead: a package-owned **managed provenance stamp** (`.ai-toolkit/managed-provenance.md`, standalone content with no 10x base, listed in `inventory/managed.json`, gitignored package state) whose version line differs between every release pair — so managed update-in-place/revert is exercised on every transition, not just the seed pair. Phase 6 §1 rule reworded as "one logical change plus the stamp it necessarily updates". Recovery-checker delta kept (defence in depth: CLI preflight vs installed-result check). Phase 6 §1 release notes + Phase 7 §3 evidence now capture checker output verbatim so the proof outlives Phase 8 §4's checker removal. Phase 1 §5, 3 §3, 6 §1, 7 §2–3, SC 6.1/7.3 updated.

### F5 — Phase 2 rebuilds three primitives the repo already has

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 §3; Phase 1 §1
- **Detail**: Phase 2 §3 builds `src/lib/{reconcile,paths,hashes,atomic-write,ownership}.ts` from
  scratch, and Phase 1 §1 builds a new byte comparator in the mirror. All three already exist here,
  tested:
  - `scripts/lib/atomic-file-writes.ts:27` `writeFileAtomically` — temp sibling + rename + failure
    cleanup, the exact contract Phase 2 §3 specifies (plus `:44` `writeFilePairAtomically`).
  - `scripts/local/lib/skills-sync-checker.ts` (20KB, tested at
    `scripts/local/skills-sync-checker.test.ts`) — manifest-hash ownership with
    `FileClass = "manifest-managed" | "lock-bootstrap" | "personal-manual"` (`:25`), `parseManifest`
    (`:110`), `listTreeFiles` (`:169`), `isAcceptedLocalHash` (`:182`). This is the plan's
    reconciliation model, already built.
  - `scripts/lib/public-skills-parity.ts:53` `checkPublicSkillsParity` — tree byte-parity comparator
    with missing/drift classification, unit-tested.
  - `scripts/lib/gauntlet-staging.ts:93` `resolveRoundDir` — a symlink-resolving containment check.
    Phase 8 removes the parity helper and schedules `scripts/local/` for removal, so the plan deletes
    tested implementations of the primitives it rewrites elsewhere in the same change.
- **Fix**: Name these as the porting seed for Phase 2 §3 and for Phase 1 §1's mirror verification,
  rather than specifying greenfield modules.
  - Strength: Carries over behavior that already survives this repo's edge cases, and makes the
    Phase 8 deletion a move rather than a loss.
  - Tradeoff: Cross-repo porting costs adaptation, and `skills-sync-checker.ts` embeds course content
    that must be stripped or kept private.
  - Confidence: HIGH — all four verified with file:line.
  - Blind spot: How much of `skills-sync-checker.ts` is course-coupled.
- **Decision**: FIXED. Blind spot closed: the checker engine (536 lines) has 7 course tokens, all prose; coupling is factored into `skills-sync-config.ts` (268 lines, 21 hits), which stays behind. Phase 2 §3 now carries a **Porting seed** block naming all four modules with file:line, two amendments: (1) `public-skills-parity.ts` is a fork not a move (Lumina keeps its narrowed copy per F3); (2) the atomic writer needs bounded `EBUSY`/`EPERM` retry + negative test before Windows bulk installs. Phase 1 §1 seeds the mirror comparator from the same modules; Phase 8 §4 now states the checker removal is a move, not a loss.

### F6 — Cutover pointer sweep is deferred to a grep, not enumerated

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 8 §3 and §6
- **Detail**: `context/foundation/lessons.md` is explicit — enumerate the full pointer set IN THE PLAN
  as a checklist "so completeness is verifiable rather than remembered" — and records this repo
  reproducing that drift twice. Phase 8 §6 instead defers to an implementation-time grep whose term
  list is weak (`count` matches everything; `mirror`, `sync.mjs`, `check:skills`, `agent-env-setup`
  are missing), and §3 names only `AGENTS.md`, `agent-env-setup.md` and the package README. Live
  pointers found but not named in the plan:
  - `.gitignore:47-48, 53-54, 58-60` (comment block instructing mirror restore) plus the 16 negation
    lines at `:62-69` and `:71-78`
  - `context/foundation/agent-env-setup.md` (26 hits)
  - `AGENTS.md` (8 hits, incl. the "three describe one set" paragraph)
  - `context/team/opportunity-map.md:13, 26, 50`
  - `context/team/mom-test-validation.md:5, 9, 10, 42, 88`
  - `context/foundation/github-issues.md:160`
  - `packages/code-reviewer/src/prompts.ts:147`, `schemas.ts:325`, `prompts.test.ts:262, 300` — cite
    `10x-impl-review-ci/references/impl-review-instructions.md` by line
  - `package.json:23` — the `check:skills` script
- **Fix**: Replace the grep instruction in Phase 8 §6 with this enumerated checklist, keeping the grep
  as the completeness backstop.
- **Decision**: FIXED, with corrections to the finding's own list. Dropped: `context/team/mom-test-validation.md` (an incident record + interview question — evidence, not instruction) and `context/team/opportunity-map.md` (zero hits); `github-issues.md:160` → append a status row, never edit the creation entry. Not added: `test-plan.md` / `review-pipeline-verification.md` ("mirror" there is test terminology; re-verified, no real pointers) and `workflow-template.yml:22` (names upstream's `@przeprogramowani/10x-toolkit`, and the file moves to managed). Promoted to Phase 8 §3 as decisions: pin `packages/code-reviewer` citations to the released artifact + heading (line numbers rot across the repo boundary); rewrite `AGENTS.md:110` "powers the public CI reviewer"; `10x-impl-review-ci` is managed per F3 unless the maintainer keeps it public (then `consumer-owned`). §6 now carries the rule "live instructions, not historical records" with `context/team/` protected like `context/archive/`; SC 8.4 reworded.

### F7 — Gitignoring package-owned paths drops them from ESLint only

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 8 §1 ("Ignore ... installed package-owned artifacts")
- **Detail**: The three gates disagree about gitignored-but-present files.
  `eslint.config.js:95` `includeIgnoreFile(gitignorePath)` derives ignores from `.gitignore`, so the
  path silently leaves the lint graph. `tsconfig.json:3` `include:["**/*"]` with no `scripts`
  exclusion means tsc still typechecks it, so a type error in package-owned code fails the
  maintainer's `npm run typecheck` and `.husky/pre-push`. `.prettierignore` covers only `.claude/`,
  `.agents/`, `context/archive/`, so `format:check` still checks it — verified: prettier 3.9.6 reads
  the gitignored `scripts/local/**` today. Net: package-owned bytes are typechecked and
  format-checked only on machines that installed the package, never on CI — and package-owned
  formatting that differs from Lumina's Prettier config turns a repo-wide CI gate red with no local
  fix. Relevant only if F1 resolves toward Fix B.
- **Fix**: Have Phase 8 §1 name `.prettierignore` alongside `.gitignore`, and state whether
  package-owned sources must satisfy Lumina's Prettier config.
- **Decision**: DISMISSED — premise wrong. Prettier ≥ 3 ignores `.gitignore`d paths by default; measured on 3.9.6 with a planted misformatted file (root → warn; `scripts/local/` → clean; `.claude/` → clean). The finding's "verified: prettier reads gitignored scripts/local/**" misread the "All matched files use Prettier code style!" message, which prints even when every match is ignored. Only `tsconfig` ignores `.gitignore`, irrelevant for JSON/Markdown in `.ai-toolkit/`. No `.prettierignore` edit (AGENTS.md keeps it narrow). Kept as prose: Phase 8 §1 now states the invariant so nobody "fixes" it later.
