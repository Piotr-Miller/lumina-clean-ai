# Gauntlet workbench — enhance workspace

Branch `skill/gauntlet-loop` (renamed from `gauntlet/enhance-ui` once the product half was reverted and only skill work remained). Skill: `.claude/skills/gauntlet-loop/SKILL.md`, domain **A**
(UI / visual surfaces). Live while the run is going — update it as rounds land, not afterwards.

## Step 0 contract

**Goal.** The enhance workspace should read as deliberately designed next to a product that does
the same job for a living — not "fine for a side project". Judged on what a user sees and does,
not on technique.

**Bar (proposed by the lead, confirmed by the user 2026-08-25).**
[Let's Enhance](https://letsenhance.io/enhancer) as the primary reference — its upload →
settings → result/download flow is the closest live analogue to ours — with
[Fotor AI Image Enhancer](https://www.fotor.com/ai-image-enhancer/) as the second. Both are
`bars.md` §A named defaults. Captured **once** at a fixed viewport into the gitignored
`scratchpad/gauntlet/enhance-ui/reference/`, hash-pinned below, comparison only, never committed,
never a source to copy layout or wording from.

**Split (the lead's call).** Four independently judgeable pieces; rounds take one at a time:

| piece | what it is                                          | why it is judgeable alone                      |
| ----- | --------------------------------------------------- | ---------------------------------------------- |
| P1    | entry state — hero, engine toggle, empty dropzone   | first impression before the user does anything |
| P2    | processing state                                    | waiting affordance, progress, cancel           |
| P3    | result presentation — before/after slider, download | the payoff moment                              |
| P4    | parameter panel (Auto + sliders)                    | reads as considered, or as knobs bolted on     |

**Round 1 takes P1, not P3 as first planned.** Two things changed the call once the bar was actually
captured, and both are worth recording because they were invisible from the plan:

1. **The reachable bar _is_ the entry state.** Let's Enhance's in-app result view sits behind sign-up.
   Getting a real P3 reference would mean creating an account and uploading the user's night photo to a
   third-party service — neither of which the lead does on the user's behalf. P3 therefore has **no bar
   yet**, and a round without a bar is not a gauntlet round.
2. **There is no `/enhance` route.** `EnhanceWorkspace` is mounted `client:load` on `src/pages/index.astro`,
   so the surface under test is the landing page itself. That makes the comparison _more_ apples-to-apples:
   the reference is also a marketing page with the tool's dropzone on it.

P3 stays in the split. It needs a bar that can be frozen without an account — a candidate is a
competitor's published before/after showcase, which is a marketing rendition of a result rather than
their real result view, and that difference must be disclosed if it is ever used.

**Stop condition — three rounds, agreed with the user 2026-08-25 before the first builder ran.** Not
"three rounds or until it wins": three rounds. If the bar still wins at the end, that is the recorded
result, not a reason to quietly take a fourth.

The user agreed the ceiling against P3; round 1 moved to P1 for the reasons above, so the three rounds
are being spent on P1 instead. Same budget, different piece — flagged to the user rather than silently
re-aimed, because the ceiling is theirs and not the lead's to repurpose.

## Reference provenance ledger

One row per reference file before it is used in a round.

| file                            | what it is                                                          | origin (URL + capture date)                                    | rights                       | sha256      |
| ------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------- | ----------- |
| `ref-01-letsenhance.png`        | Let's Enhance enhancer entry screen                                 | https://letsenhance.io/enhancer — captured 2026-08-25          | third-party, comparison only | `249afe65…` |
| `ref-02-fotor.png`              | Fotor AI Image Enhancer entry screen                                | https://www.fotor.com/ai-image-enhancer/ — captured 2026-08-25 | third-party, comparison only | `5b5aadc2…` |
| `ref-02-fotor-masked.jpg`       | same page, banner dismissed + header masked, JPEG q85 — round 3 bar | https://www.fotor.com/ai-image-enhancer/ — captured 2026-08-25 | third-party, comparison only | `54b7abdb…` |
| `ref-01-letsenhance-masked.png` | same page, header band masked — round 2 bar                         | https://letsenhance.io/enhancer — captured 2026-08-25          | third-party, comparison only | `382085fa…` |

Full hashes are re-verified before each round with
`npx tsx scripts/gauntlet-stage.ts hash scratchpad/gauntlet/enhance-ui/reference/<name>`.

**`ref-02-fotor.png` is NOT staged in round 1 — disclosed defect.** Its consent banner covers the lower
third of the frame and only offers "Accept", which the lead does not click on the user's behalf; the
reject/dismiss fallback did not match it. A banner sitting on the reference makes the bar look worse and
would flatter our side, so the file stays in the ledger as a second reference and is unusable as a staged
bar until it is re-captured cleanly. Round 1's bar is `ref-01` alone.

**Capture recipe — one script for both sides.** `scratchpad/gauntlet/enhance-ui/capture.mjs`, Playwright
chromium at 1440×900, `deviceScaleFactor: 1`, PNG, animations given 2.5 s to settle. Ours and the bar go
through the identical path, which removes the renderer/DPI/format mismatch `bars.md` §A warns defeats a
blind A/B before the critic looks. It reuses the already-installed chromium build rather than downloading
another one. Consent banners: reject or dismiss only, never accept.

**Fixture photo.** Not needed for P1 — the entry state is judged before anything is uploaded. It becomes
required for P2, P3 and P4; the user has agreed to supply a night photo they own, and the path is still
outstanding. The archived `ab-harness/samples` stay unusable: they were fetched from third-party URLs by
a script, so their provenance cannot be asserted.

## Rounds

| round | piece | verdict      | ours was | named gap                                            | gates                                       |
| ----- | ----- | ------------ | -------- | ---------------------------------------------------- | ------------------------------------------- |
| 1     | P1    | **BAR_WINS** | A        | the upload panel is not the visual centre of gravity | n/a — no source touched yet                 |
| 2     | P1    | **WINS**     | B        | (gap now points at the bar, not at us — see below)   | lint 0 err · typecheck · 396/396 · format ✓ |
| 3     | P1    | **BAR_WINS** | B        | no visible proof of the result on the entry screen   | unchanged artifact — no source touched      |

### Round 1 — critic's raw verdict, recorded before reveal

**better: B** (staged sides, not yet mapped to ours/bar at the time of writing).

**why (critic, verbatim in substance).** B wins on the thing that matters at this moment: a first-time
visitor lands, understands, and can act. Its headline plus three short benefit lines say what will
happen to the photo and that the visitor's kind of photo qualifies, and one unmistakable button starts
it. **A actually has the better sentence** — "Fix your night photos / Upload a dark, grainy shot and
brighten it instantly — right in your browser. No account needed." is sharper than anything B writes,
and "no account needed" defuses the first-visit worry that B's own nav (Create account, Pricing,
Affiliate) raises. But A spends its bottom half badly: the left panel, the only way into the product,
is a near-black rectangle with a barely visible border and two small lines floating in it — at a glance
it reads as **an image that failed to load, not a place to drop a photo**. Beside it sits a bright
promotional poster with a second copy of the logo, illegible small print, and a before/after slider
painted into the artwork rather than usable. The brightest thing on screen is an advert; the dimmest is
the door.

**gap (the single biggest thing).** Make the upload panel the visual centre of gravity instead of an
empty hole: a real filled surface with a clearly contrasting (ideally dashed) border, an upload icon, a
much larger "drop your photo here" line, and a solid button rather than a small text link — sized so it
is the brightest, most obviously clickable element on the page. In the same move the poster must stop
shouting: either replace it with a genuine before/after of a real night photo at a size where the
difference is visible, or drop it and let the panel run wide.

**evidence.** Both PNGs opened directly, 1440×900, nothing else on the filesystem touched. The critic
described both screens in specific detail — panel dimensions, border contrast, nav items, button
treatment — so it graded the pixels, not a summary.

**Reveal (run after the above was written): ours = A. The bar won — `BAR_WINS`.**

### The blinding leaked, and this verdict is downgraded accordingly

**This is referee-grade evidence, not a blind result.** Both screenshots carry visible brand marks —
ours the LuminaClean wordmark twice, the reference its own logo and a nav full of its product names —
and the critic's own evidence names "a duplicate LuminaClean logo". It did not argue from the brand, and
its reasoning is about panel contrast and attention order rather than about whose page it is, so the
verdict is worth acting on. But nothing stopped it from knowing, so calling it blind would claim more
than the setup delivered.

The leak was avoidable and the skill already implies the fix in prose — "replace the product name with
the same neutral token on both sides" — while `bars.md` §A's normalisation list covers dimensions,
format, file size and EXIF and **says nothing about masking brand marks in screenshots**. That is a real
gap in the skill, found by using it: from round 2, both sides get their logo and wordmark regions
blanked before staging. Recorded here rather than fixed mid-round, because changing the staging
procedure between a verdict and its follow-up would make the two rounds incomparable.

**What the round bought.** A named, actionable gap that does not depend on the leak: the entry panel
reads as a failed image rather than a door, and the decorative poster out-competes it for attention.
The critic also volunteered that our copy is the stronger of the two — useful, because it says the fix
is layout and hierarchy, not messaging.

## What must not drift (from `bars.md` §A)

- Class merging through `cn()` from `@/lib/utils`; no manual string concatenation.
- Enhance copy stays in `src/lib/enhance-strings.ts` — the Playwright specs match those strings
  verbatim, so a reworded label is a red `npm run test:e2e`.
- Accessible names and roles the E2E locators rely on (`getByRole` / `getByLabel`) survive every round.
- Inspection uses a served production build (`npm run build` detached + `npx wrangler dev --port 4321`),
  never `astro dev` — issue #15 breaks the enhance page there with "more than one copy of React".

## Honesty notes

- Blinding here defends against a critic's incidental bias, not against one that goes looking: a
  critic with filesystem access can hash the staged files against the frozen reference. Any verdict
  claimed as "blind" means blind in that sense and no stronger.
- Every round that touches tracked source ends with the Step 4 gates green before its verdict counts.

### Round 2 — critic's raw verdict, recorded before reveal

Fresh critic, no knowledge of round 1. Staging changed in exactly one way, disclosed to it: the top
header band is blacked out on **both** sides, so neither product's wordmark or nav is visible.

**better: B.**

**why.** B answers the visitor's first two questions in order and without effort — the headline names an
actual problem someone arrives with, the line under it says what happens and what it costs ("brighten it
instantly — right in your browser. No account needed."), and then a big unmistakable dashed box sits in
the middle saying "Drop your photo here", formats and size limit spelled out, bright button inside it.
"There is nowhere to be confused about where to begin." A is handsomer as a headline but fails the
practical half: its upload target is "faint grey rings on near-black" with text "set in a grey so dim it
reads as decoration, not as a control", and its headline "could describe a dozen different products".

**gap (now aimed at A).** Turn the empty right half into a real, visible upload target that is the
loudest element on screen: bordered filled panel, upload icon, plain-language line, formats and size
underneath, and the primary button moved **inside** the panel so the promise and the action are the same
object. "A visitor who cannot see the door does not read the sign."

**evidence.** Both PNGs opened directly, nothing else. The critic described A's ring-and-cloud target at
x≈1110, B's ~1020px dashed dropzone, the segmented Local / Cloud AI toggle and the "How it works" section
below the fold — pixel-level, not summary-level.

**Reveal (run after the above was written): ours = B. We won — `WINS`.**

### What round 2 actually establishes

**The named gap was closed and the verdict flipped.** Round 1's critic said our upload panel read as a
failed image and the poster out-shouted it; round 2's independent critic, with no knowledge of that,
picked our side and described the same region as the thing that makes the page work. That is the loop
doing its job: a specific, actionable gap, closed, and re-judged by someone who never saw the complaint.

**The masking held.** Round 1's critic volunteered "a duplicate LuminaClean logo" and could have known
whose page it judged. Round 2's evidence names no product, no brand and no URL — it argues from headline
copy, contrast and layout only. The verdict is still not a sandboxed blind (a determined critic could
hash the files against the frozen reference), but the trivial tell is gone, and the residual leak is the
one this workbench already discloses.

**One hunk in this round is unattributed.** The removal of the marketing poster from
`EnhanceWorkspace.tsx` appeared on disk at 21:01:38, inside the builder's working window; the builder
reports it did not write it and found the file already changed. The diff is exactly the second option
the round-1 critic offered ("drop it and let the upload panel run wide"), so it is on-brief and was kept
rather than reverted — but authorship is **unknown**, and a round where an unknown writer touched the
artifact under test measures a mixture. Asked of the user; recorded here either way.

**A build that reported success without building.** `npm run build` exited 0 while `dist/` stayed at the
previous build — the log carried an `rmdirSync` failure emptying the directory, held by a `workerd`
process tree that outlived the `wrangler dev` it belonged to. The first round-2 render was therefore the
round-1 page, and had it not been checked against the bundle contents, this round would have concluded
"the builder changed nothing". **Builds are now verified by grepping the built bundle for the change,
never by exit code.** Worth carrying into `bars.md` §A as a step, not just a note here.

**Also fixed inside the round, and worth flagging:** the working tree carried `aria-label="Upload an
image"` on two elements at once, which would have made `getByLabel` a strict-mode violation in four E2E
specs. Verified after the fix: exactly one element in `src/` carries that name.

### Round 3 — bar raised to Fotor, critic's raw verdict recorded before reveal

Round 2 was won, so the method says raise the bar rather than re-run the same one. The bar became the
second named default, `ref-02-fotor-masked.jpg` — a harder comparison than Let's Enhance, because it
carries a working before/after demo **and** a dashed upload panel with a button, i.e. it already does
what round 2 built. The artifact under test is unchanged from round 2; no builder ran.

Two staging fixes went in first, both prompted by the tooling rather than by taste:

- The helper warned that the two files differed **5.4×** in size (72 KB against 389 KB) — a flat dark
  page compresses to nothing next to a page full of photographs, and that is readable off a directory
  listing. Both sides were re-exported as JPEG at one fixed quality, bringing the ratio to **1.57×**.
  The superseded PNG staging was discarded unjudged.
- The consent banner that made `ref-02-fotor.png` unusable in round 1 was dismissed via its ✕ (never
  "Accept"), so the round-3 bar shows the page as a visitor sees it.

**better: A.**

**why.** A answers the only question a first-time visitor has — "will this make my photo look better?" —
without asking them to read anything: half the screen is a real before/after slider, muddy on one side
and sharp on the other, sitting immediately beside the upload panel, so "the proof and the action are in
the same glance". B _tells_ instead of showing. The critic volunteered that B's headline and subline are
"more specific and more honest" than A's generic pitch and that "No account needed" removes a real
objection — but above the fold B offers words plus a large empty dashed rectangle, so the visitor is
asked to hand over a photo on faith. It also flagged that B's **Local / Cloud AI toggle forces a
technical choice before the visitor knows what either option means**; A asks for nothing but the photo.

**gap.** Put visible proof of the result on the entry screen: a real before/after of a genuinely dark,
grainy night photo, at roughly dropzone size, beside the dropzone rather than below the fold — the same
shot, unedited on one side and brightened on the other, clearly labelled. "That single change converts
B's claim into evidence." If space is tight, take it from the engine toggle: that decision should move
**after** upload, not before it.

**evidence.** Both JPEGs opened directly, nothing else. The critic described A's slider handle, its
Before/After chips and its format list (JPG/JPEG/PNG/HEIF/HEIC/WEBP), and B's toggle, dropzone copy,
size limit and the "How it works" cards just entering the viewport — pixel-level on both sides.

**Reveal (run after the above was written): ours = B. The bar won — `BAR_WINS`.**

**Residual leak, disclosed.** Fotor names itself inside its body copy ("Fotor's free AI photo
enhancer"); our page carries no brand once the header is masked. A critic that noticed could infer which
side is the commercial product and, by elimination, which is ours. This verdict is therefore blinder than
round 1 but weaker than round 2, where neither side named itself. Masking a wordmark out of running prose
is not something the current capture recipe can do.

## Stop — the agreed ceiling, honoured

**Three rounds were agreed before the first builder ran, and three rounds is where this stops.** The loop
is visibly not exhausted: round 3 handed back a concrete, buildable gap and a fourth round would very
likely close it. That is exactly why the ceiling exists. It is recorded as unfinished rather than quietly
extended, and the next run starts from the gap above.

## Result against the bar

**What measurably improved.** The entry panel went from something a critic read as "an image that failed
to load" to the element two independent critics named as the reason the page works. Against Let's
Enhance the verdict flipped from loss to win in one round, judged by someone who never saw the first
complaint.

**What is still losing.** Against Fotor we lose, and the reason is not layout: **we claim a result we
never show**. Every competitor bar in this domain puts a before/after on the entry screen; we put ours
below the fold, behind an engine toggle the visitor cannot yet understand.

**Assumptions the user has not confirmed.** That P1 was the right piece to spend the ceiling on after P3
turned out to have no reachable bar; that the unattributed `EnhanceWorkspace.tsx` hunk (21:01:38) may be
kept; and that the two competitor captures are fair, current representations of those products.
