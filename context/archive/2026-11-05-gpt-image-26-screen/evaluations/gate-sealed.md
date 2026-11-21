# GPT-Image-2.6 screen — gate seal

Commit this file **before** opening any output (plan § Critical Implementation Details, order
step 4). It is write-once: the gate requires exactly one commit touching it, strictly before every
commit of `evaluations/ratings.json`. The tools read exactly one machine line:

GPT26-SEAL kind=gate set_id=gpt26-screen set_digest=63b743a24e3c9acec6acbbf0fab7bc785ccd6b3e819dcbe7b0d7c9bc2c9c665a key_sha256=ce8fcba3e7fbebbe1ffd0157fe116b648f344e2caf0ffd9bbf8058339f6d0418

## Human control

I open the set `gpt26-screen` only after this file is committed, and only through `context/changes/gpt-image-26-screen/references/compare-gpt26.html?set=gpt26-screen`. I do not
open its key or its frozen ledger copies, list its folder, or compare files or hashes across pairs
while rating. I rate in the sealed two-pass order and save the first-pass checkpoint before the
second pass. Each scene's two pairs share one Local file, so its two resized copies are
pixel-identical and I may recognise the repeated Local side; the procedure reduces immediate
comparison but cannot prevent recognition. This is a procedural commitment recorded in history,
not technical proof that nothing was opened earlier: Git can show when this seal was committed,
never who looked at what.
