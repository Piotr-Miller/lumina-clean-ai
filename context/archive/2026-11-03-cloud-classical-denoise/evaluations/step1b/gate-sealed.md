# S-20 step 1b — gate seal

Commit this file **before** opening the viewer (plan § Implementation Approach, order step 4).
The tools read exactly one machine line:

```text
S20-SEAL kind=gate set_id=gate-1b set_digest=a5e8b8a4ac6e8a0faa4a88eba4fc87c83a5add7ca166759bf600a4cad4f7e064 key_sha256=f7d3f7dc70d4607fdd73cea89c05e27ef27b4cec41dfa40cae3fe4b01aae78d9
```

## Human control

I open the set `gate-1b` only after this file is committed, and only through
`context/changes/cloud-classical-denoise/references/compare-s20.html`. I do not open its key or list
its folder. This is a procedural commitment recorded in history, not technical proof that nothing
was opened earlier: Git can show when this seal was committed, never who looked at what.
