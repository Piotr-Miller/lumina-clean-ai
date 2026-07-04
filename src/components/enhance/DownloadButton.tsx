import { Download } from "lucide-react";
import { STRINGS } from "@/lib/enhance-strings";
import { Button } from "@/components/ui/button";

interface DownloadButtonProps {
  /** The processed image to download. */
  blob: Blob;
  /** Suggested filename (e.g. from `deriveDownloadName`). */
  filename: string;
  disabled?: boolean;
}

/**
 * Triggers a browser download of a result blob via a transient object URL +
 * anchor, revoking the URL immediately after the click. Standalone and
 * prop-driven — reused by the cloud path with a cloud-produced blob.
 */
export function DownloadButton({ blob, filename, disabled = false }: DownloadButtonProps) {
  function handleDownload() {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" onClick={handleDownload} disabled={disabled} className="gap-2">
      <Download className="size-4" />
      {STRINGS.download.button}
    </Button>
  );
}
