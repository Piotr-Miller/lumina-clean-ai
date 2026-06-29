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

  it("rejects a fileExtension/mimeType mismatch", () => {
    expect(createPhotoJobRequestSchema.safeParse({ fileExtension: "jpg", mimeType: "image/png" }).success).toBe(false);
    expect(createPhotoJobRequestSchema.safeParse({ fileExtension: "png", mimeType: "image/jpeg" }).success).toBe(false);
  });

  it("rejects a non-object body", () => {
    expect(createPhotoJobRequestSchema.safeParse("nope").success).toBe(false);
  });

  // --- S-12 optional Bread params (gamma ≤ 1.5, strength ≤ 0.2) ---

  it("accepts a body without Bread params (server uses locked defaults)", () => {
    expect(createPhotoJobRequestSchema.safeParse({ fileExtension: "jpg", mimeType: "image/jpeg" }).success).toBe(true);
  });

  it("accepts in-range Bread params", () => {
    const r = createPhotoJobRequestSchema.safeParse({
      fileExtension: "jpg",
      mimeType: "image/jpeg",
      gamma: 1.2,
      strength: 0.1,
    });
    expect(r.success).toBe(true);
  });

  it("accepts the bound values exactly (gamma 1.5, strength 0.2)", () => {
    expect(
      createPhotoJobRequestSchema.safeParse({
        fileExtension: "jpg",
        mimeType: "image/jpeg",
        gamma: 1.5,
        strength: 0.2,
      }).success,
    ).toBe(true);
  });

  it("rejects strength > 0.2 (the model contract ceiling)", () => {
    expect(
      createPhotoJobRequestSchema.safeParse({
        fileExtension: "jpg",
        mimeType: "image/jpeg",
        strength: 0.21,
      }).success,
    ).toBe(false);
  });

  it("rejects gamma > 1.5", () => {
    expect(
      createPhotoJobRequestSchema.safeParse({
        fileExtension: "jpg",
        mimeType: "image/jpeg",
        gamma: 1.6,
      }).success,
    ).toBe(false);
  });

  it("rejects gamma < 1.0 and negative strength", () => {
    expect(
      createPhotoJobRequestSchema.safeParse({ fileExtension: "jpg", mimeType: "image/jpeg", gamma: 0.9 }).success,
    ).toBe(false);
    expect(
      createPhotoJobRequestSchema.safeParse({ fileExtension: "jpg", mimeType: "image/jpeg", strength: -0.01 }).success,
    ).toBe(false);
  });
});
