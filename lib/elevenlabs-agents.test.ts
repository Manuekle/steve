import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";
import { normalizeTranscript, verifyElevenLabsWebhookSignature } from "./elevenlabs-agents";

const SECRET = "test_webhook_secret";

function sign(payload: string, secret: string, timestamp: number): string {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
  return `t=${timestamp},v0=${signature}`;
}

describe("verifyElevenLabsWebhookSignature", () => {
  test("accepts a correctly signed, fresh payload", () => {
    const body = JSON.stringify({ type: "post_call_transcription" });
    const header = sign(body, SECRET, Math.floor(Date.now() / 1000));
    expect(
      verifyElevenLabsWebhookSignature({ rawBody: body, signatureHeader: header, webhookSecret: SECRET }),
    ).toBe(true);
  });

  test("rejects a signature made with the wrong secret", () => {
    const body = JSON.stringify({ type: "post_call_transcription" });
    const header = sign(body, "wrong_secret", Math.floor(Date.now() / 1000));
    expect(
      verifyElevenLabsWebhookSignature({ rawBody: body, signatureHeader: header, webhookSecret: SECRET }),
    ).toBe(false);
  });

  test("rejects a body that was tampered with after signing", () => {
    const original = JSON.stringify({ data: { conversation_id: "conv_1" } });
    const header = sign(original, SECRET, Math.floor(Date.now() / 1000));
    const tampered = JSON.stringify({ data: { conversation_id: "conv_evil" } });
    expect(
      verifyElevenLabsWebhookSignature({ rawBody: tampered, signatureHeader: header, webhookSecret: SECRET }),
    ).toBe(false);
  });

  test("rejects a stale timestamp outside the tolerance window (replay protection)", () => {
    const body = JSON.stringify({ type: "post_call_transcription" });
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
    const header = sign(body, SECRET, tenMinutesAgo);
    expect(
      verifyElevenLabsWebhookSignature({ rawBody: body, signatureHeader: header, webhookSecret: SECRET }),
    ).toBe(false);
  });

  test("accepts a stale timestamp when the caller widens the tolerance", () => {
    const body = JSON.stringify({ type: "post_call_transcription" });
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
    const header = sign(body, SECRET, tenMinutesAgo);
    expect(
      verifyElevenLabsWebhookSignature({
        rawBody: body,
        signatureHeader: header,
        webhookSecret: SECRET,
        toleranceSeconds: 3600,
      }),
    ).toBe(true);
  });

  test("rejects a missing signature header", () => {
    expect(
      verifyElevenLabsWebhookSignature({ rawBody: "{}", signatureHeader: null, webhookSecret: SECRET }),
    ).toBe(false);
  });

  test("rejects a malformed signature header (no v0)", () => {
    expect(
      verifyElevenLabsWebhookSignature({
        rawBody: "{}",
        signatureHeader: "t=12345",
        webhookSecret: SECRET,
      }),
    ).toBe(false);
  });

  test("rejects a v0 signature of the wrong length instead of throwing", () => {
    expect(
      verifyElevenLabsWebhookSignature({
        rawBody: "{}",
        signatureHeader: `t=${Math.floor(Date.now() / 1000)},v0=deadbeef`,
        webhookSecret: SECRET,
      }),
    ).toBe(false);
  });

  test("tolerates an unrecognized extra field alongside t and v0", () => {
    const body = JSON.stringify({ type: "post_call_transcription" });
    const timestamp = Math.floor(Date.now() / 1000);
    const v0 = createHmac("sha256", SECRET).update(`${timestamp}.${body}`, "utf8").digest("hex");
    const header = `unknown=xyz,t=${timestamp},v0=${v0}`;
    expect(
      verifyElevenLabsWebhookSignature({ rawBody: body, signatureHeader: header, webhookSecret: SECRET }),
    ).toBe(true);
  });
});

describe("normalizeTranscript", () => {
  test("maps role and time_in_call_secs onto the app's own shape", () => {
    const turns = normalizeTranscript({
      transcript: [
        { role: "agent", message: "Hola, en qué te ayudo?", time_in_call_secs: 0 },
        { role: "user", message: "Quiero un pedido", time_in_call_secs: 4 },
      ],
    });
    expect(turns).toEqual([
      { role: "agent", message: "Hola, en qué te ayudo?", timeInCallSecs: 0 },
      { role: "user", message: "Quiero un pedido", timeInCallSecs: 4 },
    ]);
  });

  test("drops turns with no message (tool-call-only turns)", () => {
    const turns = normalizeTranscript({
      transcript: [
        { role: "agent", message: null, time_in_call_secs: 1 },
        { role: "agent", message: "  ", time_in_call_secs: 2 },
        { role: "user", message: "Sí", time_in_call_secs: 3 },
      ],
    });
    expect(turns).toEqual([{ role: "user", message: "Sí", timeInCallSecs: 3 }]);
  });

  test("treats any non-agent role as user", () => {
    const turns = normalizeTranscript({
      transcript: [{ role: "caller", message: "Hola", time_in_call_secs: 0 }],
    });
    expect(turns).toEqual([{ role: "user", message: "Hola", timeInCallSecs: 0 }]);
  });

  test("returns an empty array when there is no transcript", () => {
    expect(normalizeTranscript(undefined)).toEqual([]);
    expect(normalizeTranscript({})).toEqual([]);
  });
});
