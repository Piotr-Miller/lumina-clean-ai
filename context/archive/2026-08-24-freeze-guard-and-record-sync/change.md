# Enforce the campaign freeze, and correct three stale roadmap records

**Status:** ready
**Opened:** 2026-08-24

Two independent pieces of measurement hygiene, both surfaced while closing out
the R5 revert (#178). Neither changes production behaviour.

## 1. The grader records the freeze but never checks it

`fabrication-grade.mjs` computed the ground truth's sha256 and wrote it into
the graded output — and stopped there. A hash written down next to the thing
it hashes always matches, so it proved nothing.

That is how the irregular arm was graded against the wrong file. Its
`verification.md` pinned `f423d87f…`; the grader read `b6bddc46…`. The ground
truth was produced by scripted text replacement, and the **pre-commit prettier
hook reformatted it after the hash was taken**, so the frozen input and the
graded input were different files. Nothing failed. It surfaced only during a
hand-read, after the arm had been paid for — and the mitigation applied at the
time (run prettier first, confirm the hash is stable, then pin) was a _manual
procedure_, which the next person has to remember.

`assertGroundTruthFrozen` reads the pin back out of the change's own
`verification.md` and compares it **before the first paid grader call**. It is
deliberately not derived from the file on disk: the whole point is that the two
values come from different places and have to agree.

Failure modes it refuses on:

- **drifted file** — names both hashes, names prettier as the usual cause, and
  states that any paid run already graded against the old pin is void, so
  nobody quietly re-pins to the current value and carries on
- **unpinned ground truth** — no sha256 row for the variant is a hard failure,
  not a silent pass; an unpinned ground truth cannot be _shown_ to have
  survived the hooks

Five tests, using the real archived pin. One pins the sharp edge: the `.diff`
row sits directly above the `.md` row with a different hash, and a loose
pattern would happily match the neighbour and pass a drifted file.

## 2. Three roadmap records describe work that is done or premises that are false

Acting on a stale recorded plan has already cost this repo twice — issue #15's
archived diagnosis named one dep when four were needed, and FR-015's recorded
fix was unworkable. Both were discovered only by re-deriving the problem from
scratch. These three were verified against the code today:

| Record                              | Was                                               | Now                                                                                |
| ----------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Parked: cross-device password reset | live bug + `generateLink` fix                     | Resolved; the parked plan is flagged **unworkable** and the premise **overturned** |
| S-06 Backlog Handoff sub-bullet     | same bug, "Owner: TBD"                            | done, pointing at the corrected entry                                              |
| `replicate-burst-backoff`           | "Known gap: the retry path has no automated test" | closed — ten Deno tests, `deno test` in the `ci` job                               |

The cross-device correction matters most. PR #172 _did_ correct the record —
but only inside `context/archive/2026-08-24-cross-device-password-reset/`,
while `roadmap.md` is the file anyone actually consults for what is left to do.
It still prescribed admin `generateLink({ type: "recovery" })` and asserted the
prerequisite was met because "custom SMTP/Resend is live on prod" — but that is
_Supabase's_ sender; the app has no transactional sender of its own, so the
plan could never have worked. The shipped fix was different (`@supabase/ssr`
hardcodes `flowType: "pkce"`, so the send leg moved to plain `supabase-js` on
the implicit flow), and the bug it claimed to fix **does not reproduce**: the
smoke's control arm verified a _pre-fix_ `pkce_` token cross-device and got a
session back.

## Verification

- [x] `packages/code-reviewer` — lint, typecheck, 601 tests (5 new)
- [x] app gates — typecheck, lint, `test:unit` (28 files / 345 tests)
- [x] each roadmap correction checked against the code, not memory:
      `replicate-create.test.ts` exists with the ten named tests;
      `password-reset-client.options.ts` exists; PR #172's diff confirmed to
      touch the archive and **not** `roadmap.md`; issue #7 already closed, so
      `github-issues.md` needs no sync

---

**Archived 2026-08-24.** Shipped in PR #180.
