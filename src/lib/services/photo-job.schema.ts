import { z } from "zod";
import type { CreatePhotoJobRequest } from "@/types";

/**
 * Validates the POST /api/enhance/cloud/create-job request body.
 *
 * HEIC is intentionally excluded: S-03 detect-and-rejects HEIC client-side
 * (matching `validateImageFile`), so the cloud path only ever sends JPG/PNG —
 * even though F-01's `CreatePhotoJobCommand` permits `heic` for a future slice.
 *
 * `userId` is NOT part of the body: the route derives it from the session
 * (`context.locals.user.id`), never from client input.
 *
 * Kept free of any `astro:env/server` import so it loads under the Vitest
 * Node environment (Lesson #4).
 */
/** The one valid mimeType per fileExtension. Used to reject mismatched bodies. */
const EXTENSION_MIME: Record<CreatePhotoJobRequest["fileExtension"], CreatePhotoJobRequest["mimeType"]> = {
  jpg: "image/jpeg",
  png: "image/png",
};

export const createPhotoJobRequestSchema = z
  .object({
    fileExtension: z.enum(["jpg", "png"]),
    mimeType: z.enum(["image/jpeg", "image/png"]),
    // Optional Bread params (S-12). Omitted → server uses the locked Phase-0
    // defaults. Bounds are the model contract ceilings (gamma ≤ 1.5,
    // strength ≤ 0.2), enforced here so an out-of-range value is a 400 and is
    // unreachable from the slider — never forwarded to Replicate.
    gamma: z.number().min(1.0).max(1.5).optional(),
    strength: z.number().min(0.0).max(0.2).optional(),
  })
  .refine((body) => EXTENSION_MIME[body.fileExtension] === body.mimeType, {
    message: "fileExtension and mimeType must correspond (jpg↔image/jpeg, png↔image/png).",
    path: ["mimeType"],
  });
