# e2e Flake Evidence Closure Implementation Plan

## Overview

Close the e2e-flake change the way the frame reframed it: record that the boot flake (signature 1)
and the install timeout (signature 2) are resolved, and make the one live flake — the seed sign-in
POST returning non-2xx (signature 3) — carry diagnosable evidence at its next occurrence. No fixes,
no retries, no timeout changes: signature 3's cause is deliberately left undetermined until the
evidence names its layer.

## Current State Analysis

From `frame.md` (authoritative — investigation already done):

- **Sig 1 resolved**: blank `[WebServer] ✘ [ERROR]` = wrangler ProxyWorker crash (stack:
  `castErrorCause → emitErrorEvent → onProxyWorkerMessage`), wrangler 4.118.0 via `^4.98.0` caret
  drift. #152 collected the log; #153 pinned `4.113.0`; 11/12 runs green since. Upstream
  `cloudflare/workers-sdk#14926` is OPEN and 4.124.0 still reproduces (2026-08-20).
- **Sig 2 resolved**: `--with-deps` dropped in #152 per change.md's own diagnosis.
- **Sig 3 live and unfalsifiable**: `seed.spec.ts:138` `expect(signIn.ok()).toBe(true)` discards
  status/body; the run's trace.zip was generated (`trace: "on-first-retry"`) but never uploaded —
  the artifact path lists `playwright-report/` (which doesn't exist: no `reporter` configured, CI
  default is `list`) and `wrangler-logs/`, not `test-results/`.
- **change.md is stale**: still records sig 1 as "cause unknown".
- Six bare `.ok()` asserts share the discard pattern: `seed.spec.ts:138`, `auth.setup.ts:42`,
  `anon-dashboard-redirects-to-signin.spec.ts:100`, `chroma-postpass-on.spec.ts:110`,
  `cloud-stall-surfaces-timeout.spec.ts:128`, `north-star-cloud-result.spec.ts:153`.

## Desired End State

- `change.md` accurately records all three signatures' status; `lessons.md` carries the wrangler
  unpin criterion under a greppable heading.
- Any failure of the six response asserts leaves **retained, layer-narrowing evidence**: status +
  final URL + a bounded body snippet in the failure message, and traces in an uploaded artifact —
  **including when a retry heals the run** (a flaky-green job still uploads the first attempt's
  trace). Not promised: guaranteed diagnosis — if the evidence is still layer-ambiguous, the
  declined middleware request log is the pre-identified escalation.
- Verify: the PR's own `e2e` job passes with the helper in place, and a hermetic Vitest test proves
  the failure-message path (format, truncation, fallback) deterministically.

### Key Discoveries:

- The trace that would have answered sig 3 already existed and was discarded — capture, not
  diagnosis, is the gap (`.github/workflows/ci.yml:349-357`).
- `playwright.config.ts` has no `reporter` key, so the artifact's `playwright-report/` path has
  been dead since it was written.
- `tests/e2e/helpers/` is the established home for documented single-purpose e2e modules.

## What We're NOT Doing

- No retry, backoff, or timeout change anywhere (change.md's own "Do NOT", reaffirmed by frame).
- No middleware request log — declined in planning; revisit only if the next occurrence's evidence
  is still layer-ambiguous.
- No wrangler bump or unpin — criterion recorded instead (upstream #14926 still open).
- No fix or hypothesis-chasing for sig 3 — the plan's whole point is that the next occurrence
  names its layer first.
- No behavior change to any assertion: same conditions asserted, only failure _output_ changes.

## Implementation Approach

Two phases: prose first (record what is known while it is fresh), then the capture mechanics. Each
is independently landable; both are small.

## Critical Implementation Details

- **One-line failure messages.** GitHub Actions renders the expect message in annotations and the
  console; the helper must collapse body newlines/whitespace and bound the snippet (~300 chars) so
  a failure stays one readable line.
- **Build diagnostics lazily — success bodies are secret-bearing.** A successful create-job
  response body carries a signed upload URL + token (`photo-job.service.ts`). The helper must read
  the body and build the custom message ONLY after `ok()` is false; on success it asserts with no
  custom message, so no payload ever enters step titles or the HTML report (review F-lazy).
- **Retry-healed flakes are the evidence-loss case.** `retries: 1` in CI + `trace: "on-first-retry"`
  - `if: failure()` upload means a fail-then-pass run is green, uploads nothing, and the trace that
    does exist covers the retry, not the failure. `trace: "retain-on-failure"` + a flaky-evidence
    upload step close this (review F2). A transport-level throw (no response object) bypasses the
    helper entirely — the retained first-attempt trace is what captures that mode.
- **Artifact size stays bounded.** Traces are retained only for failed attempts; the flaky-upload
  step uses `if-no-files-found: ignore`, so clean green runs upload nothing; `retention-days: 7`.

## Phase 1: Record the resolved signatures

### Overview

Bring the written record in line with what the frame established, and give the unpin criterion a
durable home outside this change's future archive.

### Changes Required:

#### 1. Change history

**File**: `context/changes/e2e-webserver-boot-flake/change.md`

**Intent**: Append a dated resolution section: sig 1 cause + fix (#152 evidence → #153 pin,
upstream #14926 open, 4.124.0 still reproducing as of 2026-08-20, inspector-9229 lead ruled out,
11/12 green since), sig 2 confirmed fixed, sig 3 documented as the live signature with its
evidence gap (run 32341863646, `seed.spec.ts:138`). Point to `frame.md` for the full workings.

**Contract**: New `##`-level dated section appended after the existing 2026-08-19 entries; existing
text stays untouched (it is the honest history of what was believed when).

#### 2. Unpin criterion lesson

**File**: `context/foundation/lessons.md`

**Intent**: New lesson recording why wrangler is pinned at exactly `4.113.0` and when it may move:
a confirmed upstream fix in `cloudflare/workers-sdk#14926` followed by a controlled CI probe on the
fixed version — never a blind bump, never silent fossilization.

**Contract**: One `##` heading in the file's established style, containing the words "wrangler" and
"#14926" so both search routes find it; 3-6 sentence body, generalizing to: a dependency pinned to
escape a regression needs a recorded unpin criterion. The probe is defined concretely (review):
after #14926 closes with a fix released in a wrangler version, bump ONLY the pin on a scratch
branch and drive **≥ 20 consecutive green `e2e` runs** on it before the pin moves on master —
pre-pin, the crash struck ~4 times in ~30 runs, so a handful of green runs is weak evidence; record
the probe run URLs in the bump PR.

### Success Criteria:

#### Automated Verification:

- Touched markdown is format-clean (review F5 — `npm run lint` is eslint-only and does not cover
  md): `npx prettier --check context/changes/e2e-webserver-boot-flake/change.md context/foundation/lessons.md`

#### Manual Verification:

- change.md reads as accurate history against frame.md (no claim beyond the evidence)
- Searching lessons.md for "wrangler" (rg / editor search) lands on the new lesson

---

## Phase 2: Make the next occurrence readable

### Overview

The capture mechanics: enriched assert messages at all six call sites, traces in the failure
artifact, a real HTML report.

### Changes Required:

#### 1. Response-assert helper

**File**: `tests/e2e/helpers/expect-response.ts` (new)

**Intent**: One helper asserting an `APIResponse` is ok, whose failure message carries the label,
status, final URL, and a bounded single-line body snippet — so a CI failure names its layer
(403 CSRF vs 500 app vs proxy-shaped emptiness) without downloading anything.

**Contract**: `expectOkResponse(response: OkReadable, label: string): Promise<void>` where
`OkReadable = Pick<APIResponse, "ok" | "status" | "url" | "text">` — structural, because three call
sites receive a browser `Response` from `page.waitForResponse()`, not an `APIResponse` (review F1;
both types satisfy the pick). **Lazy**: when `ok()` is true, assert with NO custom message and read
no body; only on `ok() === false` read the body, collapse to one line, cap (~300 chars), fall back
to a placeholder if `text()` rejects, and assert via `expect(ok, message).toBe(false→fails)`. The
message-formatting core is a pure exported function so the Vitest test (change #5) can cover it.
Header comment in the tree's documented-helper style, citing the sig-3 evidence gap.

#### 2. Call-site adoption

**Files**: `tests/e2e/seed.spec.ts:138`, `tests/e2e/auth.setup.ts:42`,
`tests/e2e/anon-dashboard-redirects-to-signin.spec.ts:100`,
`tests/e2e/chroma-postpass-on.spec.ts:110`, `tests/e2e/cloud-stall-surfaces-timeout.spec.ts:128`,
`tests/e2e/north-star-cloud-result.spec.ts:153`

**Intent**: Replace each bare `expect(x.ok()).toBe(true)` with the helper, with a label naming the
operation ("signin", "create-job", …). Assertion semantics unchanged — `seed.spec.ts:139`'s
strict pathname assert stays as-is.

**Contract**: Mechanical substitution; no other lines move.

#### 3. Reporter + trace retention

**File**: `playwright.config.ts`

**Intent**: Add an explicit reporter so `playwright-report/` actually exists for the artifact the
CI job has always tried to upload, and switch trace mode so the FIRST failing attempt is retained
(today's `on-first-retry` records only the retry — the original failure has no trace).

**Contract**: `reporter: [[process.env.CI ? "dot" : "list"], ["html", { open: "never" }]]` — the
CI default is `dot`, not `list` (review F4), so this preserves current console output in both
environments; `trace: "retain-on-failure"` replaces `"on-first-retry"` (records every attempt,
keeps only failed ones — so a flaky first attempt's trace survives its passing retry).

#### 4. Failure artifact completeness — including retry-healed flakes

**File**: `.github/workflows/ci.yml` (e2e job, "Upload Playwright report" step, ~line 354)

**Intent**: Traces and error-context files must survive the runner on red runs AND on flaky-green
runs (fail → retry-pass), which today upload nothing at all (review F2, Fix A).

**Contract**: Two steps. (a) The existing `if: failure()` step gains `test-results/` in its path
list. (b) A new sibling step, `if: success()`, uploads ONLY `test-results/` with
`if-no-files-found: ignore` and a distinct artifact name (e.g. `playwright-flaky-evidence`) — on a
clean green run `test-results/` holds no retained traces, so nothing is uploaded; on a flaky run
the first attempt's trace lands. Same `retention-days: 7`.

#### 5. Failure-path unit test

**File**: `tests/expect-response-format.test.ts` (new — `tests/*.test.ts` is Vitest's territory,
precedent `tests/jobs.rls.test.ts`)

**Intent**: The helper's central deliverable is its failure output, which a green e2e run never
exercises (review F3). Cover it hermetically with structural fake responses.

**Contract**: Vitest cases over the exported pure formatter (and the helper with fakes): success
path reads no body and passes no custom message; failure message carries label + status + final
URL; multi-line/whitespace bodies collapse to one line; over-length bodies truncate at the cap;
a rejecting `text()` falls back to the placeholder. No Playwright runtime, no network.

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `npm run typecheck`
- Lint passes: `npm run lint`
- Failure-path unit test green: `npm run test:unit` (covers format, truncation, fallback,
  no-body-read-on-success — review F3)
- The PR's own `e2e` CI job is green (all six call sites still pass with the helper)

#### Manual Verification:

- Code-review check: the helper reads the body and builds a message ONLY after `ok()` is false —
  a signed create-job success body must never enter a step title or report

**Implementation Note**: After completing this phase and all automated verification passes, pause
for manual confirmation before closing the change.

---

## Testing Strategy

### Unit Tests:

- `tests/expect-response-format.test.ts` (change #5): the failure-message path is deterministic
  logic — collapse, truncation, fallback, lazy body read — and a green e2e run never exercises it,
  so Vitest owns it with structural fakes. (The originally sketched wrong-password preview could
  never fire the helper: a failed sign-in redirects and ends HTTP 200 — review F3.)

### Integration Tests:

- The PR's `e2e` job proves the helper's pass path at all six call sites and that no assertion
  semantics changed.

### Manual Testing Steps:

1. Code-review the helper for the lazy-read invariant (success bodies carry signed URLs/tokens).

## References

- Frame brief: `context/changes/e2e-webserver-boot-flake/frame.md` (authoritative investigation)
- Plan review: `context/changes/e2e-webserver-boot-flake/reviews/plan-review.md` (Codex, REVISE —
  F1–F5 all accepted and folded into this revision)
- Evidence-discard sites: `tests/e2e/seed.spec.ts:138` and the five siblings listed above
- Dead artifact path: `.github/workflows/ci.yml:349-357`
- Upstream: `cloudflare/workers-sdk#14926` (open; 4.124.0 reproduction 2026-08-20)
- Precedent for narrow, signature-matched flake handling:
  `context/archive/2026-06-11-jobs-rls-seed-flake/change.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Record the resolved signatures

#### Automated

- [x] 1.1 prettier --check clean on change.md + lessons.md — 8bfbe66

#### Manual

- [x] 1.2 change.md reads as accurate history against frame.md — 8bfbe66
- [x] 1.3 Search for the wrangler lesson lands on the new entry — 8bfbe66

### Phase 2: Make the next occurrence readable

#### Automated

- [x] 2.1 Typecheck passes — 851aed9
- [x] 2.2 Lint passes — 851aed9
- [x] 2.3 Failure-path unit test green (npm run test:unit) — 851aed9
- [ ] 2.4 PR's e2e CI job green with the helper at all six call sites

#### Manual

- [x] 2.5 Code-review check: body read + message built only after ok() is false — 851aed9
