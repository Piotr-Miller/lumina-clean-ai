import { useState } from "react";
import { CircleAlert, CloudUpload, RotateCcw, Sparkles } from "lucide-react";
import type { EngineId } from "@/lib/engines/types";
import { Button } from "@/components/ui/button";
import { useCloudJob } from "@/components/hooks/useCloudJob";
import { useCloudSubmit } from "@/components/hooks/useCloudSubmit";
import { useLocalEnhance } from "@/components/hooks/useLocalEnhance";
import { BeforeAfterSlider } from "./BeforeAfterSlider";
import { CloudSignInPrompt } from "./CloudSignInPrompt";
import { DownloadButton } from "./DownloadButton";
import { EngineToggle } from "./EngineToggle";
import { ImageUploader } from "./ImageUploader";

interface EnhanceWorkspaceProps {
  /** Whether the current visitor has a session. Drives the Cloud sign-in gate. */
  isAuthenticated: boolean;
  /** Publishable Supabase URL for the browser Realtime client (S-04); `null` if unresolved. */
  supabaseUrl: string | null;
  /** Publishable anon key (RLS-gated) for the browser Realtime client; `null` if unresolved. */
  supabaseAnonKey: string | null;
  /** Short-lived user JWT for the Realtime subscription; `null` for anonymous visitors. */
  accessToken: string | null;
}

const SECONDARY_BUTTON = "border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white";

/**
 * The single React island for the enhance flow. Holds the engine selection and
 * the source File, composes the reusable shell (uploader → action → slider →
 * download), and drives Local via `useLocalEnhance` and Cloud via
 * `useCloudSubmit`. The action area renders purely from engine + auth + the
 * active engine's status, so switching engines preserves the loaded photo but
 * never shows one engine's result alongside the other's action.
 */
export default function EnhanceWorkspace({
  isAuthenticated,
  supabaseUrl,
  supabaseAnonKey,
  accessToken,
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
  });

  const localProcessing = enhancer.status === "processing";
  const cloudSubmitting = cloudSubmit.status === "submitting";
  const busy = localProcessing || cloudSubmitting;

  const { sourceUrl, resultUrl, resultBlob, resultWidth, resultHeight, downloadName } = enhancer;
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
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="text-center">
        <EngineToggle engine={engine} onChange={setEngine} disabled={busy} />
      </div>

      {!sourceUrl && <ImageUploader onAccepted={handleAccepted} disabled={busy} />}

      {sourceUrl && (
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
                  void enhancer.enhance();
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
                  <Button type="button" variant="outline" onClick={handleReset} className={`gap-2 ${SECONDARY_BUTTON}`}>
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
                    <p className="text-xs text-white/50">The first run after idle can take up to ~2 minutes.</p>
                  )}
                  <Button type="button" variant="outline" onClick={handleReset} className={`gap-2 ${SECONDARY_BUTTON}`}>
                    <RotateCcw className="size-4" />
                    Start over
                  </Button>
                </div>
              )}
            </>
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
