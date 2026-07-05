import { useRef, useState } from "react";
import { CircleAlert } from "lucide-react";
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
    <div className="flex w-full flex-col">
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
          "flex min-h-40 w-full grow flex-col items-center justify-center gap-2 rounded-xl px-6 py-11 text-center transition-[background-color,outline] duration-150",
          dragOver
            ? "bg-(--lc-step-3) outline-2 outline-offset-[-2px] outline-[#6fe3f2] outline-dashed"
            : "bg-(--lc-step-2) hover:bg-(--lc-step-3)",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <span className="text-sm text-(--lc-ink)">
          <span className="bg-beam bg-clip-text font-extrabold text-transparent">{STRINGS.uploader.ctaStrong}</span>{" "}
          {STRINGS.uploader.ctaRest}
        </span>
        <span className="text-xs text-(--lc-faint)">{STRINGS.uploader.constraints}</span>
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
        <p className="mt-2.5 flex items-center gap-2 text-xs text-(--lc-error)" role="alert">
          <CircleAlert className="size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
