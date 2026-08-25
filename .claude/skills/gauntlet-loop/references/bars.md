# Bars — where a Gauntlet Loop applies in this repo

A bar is something the critic can **open and compare against**. If you cannot name the command that
renders the bar and the command that renders our output, you do not have a bar yet.

| #   | Domain                   | The bar                                               | Cost of a round      |
| --- | ------------------------ | ----------------------------------------------------- | -------------------- |
| A   | UI / visual surfaces     | Frozen reference screenshots, blind A/B               | free (local build)   |
| B   | Local-engine output      | The **frozen Bread (cloud) output** on the same photo | free after freezing  |
| C   | Performance-bounded pass | A numeric budget + its existing bench harness         | free                 |
| D   | Guides / landing prose   | Reference articles + hard SEO checks                  | free                 |
| E   | AI code-reviewer prompts | Frozen ground truth + the committed graders           | **paid model calls** |
| F   | Test-suite strength      | Surviving Stryker mutants on a risk module            | CPU-expensive        |

## How to propose a bar — every domain, no exceptions

**You propose the reference; the user confirms or rejects it. Do not ask the user to name candidates,
and do not lead with "name one, or let me pick".** Performing the reference search is your job, not
theirs. Each domain below carries named defaults — take one, or find a better fit yourself and say why.

Your **first response** on any surface must carry all four of these, or it is not a proposal:

1. **A named candidate** — the actual product, article, number or file, not a category.
2. **One sentence of why** it is a useful bar for this surface.
3. **The handling**, stated up front: third-party material is comparison-only, frozen once into the
   gitignored `scratchpad/gauntlet/<slug>/reference/`, hash-pinned in the workbench, **never committed**
   — this repo is public — and a photo belonging to someone else needs their consent first.
4. **The stop-condition question**, because the ceiling is the user's budget and never your assumption.

- Good: "I propose Let's Enhance because its upload-to-result workspace is directly comparable to ours.
  I would capture it once into the gitignored scratchpad, comparison only, nothing committed. Confirm
  that bar, or reject it; I will not start the loop until you do — and how many rounds do you want?"
- Bad: "Name two products you like, or let me choose some references."

Verify a candidate is still live and reachable without a login immediately before freezing it. A named
default that 404s is not a bar; find and propose a replacement rather than handing the problem back.

## Reference material never enters git

**This repository is public.** Reference bytes — competitors' screenshots, other people's articles,
users' photos, cloud outputs derived from them — are somebody else's property, sometimes somebody's
private data, and always repo bloat. None of it belongs in a tracked path.

- **Bytes** live in the gitignored `scratchpad/gauntlet/<slug>/reference/`. Nothing under
  `context/changes/` and nothing under `context/archive/`.
- **The pin lives in the workbench**, as a provenance ledger — one row per reference file:

  | file           | what it is        | origin (URL or "shot by <who>, <date>") | rights                       | sha256  |
  | -------------- | ----------------- | --------------------------------------- | ---------------------------- | ------- |
  | `ref-01.png`   | landing reference | https://… captured 2026-08-25           | third-party, comparison only | `9f2c…` |
  | `night-03.jpg` | source photo      | shot by the maintainer                  | owned, consented             | `41ab…` |

- **Verify the hashes before each round.** That is what makes the bar frozen; the bytes being local
  does not weaken the freeze, an unchecked hash does. Use the helper rather than `sha256sum`, which
  this repo's primary shell does not have:

  ```
  npx tsx scripts/gauntlet-stage.ts hash scratchpad/gauntlet/<slug>/reference/<name>.<ext>
  ```

- A photo that belongs to someone else needs their consent before it becomes a reference — and it still
  does not get committed.
- Reference material is for **comparison only**. Never copy layout, wording, or brand from it.

---

## A. UI and visual surfaces

**Targets:** `src/pages/index.astro`, `src/pages/guides/[slug].astro`, `src/pages/auth/*.astro`,
`src/components/enhance/*` (`EnhanceWorkspace`, `BeforeAfterSlider`, `ParameterPanel`, `EngineToggle`,
`ImageUploader`, `DownloadButton`).

**Bar.** Two or three reference screenshots of comparable products that are genuinely better at the
same job, captured once into `scratchpad/gauntlet/<slug>/reference/` (gitignored — see "Reference
material never enters git" above) and hash-pinned in the workbench. Freeze them: a bar that changes
between rounds measures nothing.

**Named defaults for the Enhance workspace** (`src/components/enhance/*`):

- [Let's Enhance](https://letsenhance.io/enhancer) — the closest browser flow to compare for
  upload → enhancement settings → result/download.
- [Fotor AI Image Enhancer](https://www.fotor.com/ai-image-enhancer/) — a useful second candidate for
  one-click enhancement, progress, and before/after presentation.

**Named defaults for the landing** (`src/pages/index.astro`, judged as design rather than copy — the
prose belongs to §D):

- [Topaz Photo AI](https://www.topazlabs.com/topaz-photo-ai) — a one-upload photo-enhancement product
  whose landing does our job (show a transformation, get you to try it) with far stronger craft.
- [Photoroom](https://www.photoroom.com/) — a consumer photo tool with a landing built around the
  before/after moment, useful for hero and CTA comparison.

Auth pages have no named default: propose the sign-in screen of a product in this list, or of any tool
whose onboarding you can justify as comparable. Follow "How to propose a bar" above in every case.

Capture ours and the references at the **same viewport and the same export settings** — the blind A/B
in `critic-contract.md` is defeated by a size or format mismatch before the critic even looks.

**How the critic inspects the real thing.**

```
npm run build          # run DETACHED — a foreground build fails on the prerender loopback
npx wrangler dev --port 4321
```

Screenshot the served page (Playwright, or the browser tools) at the stated viewport, then stage it
against the reference through the blind procedure in `critic-contract.md` — the critic receives two
paths, never a labelled pair. **Never `astro dev`** for visual judgement: its Vite SSR dep-optimizer
hits issue #15 and the enhance page fails with "more than one copy of React".

**What must not drift while the loop runs.**

- Class merging goes through `cn()` from `@/lib/utils`. No manual string concatenation.
- shadcn/ui components stay in `src/components/ui/`, "new-york" variant; add with `npx shadcn@latest add`.
- No Next.js directives (`"use client"` etc.). Interactive logic → hooks in `src/components/hooks/`.
- **User-facing copy lives in `src/lib/enhance-strings.ts`**, not inline in JSX. That module is the
  single source for the Enhance surface and the reason the parked S-15 localization slice is cheap;
  inlining a literal silently undoes it.
- Several of those strings are **load-bearing for the Playwright specs**, which match them verbatim via
  `getByRole` / `getByLabel` / `getByText`. A visual round that reworded a label or removed an
  accessible name must run `npm run test:e2e` and update the specs in the same round — or it has lost
  the round.

---

## B. Local-engine output quality — the strongest bar this repo has

**Targets:** `src/lib/engines/local-engine.ts`, `chroma-denoise.ts`, `auto-params.ts`, `image-helpers.ts`.

**Bar: the Cloud AI (Bread) result on the same photo.** This is already the product's stated success
criterion — "cloud result is noticeably better than local" (`idea-notes.md`). The distance between the
two engines _is_ the gap the local engine should be closing, and it is a real image a critic can look
at rather than an opinion about denoising.

**Freeze the bar once, then never call the cloud again.**

1. Pick 5–8 representative night photos (varied: high shadow noise, colour cast, mixed light, a clipped
   highlight, a near-black frame).
2. Produce their Bread outputs **once** in a controlled environment. Save pairs as
   `<name>.source.jpg` + `<name>.bread.jpg` in `scratchpad/gauntlet/<slug>/reference/` — gitignored,
   hash-pinned in the workbench. **User photos and their cloud outputs are never committed**, and a
   photo you did not shoot needs its owner's consent before it becomes a bar.
3. Every subsequent round runs only the local engine over the frozen sources. **Zero cloud ops.**

**Cost rule — non-negotiable.** Cloud AI ops are metered and globally capped: `CLOUD_DAILY_CAP` is **3**
in production (`0` is the kill-switch), shared across _all_ users. A loop that submits cloud jobs burns
real Replicate money and denies the cap to actual users. Never point a loop at production, and never let
a test submit a real cloud job. See `guardrails.md`.

**Producing references: Bread rejects RGBA input** — feed it 3-channel RGB JPG. An alpha PNG fails.

**How the critic inspects.** Decode ours and the frozen Bread output, crop both identically, and stage
them blind (`critic-contract.md`). The critic compares at 100 %: shadow noise (luma and chroma
separately), colour cast, halo around high-contrast edges, clipped highlights, and whether detail
survived the denoise. Same source photo, same crop, same zoom on both sides — a mismatch there makes
the comparison meaningless whether or not it is blind. Numeric measures may _support_ a verdict; they
do not replace looking at the image.

**What must not drift.**

- `strength` stays within `[0.0, 0.2]` (`auto-params.ts` `strength: { min: 0.0, max: 0.2 }`;
  `BREAD_STRENGTH = 0.2`) — a cost-safety invariant, not a tuning knob to widen.
- The chroma post-pass skips above `MAX_CHROMA_POSTPASS_PIXELS` (12 MP) — that guard is a main-thread
  budget, not an obstacle.
- Auto-recommended values must stay sane defaults; the panel exists so a user _can_ override, not so
  Auto can be sloppy.
- Local is honestly "gamma + Gaussian blur", not AI. Do not let a copy round imply otherwise.

---

## C. Performance-bounded passes

**Bar: a stated numeric budget plus the harness that measures it.** For the chroma pass the budget is
"~12 MP within 2 s on the maintainer reference desktop" and the harness already exists:

```
npx tsx scripts/benchmarks/chroma-denoise-bench.ts
```

It uses a deterministic synthetic worst case (no `Math.random`), an odd iteration count for a clean
median, and a discarded warmup — so the numbers are comparable across rounds.

**The critic reads the benchmark stdout, never the builder's claim about it.** And the harness is
frozen for the duration: a builder that "improves" the number by editing the benchmark has lost the
round. Harness changes are a separate change with their own review.

---

## D. Guides and landing prose

**Targets:** `src/content/guides/*.md`, the landing sections and FAQ in `src/pages/index.astro`.

**Bar: two or three genuinely better articles on the same question**, plus hard checks the critic can
verify rather than judge.

**Named defaults for the guides** — our three are night / low-light photography explainers, so compare
against the publications that own that subject. Pick the single article on the same question as the
guide in hand, not the site root, and follow "How to propose a bar" above:

- [Photography Life](https://photographylife.com/) — its night and low-light tutorials: long-form,
  technically exact, generous with worked examples.
- [Digital Photography School](https://digital-photography-school.com/) — its low-light and
  night-shooting guides: practical, step-by-step, beginner-first, strong scannable structure.

For the landing prose and FAQ, compare against the copy on the §A landing defaults above rather than an
article. **These are somebody else's words**: comparison only, frozen once into the gitignored
`scratchpad/gauntlet/<slug>/reference/`, hash-pinned, never committed, and never a source to copy
phrasing or structure from.

The hard checks:

- frontmatter `title` + `description` present and specific (see the existing guides for the register);
- meta / OG / canonical rendered; `site` is `https://luminacleanai.com` in `astro.config.mjs`;
- the page appears in the `@astrojs/sitemap` output (the integration lists `/` plus the three guides;
  it is emitted into `dist/client/` by the build — an "it's missing from `src/pages/`" finding is a
  known false positive);
- internal links resolve against a served build.

**What must not drift.** These pages are public marketing claims. Every product statement must be true
today: RAW and HEIC are **"coming soon"**, not shipped; UI localization is parked; the local engine is a
Canvas fallback. A critic optimising for punchiness will drift into claims the product does not honour —
truth outranks the bar.

---

## E. AI code-reviewer prompt quality — paid, so pre-register

**Targets:** `packages/code-reviewer/src/prompts.ts` and the finder / judge / impl-review pipeline.

**Bar: frozen ground truth plus the graders that are already committed.**

- `packages/code-reviewer/scripts/fabrication-grade.mjs` — window-relative M1/M2/M3 fabrication grading
  against a frozen ground-truth defence inventory.
- `packages/code-reviewer/scripts/offdiff-backtest.mjs` — replays a shipped pure function over real
  archived reviews. **No model calls, no key, no spend** — always the first thing to run.
- `packages/code-reviewer/scripts/phase4-probe.mjs` — exercises the implementation-review pass end to
  end against a known diff and bypasses the CI cost gate (a deliberately-buggy probe PR measures
  nothing: bad code fails the _code_ review and the gate then skips the third pass).
- `packages/code-reviewer/evals/` — promptfoo config, fixtures, and the result schema.

**Hard rules for this domain.**

- **Ground truth must be hashed and the hash CHECKED before the first paid call.** A hash written next
  to the thing it hashes always matches. A formatting pass that lands _after_ a hash was taken is the
  freeze violation `assertGroundTruthFrozen` exists to catch — and it has already cost one paid arm.
  `.prettierignore` protects `context/archive/` for exactly this reason.
- **Never write under `context/archive/`.** Archived changes are immutable. Correcting a record there
  also does not correct `context/foundation/roadmap.md` — fix both or neither.
- **No paid arm without a new, pre-registered hypothesis** and a written stop condition. Re-running a
  measured arm to see if the number moves is not a hypothesis.
- When reading a review as evidence, **check the finding paths in `review.json`**. A red review on a PR
  that carries fixture payload may be describing the fixture, not the change.

---

## F. Test-suite strength

**Bar: the surviving mutants Stryker reports on a risk-critical module.**

```
npx stryker run --mutate "src/lib/services/photo-job.service.ts"
npx stryker run --mutate "src/lib/engines/chroma-denoise.ts:12-48"
```

Scope it to code the current change touches or a risk from `context/foundation/test-plan.md`.
`npm run test:mutation` runs the default `src/lib/**` scope; `vitest.config.stryker.ts` excludes
`jobs.rls.test.ts` (needs a live local Supabase — too slow per mutant). Report: `reports/mutation/mutation.html`.

**The critic's question is "would this mutant have been a real bug?" — not "did the score go up".**
Do not chase 100 %. Add an assertion only when the mutant represents a user-visible or
business-relevant failure; consciously ignore equivalent and cosmetic ones. Pinning implementation
detail to kill a cosmetic mutant is itself a vibe test, and a loop optimising a percentage will produce
them by the dozen. This is the one domain where the bar must be read with judgment rather than
maximised.
