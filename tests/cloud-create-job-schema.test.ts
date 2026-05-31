import { describe, expect, it } from "vitest";
import { createPhotoJobRequestSchema } from "@/lib/services/photo-job.schema";

describe("createPhotoJobRequestSchema", () => {
  it("accepts a valid jpg body", () => {
    expect(createPhotoJobRequestSchema.safeParse({ fileExtension: "jpg", mimeType: "image/jpeg" }).success).toBe(true);
  });

  it("accepts a valid png body", () => {
    expect(createPhotoJobRequestSchema.safeParse({ fileExtension: "png", mimeType: "image/png" }).success).toBe(true);
  });

  it("rejects a missing fileExtension", () => {
    expect(createPhotoJobRequestSchema.safeParse({ mimeType: "image/jpeg" }).success).toBe(false);
  });

  it("rejects a missing mimeType", () => {
    expect(createPhotoJobRequestSchema.safeParse({ fileExtension: "jpg" }).success).toBe(false);
  });

  it("rejects HEIC (excluded from the cloud path)", () => {
    expect(createPhotoJobRequestSchema.safeParse({ fileExtension: "heic", mimeType: "image/heic" }).success).toBe(
      false,
    );
  });

  it("rejects an unknown mimeType", () => {
    expect(createPhotoJobRequestSchema.safeParse({ fileExtension: "jpg", mimeType: "image/gif" }).success).toBe(false);
  });

  it("rejects a non-object body", () => {
    expect(createPhotoJobRequestSchema.safeParse("nope").success).toBe(false);
  });
});
