# GPT26 study `gpt26-wider` — gate seal

Commit this file **before** opening any output (plan § Critical Implementation Details, order
step 4). It is write-once: the gate requires exactly one commit touching it, strictly before every
commit of `evaluations/ratings.json`. The tools read exactly one machine line:

GPT26-SEAL kind=gate set_id=gpt26-wider set_digest=6beeaa30c6e6a0dc9b631a0f545b999129f294baa4787ab2bb16c6fb82bac1b6 key_sha256=2304b272c9e8a3d548eb8c94b9c0f73e9e1426905121437ea2f879a7445960e2

## Human control

I open the set `gpt26-wider` only after this file is committed, and only through `context/changes/gpt-image-26-wider/references/compare-gpt26.html?set=gpt26-wider`. I do not
open its key or its frozen ledger copies, list its folder, or compare files or hashes across pairs
while rating. I rate in the sealed two-pass order and save the first-pass checkpoint before the
second pass. Each scene's two pairs share one Local file, so its two resized copies are
pixel-identical and I may recognise the repeated Local side; the procedure reduces immediate
comparison but cannot prevent recognition. This is a procedural commitment recorded in history,
not technical proof that nothing was opened earlier: Git can show when this seal was committed,
never who looked at what.
