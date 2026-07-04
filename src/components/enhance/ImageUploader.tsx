import { useRef, useState } from "react";
import { CircleAlert, Upload } from "lucide-react";
import { STRINGS } from "@/lib/enhance-strings";
import { validateImageFile } from "@/lib/engines/image-helpers";
import { cn } from "@/lib/utils";

interface ImageUploaderProps {
  /** Called with the accepted file and a freshly created object URL for preview. */
  onAccepted: (file: File, objectUrl: string) => void;
  disabled?: boolean;
}

/**
 * Standalone upload control: click-to-pick + drag-and-drop, with inline
 * validation (type + size). Owns no enhancement state — it just hands an
 * accepted file (and its object URL) to the parent. Reused by the cloud path
 * (S-03) by swapping what the parent does with the accepted file.
 */
export function ImageUploader({ onAccepted, disabled = false }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File | undefined) {
    if (!file) return;
    const result = validateImageFile(file);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    onAccepted(file, URL.createObjectURL(file));
  }

  return (
    <div className="w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => {
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
          dragOver ? "border-purple-400 bg-white/10" : "border-white/20 bg-white/5 hover:bg-white/10",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <Upload className="size-8 text-purple-300" />
        <span className="text-sm text-white/80">
          <span className="font-medium text-white">{STRINGS.uploader.ctaStrong}</span> {STRINGS.uploader.ctaRest}
        </span>
        <span className="text-xs text-white/40">{STRINGS.uploader.constraints}</span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        aria-label={STRINGS.uploader.inputLabel}
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          // Reset so selecting the same file again re-fires onChange.
          e.target.value = "";
        }}
      />

      {error && (
        <p className="mt-2 flex items-center gap-1 text-xs text-red-300" role="alert">
          <CircleAlert className="size-3" />
          {error}
        </p>
      )}
    </div>
  );
}
