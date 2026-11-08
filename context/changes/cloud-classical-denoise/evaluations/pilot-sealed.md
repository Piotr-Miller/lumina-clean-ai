# S-20 step 1a — pilot seal

Commit this file **before** opening the viewer (plan § Implementation Approach, order step 4).
The tools read exactly one machine line:

```text
S20-SEAL kind=pilot set_id=pilot-1 set_digest=4af7f264119659185b65bb7e135f7d1b0cd03e224c19daa4cd1cb377bcbdf8a1 key_sha256=4fd22967976b33fa699f78dabaa881dce5b6e65f90c4e488914fc7f459e7febc
```

## Human control

I open the set `pilot-1` only after this file is committed, and only through
`context/changes/cloud-classical-denoise/references/compare-s20.html`. I do not open its key or list
its folder. This is a procedural commitment recorded in history, not technical proof that nothing
was opened earlier: Git can show when this seal was committed, never who looked at what.
