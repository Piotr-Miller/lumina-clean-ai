import { useCallback, useState } from "react";
import { validateImageFile } from "@/lib/engines/image-helpers";
import { submitCloudJob } from "@/lib/services/cloud-upload.client";

type CloudStatus = "idle" | "submitting" | "submitted" | "error";

export interface CloudSubmitState {
  status: CloudStatus;
  error: string | null;
  submit: () => Promise<void>;
  reset: () => void;
}

const NO_FILE_MESSAGE = "Choose a photo first.";
const GENERIC_FAILURE_MESSAGE = "Couldn't submit to Cloud AI. Please try again.";

/**
 * Orchestrates the cloud-submit flow for the currently loaded `file`. Forked
 * from `useLocalEnhance` because the cloud path is async submit-then-wait (the
 * enhanced result is delivered later by S-04's Realtime push), not the Local
 * engine's synchronous Blob return.
 *
 * Reuses `validateImageFile` so HEIC is rejected on this path too (parity with
 * Local). Owns no object URLs — the source preview stays with the workspace's
 * existing Local-source state.
 */
export function useCloudSubmit(file: File | null): CloudSubmitState {
  const [status, setStatus] = useState<CloudStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (!file) {
      setStatus("error");
      setError(NO_FILE_MESSAGE);
      return;
    }
    const validation = validateImageFile(file);
    if (!validation.ok) {
      setStatus("error");
      setError(validation.message);
      return;
    }
    setStatus("submitting");
    setError(null);
    try {
      await submitCloudJob(file);
      setStatus("submitted");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : GENERIC_FAILURE_MESSAGE);
    }
  }, [file]);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  return { status, error, submit, reset };
}
