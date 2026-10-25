# E2E fixtures

## `orient-6.jpg`, `orient-2.jpg`

Synthetic images made in this repository for `cloud-upload-orientation.spec.ts`
(change `cloud-exif-orientation`, Phase 2). They are not photographs and derive
from no third-party material, so the test-photograph rule in `AGENTS.md` does
not apply to them.

Each is a 96 × 64 stored RGB JPEG: a mid-grey `rgb(128, 128, 128)` background with
one 24 × 24 red `rgb(230, 20, 20)` block in the stored top-left corner, saved at
quality 95 with 4:4:4 chroma (no subsampling, so the block's colour survives),
with an EXIF IFD0 Orientation tag of 6 or 2.

| File           | Tag | Displayed as                        |
| -------------- | --- | ----------------------------------- |
| `orient-6.jpg` | 6   | 64 × 96, block top-right (90° CW)   |
| `orient-2.jpg` | 2   | 96 × 64, block top-right (mirrored) |

Generated with Pillow 12.3.0 from the repository root:

```bash
python3 -I - <<'EOF'
from PIL import Image
for tag in (6, 2):
    img = Image.new("RGB", (96, 64), (128, 128, 128))
    img.paste((230, 20, 20), (0, 0, 24, 24))
    exif = Image.Exif()
    exif[0x0112] = tag
    img.save(f"tests/e2e/fixtures/orient-{tag}.jpg", "JPEG", quality=95, subsampling=0, exif=exif.tobytes())
EOF
```

Check the tags with `exiftool -s -Orientation -n tests/e2e/fixtures/orient-*.jpg`.
