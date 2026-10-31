# 1.9 — spike-smoke viewer verification

**PASS**, 2026-10-31, against `ea87ae4867feb99d88346d0d49ef6f8b6e29a31c`.
The owner explicitly delegated this check to headless Playwright. This records that browser
verification, rather than claiming the owner personally performed the manual steps.

Playwright 1.62.1 / Chromium 151.0.7922.34 opened the actual
`compare-arms.html?m=spike-smoke` from disk in an isolated browser context at 1680 × 1050.
The manifest was regenerated from `scripts/s19/viewer/spike-smoke.json`; all images were real
existing spike outputs and historical Local downloads. No image, manifest or browser behavior
was mocked. Captures wait for image decoding and browser paint.

Verified:

- All three flag types toggle independently on both A and B; state survives reload.
- A content-change flag produces the required crop-note warning; an `original → result` note
  clears it. Downloaded JSON correctly maps the blind-side flags to candidate/reference.
- Keyboard `j` applies `brightness(3)` to the original only; `J` restores it. Neither candidate
  nor Local receives that filter.
- Reveal is disabled before a rating, then exposes the correct identities and toggles back to
  blind labels. Changing pair resets reveal and isolates flags.
- Both S17-04 comparisons and the S17-07 GPT comparison load; the synthetic failed slot shows
  its status with rating controls hidden. No JavaScript errors or failed resource requests.

All preferences, flags and notes were **synthetic test inputs**, not scientific quality ratings.
The isolated context was discarded; no rating export was added to the experiment's results.
No paid call or validation-photo access occurred. This check does not accept 1.13 or advance
Phase 2.

Reproduce from the repository root (requires the existing private spike files):

```sh
node context/changes/cloud-model-comparison/references/1.9-spike-smoke/verify.cjs
```

`verification.json` records the assertions, browser versions, commit, viewer/manifest hashes and
each screenshot's SHA-256. A rerun replaces this evidence and draws a fresh random A/B order.

## Per-file provenance and publication basis

The screenshots are unedited browser captures made by this verification. The viewer UI is
repository-authored. The source photographs and licences are recorded in
`test-photos/fetch.sh`'s `FETCH` array; the following grants permit adaptations and publication
with attribution and the indicated terms. Each screenshot carries its source's terms.

**S17-04 source and changes:** 56BeachyL,
[WhiteHouseNight](https://commons.wikimedia.org/wiki/File:WhiteHouseNight.jpg),
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
Each capture displays the original alongside derivatives as specified below, resized within the
viewer and surrounded by UI. Local applies gamma/blur and browser JPEG encoding; GPT applies
the existing image-edit spike transformation; NAFNet applies the existing downscale/denoise
spike transformation. The J capture additionally applies display-only 3× brightness to the
original. These screenshots are adaptations distributed under CC BY-SA 4.0.

**S17-07 source and changes:** Garry Knight,
[Night Portrait (46464526805)](https://commons.wikimedia.org/wiki/File:Night_Portrait_%2846464526805%29.jpg),
[CC BY 2.0](https://creativecommons.org/licenses/by/2.0/).
The captures display the original and its Local gamma/blur/JPEG derivative, plus the GPT
image-edit derivative where specified, resized within the viewer and surrounded by UI. These
screenshots are distributed under CC BY 2.0 with the source attribution above.

| File                       | Capture provenance / displayed derivatives                                                       | Basis for publication and licence of screenshot                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-blind.png`             | S17-04 original + GPT spike + historical Local; blind labels, no rating                          | 56BeachyL's WhiteHouseNight; [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), source and adaptations described above           |
| `02-flags-warning.png`     | S17-04 original + GPT spike + historical Local; synthetic A-side flags and missing-crop warning  | 56BeachyL's WhiteHouseNight; [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), source and adaptations described above           |
| `03-j-brightened.png`      | S17-04 original at display-only 3× brightness + unchanged GPT/Local panes; synthetic test note   | 56BeachyL's WhiteHouseNight; [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), source and adaptations described above           |
| `04-revealed.png`          | S17-04 original + GPT spike + historical Local; identities revealed after a synthetic tie        | 56BeachyL's WhiteHouseNight; [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), source and adaptations described above           |
| `05-nafnet-revealed.png`   | S17-04 original + raw NAFNet spike + historical Local; identities revealed after a synthetic tie | 56BeachyL's WhiteHouseNight; [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), source and adaptations described above           |
| `06-portrait-revealed.png` | S17-07 original + GPT spike + historical Local; identities revealed after a synthetic tie        | Garry Knight's Night Portrait (46464526805); [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/), source and adaptations described above |
| `07-failed-slot.png`       | S17-07 original + historical Local + synthetic `technical_failure` text; no failed-slot image    | Garry Knight's Night Portrait (46464526805); [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/), source and adaptations described above |

`verify.cjs`, `verification.json` and this README are repository-authored code/measurements/prose;
they contain no third-party image bytes.
