# finder-sonnet-effort — blind hand-read, PR #247 — d097949…dec09f8

> Plan Phase 4 §1. Every published finding of every valid run on this PR, deduplicated into rows **without the
> arm or run that produced it**. Row membership lives only in `hand-read-key.json`; do not open it until every row
> in both hand-read files is classified. Variants are listed in arbitrary order. The head worktree is
> `~/.cache/finder-sonnet-gate/wt-247`.
>
> **Rule (gate.md § Pre-registration §4):** the owner classifies every row `accepted` or `rejected`, with a
> one-sentence reason. A run passes only with **zero rejected** findings; unresolved counts as rejected. **#247:** a run with no findings passes.

**Dedup rule used:** findings merge into one row only when they make the same claim about the same code. A
claim repeated for a second file, or a broader claim that contains a narrower one, stays a separate row.

**Status:** dedup **approved by the owner** (2026-10-07, before any classification); agent pre-sort added (plan Phase 4 §1 step 3); classification **complete by the agent at the owner’s request** (2026-10-07), before opening the key.

**Classification authority:** The owner instructed the agent to perform the classifications (“Zrob to”). These are delegated agent decisions, not a claim that the owner personally hand-read each row as the sealed protocol prescribes; the seal is unchanged.

## R247-01 — Downloaded production photos: no retention/deletion guidance

- **Variant a** (nit, documentation, `scripts/prod-fetch-results.py:1–20`): The script downloads real, possibly PII-containing production user photos to a local temp directory by default; the safety contract documents what not to do with them (don't move into licensed test-photos) but doesn't mention retention/deletion guidance for the downloaded files themselves.
  _Suggestion:_ Add a note recommending the operator delete OUT_DIR after inspection, since these are live user photos.

- **Agent pre-sort against the head** (a proposal, not a classification): **Accurate.** `prod-fetch-results.py:16-17` says only that the photos land outside the repo and must not go into `test-photos/licensed/`; nothing says when to delete them. (The predecessor's owner classified the same claim real: finder-sonnet `hand-read-247.md` R1.)
- **Classification:** **accepted** — reason: The safety contract covers publication but gives no retention or deletion guidance for downloaded production user photos.

## R247-02 — No automated tests for either new script's pure logic

- **Variant a** (nit, testing, `scripts/prod-fetch-results.py:1–93`): Both new scripts talk to production with the service-role key and perform non-trivial parsing/logic (binary header parsing, signed-URL flow), but neither has any automated test (e.g. unit-testing the dimensions() parser against known-good/bad byte sequences, or the validation guard clauses).
  _Suggestion:_ Add minimal unit tests for the pure logic (placeholder/key validation, dimensions() parsing) that don't require network access, to protect against regressions in these safety checks.

- **Agent pre-sort against the head** (a proposal, not a classification): **Accurate absence; its value is a judgement call.** Neither script has a test. The repository has no Python test harness at all: vitest runs `tests/**/*.test.ts` only, and the one other Python script, `scripts/gen_auto_params_fixtures.py`, is untested too. Both scripts are read-only diagnostics run by hand.
- **Classification:** **accepted** — reason: The key-validation guards and binary parser have meaningful failure cases that can be tested without production access, and the absence of a Python harness does not remove that coverage gap.

## R247-03 — Hardcoded production project ref as default URL (prod-fetch-results.py)

- **Variant a** (minor, security, `scripts/prod-fetch-results.py:27`): The production Supabase project ref (tebdkqpgjjypdethpezo) is hardcoded as the default URL and committed to the repo. While not a secret by itself, baking a specific production project identifier into version-controlled source needlessly exposes internal infrastructure details in git history.
  _Suggestion:_ Require SUPABASE_URL to be passed explicitly (or read from a local, gitignored config) rather than hardcoding the prod project ref as a fallback default.
- **Variant b** (minor, security, `scripts/prod-fetch-results.py:27`): The production project URL (tebdkqpgjjypdethpezo.supabase.co) is hardcoded as the default in a script committed to the repo, duplicated in both new files. While not a secret by itself, baking the real production project ref into source control makes it easy to run destructive/exfiltration-capable tooling against prod by accident (e.g. copy-pasted elsewhere) and increases the attack surface if the repo is ever public.
  _Suggestion:_ Require SUPABASE_URL to be passed explicitly (or source it from a gitignored local config) rather than defaulting to the real production ref in committed code.

- **Agent pre-sort against the head** (a proposal, not a classification): **Fact accurate, risk overstated.** The default is at `:34` (cited `:27`), and it is deliberate (`:48`: "the default is luminaclean-prod"). The ref is not a secret: it was already in 15 committed files at the base `d097949` of this public repository. Running either script still needs the service-role key, and neither writes.
- **Classification:** **rejected** — reason: The documented production default is a public, non-secret project identifier in read-only tooling that still requires an operator-supplied secret, so the claimed new security exposure is not established.

## R247-04 — OUT_DIR defaults to the shared system temp directory

- **Variant a** (minor, security, `scripts/prod-fetch-results.py:33`): OUT_DIR defaults to the shared system temp directory (tempfile.gettempdir()), which is often world-readable on multi-user systems. Downloaded production customer photos (explicitly noted as having no stated licence) could be readable by other local users.
  _Suggestion:_ Default to a directory under the user's home (e.g. ~/.cache/lumina-prod-results) with restrictive permissions, or create the temp dir with mode 0700.

- **Agent pre-sort against the head** (a proposal, not a classification): **Accurate as a conditional.** `:38` defaults to `tempfile.gettempdir()`, and `os.makedirs` (`:74`) and `open(dest, "wb")` (`:85`) use default modes, so under a 022 umask on a shared Linux or macOS host other local users can read the photos. On Windows the temp directory is per user.
- **Classification:** **accepted** — reason: Default directory and file permissions can expose downloaded customer photos to other local users on a shared host with a 022 umask.

## R247-05 — Placeholder check prints the first 24 characters of the service-role key (prod-fetch-results.py)

- **Variant a** (major, security, `scripts/prod-fetch-results.py:41–42`): On a placeholder-detection failure the script prints `KEY[:24] + "..."` which is 24 real characters of the service-role secret straight to stderr/terminal/logs. This directly contradicts the file's own safety contract ("never stored, logged or printed") and the project rule that secrets must never appear in logs.
  _Suggestion:_ Redact entirely (e.g. print only whether it looks like a placeholder) instead of echoing any slice of the actual key value.

- **Agent pre-sort against the head** (a proposal, not a classification): **Accurate only in a narrow case; severity overstated.** The branch (`:52-54`) fires only when the key contains `<` or `>`. With the bare placeholder, the 24 characters printed are placeholder text. Only a real key pasted inside the angle brackets leaks: for a legacy JWT key that is the base64 header `eyJhbGciOi…`, the same for every Supabase JWT; for an `sb_secret_` key it is about 13 secret characters. It does contradict the file's own "never … printed" contract (`:14-15`).
- **Classification:** **accepted** — reason: A real sb_secret_ key pasted inside angle brackets exposes secret characters through KEY[:24], violating the stated no-print contract, although the major severity overstates the narrow trigger.

## R247-06 — No per-job error handling in the main loop

- **Variant a** (minor, correctness, `scripts/prod-fetch-results.py:63–80`): The main loop has no per-job error handling: a failed sign-URL call or a download timeout for one job aborts the entire script, losing results for jobs already processed in that run's message (though files already written remain).
  _Suggestion:_ Catch urllib.error per-job and continue, reporting the failure in the final summary alongside 'missing'.

- **Agent pre-sort against the head** (a proposal, not a classification): **Accurate, low impact.** The sign call and the download (`:80-83`) are outside any `try`, so one HTTP or network error ends the script with a traceback before the remaining jobs and the summary (`:90-93`). Files already saved stay, as the finding says. The default run fetches three jobs.
- **Classification:** **accepted** — reason: An unhandled signing or download error aborts the remaining jobs and final summary while leaving earlier downloads on disk.

## R247-07 — Unguarded signed['signedURL'] access raises a raw KeyError (prod-fetch-results.py)

- **Variant a** (minor, correctness, `scripts/prod-fetch-results.py:68`): If the sign API call returns an error payload instead of {'signedURL': ...} (e.g. object missing, auth issue), accessing signed['signedURL'] raises an unhandled KeyError with a raw traceback instead of the script's friendly die() pattern used elsewhere.
  _Suggestion:_ Wrap the sign call / key access and surface failures via die() with a clear message, consistent with the rest of the script's error handling.

- **Agent pre-sort against the head** (a proposal, not a classification): **Mechanism inaccurate.** A storage sign error (missing object, bad auth) comes back non-2xx, so `urllib` raises `HTTPError` inside `api()` (`:63`) before `signed['signedURL']` (`:81`) is read; a `KeyError` needs a 2xx body without `signedURL`. The consequence it names, a raw traceback instead of `die()`, is real, but through `HTTPError`, which is R247-06's claim.
- **Classification:** **rejected** — reason: The cited storage error responses raise HTTPError inside api() before signedURL is accessed, so they do not cause the claimed KeyError.

## R247-08 — Date-only filenames let two jobs on the same day overwrite each other

- **Variant a** (minor, correctness, `scripts/prod-fetch-results.py:76–78`): `dest` filenames are built from `created_at[:10]` (date only); if two selected jobs share the same date, the second download silently overwrites the first's saved file with no warning.
  _Suggestion:_ Include more of the id or full timestamp in the filename to avoid collisions.

- **Agent pre-sort against the head** (a proposal, not a classification): **Inaccurate.** The filename at `:84` is `{short}-{date}.png`, where `short` is the job id's first 8 characters, so two different jobs on the same day get different names. A collision needs two wanted jobs with the same 8-character id prefix.
- **Classification:** **rejected** — reason: The filename includes the eight-character job-id prefix as well as the date, so sharing a date alone cannot cause the claimed overwrite.

## R247-09 — 'missing' check derived from the OUT_DIR listing can be wrong with stale files

- **Variant a** (nit, correctness, `scripts/prod-fetch-results.py:87`): The 'missing' check scans OUT_DIR for any existing file starting with the job prefix, which can produce false negatives if stale files from a previous run are present, or false positives if OUT_DIR is reused across unrelated invocations.
  _Suggestion:_ Track which prefixes were actually fetched during this run (e.g. a list of matched prefixes) instead of re-deriving it from directory listing.

- **Agent pre-sort against the head** (a proposal, not a classification): **Accurate.** `:90` decides "missing" from `os.listdir(OUT)`, so a file left by an earlier run hides a job this run did not find. (The predecessor's pre-sort noted the same defect as "true but not claimed".)
- **Classification:** **accepted** — reason: The missing-job check scans existing OUT_DIR files, allowing a stale download to hide a job not found during the current run.

## R247-10 — No unit test for the dimensions() header parser

- **Variant a** (nit, testing, `scripts/prod-result-dimensions.py:1–141`): No automated tests cover the PNG/JPEG header-parsing logic (dimensions()), which is the core logic of this diagnostic and could silently misreport on edge-case JPEGs (e.g. APP markers with odd lengths).
  _Suggestion:_ Add a small unit test feeding known PNG/JPEG byte headers to dimensions() to pin expected (w,h,kind) output.

- **Agent pre-sort against the head** (a proposal, not a classification): **Accurate absence; its value is a judgement call.** The facts of R247-02, narrowed to `dimensions()` (`:79-98`). The parser's JPEG path is protected by its loop guard (see R247-13).
- **Classification:** **accepted** — reason: Synthetic PNG and JPEG boundary fixtures would protect the parser’s reported dimensions and unreadable behavior, including the reproduced short-PNG failure, without network access.

## R247-11 — Hardcoded production project ref as default URL (prod-result-dimensions.py)

- **Variant a** (minor, security, `scripts/prod-result-dimensions.py:23`): Same hardcoded production project ref issue as in prod-fetch-results.py.
  _Suggestion:_ Avoid embedding the production project ref directly in committed source; source it from an untracked local file or require it as a mandatory argument.

- **Agent pre-sort against the head** (a proposal, not a classification): **Fact accurate, risk overstated.** As R247-03. Here the default is at `:39` and is documented as deliberate at `:26-27` and `:38`.
- **Classification:** **rejected** — reason: The documented production default is the same public, non-secret identifier as R247-03 and does not establish the claimed security defect.

## R247-12 — Placeholder check prints the first 24 characters of the service-role key (prod-result-dimensions.py)

- **Variant a** (major, security, `scripts/prod-result-dimensions.py:46–47`): Same issue as in prod-fetch-results.py: the placeholder check prints `KEY[:24] + "..."`, exposing a real fragment of the service-role key in output/logs, contradicting the script's stated safety contract.
  _Suggestion:_ Avoid printing any substring of the real key; report only a boolean/length-based diagnostic.

- **Agent pre-sort against the head** (a proposal, not a classification): **Accurate only in a narrow case; severity overstated.** The same branch as R247-05, at `:56-58`. This file's later key-shape check (`:64-67`) prints only the length and the dot count.
- **Classification:** **accepted** — reason: The same angle-bracket-wrapped sb_secret_ key case as R247-05 prints secret characters despite this script’s no-print contract, with overstated severity.

## R247-13-PNG — Short PNG header raises an uncaught struct.error

- **Variant a** (minor, correctness, `scripts/prod-result-dimensions.py:65–84`): dimensions() assumes the ranged response contains enough bytes for struct.unpack (e.g. raw[16:24] for the PNG IHDR). If a stored object is smaller than the requested range or the server returns a short/empty body for any reason, struct.unpack will raise struct.error, which is not caught anywhere in the loop (only urllib.error.URLError is handled), aborting the entire census instead of marking that one row 'unreadable'.
  _Suggestion:_ Wrap the dimensions() call (or the unpacking inside it) in a try/except that treats malformed/short headers the same as the existing 'header not recognised' branch, so one bad object doesn't kill the whole run.

- **Split before key reveal (2026-10-07):** Variant a of the original R247-13; b and c remain in R247-13 because they make a different, JPEG-specific claim.
- **Classification:** **accepted** — reason: A response beginning with the PNG signature but shorter than 24 bytes raises an uncaught struct.error at raw[16:24] and aborts the census; an empty body alone does not.

## R247-13 — JPEG parse errors on truncated/malformed headers abort the census (variants b and c)

- **Variant b** (minor, correctness, `scripts/prod-result-dimensions.py:79–92`): The hand-rolled JPEG segment walker can run off the end of the truncated 2048-byte buffer when a segment length field points past the available bytes (struct.unpack on a short/missing slice raises), and this exception isn't caught, which will crash the whole census run on one malformed/truncated JPEG header.
  _Suggestion:_ Wrap dimensions() parsing in a try/except to classify unparsable headers as 'unreadable' instead of raising unhandled exceptions.
- **Variant c** (minor, correctness, `scripts/prod-result-dimensions.py:90–108`): The JPEG marker parser can raise an unhandled struct.error/IndexError on malformed or truncated ranged responses (e.g. if the 2KB slice ends mid-segment), since only urllib.error.URLError is caught around the request, not parsing. A truncated download that happens to throw an exception inside dimensions() would crash the whole census run instead of being reported as 'unreadable'.
  _Suggestion:_ Wrap the dimensions() call in a try/except (struct.error, IndexError) and treat failures as 'unreadable' like the network-error path.

- **Split before key reveal (2026-10-07):** Variant a is classified separately in R247-13-PNG; the original pre-sort below is retained for the audit trail.

- **Agent pre-sort against the head** (a proposal, not a classification): **Mostly inaccurate, and the variants differ.** For JPEG, the loop guard `while i < len(raw) - 9` (`:86`) keeps both unpack slices (`:92`, `:97`) full length, so a segment length pointing past the 2,048 bytes ends the loop and returns `None`, which prints "header not recognised" (`:125-127`) instead of crashing. Variants b and c, about the JPEG walker, are contradicted by the code. Variant a is accurate only for a body that starts with the PNG signature and is shorter than 24 bytes (`:82`). It is true that `dimensions()` at `:124` is outside the `try`. (The predecessor's owner rejected the same JPEG claim: finder-sonnet R4.) If you would classify variant a differently from b and c, the row has to be split first; say so.
- **Classification:** **rejected** — reason: The JPEG loop guard keeps the index and unpack slices within the response, and truncated or oversized segments terminate with None rather than the claimed parsing exception.

## R247-14 — Unguarded signed['signedURL'] access raises a raw KeyError (prod-result-dimensions.py)

- **Variant a** (minor, correctness, `scripts/prod-result-dimensions.py:100`): Same unguarded dict access pattern: signed['signedURL'] will throw an unhandled KeyError if the storage sign endpoint returns an error object instead of a signed URL, breaking the otherwise careful error-handling style of this diagnostic.
  _Suggestion:_ Check for an 'error' key or missing 'signedURL' and report via die() or a per-row 'unreadable' verdict instead of letting the exception propagate.

- **Agent pre-sort against the head** (a proposal, not a classification): **Mechanism inaccurate; the consequence happens another way.** As R247-07: a sign error is an `HTTPError` raised in `api()` before `signed['signedURL']` (`:115`) is read. That sign call (`:114`) is outside the `try` (`:116-123`), so an HTTP error there does end the census. That is a real defect, and the finding does not name it.
- **Classification:** **rejected** — reason: The actual signing failure is an HTTPError before dictionary access, so the real census abort does not validate this finding’s claimed error-payload-to-KeyError mechanism.

## Per-run results after key reveal (2026-10-07)

All row classifications, including the R247-13 split, were written before opening the key. These results are derived from the delegated agent classifications above; they do not assert completion of the sealed owner-personal classification step.

| Run             | Published | Accepted | Rejected rows                      | D2           | Result |
| --------------- | --------: | -------: | ---------------------------------- | ------------ | ------ |
| `low-247-r1`    |         4 |        2 | R247-08, R247-13                   | not required | FAIL   |
| `low-247-r2`    |         4 |        3 | R247-13                            | not required | FAIL   |
| `medium-247-r1` |         3 |        2 | R247-03                            | not required | FAIL   |
| `medium-247-r2` |         6 |        2 | R247-03, R247-07, R247-11, R247-14 | not required | FAIL   |

Coverage verified against all eight cached `review.json` files: 32 published findings, each mapped exactly once across 26 classified rows (25 original rows plus the pre-reveal PNG/JPEG split). No D2 match was added.

**Owner decision (2026-10-07; corrected 2026-10-09):** these #247 results are **information**. The owner did not
adopt the delegated classifications, so every #247 finding is unresolved, which the sealed rule counts as rejected:
hand-read #247 fails for both arms by rule (`gate.md` § Verdict). Plan step 4.4 cannot be completed blind and stays
open.
