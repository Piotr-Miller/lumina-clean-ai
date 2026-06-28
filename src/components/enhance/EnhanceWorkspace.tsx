import { useEffect, useRef, useState } from "react";
import { CircleAlert, CloudUpload, RotateCcw, Sparkles } from "lucide-react";
import type { EngineId, LocalParams, LumaStats } from "@/lib/engines/types";
import { PARAM_RANGES, recommendParams } from "@/lib/engines/auto-params";
import { sampleImageLuma } from "@/lib/engines/auto-params.client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import { withOverride, type LocalParamKey, type ParamKey } from "./param-panel-helpers";

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

const SECONDARY_BUTTON = "border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white";

/** Auto-less defaults — the panel starts here until Auto computes from the image. */
const LOCAL_DEFAULTS: LocalParams = { gamma: PARAM_RANGES.local.gamma.default, blur: PARAM_RANGES.local.blur.default };

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
 * from the selected image (no network), per-slider manual override, and
 * debounced Local re-processing. Cloud param threading lands in Phase 3.
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

  // --- S-12 parameter + Auto state (Local only this phase; Cloud lands in Phase 3) ---
  const [localParams, setLocalParams] = useState<LocalParams>(LOCAL_DEFAULTS);
  const [autoOn, setAutoOn] = useState(true);
  const [localOverridden, setLocalOverridden] = useState<ReadonlySet<ParamKey>>(new Set());
  const [stats, setStats] = useState<LumaStats | null>(null);

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
          setLocalOverridden(new Set());
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

  function handleAccepted(file: File, objectUrl: string) {
    setSourceFile(file);
    enhancer.onAccepted(file, objectUrl);
  }

  function handleReset() {
    setSourceFile(null);
    enhancer.reset();
    cloudSubmit.reset();
    setLocalParams(LOCAL_DEFAULTS);
    setLocalOverridden(new Set());
    setAutoOn(true);
    setStats(null);
    lastEnhancedRef.current = null;
  }

  /** Recompute Local params from the current image stats and clear overrides. */
  function applyAuto() {
    if (!stats) return;
    setLocalParams(recommendParams(stats, "local"));
    setLocalOverridden(new Set());
  }

  /** Flip Auto; re-enabling it restores the recommendation for the current image. */
  function handleToggleAuto() {
    const next = !autoOn;
    setAutoOn(next);
    if (next) applyAuto();
  }

  function handleParamChange(key: ParamKey, value: number) {
    setLocalParams((p) => ({ ...p, [key]: value }));
    setLocalOverridden((s) => withOverride(s, key as LocalParamKey));
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="text-center">
        <EngineToggle engine={engine} onChange={setEngine} disabled={busy} />
      </div>

      {!sourceUrl && <ImageUploader onAccepted={handleAccepted} disabled={busy} />}

      {sourceUrl && (
        <div className={cn("grid gap-6", engine === "local" && "md:grid-cols-[minmax(0,1fr)_320px]")}>
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
                alt="Your photo"
              />
            ) : cloudResultReady ? (
              <BeforeAfterSlider
                beforeSrc={sourceUrl}
                afterSrc={cloudAfterUrl}
                width={cloudWidth}
                height={cloudHeight}
                alt="Your photo"
              />
            ) : (
              <img src={sourceUrl} alt="Selected photo" className="max-h-[60vh] w-full rounded-xl object-contain" />
            )}

            {/* LOCAL — not yet enhanced */}
            {engine === "local" && !localResultReady && (
              <div className="flex flex-wrap justify-center gap-3">
                <Button
                  type="button"
                  onClick={() => {
                    lastEnhancedRef.current = localParams;
                    void enhancer.enhance(localParams);
                  }}
                  disabled={localProcessing}
                >
                  {localProcessing ? (
                    <span className="flex items-center gap-2">
                      <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Enhancing…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Sparkles className="size-4" />
                      Enhance
                    </span>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleReset}
                  disabled={localProcessing}
                  className={SECONDARY_BUTTON}
                >
                  Choose another
                </Button>
              </div>
            )}

            {/* LOCAL — enhanced result (localResultReady narrows resultBlob/downloadName to non-null) */}
            {localResultReady && (
              <div className="flex flex-wrap justify-center gap-3">
                <DownloadButton blob={resultBlob} filename={downloadName} />
                <Button type="button" variant="outline" onClick={handleReset} className={`gap-2 ${SECONDARY_BUTTON}`}>
                  <RotateCcw className="size-4" />
                  Start over
                </Button>
              </div>
            )}

            {/* CLOUD — anonymous: prompt to sign in (photo stays loaded) */}
            {engine === "cloud" && !isAuthenticated && (
              <>
                <CloudSignInPrompt />
                <Button type="button" variant="outline" onClick={handleReset} className={SECONDARY_BUTTON}>
                  Choose another
                </Button>
              </>
            )}

            {/* CLOUD — signed in, not yet submitted */}
            {engine === "cloud" && isAuthenticated && cloudSubmit.status !== "submitted" && (
              <div className="flex flex-wrap justify-center gap-3">
                <Button
                  type="button"
                  onClick={() => {
                    void cloudSubmit.submit();
                  }}
                  disabled={cloudSubmitting}
                >
                  {cloudSubmitting ? (
                    <span className="flex items-center gap-2">
                      <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Submitting…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <CloudUpload className="size-4" />
                      Process with Cloud AI
                    </span>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleReset}
                  disabled={cloudSubmitting}
                  className={SECONDARY_BUTTON}
                >
                  Choose another
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
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleReset}
                      className={`gap-2 ${SECONDARY_BUTTON}`}
                    >
                      <RotateCcw className="size-4" />
                      Start over
                    </Button>
                  </div>
                ) : cloudPhase === "failed" ? (
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button
                      type="button"
                      onClick={() => {
                        void cloudSubmit.submit();
                      }}
                    >
                      <RotateCcw className="size-4" />
                      Try again
                    </Button>
                    <Button type="button" variant="outline" onClick={handleReset} className={SECONDARY_BUTTON}>
                      Start over
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-center">
                    <p className="flex items-center gap-2 text-sm text-white/80">
                      <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Enhancing in the cloud…
                    </p>
                    {/* Progressive cold-start reassurance — only after the wait looks like a model boot. */}
                    {cloudColdStartHint && (
                      <p className="text-xs text-white/50">The first run after idle can take a few minutes.</p>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleReset}
                      className={`gap-2 ${SECONDARY_BUTTON}`}
                    >
                      <RotateCcw className="size-4" />
                      Start over
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Local-only this phase: Cloud (Bread) params are shown + wired to the
              job in Phase 3, so exposing the sliders now would be a no-op affordance. */}
          {engine === "local" && (
            <ParameterPanel
              engine={engine}
              params={localParams}
              ranges={PARAM_RANGES.local}
              auto={{ on: autoOn, onToggle: handleToggleAuto, onRecalculate: applyAuto }}
              overridden={localOverridden}
              onChange={handleParamChange}
              onRestoreAuto={applyAuto}
            />
          )}
        </div>
      )}

      {/* Per-engine error line (a stale error from the inactive engine never shows). */}
      {engine === "local" && enhancer.error && (
        <p className="mt-3 flex items-center justify-center gap-1 text-sm text-red-300" role="alert">
          <CircleAlert className="size-4" />
          {enhancer.error}
        </p>
      )}
      {/* Submit-stage errors (e.g. upload rejected) and pipeline/timeout/load errors
          never coexist; show whichever is set. */}
      {engine === "cloud" && (cloudSubmit.error ?? cloudError) && (
        <p className="mt-3 flex items-center justify-center gap-1 text-sm text-red-300" role="alert">
          <CircleAlert className="size-4" />
          {cloudSubmit.error ?? cloudError}
        </p>
      )}
    </div>
  );
}
