import { useCallback, useEffect, useRef, useState } from "react";
import { deriveDownloadName, MAX_IMAGE_DIMENSION } from "@/lib/engines/image-helpers";
import { localEngine } from "@/lib/engines/local-engine";

type Status = "idle" | "processing" | "done" | "error";

export interface LocalEnhanceState {
  status: Status;
  sourceUrl: string | null;
  resultUrl: string | null;
  resultBlob: Blob | null;
  resultWidth: number | null;
  resultHeight: number | null;
  downloadName: string | null;
  error: string | null;
  onAccepted: (file: File, objectUrl: string) => void;
  enhance: () => Promise<void>;
  reset: () => void;
}

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

const TOO_LARGE_MESSAGE = `This photo is too large to process in your browser (max ${String(MAX_IMAGE_DIMENSION)}×${String(MAX_IMAGE_DIMENSION)} px) — try a smaller copy.`;
const GENERIC_FAILURE_MESSAGE =
  "We couldn't process this image — it may be corrupted or in an unsupported format. Try another photo.";

/**
 * Orchestrates the Local engine flow: holds the source/result state, runs the
 * engine with a spinner-paint yield, enforces the post-decode dimension guard,
 * maps every failure to a concrete user-facing message, and owns object-URL
 * lifecycle (revoking the previous source/result on replace and on unmount).
 */
export function useLocalEnhance(): LocalEnhanceState {
  const [status, setStatus] = useState<Status>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultWidth, setResultWidth] = useState<number | null>(null);
  const [resultHeight, setResultHeight] = useState<number | null>(null);
  const [downloadName, setDownloadName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Authoritative record of live object URLs, mutated only in handlers/effects
  // so the unmount cleanup can revoke them without re-subscribing.
  const urlsRef = useRef<{ source: string | null; result: string | null }>({ source: null, result: null });

  useEffect(() => {
    return () => {
      if (urlsRef.current.source) URL.revokeObjectURL(urlsRef.current.source);
      if (urlsRef.current.result) URL.revokeObjectURL(urlsRef.current.result);
    };
  }, []);

  const onAccepted = useCallback((accepted: File, objectUrl: string) => {
    if (urlsRef.current.source) URL.revokeObjectURL(urlsRef.current.source);
    if (urlsRef.current.result) URL.revokeObjectURL(urlsRef.current.result);
    urlsRef.current = { source: objectUrl, result: null };
    setFile(accepted);
    setSourceUrl(objectUrl);
    setResultUrl(null);
    setResultBlob(null);
    setResultWidth(null);
    setResultHeight(null);
    setDownloadName(null);
    setError(null);
    setStatus("idle");
  }, []);

  const enhance = useCallback(async () => {
    if (!file || !sourceUrl) return;
    setStatus("processing");
    setError(null);
    // Yield a macrotask so the spinner paints before the blocking pixel pass.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    try {
      const img = await decodeImage(sourceUrl);
      if (img.naturalWidth > MAX_IMAGE_DIMENSION || img.naturalHeight > MAX_IMAGE_DIMENSION) {
        setStatus("error");
        setError(TOO_LARGE_MESSAGE);
        return;
      }
      const result = await localEngine.enhance(img, { mimeType: file.type });
      const url = URL.createObjectURL(result.blob);
      if (urlsRef.current.result) URL.revokeObjectURL(urlsRef.current.result);
      urlsRef.current = { ...urlsRef.current, result: url };
      setResultUrl(url);
      setResultBlob(result.blob);
      setResultWidth(result.width);
      setResultHeight(result.height);
      setDownloadName(deriveDownloadName(file.name, result.mimeType));
      setStatus("done");
    } catch {
      setStatus("error");
      setError(GENERIC_FAILURE_MESSAGE);
    }
  }, [file, sourceUrl]);

  const reset = useCallback(() => {
    if (urlsRef.current.source) URL.revokeObjectURL(urlsRef.current.source);
    if (urlsRef.current.result) URL.revokeObjectURL(urlsRef.current.result);
    urlsRef.current = { source: null, result: null };
    setFile(null);
    setSourceUrl(null);
    setResultUrl(null);
    setResultBlob(null);
    setResultWidth(null);
    setResultHeight(null);
    setDownloadName(null);
    setError(null);
    setStatus("idle");
  }, []);

  return {
    status,
    sourceUrl,
    resultUrl,
    resultBlob,
    resultWidth,
    resultHeight,
    downloadName,
    error,
    onAccepted,
    enhance,
    reset,
  };
}
