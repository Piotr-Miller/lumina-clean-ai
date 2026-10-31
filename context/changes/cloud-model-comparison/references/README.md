# References: Local engine on the `s17-v2` tuning photos

These files are the real Local engine's output, kept as the S-19 baseline. They were produced
on 2026-10-29 in the production app (luminacleanai.com, Local tab, Auto ON) in Chrome. The
agent drove the app, and each file is exactly what the app's Download control produced. Local
runs in the browser, so no photo was uploaded to a server. Outputs are full resolution.

**Changes made to each source:** Local's gamma curve and Gaussian blur, with the Auto values in
the table, then JPEG re-encoding by the browser. The input is the file of the same name in
`test-photos/licensed/`, where `test-photos/fetch.sh` records its source.

**Basis for publishing:** every source is CC0, CC BY or CC BY-SA, and none carries a
NoDerivatives term. Each adaptation is published under its source's licence, with attribution
and the changes above. The two CC BY-SA adaptations are themselves CC BY-SA 4.0.

| File                                              | Source (author, page)                                                                                                                                                                                                                              | Licence of source and of this file                              | Auto gamma / blur |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------- |
| `luminaclean-01-aurora-fjord-kirkjufell.jpg`      | Oliver Degener (uploaded by Chr Grundo), [Northern Lights over Kirkjufell seen from Grundarfjörður](https://commons.wikimedia.org/wiki/File:Northern_Lights_over_Kirkjufell_seen_from_Grundarfj%C3%B6r%C3%B0ur.jpg); input fetched at 3840 px wide | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | 1.56 / 0.2        |
| `luminaclean-02-aurora-frozen-lake-norway.jpg`    | Anthony's astro, [Aurora mountain](https://commons.wikimedia.org/wiki/File:Aurora_mountain.jpg); input fetched at 3840 px wide                                                                                                                     | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)       | 1.05 / 0.2        |
| `luminaclean-03-aurora-reykjanes-snow-lava.jpg`   | Sean O Riordan (via Flickr), [Reykjanes Geopark Aurora](https://commons.wikimedia.org/wiki/File:Reykjanes_Geopark_Aurora_-_Flickr_-_Seanie2322.jpg); input fetched at 3840 px wide                                                                 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)   | 1.19 / 0.2        |
| `luminaclean-04-phone-whitehouse-iphone13pro.jpg` | 56BeachyL, [WhiteHouseNight](https://commons.wikimedia.org/wiki/File:WhiteHouseNight.jpg)                                                                                                                                                          | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | 1.10 / 0.1        |
| `luminaclean-05-phone-walgreens-pixel7.jpg`       | edenpictures (Eden, Janine and Jim), [Walgreens Neon, New Orleans at night, April 2023](https://commons.wikimedia.org/wiki/File:Walgreens_Neon%2C_New_Orleans_at_night%2C_April_2023.jpg)                                                          | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/)       | 1.67 / 0.3        |
| `luminaclean-06-phone-rain-galaxys24ultra.jpg`    | Justauser13, [Rain at night captured from Expert RAW, Samsung Galaxy S24 Ultra](https://commons.wikimedia.org/wiki/File:Rain_at_night_captured_from_Expert_RAW%2C_Samsung_Galaxy_S24_Ultra.jpg)                                                    | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)       | 1.00 / 0.1        |
| `luminaclean-07-night-portrait.jpg`               | Garry Knight, [Night Portrait (46464526805)](https://commons.wikimedia.org/wiki/File:Night_Portrait_%2846464526805%29.jpg)                                                                                                                         | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/)       | 1.80 / 0.7        |

S17-21 (`21-kangchenjunga.jpg`) has no file here. The owner ran it by hand because its 17 MB
input exceeds the browser tool's 10 MB upload limit, and rated the result too bright. The
download and the Auto values were not saved.

`compare.html` was written for this change and contains no third-party material. It is a viewer
for rating Local against the original: side by side, a flip view (Space) and 100% zoom
(Z). Open it straight from disk. It reads the originals from `test-photos/licensed/`, keeps the
ratings in the browser and exports them as a Markdown table.

`compare-bread.html` was also written for this change and contains no third-party material. It
rates Bread against Local on the tuning photos, blind: the original, then A and B in an order drawn
once per photo, with the engines revealed only after rating. Each photo gets one fixed Bread output
(S-17's best-rated setting, or for S17-05/06 the production job's raw `result.png`). Those outputs
are not published: it reads them from the gitignored `test-photos/private/`, so it only works on a
machine that holds that folder. At 100% every image is shown at Bread's pixel size, scaling Local
and the original down rather than Bread up.

## S-19 gate baselines (Phase 1): common prepared inputs

The seven files above are **historical diagnostics** (Phase 2 only): the app received the
original source files, so wide-gamut photos reached Local without the colour conversion every
candidate now gets. The gate baselines are made from the **common prepared input** instead:
`python3 scripts/s19/inputs.py --all` writes `test-photos/private/s19/inputs/<id>-common.jpg`
(EXIF orientation applied, embedded profile converted to sRGB, JPEG q95 4:4:4, 2.1–9.8 MB), and
real Local (in the app) and GPT both receive exactly that file.

For each of the eight tuning photos the owner runs the common file through the unchanged Local
engine in the app (Auto ON) and saves the download as `test-photos/private/s19/local/<id>.jpg`.
In the same desktop Chrome, `npx tsx scripts/s19/baseline.ts --serve --all` records what the
app's own `sampleImageLuma` measures on those bytes, as `local/<id>.auto.json`: full-precision
stats, the parameters `recommendParams` yields from them, the input hash, the browser and the
app source revision. Those parameters are labelled **recomputed**, not "observed applied": they
are not read from the app while it processes the photo. The app's rounded slider labels can be
typed into the page; `baseline.ts --check-auto --all` compares them as a diagnostic only.

| Photo  | Common input                                    | Source (author, page)                                                                                                                                              | Licence                                                         | Download / Auto record                                   |
| ------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------- |
| S17-01 | 3840 × 2560, from sRGB                          | Oliver Degener (uploaded by Chr Grundo), [Commons](https://commons.wikimedia.org/wiki/File:Northern_Lights_over_Kirkjufell_seen_from_Grundarfj%C3%B6r%C3%B0ur.jpg) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | `s19-local/S17-01.jpg`, `.auto.json`; γ 1.54 / blur 0.2  |
| S17-02 | 3840 × 2221, Display P3                         | Anthony's astro, [Commons](https://commons.wikimedia.org/wiki/File:Aurora_mountain.jpg)                                                                            | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)       | `s19-local/S17-02.jpg`, `.auto.json`; γ 1.05 / blur 0.2  |
| S17-03 | 3840 × 2560, ProPhoto RGB                       | Sean O Riordan, [Commons](https://commons.wikimedia.org/wiki/File:Reykjanes_Geopark_Aurora_-_Flickr_-_Seanie2322.jpg)                                              | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)   | `s19-local/S17-03.jpg`, `.auto.json`; γ 1.20 / blur 0.2  |
| S17-04 | 4032 × 3024, Display P3                         | 56BeachyL, [Commons](https://commons.wikimedia.org/wiki/File:WhiteHouseNight.jpg)                                                                                  | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | `s19-local/S17-04.jpg`, `.auto.json`; γ 1.10 / blur 0.1  |
| S17-05 | 3072 × 4080, sRGB                               | edenpictures, [Commons](https://commons.wikimedia.org/wiki/File:Walgreens_Neon%2C_New_Orleans_at_night%2C_April_2023.jpg)                                          | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/)       | `s19-local/S17-05.jpg`, `.auto.json`; γ 1.67 / blur 0.3  |
| S17-06 | 4284 × 5712, DCI-P3, EXIF orientation 6 applied | Justauser13, [Commons](https://commons.wikimedia.org/wiki/File:Rain_at_night_captured_from_Expert_RAW%2C_Samsung_Galaxy_S24_Ultra.jpg)                             | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)       | `s19-local/S17-06.jpg`, `.auto.json`; γ 1.00 / blur 0.05 |
| S17-07 | 5145 × 3431, Adobe RGB                          | Garry Knight, [Commons](https://commons.wikimedia.org/wiki/File:Night_Portrait_%2846464526805%29.jpg)                                                              | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/)       | `s19-local/S17-07.jpg`, `.auto.json`; γ 1.80 / blur 0.7  |
| S17-21 | 6016 × 4000, Adobe RGB                          | Sudipto2cool, [Commons](https://commons.wikimedia.org/wiki/File:Kangchenjunga_at_Night.jpg)                                                                        | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)       | `s19-local/S17-21.jpg`, `.auto.json`; γ 1.72 / blur 0.5  |

The owner saved the eight downloads on 2026-10-31 (S17-21 first landed in `~/Downloads` and was
copied into place unchanged). At the owner's request they are also published in `s19-local/`,
the JPEGs byte-identical to `test-photos/private/s19/local/`, each beside its Auto record (the
same JSON, reformatted by Prettier). The originals are already committed in
`test-photos/licensed/`; the common inputs are not committed, because `inputs.py --check`
re-derives them byte-for-byte from those originals.

**Changes made to each source (`s19-local/<id>.jpg`):** EXIF orientation applied and the embedded
profile converted to sRGB (`inputs.py`), then Local's gamma curve and Gaussian blur with the Auto
values in the table, then JPEG re-encoding by the browser. Full resolution.

**Basis for publishing:** every source is CC0, CC BY or CC BY-SA with the author in the table, and
none carries a NoDerivatives term. Each adaptation is published under its source's licence, with
attribution and the changes above; the two CC BY-SA adaptations (S17-01, S17-04) are CC BY-SA 4.0.
The `.auto.json` records hold measurements and metadata only, no image content.

## `compare-arms.html` (S-19 blind viewer)

Written for this change; it contains no third-party material. It generalises `compare-bread.html`
to the original plus N arms. `scripts/s19/viewer-inputs.py <spec.json>` writes the manifest it
reads to the gitignored `test-photos/private/s19/viewer/<name>.js` (a script, since browsers
refuse `fetch` from disk); open `compare-arms.html?m=<name>`. The builder checks the holdout
guard before reading any image, and a tuning manifest never lists validation photos.

- **Gate pairs.** Each pair is one candidate against real Local, or a NAFNet arm against its
  control, in an A/B order drawn once per pair and revealed only after rating. At 100% both are
  shown at the smaller width of the pair; nothing is enlarged.
- **Flags.** Per side: severe regression, content change (with a mandatory crop note
  "original → result") and unverified lettering reconstruction. A clear preference needs a
  reason, and a clear candidate win needs its basis: an independent confirmed gain, or only
  unverified lettering, which `tally.py` scores as a tie.
- **Brightened original** (J) for the star and lettering checks; **native export** shows each
  arm's own file at 100% with its size, available once every pair of the photo is rated.
- **Failed slots** appear with their status and no image, and are exported as such.
- **Export** downloads the JSON `tally.py` joins against the series manifest and the attempts
  ledger, plus a Markdown table. A validation manifest without a matching Phase 7 release is
  refused before any image URL is created.

`scripts/s19/viewer/spike-smoke.json` is a smoke-test spec over the existing spike outputs
(GPT on S17-04 and S17-07, raw NAFNet on S17-04) against the historical Local downloads, with
one synthetic failed slot. It is not a gate and not the Phase 2 rating set.
