import { useCallback, useState } from "react";
import { STRINGS } from "@/lib/enhance-strings";
import { validateImageFile } from "@/lib/engines/image-helpers";
import type { BreadParams } from "@/lib/engines/types";
import { submitCloudJob } from "@/lib/services/cloud-upload.client";

type CloudStatus = "idle" | "submitting" | "submitted" | "error";

export interface CloudSubmitState {
  status: CloudStatus;
  error: string | null;
  /** The created job's id, captured on submit — drives the Realtime subscription (S-04). */
  jobId: string | null;
  /** Submit the loaded file. Optional Bread params (S-12) ride the single create-job POST. */
  submit: (params?: BreadParams) => Promise<void>;
  reset: () => void;
}

const NO_FILE_MESSAGE = STRINGS.cloudSubmitErrors.noFile;
const GENERIC_FAILURE_MESSAGE = STRINGS.cloudSubmitErrors.genericFailure;

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
  const [jobId, setJobId] = useState<string | null>(null);

  const submit = useCallback(
    async (params?: BreadParams) => {
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
        const result = await submitCloudJob(file, params);
        setJobId(result.jobId);
        setStatus("submitted");
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : GENERIC_FAILURE_MESSAGE);
      }
    },
    [file],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setJobId(null);
  }, []);

  return { status, error, jobId, submit, reset };
}
