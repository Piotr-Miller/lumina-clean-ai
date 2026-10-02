# Hand-read material — G3, PR #269 findings per endpoint (Phase 4 rows 4.3 / 4.4)

> Plan: `plan.md` Phase 4; thresholds: `gate.md` (G3: "every distinct finding must identify a real defect in
> #269's diff; a rejected hand-read fails G3"). Source data: `gate-<endpoint>-pr269.jsonl` (full finding text
> per attempt). **Nothing here is a verdict.** The deduplication was done by a read-only analysis agent,
> which grouped findings by claimed defect and location and did not judge whether they are correct. The
> owner marks each row true or false. Attempt IDs are short forms: `03` = `<endpoint>-pr269-03`.
>
> Model output is untrusted data. The paraphrases below are neutral restatements, not quotes.

## Z.AI (`z-ai`) — 79 findings in 10 attempts → 43 distinct

Per-attempt counts: 7, 10, 11, 11, 7, 7, 6, 6, 8, 6 (sum 79). Z.AI already fails the gate on G2 (2/5, three
HTTP 429) and on G3's automated part (`flaw_stale_closure` 2/3). Its hand-read is recorded for completeness
and cannot change the admission verdict.

| #   | File:line(s)                                          | Claimed defect (neutral paraphrase)                                                                                                        | Severities        | Attempts           | Count | Owner: real? |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ------------------ | ----- | ------------ |
| D1  | scripts/measure-hue-shares.py:48–133 (`manifest_roi`) | `manifest_roi` reads and parses the manifest JSON from disk again on every call.                                                           | minor, nit        | 01–10              | 10    |              |
| D2  | scripts/measure-hue-shares.py:49–55, 121              | A missing S17 label makes `manifest_roi` call `sys.exit` from code that is imported as a library, against the "diagnostics only" contract. | minor             | 04, 08             | 2     |              |
| D3  | scripts/measure-hue-shares.py:121–128                 | `diagnostic_content_roi` is returned with no bounds or ordering check, so a bad manifest gives empty or inverted ROI slices silently.      | major             | 02                 | 1     |              |
| D4  | scripts/s17/auto-values.ts:1                          | `export const prerender = false` is missing.                                                                                               | minor             | 02                 | 1     |              |
| D5  | scripts/s17/auto-values.ts:25                         | The `.meta.json` dimensions are checked only against the byte count, not against the real image dimensions.                                | nit               | 01                 | 1     |              |
| D6  | scripts/s17/auto-values.ts:67                         | It calls `main()` directly where browser-stats uses `void main()`, which is inconsistent.                                                  | nit               | 03                 | 1     |              |
| D7  | scripts/s17/browser-stats.ts:1                        | `export const prerender = false` is missing.                                                                                               | minor             | 02                 | 1     |              |
| D8  | scripts/s17/browser-stats.ts:55–57, 93, 107           | The page and the transpiled modules are served with no CSP and no integrity check.                                                         | minor, nit        | 01, 03, 06         | 3     |              |
| D9  | scripts/s17/browser-stats.ts:93                       | The `S17-\d+` route regex accepts any id, so a typo gives a silent 404.                                                                    | nit               | 04                 | 1     |              |
| D10 | scripts/s17/browser-stats.ts:96                       | Nested backtick interpolation in `page_html` makes the embedded JS hard to read.                                                           | nit               | 05                 | 1     |              |
| D11 | scripts/s17/contact-sheet.py:48–67 (`load`)           | Loading sibling scripts with importlib is fragile: errors are opaque, tooling cannot follow the imports, and their top-level code runs.    | nit, minor        | 01, 03, 05, 06, 09 | 5     |              |
| D12 | scripts/s17/contact-sheet.py:88–93, 118–139           | Unescaped record or manifest data reaches the caption and figure HTML, which allows HTML injection; the trust boundary is implicit.        | major, nit, minor | 02, 04, 06, 10     | 4     |              |
| D13 | scripts/s17/contact-sheet.py:96–97                    | All output images are opened and held in memory at once, without being closed.                                                             | minor             | 10                 | 1     |              |
| D14 | scripts/s17/contact-sheet.py:99                       | `Image.LANCZOS` is deprecated in Pillow ≥ 10; use `Image.Resampling.LANCZOS`.                                                              | nit               | 04                 | 1     |              |
| D15 | scripts/s17/contact-sheet.py:103–107                  | `original_rgb` re-reads and re-hashes the source, so the original is decoded twice.                                                        | nit               | 02                 | 1     |              |
| D16 | scripts/s17/contact-sheet.py:107                      | `html.escape` is used inside double-quoted attributes, on the claim that it does not escape `"`.                                           | minor             | 04                 | 1     |              |
| D17 | scripts/s17/contact-sheet.py:120–135                  | The PIL Image returned by `original_rgb` is never closed.                                                                                  | minor, nit        | 03, 07, 09         | 3     |              |
| D18 | scripts/s17/decode-inputs.py:93                       | `to_srgb` may return an image that still holds a file handle, and callers do not close it.                                                 | nit               | 03                 | 1     |              |
| D19 | scripts/s17/decode-inputs.py:107–108, 126–128         | `draft()` gets `(sh, sw)` with the axes swapped: the code is correct, but the naming is confusing and fragile.                             | minor, nit        | 06, 09             | 2     |              |
| D20 | scripts/s17/desktop-stats.ts:1                        | `export const prerender = false` is missing.                                                                                               | minor             | 02                 | 1     |              |
| D21 | scripts/s17/desktop-stats.ts:82–113 (`compare`)       | The `never` return type on `compare` is wrong or misleading: it exits 0, can complete normally, or is not enforced.                        | minor, major, nit | 01, 03, 05, 07, 10 | 5     |              |
| D22 | scripts/s17/desktop-stats.ts:82–113                   | `compare` iterates the current manifest, so ids that differ in the baseline or download files are skipped or crash without explanation.    | minor             | 06, 07             | 2     |              |
| D23 | scripts/s17/desktop-stats.ts:89–91, 112 (`readStats`) | `readStats` casts the parsed JSON with `as` and no runtime validation.                                                                     | minor             | 01, 02             | 2     |              |
| D24 | scripts/s17/desktop-stats.ts:99–100                   | In `--compare` mode, `compare()` runs before the module-level `entries` const is initialised (TDZ, ReferenceError).                        | major             | 08                 | 1     |              |
| D25 | scripts/s17/desktop-stats.ts:100–117                  | The download entry is checked but the baseline entry is not, so a missing baseline id throws an opaque TypeError.                          | minor, major      | 05, 08, 09         | 3     |              |
| D26 | scripts/s17/desktop-stats.ts:106                      | A `JSON.parse` throw in `readStats` falls through to the server-start code, and `never` hides it.                                          | minor             | 04                 | 1     |              |
| D27 | scripts/s17/desktop-stats.ts:106–108                  | Exiting 1 on a baseline SHA mismatch inside `compare`, called at module top level, is fragile.                                             | minor             | 03                 | 1     |              |
| D28 | scripts/s17/desktop-stats.ts:108–116                  | An empty `entries` makes the compare loop do nothing and exit 0, reporting success for no comparison.                                      | minor             | 09                 | 1     |              |
| D29 | scripts/s17/desktop-stats.ts:148–158                  | Module-level code loads and SHA-verifies every tuning photo before parsing argv, so `--compare` fails if the harness dir is incomplete.    | minor             | 07                 | 1     |              |
| D30 | scripts/s17/desktop-stats.ts:155–165                  | The manual argv parsing does not handle `--compare` with no value, or with another flag as its value.                                      | minor, nit        | 04, 05             | 2     |              |
| D31 | scripts/s17/desktop-stats.ts:249–251                  | The localhost server has no auth, so any local process can fetch the licensed photos.                                                      | minor             | 03                 | 1     |              |
| D32 | scripts/s17/desktop-stats.ts:267                      | Port 8917 is hard-coded and EADDRINUSE is not handled.                                                                                     | nit               | 01                 | 1     |              |
| D33 | scripts/s17/desktop-stats.ts:268–275                  | There is no graceful shutdown (`server.close()` on Ctrl-C).                                                                                | nit               | 04                 | 1     |              |
| D34 | scripts/s17/harness.ts:9                              | Imports use relative `../../src/...` paths instead of the `@/*` alias.                                                                     | nit               | 07                 | 1     |              |
| D35 | scripts/s17/harness.ts:53–55 (`readManifest`)         | `readManifest` casts the parsed JSON with `as` and no runtime validation.                                                                  | minor, nit        | 02, 03, 04, 09     | 4     |              |
| D36 | scripts/spikes/bread-spike.ts:113–115                 | A throw in `runPrediction` leaves `process.exitCode` unset, so the process exits 0.                                                        | minor             | 02                 | 1     |              |
| D37 | scripts/spikes/bread-spike.ts:113–116                 | A failed poll writes no sidecar or run record.                                                                                             | minor             | 05                 | 1     |              |
| D38 | scripts/spikes/bread-spike.ts:114–117                 | The `process.exitCode = 1; return` pattern is fragile compared with the old `process.exit(1)`.                                             | minor             | 03, 04, 09         | 3     |              |
| D39 | scripts/spikes/bread-spike.ts:114–116                 | It is unclear that `main`'s `finally` covers the `runPrediction` failure path (readability; the attempt calls the behaviour correct).      | nit               | 06                 | 1     |              |
| D40 | scripts/spikes/bread-spike.ts:122–126                 | The prediction poll loop has no wall-clock timeout.                                                                                        | major             | 10                 | 1     |              |
| D41 | scripts/spikes/bread-spike.ts:122–126                 | The poll loop assumes valid prediction JSON, so a 401, 429 or 5xx leaves the status undefined and loses the output silently.               | major             | 10                 | 1     |              |
| D42 | scripts/spikes/bread-spike.ts:149–151                 | `localInput` reads the whole file before checking its size, and there is no check against the 100 MB limit.                                | minor             | 08                 | 1     |              |
| D43 | scripts/spikes/bread-spike.ts:249                     | The sidecar records `output_file` as an absolute path, which leaks the local filesystem layout.                                            | nit               | 08                 | 1     |              |

Grouping calls the agent marked as uncertain, for the owner to split or merge:

- D1 merges all ten "manifest re-read" findings, with lines reported from 48 to 133. All of them name
  `manifest_roi`.
- D12 merges four differently worded "unescaped HTML" findings. Attempt 06 contradicts 02 about what `figure`
  escapes, so it is the most arguable member. D16, the narrower point about `html.escape` and `"`, is kept
  apart.
- D21, D26, D27 and D28 all sit on `compare`'s signature but make different claims. Attempt 02's finding at
  89–91 is counted once, in D23, because its main point is the unvalidated cast.
- D22 and D25 are kept apart: one is about a manifest revision or id mismatch, the other about the missing
  baseline-entry guard.
- On bread-spike.ts lines 113–117, six findings are split by claim into D36–D39.
- D4, D7 and D20 are the same "missing prerender" claim from attempt 02 against three files.

## Novita (`novita`) — 82 findings in 10 attempts → 50 distinct

Per-attempt counts: 9, 9, 8, 6, 8, 9, 8, 6, 10, 9 (sum 82). Novita passed G1, G2, G3's automated part and G4,
so **this hand-read decides its G3** and with it Novita's admission. "Same as (Z.AI)" points to a Z.AI row
above whose verdict can be reused. 16 rows match exactly, 3 partially (N10, N16, N39), and 31 need a fresh read.

| #   | File:line(s)                             | Claimed defect (neutral paraphrase)                                                                                              | Severities        | Attempts       | Count | Same as (Z.AI) | Owner: real? |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------- | ----- | -------------- | ------------ |
| N1  | scripts/measure-hue-shares.py:114–123    | `manifest_roi` reads and parses the manifest JSON from disk again on every call.                                                 | minor, nit        | 01–10          | 10    | D1             |              |
| N2  | scripts/measure-hue-shares.py:118–123    | A missing or malformed manifest gives a raw traceback instead of a clear `sys.exit` message.                                     | minor             | 10             | 1     | —              |              |
| N3  | scripts/measure-hue-shares.py:118–130    | A zero-pixel (degenerate) ROI gives a NaN mean RGB, and nothing guards against it.                                               | minor             | 02, 08         | 2     | —              |              |
| N4  | scripts/s17/auto-values.ts:1             | `export const prerender = false` is missing (both attempts concede that the file is a CLI script).                               | nit               | 02, 10         | 2     | D4             |              |
| N5  | scripts/s17/auto-values.ts:1–67          | The new harness scripts have no tests.                                                                                           | nit               | 05             | 1     | —              |              |
| N6  | scripts/s17/auto-values.ts:38–39         | The alpha channel of the `.rgba` buffer is never checked to be 255.                                                              | nit               | 01             | 1     | —              |              |
| N7  | scripts/s17/browser-stats.ts:1–30        | The JSDoc cites "plan Phase 1 note" and "row 1.6" without linking the plan.                                                      | nit               | 09             | 1     | —              |              |
| N8  | scripts/s17/browser-stats.ts:52–56       | `transpileModule` skips type-checking, and no comment says so.                                                                   | nit               | 03             | 1     | —              |              |
| N9  | scripts/s17/browser-stats.ts:78          | The `S17-\d+` route regex is looser than the `\d{2}` id format.                                                                  | nit               | 05             | 1     | D9             |              |
| N10 | scripts/s17/browser-stats.ts:84–86       | The inline page uses nested backtick interpolation and has no `<html><body>`, which is fragile.                                  | nit               | 10             | 1     | D10 (partial)  |              |
| N11 | scripts/s17/browser-stats.ts:104–107     | The photo route uses an O(n) `entries.find`, which is inconsistent with the `photoBytes` Map.                                    | nit               | 02             | 1     | —              |              |
| N12 | scripts/s17/browser-stats.ts:155–161     | NaN or Infinity from `page.evaluate` becomes null in JSON, and the `BrowserSample` cast hides it.                                | minor             | 01             | 1     | —              |              |
| N13 | scripts/s17/browser-stats.ts:204         | `process.exit(worst)` runs synchronously after `void main()`, so a rejected `main()` still exits 0.                              | minor             | 06             | 1     | —              |              |
| N14 | scripts/s17/contact-sheet.py:38          | `ImageOps` is imported and never used.                                                                                           | nit               | 04             | 1     | —              |              |
| N15 | scripts/s17/contact-sheet.py:52–71       | Loading sibling scripts through importlib is fragile: tooling cannot follow it and import-time side effects run.                 | nit               | 01, 02, 03, 10 | 4     | D11            |              |
| N16 | scripts/s17/contact-sheet.py:54–57       | Loading at module top level means a broken dependency crashes even `--help` and blocks unit tests.                               | minor             | 06, 09         | 2     | D11 (partial)  |              |
| N17 | scripts/s17/contact-sheet.py:57–85       | The caption goes into `<figcaption>` without HTML escaping, so run-record data can inject markup.                                | major, minor      | 06, 07         | 2     | D12            |              |
| N18 | scripts/s17/contact-sheet.py:100–101     | `sorted(sizes)` is shown in the HTML as a raw Python tuple.                                                                      | nit               | 07             | 1     | —              |              |
| N19 | scripts/s17/contact-sheet.py:108–111     | With `--markdown`, the exposure stats are computed twice for each output.                                                        | minor             | 07             | 1     | —              |              |
| N20 | scripts/s17/contact-sheet.py:112         | All output images are decoded and held in memory at once.                                                                        | nit               | 08             | 1     | D13            |              |
| N21 | scripts/s17/contact-sheet.py:126–139     | Re-attaching the ICC profile after `exif_transpose` depends on `to_srgb` internals, so it may not apply or may break silently.   | minor             | 01, 09         | 2     | —              |              |
| N22 | scripts/s17/contact-sheet.py:130–131     | The image from `Image.open` in `original_rgb` is never closed.                                                                   | nit               | 06             | 1     | D17            |              |
| N23 | scripts/s17/contact-sheet.py:155         | The resized copy of `original` is saved but not assigned, so later code that uses `original` would get the full-size image.      | minor             | 05             | 1     | —              |              |
| N24 | scripts/s17/decode-inputs.py:1–197       | The re-implemented decode, orient, downscale and sample pipeline has no fixture tests.                                           | nit               | 04             | 1     | —              |              |
| N25 | scripts/s17/decode-inputs.py:83–95       | Rounding is round-half-up while Canvas rounds to even, and the docstring does not mention it.                                    | nit               | 07             | 1     | —              |              |
| N26 | scripts/s17/decode-inputs.py:89–99       | The output of `profileToProfile` is never checked to be RGB mode.                                                                | minor             | 03             | 1     | —              |              |
| N27 | scripts/s17/decode-inputs.py:94–95       | `to_srgb` converts to RGB before applying the ICC profile, which reads backwards.                                                | nit               | 06             | 1     | —              |              |
| N28 | scripts/s17/decode-inputs.py:99–107      | Re-attaching `icc_profile` after `exif_transpose` is dead code, because `convert("RGB")` drops `info`.                           | minor             | 02             | 1     | —              |              |
| N29 | scripts/s17/decode-inputs.py:117–118     | The `--filter` flag shadows the Python builtin `filter`.                                                                         | nit               | 01             | 1     | —              |              |
| N30 | scripts/s17/desktop-stats.ts:82–108      | The `never` return type on `compare` is misleading or does not hold.                                                             | nit, minor, major | 03, 05, 06, 08 | 4     | D21            |              |
| N31 | scripts/s17/desktop-stats.ts:88–178      | Module-level manifest, photo, SHA and transpile work makes `--compare` or an import do needless I/O and crash on missing photos. | minor, nit        | 02, 07, 08, 09 | 4     | D29            |              |
| N32 | scripts/s17/desktop-stats.ts:89, 259–273 | The localhost server has no token or auth, so any local process can fetch the licensed photos and the source.                    | minor             | 09, 10         | 2     | D31            |              |
| N33 | scripts/s17/desktop-stats.ts:104–130     | `base[id]` is not null-checked (the download entry is), so a missing baseline id throws an opaque TypeError.                     | minor             | 03, 04         | 2     | D25            |              |
| N34 | scripts/s17/desktop-stats.ts:107         | An empty `entries` list makes `compare` exit 0 having compared nothing.                                                          | minor             | 09             | 1     | D28            |              |
| N35 | scripts/s17/desktop-stats.ts:156–170     | `--baseline` with no value silently falls back to the default baseline.                                                          | minor             | 07             | 1     | —              |              |
| N36 | scripts/s17/desktop-stats.ts:259–273     | The server does not check the `Host` header.                                                                                     | nit               | 10             | 1     | —              |              |
| N37 | scripts/s17/desktop-stats.ts:261–275     | There is no CORS or Origin check, so a page from another origin could read the photos and the JS.                                | minor             | 01, 05         | 2     | —              |              |
| N38 | scripts/s17/desktop-stats.ts:261–275     | The photo route regex `S17-\d+` is looser than `\d{2}` (the same claim as N9, in a second file).                                 | nit               | 05             | 1     | —              |              |
| N39 | scripts/s17/desktop-stats.ts:263–275     | The server is never closed and keep-alive stays on, so the process does not exit by itself.                                      | nit, major        | 01, 06         | 2     | D33 (partial)  |              |
| N40 | scripts/s17/harness.ts:12–14             | `import.meta.dirname` needs a recent Node, and the version floor is not documented.                                              | nit               | 04, 09         | 2     | —              |              |
| N41 | scripts/s17/harness.ts:53–55             | `readManifest` does not cache the parsed manifest (the attempt says this is fine today).                                         | nit               | 02             | 1     | —              |              |
| N42 | scripts/s17/harness.ts:53–55             | `readManifest` has no error handling, so a missing or malformed manifest gives a raw Node error.                                 | nit, minor        | 03, 10         | 2     | —              |              |
| N43 | scripts/s17/harness.ts:55                | The parsed manifest is cast with no runtime shape validation.                                                                    | nit               | 07             | 1     | D35            |              |
| N44 | scripts/spikes/bread-spike.ts:88–90      | Reading the whole file and wrapping it in a Blob doubles memory for large inputs, and nothing documents this.                    | nit               | 09             | 1     | —              |              |
| N45 | scripts/spikes/bread-spike.ts:111–117    | `process.exitCode = 1; return` does not guarantee termination the way `process.exit(1)` did.                                     | minor             | 04, 09         | 2     | D38            |              |
| N46 | scripts/spikes/bread-spike.ts:113–115    | A failed output download in `saveOutput` returns without setting the exit code, so the run exits 0.                              | minor             | 03             | 1     | —              |              |
| N47 | scripts/spikes/bread-spike.ts:114–117    | The early-return-plus-`finally` control flow is subtle or undocumented.                                                          | nit, minor        | 01, 06, 10     | 3     | D39            |              |
| N48 | scripts/spikes/bread-spike.ts:114–116    | After a failed create, `finally` still deletes an upload that no prediction used (the attempt calls this harmless).              | minor             | 02             | 1     | —              |              |
| N49 | scripts/spikes/bread-spike.ts:119–125    | The prediction poll loop has no wall-clock timeout.                                                                              | minor             | 08             | 1     | D40            |              |
| N50 | scripts/spikes/bread-spike.ts:244–253    | The sidecar stores the raw remote input URL, which could leak a token or address.                                                | major             | 05             | 1     | —              |              |

Grouping calls the agent marked as uncertain:

- N15 and N16 split one importlib theme. N16 is the "`--help` crashes / blocks tests" consequence. D11 covers
  both.
- N31 merges four module-level side-effect findings. Attempt 02 opens on `never`, but its stated main point
  is the side effects.
- N32 and N37 split the server threat by actor: a local process, and a cross-origin page. Only N32 is
  mapped to D31.
- N10, N16 and N39 are partial matches only, so reuse their Z.AI verdicts with care.
- N35 (`--baseline` with no value) is the same class as D30 (`--compare` with no value) but a different
  flag, so it is not mapped.
- N9 and N38 are the same regex claim in two files, kept apart by location.

## DeepInfra (`deepinfra`) — 26 findings in 5 answered attempts → 25 distinct

Per-attempt counts: 7, 0, 8, 11, 0, then 429 for attempts 06–10 (sum 26). DeepInfra fails on G1 (5/10) and G2
(4/5). Its hand-read is material only and cannot change the verdict. Several line numbers do not match the
tree, so the rows are grouped by claim.

| #   | File:line(s)                            | Claimed defect (neutral paraphrase)                                                                           | Severities | Attempts | Count | Same as       |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------- | -------- | ----- | ------------- |
| P1  | scripts/measure-hue-shares.py:1         | The docstring cites the withdrawn S-17 green→magenta diagnosis without marking it as historical.              | minor      | 04       | 1     | —             |
| P2  | scripts/measure-hue-shares.py:34–60     | Invalid ROI coordinates are not validated, and the behaviour is undocumented.                                 | minor      | 01       | 1     | D3 (partial)  |
| P3  | scripts/measure-hue-shares.py:41        | The docs use both `V>=0.90` and `V≥0.90`.                                                                     | nit        | 04       | 1     | —             |
| P4  | scripts/measure-hue-shares.py:115       | `manifest_roi` does not handle a missing or malformed manifest.                                               | minor      | 04       | 1     | N2            |
| P5  | scripts/s17/auto-values.ts:1            | The JSDoc repeats the filename.                                                                               | nit        | 03       | 1     | —             |
| P6  | scripts/s17/auto-values.ts:1            | The comment says "second half of the harness" without naming the first half.                                  | minor      | 04       | 1     | —             |
| P7  | scripts/s17/auto-values.ts:1–67         | There is no explicit exit code on success, which is inconsistent with the error paths.                        | nit        | 01       | 1     | —             |
| P8  | scripts/s17/browser-stats.ts:1          | The JSDoc refers to `@param` style but documents no parameters.                                               | nit        | 03       | 1     | —             |
| P9  | scripts/s17/browser-stats.ts:1–204, 108 | The Chromium launch and the page operations have no timeout.                                                  | minor      | 01, 04   | 2     | —             |
| P10 | scripts/s17/contact-sheet.py:1          | The docstring cites "plan Phase 3 procedure" without saying where the plan is.                                | nit        | 03       | 1     | —             |
| P11 | scripts/s17/contact-sheet.py:1          | It validates checksums but not that the outputs are readable images.                                          | minor      | 04       | 1     | —             |
| P12 | scripts/s17/contact-sheet.py:1–230      | It does not check early that the output dir is writable, so it can fail after the expensive processing.       | minor      | 01       | 1     | —             |
| P13 | scripts/s17/decode-inputs.py:1          | The long docstring has no short summary line.                                                                 | nit        | 03       | 1     | —             |
| P14 | scripts/s17/decode-inputs.py:80–120     | `to_srgb` assumes `profileToProfile` returns None only in place, but it may also do so on a conversion error. | minor      | 01       | 1     | —             |
| P15 | scripts/s17/decode-inputs.py:86         | `point_bilinear` uses float64 for 8-bit data.                                                                 | minor      | 04       | 1     | —             |
| P16 | scripts/s17/desktop-stats.ts:1          | The exit-status docs do not fully explain status 2.                                                           | minor      | 04       | 1     | —             |
| P17 | scripts/s17/desktop-stats.ts:132        | `entries` is used in `compare` before it is defined.                                                          | minor      | 03       | 1     | D24           |
| P18 | scripts/s17/harness.ts:1                | The header would benefit from an example directory layout.                                                    | nit        | 03       | 1     | —             |
| P19 | scripts/s17/harness.ts:1                | The shared types have no version field to catch a script/app mismatch.                                        | minor      | 04       | 1     | —             |
| P20 | scripts/spikes/bread-spike.ts:48–100    | `REPLICATE_API_TOKEN` is not validated for format or expiry, so auth failures are unclear.                    | critical   | 01       | 1     | —             |
| P21 | scripts/spikes/bread-spike.ts:71–73     | `process.exitCode = 1; return` may mask a prediction failure; use `process.exit(1)`.                          | minor      | 03       | 1     | D38           |
| P22 | scripts/spikes/bread-spike.ts:80        | The file-upload fetch has no timeout.                                                                         | minor      | 04       | 1     | —             |
| P23 | scripts/spikes/bread-spike.ts:85–87     | A failed `createRes.ok` check logs but does not exit, so the script carries on.                               | minor      | 03       | 1     | D38 (partial) |
| P24 | scripts/spikes/bread-spike.ts:148       | Error handling mixes `process.exitCode` and `process.exit`.                                                   | nit        | 04       | 1     | D38 (partial) |
| P25 | scripts/spikes/bread-spike.ts:150–200   | A failed `deleteUpload` only warns, so uploads may pile up on Replicate.                                      | major      | 01       | 1     | —             |

Uncertain grouping calls: P9 merges a whole-file claim (01) with a line-108 claim (04). P21, P23 and P24 are
three framings of the exitCode/return pattern, kept apart. The cited lines for P21 and P23 do not match the
tree, where the token check is at 69–72 and the create check at 117–120.

## Venice (`venice`) — 58 findings in 10 attempts → 48 distinct

Per-attempt counts: 7, 3, 4, 11, 5, 12, 3, 2, 6, 5 (sum 58). Venice fails on G2 (3/5) and on G3's automated
part (`flaw_stale_closure` 2/3), so this is material only. Many cited lines do not match the tree, so the rows
are grouped by claim.

| #   | File:line(s)                          | Claimed defect (neutral paraphrase)                                                                             | Severities        | Attempts       | Count | Same as       |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------- | -------------- | ----- | ------------- |
| V1  | scripts/measure-hue-shares.py:1–50    | The module docstring is verbose and mixes history with method docs.                                             | nit               | 03, 10         | 2     | —             |
| V2  | scripts/measure-hue-shares.py:59–61   | ROI coordinates are floored with no bounds check.                                                               | minor             | 06             | 1     | D3            |
| V3  | scripts/measure-hue-shares.py:67–70   | `exposure_stats` returns a tuple that mixes 0–100 percentages with 0–1 values.                                  | minor             | 07             | 1     | —             |
| V4  | scripts/measure-hue-shares.py:77–79   | The name `exposure_line` is ambiguous.                                                                          | nit               | 07             | 1     | —             |
| V5  | scripts/measure-hue-shares.py:114–149 | `exposure_stats` assumes RGB, so an alpha channel would enter the calculations.                                 | minor             | 01             | 1     | —             |
| V6  | scripts/measure-hue-shares.py:115–118 | `manifest_roi` re-reads and re-parses the manifest on every call.                                               | minor             | 02             | 1     | D1            |
| V7  | scripts/s17/ (directory)              | The new S-17 harness scripts have no tests.                                                                     | major, minor      | 01, 02, 03, 06 | 4     | N5            |
| V8  | scripts/s17/auto-values.ts:1–67       | The `void main()` invocation is unconventional.                                                                 | nit               | 10             | 1     | D6 (partial)  |
| V9  | scripts/s17/auto-values.ts:16         | The imported `computeLumaStats` and `recommendParams` have no I/O docs.                                         | nit               | 04             | 1     | —             |
| V10 | scripts/s17/auto-values.ts:32–40      | The RGBA buffer length is not checked against `w*h*4`.                                                          | minor, major      | 01, 06         | 2     | D5 (partial)  |
| V11 | scripts/s17/browser-stats.ts:1        | The `@playwright/test` dependency is not documented as required.                                                | major             | 05             | 1     | —             |
| V12 | scripts/s17/browser-stats.ts:1–30     | The JSDoc formats its em dashes and comparison numbers inconsistently.                                          | nit               | 09             | 1     | —             |
| V13 | scripts/s17/browser-stats.ts:20, 134  | `CONTINUOUS_TOLERANCE = 0.001` is hard-coded, unexplained and not configurable.                                 | nit, minor        | 01, 04         | 2     | —             |
| V14 | scripts/s17/browser-stats.ts:75–77    | The TS modules are re-transpiled on every run, with no cache.                                                   | minor             | 06             | 1     | —             |
| V15 | scripts/s17/browser-stats.ts:95–105   | All photos are read into memory before the browser starts.                                                      | minor             | 09             | 1     | —             |
| V16 | scripts/s17/contact-sheet.py:17–22    | The docs do not explain why validation photos are excluded.                                                     | minor             | 06             | 1     | —             |
| V17 | scripts/s17/contact-sheet.py:18       | The docstring does not say Pillow needs ImageCms/littlecms.                                                     | minor             | 05             | 1     | —             |
| V18 | scripts/s17/contact-sheet.py:67       | The variable name `runs` is not descriptive.                                                                    | nit               | 03             | 1     | —             |
| V19 | scripts/s17/contact-sheet.py:76       | The manifest `json.loads` has no parse-error handling.                                                          | minor             | 04             | 1     | —             |
| V20 | scripts/s17/contact-sheet.py:95       | Each file is read twice, to hash it and to process it.                                                          | minor             | 04             | 1     | D15 (partial) |
| V21 | scripts/s17/decode-inputs.py:1–50     | The docstring's numbered list is indented inconsistently.                                                       | nit               | 09             | 1     | —             |
| V22 | scripts/s17/decode-inputs.py:1–197    | There are no setup docs for the dependencies or the workflow order.                                             | major             | 01             | 1     | —             |
| V23 | scripts/s17/decode-inputs.py:32       | `SAMPLE_MAX_EDGE = 512` is unexplained.                                                                         | nit               | 04             | 1     | —             |
| V24 | scripts/s17/decode-inputs.py:58–82    | The custom `point_bilinear` resampler has no unit tests.                                                        | minor             | 04             | 1     | N24 (partial) |
| V25 | scripts/s17/decode-inputs.py:85       | `point_bilinear` uses float64 where float32 would be enough.                                                    | minor             | 05             | 1     | —             |
| V26 | scripts/s17/decode-inputs.py:140–145  | `point_bilinear` allocates several large arrays, so memory use can be high.                                     | minor             | 06             | 1     | —             |
| V27 | scripts/s17/decode-inputs.py:156–157  | `round(w * scale)` could overflow on extremely large images.                                                    | minor             | 04             | 1     | —             |
| V28 | scripts/s17/desktop-stats.ts:150–160  | The `BASELINE_SHA256` hex literal is hard to read.                                                              | nit               | 09             | 1     | —             |
| V29 | scripts/s17/desktop-stats.ts:253      | `entries` is used before it is defined, which is a runtime error in `compare`.                                  | critical          | 03             | 1     | D24           |
| V30 | scripts/s17/desktop-stats.ts:262–264  | The hard-coded baseline SHA-256 can go stale and cause false failures.                                          | major             | 06             | 1     | —             |
| V31 | scripts/s17/harness.ts:1–3            | The file header could describe its purpose better.                                                              | nit               | 06             | 1     | —             |
| V32 | scripts/spikes/bread-spike.ts:48–50   | `DATA_URI_MAX_BYTES` breaks the camelCase convention.                                                           | nit               | 06             | 1     | —             |
| V33 | scripts/spikes/bread-spike.ts:48–55   | A missing `REPLICATE_API_TOKEN` prints an error but does not stop the script.                                   | critical          | 05             | 1     | —             |
| V34 | scripts/spikes/bread-spike.ts:48–62   | The token could be logged by way of `imageLabel` when a local path is used.                                     | critical          | 10             | 1     | —             |
| V35 | scripts/spikes/bread-spike.ts:51      | `DATA_URI_MAX_BYTES` should cite Replicate's documented limit.                                                  | nit               | 04             | 1     | —             |
| V36 | scripts/spikes/bread-spike.ts:58      | `DATA_URI_MAX_BYTES` sits among the imports instead of in a config section.                                     | nit               | 02             | 1     | —             |
| V37 | scripts/spikes/bread-spike.ts:63–73   | `localInput`/`mimeOf` check only the extension, not the content's magic bytes.                                  | major, critical   | 04, 06         | 2     | —             |
| V38 | scripts/spikes/bread-spike.ts:71      | The error message for a failed prediction creation could be more specific.                                      | nit               | 01             | 1     | —             |
| V39 | scripts/spikes/bread-spike.ts:88–90   | Upload error messages include local paths and sizes.                                                            | minor             | 04             | 1     | D43 (partial) |
| V40 | scripts/spikes/bread-spike.ts:98–108  | The inline `consequence` message in `deleteUpload` would be better as a constant.                               | nit               | 05             | 1     | —             |
| V41 | scripts/spikes/bread-spike.ts:113     | After a failed create, `exitCode = 1` is set but polling continues (it asks for a `return`).                    | minor             | 09             | 1     | —             |
| V42 | scripts/spikes/bread-spike.ts:118     | `process.exitCode = 1` here but `process.exit(1)` elsewhere is inconsistent.                                    | minor             | 08             | 1     | D38 (partial) |
| V43 | scripts/spikes/bread-spike.ts:118–124 | `exitCode = 1; return` instead of exiting could continue with an invalid prediction.                            | major             | 10             | 1     | D38           |
| V44 | scripts/spikes/bread-spike.ts:125–126 | `readFileSync` reads the whole file before checking its size.                                                   | minor             | 04             | 1     | D42           |
| V45 | scripts/spikes/bread-spike.ts:125–130 | When the upload succeeds but prediction creation fails, the upload is not cleaned up (N48 claims the opposite). | major             | 01             | 1     | —             |
| V46 | scripts/spikes/bread-spike.ts:147–168 | A failed `deleteUpload` only warns, with no retry and no exit code, so files may remain on Replicate.           | minor, major, nit | 06, 07, 08, 10 | 4     | —             |
| V47 | scripts/spikes/bread-spike.ts:148–160 | `mimeOf` returns `string \| null`, but callers treat it as a string.                                            | minor             | 09             | 1     | —             |
| V48 | scripts/spikes/bread-spike.ts:242–250 | The sidecar run-record format has no completeness test.                                                         | minor             | 06             | 1     | —             |

Uncertain grouping calls:

- V46 merges "no exit code" (07, 08) with "best-effort, add retry" (06, 10). It could be split 2 + 2.
- V41 and V43 make opposite claims and are kept apart.
- V45 contradicts N48, so it is not mapped to it.
- V10 and D5 run in opposite directions, so the match is only partial.
