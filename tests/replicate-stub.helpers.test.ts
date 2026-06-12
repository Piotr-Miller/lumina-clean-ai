import { describe, expect, it } from "vitest";
import { verifyReplicateSignature } from "@/lib/services/replicate-webhook";
import { callbackBody, signCallback } from "./e2e/helpers/replicate-stub";

/**
 * Hermetic proof that the E2E stub's signer (tests/e2e/helpers/replicate-stub.ts)
 * produces signatures the PRODUCTION verifier accepts — and that tampering is
 * rejected. This kills the whole "the stub signs wrong" failure class without
 * Docker, a running function, or a browser: if this is green, a green E2E run
 * means the pipeline worked, not that the stub fooled itself.
 *
 * A locally-generated `whsec_` secret is used (signer and verifier share it) —
 * the same locality the live smoke deliberately steps outside of (a self-signing
 * harness can't validate the PROD secret; lessons.md). That's out of scope here.
 */
// 32 random-looking bytes, base64 → a structurally valid whsec_ secret.
const SECRET = "whsec_dGVzdHNlY3JldGZvcmUyZWhlcm1ldGljc2lnbmluZzEy";

describe("replicate-stub signer ↔ production verifier round-trip", () => {
  it("signs a body the production verifier accepts", async () => {
    const body = callbackBody({
      predictionId: "pred_abc",
      status: "succeeded",
      output: "https://replicate.delivery/x.jpg",
    });
    const { headers, rawBody } = signCallback({ secret: SECRET, body });

    const ok = await verifyReplicateSignature({
      webhookId: headers["webhook-id"],
      webhookTimestamp: headers["webhook-timestamp"],
      webhookSignature: headers["webhook-signature"],
      body: rawBody,
      signingSecret: SECRET,
    });
    expect(ok).toBe(true);
  });

  it("is rejected when the body is tampered after signing", async () => {
    const { headers, rawBody } = signCallback({
      secret: SECRET,
      body: callbackBody({ predictionId: "pred_abc", status: "succeeded", output: "https://replicate.delivery/x.jpg" }),
    });
    const ok = await verifyReplicateSignature({
      webhookId: headers["webhook-id"],
      webhookTimestamp: headers["webhook-timestamp"],
      webhookSignature: headers["webhook-signature"],
      body: `${rawBody} `, // one trailing byte → different signed content
      signingSecret: SECRET,
    });
    expect(ok).toBe(false);
  });

  it("is rejected under a different signing secret", async () => {
    const { headers, rawBody } = signCallback({
      secret: SECRET,
      body: callbackBody({ predictionId: "pred_abc", status: "failed", error: "x" }),
    });
    const ok = await verifyReplicateSignature({
      webhookId: headers["webhook-id"],
      webhookTimestamp: headers["webhook-timestamp"],
      webhookSignature: headers["webhook-signature"],
      body: rawBody,
      signingSecret: "whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    });
    expect(ok).toBe(false);
  });

  it("is rejected when the signed timestamp is altered (replay-guard input)", async () => {
    const { headers, rawBody } = signCallback({
      secret: SECRET,
      body: callbackBody({ predictionId: "pred_abc", status: "succeeded", output: "https://replicate.delivery/x.jpg" }),
      timestamp: 1_700_000_000,
    });
    const ok = await verifyReplicateSignature({
      webhookId: headers["webhook-id"],
      webhookTimestamp: "1700000001", // off by one from the signed value
      webhookSignature: headers["webhook-signature"],
      body: rawBody,
      signingSecret: SECRET,
    });
    expect(ok).toBe(false);
  });
});
