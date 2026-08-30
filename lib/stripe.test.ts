import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";
import { verifyStripeWebhookSignature } from "./stripe";

const SECRET = "whsec_test_secret";

function sign(payload: string, secret: string, timestamp: number): string {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

describe("verifyStripeWebhookSignature", () => {
  test("accepts a correctly signed, fresh payload", () => {
    const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
    const header = sign(body, SECRET, Math.floor(Date.now() / 1000));
    expect(
      verifyStripeWebhookSignature({ rawBody: body, signatureHeader: header, webhookSecret: SECRET }),
    ).toBe(true);
  });

  test("rejects a signature made with the wrong secret", () => {
    const body = JSON.stringify({ id: "evt_1" });
    const header = sign(body, "whsec_wrong", Math.floor(Date.now() / 1000));
    expect(
      verifyStripeWebhookSignature({ rawBody: body, signatureHeader: header, webhookSecret: SECRET }),
    ).toBe(false);
  });

  test("rejects a body that was tampered with after signing", () => {
    const original = JSON.stringify({ id: "evt_1", amount: 100 });
    const header = sign(original, SECRET, Math.floor(Date.now() / 1000));
    const tampered = JSON.stringify({ id: "evt_1", amount: 999999 });
    expect(
      verifyStripeWebhookSignature({ rawBody: tampered, signatureHeader: header, webhookSecret: SECRET }),
    ).toBe(false);
  });

  test("rejects a stale timestamp outside the tolerance window (replay protection)", () => {
    const body = JSON.stringify({ id: "evt_1" });
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
    const header = sign(body, SECRET, tenMinutesAgo);
    expect(
      verifyStripeWebhookSignature({ rawBody: body, signatureHeader: header, webhookSecret: SECRET }),
    ).toBe(false);
  });

  test("accepts a stale timestamp when the caller widens the tolerance", () => {
    const body = JSON.stringify({ id: "evt_1" });
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
    const header = sign(body, SECRET, tenMinutesAgo);
    expect(
      verifyStripeWebhookSignature({
        rawBody: body,
        signatureHeader: header,
        webhookSecret: SECRET,
        toleranceSeconds: 3600,
      }),
    ).toBe(true);
  });

  test("rejects a missing signature header", () => {
    expect(
      verifyStripeWebhookSignature({ rawBody: "{}", signatureHeader: null, webhookSecret: SECRET }),
    ).toBe(false);
  });

  test("rejects a malformed signature header (no v1)", () => {
    expect(
      verifyStripeWebhookSignature({
        rawBody: "{}",
        signatureHeader: "t=12345",
        webhookSecret: SECRET,
      }),
    ).toBe(false);
  });

  test("rejects a v1 signature of the wrong length instead of throwing", () => {
    expect(
      verifyStripeWebhookSignature({
        rawBody: "{}",
        signatureHeader: `t=${Math.floor(Date.now() / 1000)},v1=deadbeef`,
        webhookSecret: SECRET,
      }),
    ).toBe(false);
  });

  test("tolerates Stripe's real header shape with an extra v0 field", () => {
    const body = JSON.stringify({ id: "evt_1" });
    const timestamp = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", SECRET).update(`${timestamp}.${body}`, "utf8").digest("hex");
    const header = `t=${timestamp},v0=irrelevant_legacy_signature,v1=${v1}`;
    expect(
      verifyStripeWebhookSignature({ rawBody: body, signatureHeader: header, webhookSecret: SECRET }),
    ).toBe(true);
  });
});
