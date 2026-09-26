# S-17 — photo candidate pool

Collected 2026-09-26. **18 candidates, not an accepted benchmark. The 6/12 split is unset.**
No model experiments were run. IDs are inventory IDs, not tuning/validation assignments.

## State and selection rules

- 01–03 already exist locally and have prior experimental exposure: exclude these scenes and their resized variants from independent validation. Final assignment remains undecided.
- 04–06 were downloaded at Commons original-file resolution, decoded, checked for camera model and dimensions, and visually inspected as previews. Bytes are unchanged. These are phone JPEGs, not proof of untouched sensor output or maximum sensor resolution.
- 07–18 are source-page leads only: not downloaded or visually accepted. Metadata below comes from the linked pages; unknowns are explicit. Do not count them as ready inputs.
- Before freezing: inspect every full-size image and relevant crops, verify licence/author and file bytes, check upload limits, record SHA-256, and remove duplicate scenes. Keep source selection independent of Cloud/Local outcomes.
- Freeze the selected 18 and the 6/12 split before the first new tuning run. Keep scenes from the same shoot together. The pool currently overrepresents architecture; seek more low-light faces and non-aurora landscapes before acceptance.
- Use originals without a `width=` parameter for new phone candidates. The three older auroras are resized Commons renditions, not full-resolution originals.

## Downloaded phone candidates

All three are below the app's 25 MB upload limit. All exceed the 1536 px Cloud output cap.
Licence links: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/),
[CC BY 2.0](https://creativecommons.org/licenses/by/2.0/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Each author and licence is also recorded in `test-photos/fetch.sh`'s FETCH array.

| ID / local file under `test-photos/licensed/` | Source and attribution                                                                                                                                                                             | Verified file                                                               | Coverage / caveat                                                                                                                                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 04 `04-phone-whitehouse-iphone13pro.jpg`      | [WhiteHouseNight](https://commons.wikimedia.org/wiki/File:WhiteHouseNight.jpg), 56BeachyL, CC BY-SA 4.0                                                                                            | 4032×3024; iPhone 13 Pro                                                    | Bright white facade, dark fence and vegetation. Source metadata reports approximately 2× digital zoom; not a clean optical-resolution reference.                                                 |
| 05 `05-phone-walgreens-pixel7.jpg`            | [Walgreens Neon](https://commons.wikimedia.org/wiki/File:Walgreens_Neon,_New_Orleans_at_night,_April_2023.jpg), edenpictures (Eden, Janine and Jim), CC BY 2.0; Flickr licence reviewed by Commons | 3072×4080; Pixel 7                                                          | Saturated red/blue lights, lettering, dark sky. HDR+ in source metadata; bright coloured pixels already exist in the input.                                                                      |
| 06 `06-phone-rain-galaxys24ultra.jpg`         | [Rain at night](https://commons.wikimedia.org/wiki/File:Rain_at_night_captured_from_Expert_RAW,_Samsung_Galaxy_S24_Ultra.jpg), Justauser13, CC BY 4.0                                              | Stored 5712×4284; EXIF orientation 6; displayed 4284×5712; Galaxy S24 Ultra | Streetlamp, rain, foliage, wet pavement. Expert RAW named by uploader, but downloaded file is JPEG. Already bright/processed: useful no-harm candidate, not automatically a denoising challenge. |

SHA-256 of downloaded, unchanged files:

```text
c0022a812c6a96c9ffa443a1f91b76bc46b5e82c058f79f09cf02d0dbd322f4d  04-phone-whitehouse-iphone13pro.jpg
9debe50cec8657b3f147bd134f3c45ad583f5e19ada9993995871a3739c016f7  05-phone-walgreens-pixel7.jpg
660535e3ec11613277db8e3dee72b5f8e324ff1367250fcb332d6aa9556de910  06-phone-rain-galaxys24ultra.jpg
```

## Existing candidates

Source links, author details and licence caveats are in [test-photos README](../../../test-photos/README.md).
The historical green-to-magenta diagnosis in that README is superseded by this change's decision; these scenes are exposure/colour-preservation candidates, not evidence of that diagnosis.

| ID  | Existing local filename             | Dimensions | Attribution / licence                                | Limitation                                                                            |
| --- | ----------------------------------- | ---------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 01  | `01-aurora-fjord-kirkjufell.jpg`    | 3840×2560  | Oliver Degener, uploaded by Chr Grundo; CC BY-SA 4.0 | Known regression scene; photographer/uploader discrepancy remains recorded in README. |
| 02  | `02-aurora-frozen-lake-norway.jpg`  | 3840×2221  | Anthony's astro; CC BY 4.0                           | Resized stitched panorama; prior experimental exposure.                               |
| 03  | `03-aurora-reykjanes-snow-lava.jpg` | 3840×2560  | Sean O Riordan; CC0                                  | Resized rendition; tinted snow; prior experimental exposure.                          |

## Source-page leads awaiting download and visual qualification

Scene descriptions indicate intended coverage, not a completed visual assessment. Licence claims are those found on source pages, not blanket clearance of other rights. For rows marked pending, verify the file's own licence before adding to FETCH or downloading into `licensed/`.

| ID  | Linked source                                                                                                                                             | Published dimensions                           | Author / licence status                                                       | Intended coverage and remaining check                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 07  | [Night Portrait](<https://commons.wikimedia.org/wiki/File:Night_Portrait_(46464526805).jpg>)                                                              | 5145×3431                                      | Garry Knight; CC BY 2.0, Commons Flickr review                                | Face with night/neon lighting; edited image. Confirm useful skin/detail regions.                                            |
| 08  | [Candle Light Vigil 2015](<https://commons.wikimedia.org/wiki/File:National_Law_Enforcement_Officers_Memorial_Candle_Light_Vigil_2015_(17612131126).jpg>) | 5760×3840                                      | James Tourtellotte / U.S. CBP; page marks official federal work public domain | Human subject, candle, ISO 6400; edited in Photoshop. Confirm lighting and suitability.                                     |
| 09  | [Temple Street Night Market](https://commons.wikimedia.org/wiki/File:Temple_Street_Night_Market,_Kowloon,_Hong_Kong.jpg)                                  | 3216×3839                                      | Daniel Case; CC BY-SA 3.0 option                                              | Mixed lighting, people and fine detail; inspect cropping/processing.                                                        |
| 10  | [Clementi night market](https://commons.wikimedia.org/wiki/File:Night_market_in_Clementi,_Singapore_-_20070116-04.jpg)                                    | 3872×2592                                      | alex.ch; CC BY 2.0, Commons transfer review                                   | People and stalls under artificial lighting; assess actual darkness.                                                        |
| 11  | [Nilgiris forest night time](https://commons.wikimedia.org/wiki/File:Nilgiris_forest_night_time.JPG)                                                      | 4288×3216                                      | Author and licence pending                                                    | Non-aurora landscape; confirm it is genuinely low-light and not just a filename.                                            |
| 12  | [Night — Grundlsee](<https://commons.wikimedia.org/wiki/File:Night_(205566461).jpeg>)                                                                     | 2048×1136                                      | Ioan Sendroiu; CC0 with VRT note                                              | Lake/mountains; source explicitly warns EXIF is invalid. Reduced web image, not phone evidence.                             |
| 13  | [Millennium Dome at night](https://commons.wikimedia.org/wiki/File:London_MMB_X0_Millennium_Dome.jpg)                                                     | 3975×2343                                      | mattbuck; licence pending                                                     | Water/reflections, ISO 3200; edited/cropped, Pentax K-x.                                                                    |
| 14  | [Piccadilly Circus at night](<https://commons.wikimedia.org/wiki/File:Piccadilly_Circus,_London_-_at_night_-_Samsung_(6438381775).jpg>)                   | 3648×2736                                      | Elliott Brown; CC BY 2.0                                                      | Bright advertising/dark street. **Fujifilm FinePix S1500, not a Samsung phone**; Samsung is the sign.                       |
| 15  | [Riverfront Streetcar at night](https://commons.wikimedia.org/wiki/File:Riverfront_Streetcar_at_night,_New_Orleans_French_Quarter_November_2025.jpg)      | Pending                                        | Author and licence pending                                                    | Pixel 7 listed in metadata, ISO 649, HDR+. Verify original size and avoid excess same-city coverage with 05.                |
| 16  | [Post Office at Night](<https://commons.wikimedia.org/wiki/File:Post_Office_at_Night_(52576781336).jpg>)                                                  | Metadata says 4080×3072; original file pending | Author and licence pending                                                    | Pixel 7, HDR+, ISO 154. Possible additional full-size phone source; metadata alone does not verify downloadable dimensions. |
| 17  | [Candle — Eternal flame](<https://commons.wikimedia.org/wiki/File:Candle_(29055009757).jpg>)                                                              | 6000×4000                                      | Christopher Henry; CC BY 2.0, Commons Flickr review                           | Small intense light and surrounding shadows; Sony α7 III. Check exposure and useful texture.                                |
| 18  | [National Museum staircase at night](<https://commons.wikimedia.org/wiki/File:National_Museum_Staircase2_at_night_(Prague).jpg>)                          | 2736×3648                                      | Mohamed Yahya; CC BY-SA 2.0, Commons Flickr review                            | Interior artificial light and architecture; Samsung L200 compact camera, not a phone.                                       |

## Not selected in this pass

- Valletta night scenes: iPhone XR original 3024×4032, but categorized black-and-white; unsuitable for the main colour-preservation set.
- Night Dim light: phone source, but Lightroom processing and watermark; lower priority.
- Paintings, video stills and photographs of phones returned by search were excluded.
- Additional low-light phone portraits and dark natural scenes remain the main acquisition gap. Replace weaker architectural leads rather than filling 18 slots solely to hit the count.

## Next collection step

Download and qualify the strongest human-subject and landscape leads, record their author/licence in FETCH, and replace weak or unclear candidates. Only then approve 18 inputs and freeze the split. New derivatives or comparison evidence require their own per-file attribution and publication basis under AGENTS.md; this inventory does not approve future evidence publication.
