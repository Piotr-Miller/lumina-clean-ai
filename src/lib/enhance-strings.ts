/**
 * Single source of user-facing copy for the Enhance surface (screen `/`).
 *
 * i18n-readiness (change `enhance-ui-refresh`): the later DE/PL localization
 * slice localizes this screen by editing/branching THIS module only — no JSX
 * re-touching. Every value is byte-identical to the inline literal it replaced.
 *
 * ⚠️ Several values are load-bearing for the Playwright E2E specs, which match
 * them verbatim via getByRole/getByLabel/getByText (see the "E2E locator
 * contract" freeze list in context/changes/enhance-ui-refresh/plan.md). Do not
 * reword without updating the specs in the same change.
 *
 * Plain TS with no `astro:env` imports — importable from Astro frontmatter,
 * React islands, lib services, and Vitest alike (see lessons.md on module
 * loading). Internal Error messages that never reach the UI (e.g. "Image
 * failed to decode.") deliberately stay at their throw sites.
 */
export const STRINGS = {
  /** `src/pages/index.astro` — page shell. */
  page: {
    title: "LuminaClean AI — fix your night photos",
    /** E2E freeze: heading role. */
    heading: "Fix your night photos",
    subtitle: "Upload a dark, grainy shot and brighten it instantly — right in your browser. No account needed.",
    /** Idle-state key-visual banner (enhance-ui-refresh kit, state 01). */
    bannerAlt: "LuminaClean AI — from noise to perfection",
  },

  /**
   * `src/pages/index.astro` — below-the-fold content sections (change
   * landing-content, Phase 3). Static SSR copy for How-it-works, FAQ (native
   * `<details>`), and the guide teasers. Teaser title/cover/reading-time come
   * from the `guides` content collection; only the teaser blurb + section
   * chrome live here. Not E2E-frozen (static content carries no risk-map row).
   */
  landing: {
    howItWorks: {
      heading: "How it works",
      lede: "The two engines, the controls, and what's free — with the finer details waiting in tooltips right at each control.",
      cards: [
        {
          kicker: "Engines",
          title: "Local vs Cloud AI",
          body: "Local brightens instantly in your browser — nothing is uploaded. Cloud AI sends the photo to a night-photo model for a visibly cleaner result (free account required).",
        },
        {
          kicker: "Controls",
          title: "Sliders + Auto",
          body: "Auto reads your photo and sets the sliders; drag any of them to take over. Every slider explains itself when you hover or focus it.",
        },
        {
          kicker: "Cost",
          title: "What's free?",
          body: "Local is free and unlimited. Cloud AI is free within a small daily community limit — sliders never trigger processing; only the explicit process button does.",
        },
      ],
    },
    faq: {
      heading: "FAQ",
      items: [
        {
          q: "Is my photo uploaded anywhere?",
          a: "With the Local engine — never; everything happens in your browser. With Cloud AI the photo is uploaded over an encrypted connection, processed, and the source file is automatically deleted within 24 hours.",
        },
        {
          q: "Why does Cloud AI need an account?",
          a: "Cloud processing costs real GPU time. A free account plus a shared daily limit keeps it free for everyone.",
        },
        {
          q: "Which files can I upload?",
          a: 'JPG or PNG up to 25 MB. HEIC and RAW support is coming soon. PNGs with transparency get a one-click "Convert to RGB and try again" helper for the cloud model.',
        },
        {
          q: "Why did my first cloud photo take a few minutes?",
          a: "After a quiet period the AI model boots from cold — the first run can take a few minutes; the next ones finish in seconds.",
        },
      ],
    },
    guides: {
      heading: "Learn the craft",
      lede: "Three evergreen guides — also the SEO surface of the landing.",
      readLink: "Read the guide →",
      /** Teaser order + slug→blurb map; title/cover/min read come from the collection. */
      order: ["what-ruins-night-photos", "shoot-better-night-photos", "shooting-in-difficult-light"],
      teasers: {
        "what-ruins-night-photos":
          "Noise, underexposure, motion blur: which of the three your editor can rescue, and which you have to avoid at capture time.",
        "shoot-better-night-photos":
          "Brace, expose for the highlights, skip digital zoom, let night mode finish — practical habits that beat any filter.",
        "shooting-in-difficult-light":
          "Backlight, harsh sun, mixed colour, high contrast: name the light you're standing in, and the one move that saves the shot follows.",
      },
    },
  },

  /** `EngineToggle.tsx`. */
  engine: {
    /** E2E freeze: group aria-label. */
    groupLabel: "Processing engine",
    local: "Local",
    /** E2E freeze: button name. */
    cloud: "Cloud AI",
  },

  /** `ImageUploader.tsx`. */
  uploader: {
    ctaStrong: "Click to upload",
    ctaRest: "or drag & drop",
    constraints: "JPG or PNG · up to 25 MB",
    /** E2E freeze: file-input aria-label. */
    inputLabel: "Upload an image",
  },

  /** `BeforeAfterSlider.tsx`. */
  slider: {
    /** E2E freeze: slider aria-label. */
    ariaLabel: "Before and after comparison — drag or use arrow keys to compare",
    /** E2E freeze (chroma spec): img name derives as `"Your photo — enhanced"`. */
    enhancedAlt: (alt: string) => `${alt} — enhanced`,
    enhancedFallback: "Enhanced result",
    originalAlt: (alt: string) => `${alt} — original`,
    originalFallback: "Original",
    /** Decorative corner chips on the comparison stage (kit states 04/08). */
    beforeLabel: "Before",
    afterLabel: "After",
  },

  /** `EnhanceWorkspace.tsx` — actions, statuses, alts. */
  workspace: {
    photoAlt: "Your photo",
    selectedAlt: "Selected photo",
    /** E2E freeze: button name (the "photo loaded" signal). */
    enhance: "Enhance",
    enhancing: "Enhancing…",
    chooseAnother: "Choose another",
    /** E2E freeze: button name. */
    startOver: "Start over",
    submitting: "Submitting…",
    /** E2E freeze: button name. */
    processWithCloud: "Process with Cloud AI",
    converting: "Converting…",
    convertToRgb: "Convert to RGB and try again",
    /** E2E freeze: button name. */
    tryAgain: "Try again",
    /** E2E freeze: processing status line (asserted visible, then gone). */
    enhancingInCloud: "Enhancing in the cloud…",
    coldStartHint: "The first run after idle can take a few minutes.",
    convertFailed: "We couldn't convert this image. Please try another photo.",
  },

  /** `CloudSignInPrompt.tsx` — the anonymous Cloud gate. */
  signInPrompt: {
    /** E2E freeze: heading (seed spec asserts visible for anon, gone signed-in). */
    heading: "Sign in to use Cloud AI",
    body: "Cloud AI delivers a noticeably cleaner result than the local engine. Sign in (or create a free account) to process this photo in the cloud — your photo stays loaded.",
    signIn: "Sign in",
    createAccount: "Create account",
  },

  /** `DownloadButton.tsx`. */
  download: {
    /** E2E freeze: button name. */
    button: "Download",
  },

  /** `ParameterPanel.tsx` (S-12). */
  panel: {
    heading: "Adjustments",
    auto: "Auto",
    autoOn: "on",
    autoOff: "off",
    adjusted: "· adjusted",
    recalculate: "Recalculate",
    restoreAuto: "Restore Auto",
    provisionalNote: "Provisional — Cloud Auto values are conservative estimates and may be refined.",
    paramLabels: {
      gamma: "Brightness (gamma)",
      blur: "Smoothing (blur)",
      strength: "Denoise strength",
    },
  },

  /** `useLocalEnhance.ts` — Local engine failures. */
  localErrors: {
    tooLarge: (maxDimension: number) =>
      `This photo is too large to process in your browser (max ${String(maxDimension)}×${String(maxDimension)} px) — try a smaller copy.`,
    genericFailure:
      "We couldn't process this image — it may be corrupted or in an unsupported format. Try another photo.",
  },

  /** `useCloudSubmit.ts` — submit-stage failures. */
  cloudSubmitErrors: {
    noFile: "Choose a photo first.",
    genericFailure: "Couldn't submit to Cloud AI. Please try again.",
  },

  /**
   * `cloud-job-decisions.ts` + `useCloudJob.ts` — pipeline failure copy.
   * Re-exported by `cloud-job-decisions.ts` under its original names
   * (TIMEOUT_MESSAGE, …) so tests and consumers keep their imports.
   */
  cloudErrors: {
    /** E2E freeze: stall spec asserts this exact alert text. */
    timeout: "Cloud processing took too long. Please try again.",
    genericFailed: "Cloud processing failed. Please try again.",
    providerRateLimited: "Cloud AI is busy right now — please try again in a moment, or switch to the Local engine.",
    rgbaAlpha: "This image has a transparency layer the cloud model can't read. Convert it to RGB and try again.",
    resultLoad: "The enhanced result couldn't be loaded. Please try again.",
  },

  /** `cloud-upload.client.ts` — create-job route + signed-upload failures. */
  uploadErrors: {
    route: {
      unauthorized: "Please sign in to use Cloud AI.",
      invalid_body: "This photo can't be sent to Cloud AI — please use a JPG or PNG.",
      daily_cap_reached: "The daily Cloud AI limit has been reached. Try the Local engine, or come back tomorrow.",
      internal_error: "Cloud processing is temporarily unavailable. Please try again.",
    },
    genericRoute: "Couldn't start Cloud processing. Please try again.",
    uploadTooLarge: "This photo is too large to upload (max 25 MB). Try a smaller copy.",
    uploadRejected: "The upload link was rejected. Please try again.",
    uploadFailed: "Upload failed. Please try again.",
    network: "Couldn't reach Cloud AI — check your connection and try again.",
  },

  /** `image-helpers.ts` — file validation (shared by Local + Cloud submit). */
  fileValidation: {
    heicUnsupported: "HEIC photos aren't supported yet — please convert to JPG or PNG and try again.",
    unsupportedType: "Unsupported file type. Please upload a JPG or PNG image.",
    tooLarge: "This image is too large (max 25 MB). Try a smaller copy.",
  },
} as const;
