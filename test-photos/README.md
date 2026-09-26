# Test photos

Input photographs for **manual** experiments against the real app: Cloud AI runs, Local-engine
comparisons, parameter tuning, quality checks. These are not automated-test fixtures — those live in
`tests/e2e/fixtures/` and are deliberately tiny.

## Two folders, one rule

| Folder      | Tracked? | For                                                                        |
| ----------- | -------- | -------------------------------------------------------------------------- |
| `licensed/` | **yes**  | Freely licensed photos whose licence and author are recorded in `fetch.sh` |
| `private/`  | **no**   | Your own photos, and anything whose provenance you cannot state            |

**The rule: a photo may be committed only if its licence and author are written down.** Everything
else goes in `private/`, which is gitignored.

## Why the rule exists

Every Cloud AI trial in this project's history — all three of S-17's evidence screenshots included —
used images traced on 2026-09-22 to <https://capturetheatlas.com/noise-in-photography/>, a site whose
footer reads `ALL RIGHTS RESERVED`. Nobody recorded that at the time, so for months the corpus had no
stated provenance and nobody could tell whether a larger copy could be obtained. See
`context/changes/cloud-quality-below-local/result-dimensions-census.md` § Provenance.

`context/changes/local-engine-ceiling/change.md` had already rejected an older sample set for exactly
this reason: _"fetched from third-party URLs by a script and their provenance cannot be asserted"_.
This directory is what stops that recurring.

## Adding a photo

**Freely licensed** → add one line to the `FETCH` array in `fetch.sh` and run `bash test-photos/fetch.sh`
from the repo root. The label carries the scene, why the photo is here, and `LICENCE Author`. Commit
both the script entry and the fetched file.

**Your own, or anything unclear** → drop it in `private/` and reference it by path from whatever
document needs it. Never move it into `licensed/`.

Wikimedia Commons sizing uses `Special:FilePath/<file>?width=N`, the encoding-tolerant redirect to a
sized rendition. Direct `/thumb/` URLs 404 on some filenames. The pattern comes from
`context/archive/2026-06-18-bread-chroma-postpass/ab-harness/fetch-samples.sh`.

## What `fetch.sh` checks for you

After each download it prints the dimensions and flags two things that would silently waste a run:

- **long edge ≤ 1536** — Cloud AI caps the long edge at 1536 px and floors both dimensions to a
  multiple of 8, so such a photo is **passed through untouched**. Fifteen of the eighteen stored
  production jobs were this case, which is why the resolution gap went unobserved for months.
- **over 25 MB** — `MAX_FILE_BYTES`, so the app rejects the upload.

## Current set

### `licensed/01-aurora-fjord-kirkjufell.jpg`

3840 × 2560 · 9.83 MP · 6.6 MB · CC BY-SA 4.0 · photo by Oliver Degener, uploaded to
Wikimedia Commons by Chr Grundo (see note below) · Kirkjufell seen from Grundarfjörður.

A saturated green aurora over dark water with mountains — the scene class that produces the S-17
green→magenta fault — at a source **well above** the 1536 px cap. Measured green dominance is **+88**
in the sky against a foreground luma of **18**, so it exercises both halves of the fault's signature:
saturated chroma, and the dark regions where the hue flip appears.

**Attribution note (corrected 2026-09-26).** This file was first credited to Diego Delso, which was
wrong. Its Commons page
(<https://commons.wikimedia.org/wiki/File:Northern_Lights_over_Kirkjufell_seen_from_Grundarfj%C3%B6r%C3%B0ur.jpg>)
gives the description _"Winning photo from the town's photo competition in 2019. Photo by Oliver
Degener"_, the Author field **Chr Grundo**, Source _Own work_, dated 26 October 2019, licence
**CC BY-SA 4.0**. Credit both names as above. The page names a photographer other than the uploader
while marking the upload _own work_; that gap is recorded here rather than resolved, since the
licence grant rests on the uploader's claim.

It exists for **Run A** of `context/changes/cloud-quality-below-local/defaults-experiment.md`, the run
that separates saturation-dependence from size-dependence. Every prior trial used a ~0.5 MP web copy,
so that variable has never been moved. The geometry deliberately matches the repo's existing
`01-very-dark-iso160000.jpg` night sample, which makes the two directly comparable.

### `licensed/02-aurora-frozen-lake-norway.jpg`

3840 × 2221 · 8.53 MP · 1.6 MB · **CC BY 4.0** (<https://creativecommons.org/licenses/by/4.0/>) ·
by **Anthony's astro**, own work · _Aurora mountain.jpg_,
<https://commons.wikimedia.org/wiki/File:Aurora_mountain.jpg>. The file is Wikimedia's 3840 px
rendition of an 8430 × 4875 stitched panorama, so it is already a resized copy of the original.

A saturated green arc over the pale snow-and-ice shore of a frozen lake in Norway. Its lower 40 %
is genuinely near-neutral — RGB ≈ 93 / 92 / 82, two thirds of those pixels below saturation 0.18 at
896 px — which is the scene element the failing S-17 baseline (`190832de`, a Lofoten beach) turned
magenta and Kirkjufell lacks.

**Attribution note.** The author is credited only by the Commons username **Anthony's astro**, which
the page gives as the Author with Source _Own work_; the account has since been renamed. Credit that
name exactly as written. The description (_"aurora pano over a frozen lake in Norway. Shot on a Canon
R6ii with a 16mm lens"_) names no other photographer.

### `licensed/03-aurora-reykjanes-snow-lava.jpg`

3840 × 2560 · 9.83 MP · 2.8 MB · **CC0** (<https://creativecommons.org/publicdomain/zero/1.0/>) ·
by **Sean O Riordan**, via Flickr (<https://www.flickr.com/photos/114717511@N02/25941120808/>, Commons
licence review passed) · _Reykjanes Geopark Aurora_,
<https://commons.wikimedia.org/wiki/File:Reykjanes_Geopark_Aurora_-_Flickr_-_Seanie2322.jpg>. The
file is Wikimedia's 3840 px rendition of a 6000 × 4000 original.

A green aurora over a snowy coastal flat with dark lava rocks, the darkest of the candidates (mean
0.20) and 3:2 like the failing 896 × 600 result. **Its snow is not neutral**: the lower 40 % reads
yellow-green (RGB ≈ 59 / 62 / 37, mean saturation 0.40, only 7 % of pixels below 0.18), so it tests a
dark scene with a tinted foreground rather than neutral ground.

Both files exist for the baseline-like-scene runs in
`context/changes/cloud-quality-below-local/defaults-experiment.md`. The runs use **896 px copies**
resized with LANCZOS (JPEG q95, no chroma subsampling) and kept in the gitignored `private/` folder;
those copies are adaptations of the files above and carry the same terms.
