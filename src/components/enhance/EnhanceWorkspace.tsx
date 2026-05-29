import { CircleAlert, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocalEnhance } from "@/components/hooks/useLocalEnhance";
import { BeforeAfterSlider } from "./BeforeAfterSlider";
import { DownloadButton } from "./DownloadButton";
import { ImageUploader } from "./ImageUploader";

/**
 * The single React island for the Local enhance flow. Composes the reusable
 * shell — uploader → enhance action (with spinner) → before/after slider →
 * download — and drives it from the `useLocalEnhance` hook.
 */
export default function EnhanceWorkspace() {
  const enhancer = useLocalEnhance();
  const processing = enhancer.status === "processing";

  return (
    <div className="mx-auto w-full max-w-2xl">
      {!enhancer.sourceUrl && <ImageUploader onAccepted={enhancer.onAccepted} disabled={processing} />}

      {enhancer.sourceUrl && enhancer.status !== "done" && (
        <div className="flex flex-col items-center gap-4">
          <img
            src={enhancer.sourceUrl}
            alt="Selected photo"
            className="max-h-[60vh] w-full rounded-xl object-contain"
          />
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              type="button"
              onClick={() => {
                void enhancer.enhance();
              }}
              disabled={processing}
            >
              {processing ? (
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
              onClick={enhancer.reset}
              disabled={processing}
              className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              Choose another
            </Button>
          </div>
        </div>
      )}

      {enhancer.status === "done" &&
        enhancer.sourceUrl &&
        enhancer.resultUrl &&
        enhancer.resultBlob &&
        enhancer.downloadName &&
        enhancer.resultWidth &&
        enhancer.resultHeight && (
          <div className="flex flex-col items-center gap-4">
            <BeforeAfterSlider
              beforeSrc={enhancer.sourceUrl}
              afterSrc={enhancer.resultUrl}
              width={enhancer.resultWidth}
              height={enhancer.resultHeight}
              alt="Your photo"
            />
            <div className="flex flex-wrap justify-center gap-3">
              <DownloadButton blob={enhancer.resultBlob} filename={enhancer.downloadName} />
              <Button
                type="button"
                variant="outline"
                onClick={enhancer.reset}
                className="gap-2 border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <RotateCcw className="size-4" />
                Start over
              </Button>
            </div>
          </div>
        )}

      {enhancer.error && (
        <p className="mt-3 flex items-center justify-center gap-1 text-sm text-red-300" role="alert">
          <CircleAlert className="size-4" />
          {enhancer.error}
        </p>
      )}
    </div>
  );
}
