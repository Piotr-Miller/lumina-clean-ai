# S-20 step 1a — gate seal

Commit this file **before** opening the viewer (plan § Implementation Approach, order step 4).
The tools read exactly one machine line:

```text
S20-SEAL kind=gate set_id=gate-1 set_digest=9e1e962409da9adae43d44ce2715dffefb585bab7808acd39a3bed7f1b849737 key_sha256=120c3f44313b5dcc9aa7f7935885a4f7004f10280150f4e51661f46d81d44b91
```

## Human control

I open the set `gate-1` only after this file is committed, and only through
`context/changes/cloud-classical-denoise/references/compare-s20.html`. I do not open its key or list
its folder. This is a procedural commitment recorded in history, not technical proof that nothing
was opened earlier: Git can show when this seal was committed, never who looked at what.
