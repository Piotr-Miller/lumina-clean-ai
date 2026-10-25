import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STRINGS } from "@/lib/enhance-strings";
import { submitCloudJob } from "@/lib/services/cloud-upload.client";
import { exifApp1, jfifApp0, jpegBytes, orientedJpegBytes, tiff, type Bytes } from "./helpers/jpeg-bytes";

// The redraw needs a DOM canvas; under `node` the default preparation reaches this stub instead.
const redrawUprightJpeg = vi.hoisted(() => vi.fn<(file: File) => Promise<File>>());
vi.mock("@/lib/engines/canvas-helpers", () => ({ redrawUprightJpeg }));

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

function jpegFile(bytes: Bytes, name = "phone.jpg"): File {
  return new File([bytes], name, { type: "image/jpeg" });
}

/** A fetch stub where create-job succeeds and the PUT returns 200. */
function okFetch(jobId = "job-p") {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({ jobId, uploadUrl: "https://x/u/j/source?token=t", uploadToken: "t", sourcePath: "u/j/source" }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function putInit(fetchMock: ReturnType<typeof vi.fn>): RequestInit {
  return (fetchMock.mock.calls[1] as [string, RequestInit])[1];
}

beforeEach(() => {
  redrawUprightJpeg.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

  it("maps a 429 daily_cap_reached from the route to the cap message and never PUTs", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ error: { code: "daily_cap_reached" } }, 429));
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitCloudJob(jpeg())).rejects.toThrow(
      "The daily Cloud AI limit has been reached. Try the Local engine, or come back tomorrow.",
    );
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

describe("submitCloudJob preparation (before create-job)", () => {
  it("PUTs the prepared file and derives the MIME type and extension from it", async () => {
    const fetchMock = okFetch();
    const prepared = jpegFile(new Uint8Array([9, 9, 9]), "shot.jpg");
    const prepare = vi.fn().mockResolvedValue(prepared);
    const original = png();

    await submitCloudJob(original, undefined, prepare);

    expect(prepare).toHaveBeenCalledWith(original);
    const [, postInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(postInit.body as string)).toEqual({ fileExtension: "jpg", mimeType: "image/jpeg" });
    expect((putInit(fetchMock).headers as Record<string, string>)["Content-Type"]).toBe("image/jpeg");
    expect(putInit(fetchMock).body).toBe(prepared);
  });

  it("stops before create-job with the prepare-failure copy when preparation throws", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const prepare = vi.fn().mockRejectedValue(new Error("Canvas could not encode the image."));

    await expect(submitCloudJob(jpeg(), undefined, prepare)).rejects.toThrow(STRINGS.uploadErrors.prepareFailed);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("no job was created"),
      "Canvas could not encode the image.",
    );
  });

  it("rejects a prepared file over 25 MB before create-job", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const prepare = vi.fn().mockResolvedValue(jpegFile(new Uint8Array(25_000_001)));

    await expect(submitCloudJob(jpeg(), undefined, prepare)).rejects.toThrow(STRINGS.fileValidation.tooLarge);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("by default PUTs an orientation-1 JPEG as the identical File, without warning", async () => {
    const fetchMock = okFetch();
    const warn = vi.spyOn(console, "warn");
    const file = jpegFile(orientedJpegBytes(1));

    await submitCloudJob(file);

    expect(putInit(fetchMock).body).toBe(file);
    expect(redrawUprightJpeg).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("by default PUTs a PNG as the identical File", async () => {
    const fetchMock = okFetch();
    const file = png();

    await submitCloudJob(file);

    expect(putInit(fetchMock).body).toBe(file);
    expect(redrawUprightJpeg).not.toHaveBeenCalled();
  });

  it("by default PUTs a JPEG with no Exif as the identical File, without warning", async () => {
    const fetchMock = okFetch();
    const warn = vi.spyOn(console, "warn");
    const file = jpegFile(jpegBytes(jfifApp0()));

    await submitCloudJob(file);

    expect(putInit(fetchMock).body).toBe(file);
    expect(warn).not.toHaveBeenCalled();
  });

  it("by default treats tag 0 as unoriented and PUTs the identical File", async () => {
    const fetchMock = okFetch();
    const file = jpegFile(orientedJpegBytes(0));

    await submitCloudJob(file);

    expect(putInit(fetchMock).body).toBe(file);
    expect(redrawUprightJpeg).not.toHaveBeenCalled();
  });

  it("by default redraws an orientation-6 JPEG and PUTs the redrawn file", async () => {
    const fetchMock = okFetch();
    const upright = jpegFile(new Uint8Array([7, 7, 7]), "phone.jpg");
    redrawUprightJpeg.mockResolvedValue(upright);
    const file = jpegFile(orientedJpegBytes(6));

    await submitCloudJob(file);

    expect(redrawUprightJpeg).toHaveBeenCalledWith(file);
    expect(putInit(fetchMock).body).toBe(upright);
  });

  it("by default stops before create-job when the redraw of an oriented JPEG fails", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    redrawUprightJpeg.mockRejectedValue(new Error("Canvas 2D context unavailable."));

    await expect(submitCloudJob(jpegFile(orientedJpegBytes(8)))).rejects.toThrow(STRINGS.uploadErrors.prepareFailed);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("by default uploads a JPEG with unreadable Exif as stored, warning once with the consequence", async () => {
    const fetchMock = okFetch();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const badTiff = tiff({ orientation: 6 });
    badTiff.set([0x41, 0x42], 0); // unknown byte order
    const file = jpegFile(jpegBytes(exifApp1(badTiff)));

    await submitCloudJob(file);

    expect(putInit(fetchMock).body).toBe(file);
    expect(redrawUprightJpeg).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("may come back rotated or mirrored"));
  });
});
