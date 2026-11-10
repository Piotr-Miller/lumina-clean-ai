# S-20 step 1b — pilot seal

Commit this file **before** opening the viewer (plan § Implementation Approach, order step 4).
The tools read exactly one machine line:

```text
S20-SEAL kind=pilot set_id=pilot-1b set_digest=c9480e90783a6f692f6a2d52a10a81267c49f6d5217e922de01d2acc5d4971e3 key_sha256=7e2738d81403f7ed906728ce60dd10cd3608c9088bd128459711d22295d83865
```

## Human control

I open the set `pilot-1b` only after this file is committed, and only through
`context/changes/cloud-classical-denoise/references/compare-s20.html`. I do not open its key or list
its folder. This is a procedural commitment recorded in history, not technical proof that nothing
was opened earlier: Git can show when this seal was committed, never who looked at what.
