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
export const createPhotoJobRequestSchema = z.object({
  fileExtension: z.enum(["jpg", "png"]),
  mimeType: z.enum(["image/jpeg", "image/png"]),
}) satisfies z.ZodType<CreatePhotoJobRequest>;
