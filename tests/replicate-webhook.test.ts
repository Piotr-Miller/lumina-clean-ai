import { describe, expect, it } from "vitest";
import {
  isAllowedOutputUrl,
  isWebhookTimestampFresh,
  mapPredictionToOutcome,
  resultExtensionFromContentType,
  verifyReplicateSignature,
  WEBHOOK_TOLERANCE_SECONDS,
} from "@/lib/services/replicate-webhook";

/**
 * Canonical "svix" webhook test vector (the scheme Replicate uses). Proving our
 * own Web-Crypto implementation accepts this fixed vector confirms byte-level
 * compatibility with what Replicate actually signs — not just self-consistency.
 * Source: the standard-webhooks / svix reference vector.
 */
const VECTOR = {
  signingSecret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
  webhookId: "msg_p5jXN8AQM9LWM0D4loKWxJek",
  webhookTimestamp: "1614265330",
  body: `{"test": 2432232314}`,
  signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
};

describe("verifyReplicateSignature", () => {
  it("accepts a valid signature (canonical svix vector → Replicate-compatible)", async () => {
    const ok = await verifyReplicateSignature({
      webhookId: VECTOR.webhookId,
      webhookTimestamp: VECTOR.webhookTimestamp,
      webhookSignature: VECTOR.signature,
      body: VECTOR.body,
      signingSecret: VECTOR.signingSecret,
    });
    expect(ok).toBe(true);
  });

  it("accepts when the header carries multiple space-delimited signatures (rotation)", async () => {
    const ok = await verifyReplicateSignature({
      webhookId: VECTOR.webhookId,
      webhookTimestamp: VECTOR.webhookTimestamp,
      webhookSignature: `v1,aW52YWxpZHNpZ25hdHVyZXZhbHVlMDAwMDAwMDAwMDA= ${VECTOR.signature}`,
      body: VECTOR.body,
      signingSecret: VECTOR.signingSecret,
    });
    expect(ok).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const ok = await verifyReplicateSignature({
      webhookId: VECTOR.webhookId,
      webhookTimestamp: VECTOR.webhookTimestamp,
      webhookSignature: VECTOR.signature,
      body: `{"test": 9999999999}`,
      signingSecret: VECTOR.signingSecret,
    });
    expect(ok).toBe(false);
  });

  it("rejects the wrong signing secret", async () => {
    const ok = await verifyReplicateSignature({
      webhookId: VECTOR.webhookId,
      webhookTimestamp: VECTOR.webhookTimestamp,
      webhookSignature: VECTOR.signature,
      body: VECTOR.body,
      signingSecret: "whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    });
    expect(ok).toBe(false);
  });

  it("rejects a tampered timestamp (replay guard input)", async () => {
    const ok = await verifyReplicateSignature({
      webhookId: VECTOR.webhookId,
      webhookTimestamp: "1614265331",
      webhookSignature: VECTOR.signature,
      body: VECTOR.body,
      signingSecret: VECTOR.signingSecret,
    });
    expect(ok).toBe(false);
  });

  it("returns false (never throws) on missing headers", async () => {
    expect(
      await verifyReplicateSignature({
        webhookId: "",
        webhookTimestamp: "",
        webhookSignature: "",
        body: VECTOR.body,
        signingSecret: VECTOR.signingSecret,
      }),
    ).toBe(false);
  });

  it("ignores a non-v1 signature entry", async () => {
    const ok = await verifyReplicateSignature({
      webhookId: VECTOR.webhookId,
      webhookTimestamp: VECTOR.webhookTimestamp,
      webhookSignature: VECTOR.signature.replace("v1,", "v2,"),
      body: VECTOR.body,
      signingSecret: VECTOR.signingSecret,
    });
    expect(ok).toBe(false);
  });
});

describe("isWebhookTimestampFresh", () => {
  // Inject a fixed clock so the assertions don't depend on wall time.
  const now = 1_700_000_000;

  it("accepts a timestamp at the current second", () => {
    expect(isWebhookTimestampFresh(String(now), now)).toBe(true);
  });

  it("accepts skew within ±tolerance in both directions", () => {
    expect(isWebhookTimestampFresh(String(now - WEBHOOK_TOLERANCE_SECONDS), now)).toBe(true);
    expect(isWebhookTimestampFresh(String(now + WEBHOOK_TOLERANCE_SECONDS), now)).toBe(true);
    expect(isWebhookTimestampFresh(String(now - 60), now)).toBe(true);
  });

  it("rejects a stale (replayed) past timestamp beyond tolerance", () => {
    expect(isWebhookTimestampFresh(String(now - WEBHOOK_TOLERANCE_SECONDS - 1), now)).toBe(false);
  });

  it("rejects a future timestamp beyond tolerance", () => {
    expect(isWebhookTimestampFresh(String(now + WEBHOOK_TOLERANCE_SECONDS + 1), now)).toBe(false);
  });

  it("rejects a missing or unparseable timestamp (never throws)", () => {
    expect(isWebhookTimestampFresh("", now)).toBe(false);
    expect(isWebhookTimestampFresh("not-a-number", now)).toBe(false);
  });
});

describe("isAllowedOutputUrl", () => {
  it("accepts https *.replicate.delivery and the apex host", () => {
    expect(isAllowedOutputUrl("https://pbxt.replicate.delivery/abc/out.png")).toBe(true);
    expect(isAllowedOutputUrl("https://replicate.delivery/out.jpg")).toBe(true);
  });

  it("rejects a non-https scheme", () => {
    expect(isAllowedOutputUrl("http://pbxt.replicate.delivery/out.png")).toBe(false);
  });

  it("rejects a disallowed host", () => {
    expect(isAllowedOutputUrl("https://evil.example.com/out.png")).toBe(false);
  });

  it("rejects a look-alike host that only contains the allowed domain", () => {
    expect(isAllowedOutputUrl("https://replicate.delivery.evil.com/out.png")).toBe(false);
    expect(isAllowedOutputUrl("https://notreplicate.delivery/out.png")).toBe(false);
  });

  it("rejects an unparseable URL (never throws)", () => {
    expect(isAllowedOutputUrl("not a url")).toBe(false);
    expect(isAllowedOutputUrl("")).toBe(false);
  });
});

describe("mapPredictionToOutcome", () => {
  it("maps succeeded + string output to a download action", () => {
    expect(mapPredictionToOutcome({ id: "p1", status: "succeeded", output: "https://r/out.png" })).toEqual({
      kind: "succeeded",
      outputUrl: "https://r/out.png",
    });
  });

  it("maps succeeded + array output to the first usable URL", () => {
    expect(
      mapPredictionToOutcome({ id: "p1", status: "succeeded", output: [null, "https://r/a.jpg", "https://r/b.jpg"] }),
    ).toEqual({ kind: "succeeded", outputUrl: "https://r/a.jpg" });
  });

  it("treats succeeded-without-output as a failure", () => {
    const outcome = mapPredictionToOutcome({ id: "p1", status: "succeeded", output: null });
    expect(outcome.kind).toBe("failed");
  });

  it("maps failed to a failure with the error text", () => {
    expect(mapPredictionToOutcome({ id: "p1", status: "failed", error: "CUDA OOM" })).toEqual({
      kind: "failed",
      errorMessage: "CUDA OOM",
    });
  });

  it("maps canceled to a failure", () => {
    expect(mapPredictionToOutcome({ id: "p1", status: "canceled" }).kind).toBe("failed");
  });

  it("stringifies a non-string error and bounds its length", () => {
    const outcome = mapPredictionToOutcome({ id: "p1", status: "failed", error: { detail: "x".repeat(500) } });
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") expect(outcome.errorMessage.length).toBeLessThanOrEqual(300);
  });

  it("ignores non-terminal statuses (defensive — should not arrive with completed filter)", () => {
    expect(mapPredictionToOutcome({ id: "p1", status: "processing" })).toEqual({ kind: "ignore" });
    expect(mapPredictionToOutcome({})).toEqual({ kind: "ignore" });
  });
});

describe("resultExtensionFromContentType", () => {
  it("maps known image content-types", () => {
    expect(resultExtensionFromContentType("image/jpeg")).toBe("jpg");
    expect(resultExtensionFromContentType("image/png")).toBe("png");
    expect(resultExtensionFromContentType("image/webp")).toBe("webp");
  });

  it("tolerates a content-type with parameters", () => {
    expect(resultExtensionFromContentType("image/png; charset=binary")).toBe("png");
  });

  it("falls back to the URL extension when content-type is missing", () => {
    expect(resultExtensionFromContentType(null, "https://r/out.png?token=abc")).toBe("png");
    expect(resultExtensionFromContentType(null, "https://r/out.jpeg")).toBe("jpg");
  });

  it("defaults to jpg when nothing is determinable", () => {
    expect(resultExtensionFromContentType(null)).toBe("jpg");
    expect(resultExtensionFromContentType("application/octet-stream", "https://r/out")).toBe("jpg");
  });
});
