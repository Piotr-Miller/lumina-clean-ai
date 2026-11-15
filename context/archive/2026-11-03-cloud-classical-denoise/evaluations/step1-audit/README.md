# S-20 step 1a — audit bundle

Written by `scripts/s20/gate.py` after a terminal verdict. JSON metadata only: no image bytes.

- `pilot-key.raw`, `gate-key.raw`: the sealed keys, verbatim. Their sha256 equals the `key_sha256`
  of `../pilot-sealed.md` and `../gate-sealed.md`.
- `pilot-manifest.raw`, `gate-manifest.raw`: the viewer manifests, verbatim; `set_digest` recomputes.
- `records/<sha256>.raw`: every decoded, arm and NLM record either key names, named by its sha256.

`*.raw` keeps the formatter away from bytes whose hashes are pinned.

**From a checkout alone:** `python3 scripts/s20/gate.py --audit context/changes/cloud-classical-denoise/evaluations/step1-audit`
re-derives the verdict from these files, the committed seals, exports, freeze and
`scripts/s20/configs/local-baselines.json`, without opening an image.

**Full verification** also re-hashes and re-decodes the presentation and source images. It needs
the private workspace: `test-photos/private/s19/inputs/`, `test-photos/private/s19/local/`,
`test-photos/private/s19/arms/{control-full,nlm-gamma}/`, and `test-photos/private/s20/` (`decoded/`,
`nlm/`, and the two set folders named in the seals). Then run `gate.py --set <gate set_id> --export
context/changes/cloud-classical-denoise/evaluations/gate-ratings.json`.
