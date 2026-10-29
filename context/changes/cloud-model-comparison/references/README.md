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
