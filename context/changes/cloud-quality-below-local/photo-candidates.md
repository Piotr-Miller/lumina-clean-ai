# S-17 — frozen photo set v1

Frozen **2026-09-26**, at the maintainer's request, before any new engine experiment.
**18 downloaded inputs: 6 tuning + 12 validation.** Candidate collection and input qualification are complete for this version. This is an internal acceptance set, not a representative statistical sample of all night photography.

- [Gallery with originals, split and attribution](../../../test-photos/s17-gallery.html)
- [Machine-readable manifest](../../../test-photos/s17-benchmark.json): exact paths, source pages/revisions, download URLs, author, licence link, SHA-256, byte count, stored/display dimensions, camera metadata, prior exposure, diagnostic ROI and caveats per file.
- [Frozen checksums](../../../test-photos/s17-benchmark.sha256): all 18 inputs and the manifest itself. From repo root: `sha256sum -c test-photos/s17-benchmark.sha256`.
- All photographs live in `test-photos/licensed/`; each author and licence/public-domain basis is recorded in `test-photos/fetch.sh`'s FETCH array. New source bytes were not recompressed, resized or stripped of EXIF. Older 01–03 retain the pre-existing Commons renditions.

## Frozen allocation

IDs remain stable from the candidate inventory; gaps are rejected leads, not missing inputs.

| ID     | Split      | Scene       | Display dimensions | Input                                                                                                    |
| ------ | ---------- | ----------- | ------------------ | -------------------------------------------------------------------------------------------------------- |
| S17-01 | tuning     | aurora      | 3840×2560          | [01-aurora-fjord-kirkjufell.jpg](../../../test-photos/licensed/01-aurora-fjord-kirkjufell.jpg)           |
| S17-02 | tuning     | aurora      | 3840×2221          | [02-aurora-frozen-lake-norway.jpg](../../../test-photos/licensed/02-aurora-frozen-lake-norway.jpg)       |
| S17-03 | tuning     | aurora      | 3840×2560          | [03-aurora-reykjanes-snow-lava.jpg](../../../test-photos/licensed/03-aurora-reykjanes-snow-lava.jpg)     |
| S17-04 | tuning     | phone       | 4032×3024          | [04-phone-whitehouse-iphone13pro.jpg](../../../test-photos/licensed/04-phone-whitehouse-iphone13pro.jpg) |
| S17-05 | validation | phone       | 3072×4080          | [05-phone-walgreens-pixel7.jpg](../../../test-photos/licensed/05-phone-walgreens-pixel7.jpg)             |
| S17-06 | validation | phone       | 4284×5712          | [06-phone-rain-galaxys24ultra.jpg](../../../test-photos/licensed/06-phone-rain-galaxys24ultra.jpg)       |
| S17-07 | tuning     | people      | 5145×3431          | [07-night-portrait.jpg](../../../test-photos/licensed/07-night-portrait.jpg)                             |
| S17-08 | validation | people      | 5760×3840          | [08-candle-vigil.jpg](../../../test-photos/licensed/08-candle-vigil.jpg)                                 |
| S17-09 | validation | mixed-light | 3216×3839          | [09-night-market-temple.jpg](../../../test-photos/licensed/09-night-market-temple.jpg)                   |
| S17-10 | validation | mixed-light | 3872×2592          | [10-night-market-clementi.jpg](../../../test-photos/licensed/10-night-market-clementi.jpg)               |
| S17-11 | validation | people      | 4288×3216          | [11-nilgiris.jpg](../../../test-photos/licensed/11-nilgiris.jpg)                                         |
| S17-12 | validation | landscape   | 2048×1136          | [12-grundlsee.jpg](../../../test-photos/licensed/12-grundlsee.jpg)                                       |
| S17-17 | validation | point-light | 6000×4000          | [17-candle.jpg](../../../test-photos/licensed/17-candle.jpg)                                             |
| S17-18 | validation | interior    | 2736×3648          | [18-staircase.jpg](../../../test-photos/licensed/18-staircase.jpg)                                       |
| S17-19 | validation | people      | 1200×1800          | [19-night-portrait-darkroom.jpg](../../../test-photos/licensed/19-night-portrait-darkroom.jpg)           |
| S17-20 | validation | people      | 2000×2954          | [20-woman-phone-night.jpg](../../../test-photos/licensed/20-woman-phone-night.jpg)                       |
| S17-21 | tuning     | landscape   | 6016×4000          | [21-kangchenjunga.jpg](../../../test-photos/licensed/21-kangchenjunga.jpg)                               |
| S17-22 | validation | landscape   | 4260×2980          | [22-trisul.jpg](../../../test-photos/licensed/22-trisul.jpg)                                             |

## Why this split

- **Tuning (6):** the three previously used auroras (01–03), an iPhone night facade (04), dark people beside neon (07), and a dark mountain landscape (21). Their roles cover the known regression, highlight protection, skin/shadows and dark terrain. All previously used scenes remain outside validation.
- **Validation (12):** two other phone sources (05–06), four people/face scenes (08, 11, 19, 20), two non-aurora landscapes (12, 22), two mixed-light markets (09–10), a candle (17), and an interior (18). No known shared shoot or duplicate scene crosses the split. The two mountain scenes use different photographers and locations; the people scenes use different sources/authors.
- The collection supplies **five people scenes** overall and **three non-aurora night landscapes**, plus three auroras. Nilgiris (11) was reclassified after visual inspection: it is a dark portrait on a tree with flash, not a landscape. The woman using a phone (20) is not counted as a phone-camera source.
- Three full-size published phone JPEGs are present: iPhone 13 Pro (12.19 MP, tuning), Pixel 7 (12.53 MP, validation), Galaxy S24 Ultra (24.47 MP, validation). These are original-size published files, not proof of sensor-native or unprocessed output. HDR+, digital zoom and Expert RAW/JPEG provenance are recorded individually.
- Selection used input scenes and technical checks only. No Cloud/Local output or win/loss information was used. Input inspection is permitted; validation outputs must remain unavailable to parameter tuning.

## Qualification performed

- Every file decoded successfully at full stored dimensions; dimensions, EXIF orientation and byte sizes were checked. All are JPEGs, below 25,000,000 bytes and at most 8000 px per edge, matching current app upload/local limits. Total input size is approximately 71.84 MB.
- Reviewed oriented overview images and native-pixel crops for texture, noise, skin/lighting where relevant, obvious processing and duplicate scenes. This is input suitability review, not confirmation that enhancement is possible or desirable on every frame.
- Inspected author/licence statements on the new source pages. Stable revision links are in the manifest where captured. The final two downloads used the Flickr originals linked by Commons after Commons returned HTTP 429; the staircase's SHA-1 also matches the Commons page.
- SHA-256 hashes and the allocation are frozen together. Temporary contact sheets/crops stayed in `/tmp`; the gallery references licensed source files directly, so no uncredited derivative evidence images were added.

## Limits fixed before results

1. **No held-out aurora:** all three auroras were previously used and belong to tuning. The 12-image result cannot establish generalization to new auroras. Do not leak a resized variant of 01–03 into validation.
2. **Limited phone coverage:** only three phone sources, with no verified low-light phone portrait. This set cannot establish broad superiority for phone photos or faces captured on phones.
3. **Already processed/no-harm cases:** rain, lit markets, museum interior and long-exposure landscapes are not uniformly underexposed. Preserving them may legitimately produce ties. Do not drop them after seeing outcomes to make the Cloud win rate pass.
4. **Existing provenance caveat on 01:** Commons names Oliver Degener as photographer and Chr Grundo as author/uploader. The earlier README records this unresolved gap; retaining an existing input does not resolve it or authorize new derivative publication. Model output evidence still needs the per-file publication basis required by AGENTS.md.
5. **Grundlsee metadata caveat:** Commons credits Ioan Sendroiu and CC0, with a VRT note explicitly invalidating the copyright-holder EXIF. Do not substitute the contradictory embedded name as the photographer. VRT ticket: 2019021610002429.
6. **Authored marks:** 19 has a small lower watermark; 22 has a frame/signature. Keep uploaded bytes unchanged. Manifest diagnostic regions exclude these marks; record whole-frame diagnostics separately. Trisul's border still influences Auto, so its exposure statistics do not generalize to unframed photos. Do not change the regions after seeing outputs.
7. **Known regression resolution:** input 01 in this set is 3840×2560. The earlier 896px experiment and its 21.3%/4.9% measurements refer to a different input artifact and are not acceptance thresholds for this file. Keep any exact historical regression replay separate from the 18-image score.

## Freeze protocol

- Verify hashes before experiments. `fetch.sh` is a retrieval aid, not permission to silently replace frozen bytes if an upstream file changes.
- Tune only on the six tuning images. Freeze parameters before opening the twelve validation outputs.
- Use the actual app paths, same input bytes, each engine's own Auto and matched presentation scale as agreed. Record final downloaded outputs as well as any raw intermediate used for diagnosis.
- A failed validation run is a result. Any subsequent tuning using that feedback makes these 12 images development material; a new independent set is needed for another acceptance claim.
- Fix genuine acquisition defects by explicitly versioning the manifest and documenting the reason before engine results are inspected. Do not change v1 membership or hashes in place after experiments begin.

## Candidate disposition

The earlier pool was expanded with 19 (dim portrait), 20 (woman in street lighting), 21 (Kangchenjunga) and 22 (Trisul). These replace unqualified leads 13–16 (Dome, Piccadilly, streetcar, post office), reducing redundant architecture. Existing acquired candidates 01–12 and 17–18 were retained after input inspection. The relatively bright 10 and 18 remain deliberate no-harm controls.

Valletta black-and-white, watermarked Night Dim light, paintings, video stills and photos of phones remain excluded. No model experiment, external publication or commit was performed during collection.
