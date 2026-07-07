import { useEffect, useRef, useState } from "react";
import { CircleAlert, CloudUpload, RotateCcw, Sparkles } from "lucide-react";
import { STRINGS } from "@/lib/enhance-strings";
import type { BreadParams, EngineId, LocalParams, LumaStats } from "@/lib/engines/types";
import { PARAM_RANGES, recommendParams } from "@/lib/engines/auto-params";
import { sampleImageLuma } from "@/lib/engines/auto-params.client";
import { flattenToRgbJpeg } from "@/lib/engines/canvas-helpers";
import { Button } from "@/components/ui/button";
import { useBeforeUnloadWarning } from "@/components/hooks/useBeforeUnloadWarning";
import { useCloudJob } from "@/components/hooks/useCloudJob";
import { useCloudSubmit } from "@/components/hooks/useCloudSubmit";
import { useDebouncedValue } from "@/components/hooks/useDebouncedValue";
import { useLocalEnhance } from "@/components/hooks/useLocalEnhance";
import { BeforeAfterSlider } from "./BeforeAfterSlider";
import { CloudSignInPrompt } from "./CloudSignInPrompt";
import { DownloadButton } from "./DownloadButton";
import { EngineToggle } from "./EngineToggle";
import { ImageUploader } from "./ImageUploader";
import { ParameterPanel } from "./ParameterPanel";
import { withOverride, type BreadParamKey, type LocalParamKey, type ParamKey } from "./param-panel-helpers";

interface EnhanceWorkspaceProps {
  /** Whether the current visitor has a session. Drives the Cloud sign-in gate. */
  isAuthenticated: boolean;
  /** Publishable Supabase URL for the browser Realtime client (S-04); `null` if unresolved. */
  supabaseUrl: string | null;
  /** Publishable anon key (RLS-gated) for the browser Realtime client; `null` if unresolved. */
  supabaseAnonKey: string | null;
  /** Short-lived user JWT for the Realtime subscription; `null` for anonymous visitors. */
  accessToken: string | null;
  /** Server-resolved chroma post-pass flag (runtime secret); gates the cloud-result post-pass. */
  chromaEnabled: boolean;
}

/** Spinner tints (kit): cyan-tipped on dark surfaces, void-dark inside the light beam primary. */
const SPINNER_ON_DARK = "border-(--lc-step-3) border-t-[#6fe3f2]";
const SPINNER_ON_BEAM = "border-[#050507]/30 border-t-[#050507]";

/** Auto-less defaults — the panel starts here until Auto computes from the image. */
const LOCAL_DEFAULTS: LocalParams = { gamma: PARAM_RANGES.local.gamma.default, blur: PARAM_RANGES.local.blur.default };
const BREAD_DEFAULTS: BreadParams = {
  gamma: PARAM_RANGES.cloud.gamma.default,
  strength: PARAM_RANGES.cloud.strength.default,
};

/** Local re-process debounce while a slider is dragged (full-res, no live preview). */
const LOCAL_DEBOUNCE_MS = 350;

/** Decode an object URL into a loaded HTMLImageElement (rejects on bad data). */
function decodeImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve(img);
    };
    img.onerror = () => {
      reject(new Error("Image failed to decode."));
    };
    img.src = url;
  });
}

/**
 * The single React island for the enhance flow. Holds the engine selection and
 * the source File, composes the reusable shell (uploader → action → slider →
 * download), and drives Local via `useLocalEnhance` and Cloud via
 * `useCloudSubmit`. The action area renders purely from engine + auth + the
 * active engine's status, so switching engines preserves the loaded photo but
 * never shows one engine's result alongside the other's action.
 *
 * S-12 adds the parameter panel: a deterministic Auto recommendation computed
 * from the selected image (no network), per-slider manual override, debounced
 * Local re-processing, and Cloud (Bread) params that ride the single create-job
 * POST — sliders/Auto never issue a request (cost-safety invariant).
 */
export default function EnhanceWorkspace({
  isAuthenticated,
  supabaseUrl,
  supabaseAnonKey,
  accessToken,
  chromaEnabled,
}: EnhanceWorkspaceProps) {
  const enhancer = useLocalEnhance();
  const [engine, setEngine] = useState<EngineId>("local");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const cloudSubmit = useCloudSubmit(sourceFile);
  const cloudJob = useCloudJob({
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    accessToken,
    jobId: cloudSubmit.jobId,
    sourceFileName: sourceFile?.name ?? null,
    chromaEnabled,
  });

  // --- S-12 parameter + Auto state ---
  const [localParams, setLocalParams] = useState<LocalParams>(LOCAL_DEFAULTS);
  const [breadParams, setBreadParams] = useState<BreadParams>(BREAD_DEFAULTS);
  const [autoOn, setAutoOn] = useState(true);
  const [localOverridden, setLocalOverridden] = useState<ReadonlySet<ParamKey>>(new Set());
  const [breadOverridden, setBreadOverridden] = useState<ReadonlySet<ParamKey>>(new Set());
  const [stats, setStats] = useState<LumaStats | null>(null);

  // RGBA → RGB recovery (Phase 2): `converting` disables the button + shows a
  // spinner while the canvas flatten runs; `convertError` surfaces a flatten
  // failure in the cloud error line.
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  const localProcessing = enhancer.status === "processing";
  const cloudSubmitting = cloudSubmit.status === "submitting";
  const busy = localProcessing || cloudSubmitting;

  const { sourceUrl, resultUrl, resultBlob, resultWidth, resultHeight, downloadName } = enhancer;

  // Read current Auto without making it a dep of the analyze effect (toggling
  // Auto must not re-decode the image; the toggle handler recomputes instead).
  const autoOnRef = useRef(autoOn);
  useEffect(() => {
    autoOnRef.current = autoOn;
  });

  // Analyze the selected image once (client-side, no network) and, if Auto is
  // on, populate the sliders from the recommendation — all inside the async
  // callback so no setState fires synchronously in the effect body. Reset
  // clears `stats` explicitly, so the effect only needs the truthy branch.
  useEffect(() => {
    if (!sourceUrl) return;
    let cancelled = false;
    decodeImage(sourceUrl)
      .then((img) => {
        if (cancelled) return;
        const s = sampleImageLuma(img);
        setStats(s);
        if (autoOnRef.current) {
          setLocalParams(recommendParams(s, "local"));
          setBreadParams(recommendParams(s, "cloud"));
          setLocalOverridden(new Set());
          setBreadOverridden(new Set());
        }
      })
      .catch(() => {
        /* analysis failure → keep current params */
      });
    return () => {
      cancelled = true;
    };
  }, [sourceUrl]);

  // Keep the latest enhance fn reachable from the debounce effect without making
  // it a dep (the hook returns a fresh identity each render, which would
  // otherwise re-fire the effect every render).
  const enhanceRef = useRef(enhancer.enhance);
  useEffect(() => {
    enhanceRef.current = enhancer.enhance;
  });

  // Convert-and-retry re-submit (Phase 2). The convert handler swaps the source
  // File via the uploader's accept seam and flips `pendingResubmitRef`; the
  // effect below fires the cloud submit once the new File has propagated to
  // `useCloudSubmit` (whose `submit` closes over `[file]`). A REF trigger (not
  // state) keeps the submit off the effect's synchronous setState path — the
  // same no-sync-setState discipline the analyze/debounce effects use to satisfy
  // `react-hooks/set-state-in-effect`. The latest `submit`/`breadParams` are read
  // through refs (their identity changes each render) — refreshed here so the
  // updater runs before the sourceFile-keyed effect below.
  const pendingResubmitRef = useRef(false);
  const cloudSubmitRef = useRef(cloudSubmit.submit);
  const breadParamsRef = useRef(breadParams);
  useEffect(() => {
    cloudSubmitRef.current = cloudSubmit.submit;
    breadParamsRef.current = breadParams;
  });
  useEffect(() => {
    if (!pendingResubmitRef.current || !sourceFile) return;
    pendingResubmitRef.current = false;
    void cloudSubmitRef.current(breadParamsRef.current);
  }, [sourceFile]);

  // Params last handed to the engine. Guards the debounce effect from repeating
  // identical work when it re-fires on a status change (which would loop), and
  // lets a change made mid-process replay once processing finishes.
  const lastEnhancedRef = useRef<LocalParams | null>(null);

  // Debounced Local re-render: re-run the engine when Local params settle, but
  // only once a result already exists (the first enhance is the explicit click).
  // `enhancer.status` is a dep so a slider change made WHILE a previous re-render
  // is in flight replays here when status returns to "done" (F1) — the
  // `lastEnhancedRef` guard stops that same transition from looping.
  const debouncedLocalParams = useDebouncedValue(localParams, LOCAL_DEBOUNCE_MS);
  useEffect(() => {
    if (engine !== "local") return;
    if (enhancer.status !== "done") return;
    if (debouncedLocalParams === lastEnhancedRef.current) return;
    lastEnhancedRef.current = debouncedLocalParams;
    void enhanceRef.current(debouncedLocalParams);
  }, [debouncedLocalParams, engine, enhancer.status]);

  const localResultReady =
    engine === "local" &&
    enhancer.status === "done" &&
    resultUrl !== null &&
    resultBlob !== null &&
    downloadName !== null &&
    resultWidth !== null &&
    resultHeight !== null;

  // Destructured to local consts so the `cloudResultReady` `&&` chain narrows
  // the nullable fields to non-null inside the JSX (property accesses on
  // `cloudJob` would re-widen) — mirrors the `localResultReady` pattern.
  const {
    phase: cloudPhase,
    afterUrl: cloudAfterUrl,
    resultBlob: cloudBlob,
    resultWidth: cloudWidth,
    resultHeight: cloudHeight,
    downloadName: cloudDownloadName,
    errorMessage: cloudError,
    coldStartHint: cloudColdStartHint,
    isRgbaError: cloudIsRgbaError,
  } = cloudJob;
  const cloudResultReady =
    engine === "cloud" &&
    isAuthenticated &&
    cloudPhase === "succeeded" &&
    cloudAfterUrl !== null &&
    cloudBlob !== null &&
    cloudDownloadName !== null &&
    cloudWidth !== null &&
    cloudHeight !== null;

  // Guard an accidental refresh/close while there's unsaved work in flight — a
  // loaded photo (either engine) or an in-flight cloud job. A reload can't
  // restore a File/object-URL, so the native prompt is the fix, not recovery.
  useBeforeUnloadWarning(sourceUrl !== null || cloudPhase === "processing");

  function handleAccepted(file: File, objectUrl: string) {
    setSourceFile(file);
    enhancer.onAccepted(file, objectUrl);
  }

  function handleReset() {
    setSourceFile(null);
    enhancer.reset();
    cloudSubmit.reset();
    setLocalParams(LOCAL_DEFAULTS);
    setBreadParams(BREAD_DEFAULTS);
    setLocalOverridden(new Set());
    setBreadOverridden(new Set());
    setAutoOn(true);
    setStats(null);
    lastEnhancedRef.current = null;
    // Disarm a pending convert-retry so a fresh upload (null → file) can't
    // inherit it and auto-submit.
    pendingResubmitRef.current = false;
    setConvertError(null);
    setConverting(false);
  }

  // RGBA recovery: flatten the source to an opaque RGB JPEG, hand it to the SAME
  // accept seam the uploader uses (keeps the preview/local state aligned and feeds
  // `useCloudSubmit`), then arm the re-submit effect. Flattening is one canvas
  // encode; the spinner covers it and the guard blocks a double click.
  async function handleConvertToRgb() {
    if (!sourceFile || converting) return;
    setConverting(true);
    setConvertError(null);
    try {
      const flattened = await flattenToRgbJpeg(sourceFile);
      const objectUrl = URL.createObjectURL(flattened);
      handleAccepted(flattened, objectUrl);
      pendingResubmitRef.current = true;
    } catch {
      setConvertError(STRINGS.workspace.convertFailed);
    } finally {
      setConverting(false);
    }
  }

  /** Recompute every engine's params from the current image stats and clear overrides. */
  function applyAuto() {
    if (!stats) return;
    setLocalParams(recommendParams(stats, "local"));
    setBreadParams(recommendParams(stats, "cloud"));
    setLocalOverridden(new Set());
    setBreadOverridden(new Set());
  }

  /** Flip Auto; re-enabling it restores the recommendation for the current image. */
  function handleToggleAuto() {
    const next = !autoOn;
    setAutoOn(next);
    if (next) applyAuto();
  }

  function handleParamChange(key: ParamKey, value: number) {
    if (engine === "local") {
      setLocalParams((p) => ({ ...p, [key]: value }));
      setLocalOverridden((s) => withOverride(s, key as LocalParamKey));
    } else {
      setBreadParams((p) => ({ ...p, [key]: value }));
      setBreadOverridden((s) => withOverride(s, key as BreadParamKey));
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="text-center">
        <EngineToggle engine={engine} onChange={setEngine} disabled={busy} />
      </div>

      {/* Idle: uploader beside the key-visual banner (kit state 01 — the only
          state where the LCAI marketing graphic appears; dropped on mobile). */}
      {!sourceUrl && (
        <div className="grid items-stretch gap-6 md:grid-cols-[1.05fr_1fr]">
          <ImageUploader onAccepted={handleAccepted} disabled={busy} />
          <img
            src="/images/enhance-idle-banner.jpg"
            alt={STRINGS.page.bannerAlt}
            width={560}
            height={560}
            loading="eager"
            className="hidden h-full min-h-[420px] w-full rounded-xl object-cover md:block"
          />
        </div>
      )}

      {sourceUrl && (
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col items-center gap-4">
            {/* A ready Local OR Cloud result swaps the preview for the slider; every other
                state shows the plain preview. The `*ResultReady` flags already narrow the
                respective resultUrl/width/height to non-null. */}
            {localResultReady ? (
              <BeforeAfterSlider
                beforeSrc={sourceUrl}
                afterSrc={resultUrl}
                width={resultWidth}
                height={resultHeight}
                alt={STRINGS.workspace.photoAlt}
              />
            ) : cloudResultReady ? (
              <BeforeAfterSlider
                beforeSrc={sourceUrl}
                afterSrc={cloudAfterUrl}
                width={cloudWidth}
                height={cloudHeight}
                alt={STRINGS.workspace.photoAlt}
              />
            ) : (
              <img
                src={sourceUrl}
                alt={STRINGS.workspace.selectedAlt}
                className="max-h-[60vh] w-full rounded-xl object-contain"
              />
            )}

            {/* LOCAL — not yet enhanced */}
            {engine === "local" && !localResultReady && (
              <div className="flex flex-wrap justify-center gap-3">
                <Button
                  type="button"
                  variant="beam"
                  onClick={() => {
                    lastEnhancedRef.current = localParams;
                    void enhancer.enhance(localParams);
                  }}
                  disabled={localProcessing}
                >
                  {localProcessing ? (
                    <span className="flex items-center gap-2">
                      <span className={`size-4 animate-spin rounded-full border-2 ${SPINNER_ON_BEAM}`} />
                      {STRINGS.workspace.enhancing}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Sparkles className="size-4" />
                      {STRINGS.workspace.enhance}
                    </span>
                  )}
                </Button>
                <Button type="button" variant="lcquiet" onClick={handleReset} disabled={localProcessing}>
                  {STRINGS.workspace.chooseAnother}
                </Button>
              </div>
            )}

            {/* LOCAL — enhanced result (localResultReady narrows resultBlob/downloadName to non-null) */}
            {localResultReady && (
              <div className="flex flex-wrap justify-center gap-3">
                <DownloadButton blob={resultBlob} filename={downloadName} />
                <Button type="button" variant="lcquiet" onClick={handleReset} className="gap-2">
                  <RotateCcw className="size-4" />
                  {STRINGS.workspace.startOver}
                </Button>
              </div>
            )}

            {/* CLOUD — anonymous: prompt to sign in (photo stays loaded) */}
            {engine === "cloud" && !isAuthenticated && (
              <>
                <CloudSignInPrompt />
                <Button type="button" variant="lcquiet" onClick={handleReset}>
                  {STRINGS.workspace.chooseAnother}
                </Button>
              </>
            )}

            {/* CLOUD — signed in, not yet submitted */}
            {engine === "cloud" && isAuthenticated && cloudSubmit.status !== "submitted" && (
              <div className="flex flex-wrap justify-center gap-3">
                <Button
                  type="button"
                  variant="beam"
                  onClick={() => {
                    void cloudSubmit.submit(breadParams);
                  }}
                  disabled={cloudSubmitting}
                >
                  {cloudSubmitting ? (
                    <span className="flex items-center gap-2">
                      <span className={`size-4 animate-spin rounded-full border-2 ${SPINNER_ON_BEAM}`} />
                      {STRINGS.workspace.submitting}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <CloudUpload className="size-4" />
                      {STRINGS.workspace.processWithCloud}
                    </span>
                  )}
                </Button>
                <Button type="button" variant="lcquiet" onClick={handleReset} disabled={cloudSubmitting}>
                  {STRINGS.workspace.chooseAnother}
                </Button>
              </div>
            )}

            {/* CLOUD — submitted. The live pipeline status (pushed via Realtime) drives the
                terminal UX: a spinner while processing, the result download once succeeded
                (the slider is rendered above), or the error + Try again/Start over on
                failure/timeout. `cloudResultReady` narrows cloudBlob/cloudDownloadName to non-null. */}
            {engine === "cloud" && isAuthenticated && cloudSubmit.status === "submitted" && (
              <>
                {cloudResultReady ? (
                  <div className="flex flex-wrap justify-center gap-3">
                    <DownloadButton blob={cloudBlob} filename={cloudDownloadName} />
                    <Button type="button" variant="lcquiet" onClick={handleReset} className="gap-2">
                      <RotateCcw className="size-4" />
                      {STRINGS.workspace.startOver}
                    </Button>
                  </div>
                ) : cloudPhase === "failed" ? (
                  <div className="flex flex-wrap justify-center gap-3">
                    {/* RGBA recovery: flatten alpha → RGB JPEG and re-submit (Phase 2). */}
                    {cloudIsRgbaError && (
                      <Button
                        type="button"
                        variant="beam"
                        onClick={() => {
                          void handleConvertToRgb();
                        }}
                        disabled={converting}
                      >
                        {converting ? (
                          <span className="flex items-center gap-2">
                            <span className={`size-4 animate-spin rounded-full border-2 ${SPINNER_ON_BEAM}`} />
                            {STRINGS.workspace.converting}
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <Sparkles className="size-4" />
                            {STRINGS.workspace.convertToRgb}
                          </span>
                        )}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant={cloudIsRgbaError ? "lcsecondary" : "beam"}
                      disabled={converting}
                      onClick={() => {
                        void cloudSubmit.submit(breadParams);
                      }}
                    >
                      <RotateCcw className="size-4" />
                      {STRINGS.workspace.tryAgain}
                    </Button>
                    <Button type="button" variant="lcquiet" onClick={handleReset} disabled={converting}>
                      {STRINGS.workspace.startOver}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-center">
                    <p className="flex items-center gap-2 text-sm text-(--lc-dim)">
                      <span className={`size-4 animate-spin rounded-full border-2 ${SPINNER_ON_DARK}`} />
                      {STRINGS.workspace.enhancingInCloud}
                    </p>
                    {/* Progressive cold-start reassurance — only after the wait looks like a model boot. */}
                    {cloudColdStartHint && (
                      <p className="text-xs text-(--lc-faint)">{STRINGS.workspace.coldStartHint}</p>
                    )}
                    {/* Single-job app, no queue: warn before "Start over" abandons this run. */}
                    <p className="text-xs text-(--lc-faint)">{STRINGS.workspace.cloudSingleJobHint}</p>
                    <Button type="button" variant="lcquiet" onClick={handleReset} className="gap-2">
                      <RotateCcw className="size-4" />
                      {STRINGS.workspace.startOver}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Both engines now have a working panel. Local sliders re-render the
              client result (debounced); Bread sliders/Auto only mutate state and
              ride the next Apply POST — never an on-change request. */}
          <ParameterPanel
            engine={engine}
            params={engine === "local" ? localParams : breadParams}
            ranges={engine === "local" ? PARAM_RANGES.local : PARAM_RANGES.cloud}
            auto={{ on: autoOn, onToggle: handleToggleAuto, onRecalculate: applyAuto }}
            overridden={engine === "local" ? localOverridden : breadOverridden}
            onChange={handleParamChange}
            onRestoreAuto={applyAuto}
          />
        </div>
      )}

      {/* Per-engine error line (a stale error from the inactive engine never shows). */}
      {engine === "local" && enhancer.error && (
        <p className="mt-3 flex items-center justify-center gap-2 text-sm text-(--lc-error)" role="alert">
          <CircleAlert className="size-4 shrink-0" />
          {enhancer.error}
        </p>
      )}
      {/* Submit-stage errors (e.g. upload rejected) and pipeline/timeout/load errors
          never coexist; show whichever is set. */}
      {engine === "cloud" && (convertError ?? cloudSubmit.error ?? cloudError) && (
        <p className="mt-3 flex items-center justify-center gap-2 text-sm text-(--lc-error)" role="alert">
          <CircleAlert className="size-4 shrink-0" />
          {convertError ?? cloudSubmit.error ?? cloudError}
        </p>
      )}
    </div>
  );
}
