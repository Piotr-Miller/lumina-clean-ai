import { afterEach, describe, expect, it, vi } from "vitest";
import { submitCloudJob } from "@/lib/services/cloud-upload.client";

const ENDPOINT = "/api/enhance/cloud/create-job";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function jpeg(): File {
  return new File([new Uint8Array([1, 2, 3])], "night.jpg", { type: "image/jpeg" });
}

function png(): File {
  return new File([new Uint8Array([4, 5, 6])], "shot.png", { type: "image/png" });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("submitCloudJob", () => {
  it("posts the derived jpg body, PUTs to the signed URL, and returns the jobId", async () => {
    const uploadUrl = "https://proj.supabase.co/storage/v1/object/upload/sign/photos/u/j/source.jpg?token=tok";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ jobId: "job-1", uploadUrl, uploadToken: "tok", sourcePath: "u/j/source.jpg" }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const file = jpeg();
    const result = await submitCloudJob(file);

    expect(result).toEqual({ jobId: "job-1" });

    const [postUrl, postInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(postUrl).toBe(ENDPOINT);
    expect(postInit.method).toBe("POST");
    expect(JSON.parse(postInit.body as string)).toEqual({ fileExtension: "jpg", mimeType: "image/jpeg" });

    const [putUrl, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(putUrl).toBe(uploadUrl);
    expect(putInit.method).toBe("PUT");
    expect((putInit.headers as Record<string, string>)["Content-Type"]).toBe("image/jpeg");
    expect(putInit.body).toBe(file);
  });

  it("derives the png body and Content-Type for a png file", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          jobId: "job-2",
          uploadUrl: "https://x/u/j/source.png?token=t",
          uploadToken: "t",
          sourcePath: "u/j/source.png",
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await submitCloudJob(png());

    const [, postInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(postInit.body as string)).toEqual({ fileExtension: "png", mimeType: "image/png" });
    const [, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((putInit.headers as Record<string, string>)["Content-Type"]).toBe("image/png");
  });

  it("maps a 401 from the route to a sign-in message and never PUTs", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ error: { code: "unauthorized" } }, 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitCloudJob(jpeg())).rejects.toThrow("Please sign in to use Cloud AI.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps a 500 internal_error from the route to an unavailable message", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ error: { code: "internal_error" } }, 500));
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitCloudJob(jpeg())).rejects.toThrow(
      "Cloud processing is temporarily unavailable. Please try again.",
    );
  });

  it("maps a 413 from the signed-URL PUT to a too-large message", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          jobId: "job-3",
          uploadUrl: "https://x/u/j/source.jpg?token=t",
          uploadToken: "t",
          sourcePath: "u/j/source.jpg",
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 413 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitCloudJob(jpeg())).rejects.toThrow(
      "This photo is too large to upload (max 25 MB). Try a smaller copy.",
    );
  });

  it("maps a 403 from the signed-URL PUT to a rejected-link message", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          jobId: "job-4",
          uploadUrl: "https://x/u/j/source.jpg?token=t",
          uploadToken: "t",
          sourcePath: "u/j/source.jpg",
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitCloudJob(jpeg())).rejects.toThrow("The upload link was rejected. Please try again.");
  });

  it("falls back to a generic message when the route error body is not JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("<html>502</html>", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitCloudJob(jpeg())).rejects.toThrow("Couldn't start Cloud processing. Please try again.");
  });

  it("maps a network-layer fetch failure to a connection message", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitCloudJob(jpeg())).rejects.toThrow(
      "Couldn't reach Cloud AI — check your connection and try again.",
    );
  });
});
