import { describe, expect, it, vi, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import {
  createPaymentPreference,
  getPayment,
  isMercadoPagoCurrency,
  verifyMercadoPagoSignature,
} from "./mercadopago";

afterEach(() => {
  vi.unstubAllGlobals();
});

const ok = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("isMercadoPagoCurrency", () => {
  it("accepts the countries Checkout Pro operates in, case-insensitively", () => {
    expect(isMercadoPagoCurrency("ars")).toBe(true);
    expect(isMercadoPagoCurrency("MXN")).toBe(true);
    expect(isMercadoPagoCurrency(" uyu ")).toBe(true);
  });

  it("rejects currencies it cannot bill", () => {
    expect(isMercadoPagoCurrency("usd")).toBe(false);
    expect(isMercadoPagoCurrency("eur")).toBe(false);
  });
});

describe("createPaymentPreference", () => {
  it("sends the amount as a plain decimal, not the smallest unit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ init_point: "https://mp/checkout" }));
    vi.stubGlobal("fetch", fetchMock);

    await createPaymentPreference({
      accessToken: "APP_USR-abc",
      amount: "49.99",
      currency: "ars",
      productName: "Consultoría",
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.items[0].unit_price).toBe(49.99);
    expect(body.items[0].currency_id).toBe("ARS");
    expect(init.headers.authorization).toBe("Bearer APP_USR-abc");
  });

  it("prefers the sandbox URL for a test token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        ok({ init_point: "https://mp/live", sandbox_init_point: "https://mp/sandbox" }),
      ),
    );
    const url = await createPaymentPreference({
      accessToken: "TEST-abc",
      amount: "10",
      currency: "mxn",
      productName: "x",
    });
    expect(url).toBe("https://mp/sandbox");
  });

  it("uses the live URL for a production token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        ok({ init_point: "https://mp/live", sandbox_init_point: "https://mp/sandbox" }),
      ),
    );
    const url = await createPaymentPreference({
      accessToken: "APP_USR-abc",
      amount: "10",
      currency: "mxn",
      productName: "x",
    });
    expect(url).toBe("https://mp/live");
  });

  it("refuses a currency Mercado Pago cannot bill, without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createPaymentPreference({
        accessToken: "APP_USR-abc",
        amount: "10",
        currency: "usd",
        productName: "x",
      }),
    ).rejects.toThrow(/does not accept USD/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a non-positive amount", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createPaymentPreference({
        accessToken: "APP_USR-abc",
        amount: "0",
        currency: "ars",
        productName: "x",
      }),
    ).rejects.toThrow(/Invalid amount/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the API's message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "invalid access token" }), { status: 401 }),
      ),
    );
    await expect(
      createPaymentPreference({
        accessToken: "APP_USR-bad",
        amount: "10",
        currency: "ars",
        productName: "x",
      }),
    ).rejects.toThrow(/401: invalid access token/);
  });
});

describe("external_reference", () => {
  it("rides along on the preference, so the webhook can find the contact", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ init_point: "https://mp/checkout" }));
    vi.stubGlobal("fetch", fetchMock);

    await createPaymentPreference({
      accessToken: "APP_USR-abc",
      amount: "10",
      currency: "ars",
      productName: "x",
      externalReference: "steve_deadbeef",
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body).external_reference).toBe("steve_deadbeef");
  });

  it("is omitted when there is none, rather than sent empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ init_point: "https://mp/checkout" }));
    vi.stubGlobal("fetch", fetchMock);

    await createPaymentPreference({
      accessToken: "APP_USR-abc",
      amount: "10",
      currency: "ars",
      productName: "x",
    });

    expect("external_reference" in JSON.parse(fetchMock.mock.calls[0][1].body)).toBe(false);
  });
});

describe("getPayment", () => {
  it("reads the payment back through the account's own token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ok({
        id: 123,
        status: "approved",
        external_reference: "steve_deadbeef",
        transaction_amount: 49.99,
        payer: { email: "buyer@example.com" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const payment = await getPayment({ accessToken: "APP_USR-abc", paymentId: "123" });

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.mercadopago.com/v1/payments/123");
    expect(payment).toEqual({
      id: "123",
      status: "approved",
      externalReference: "steve_deadbeef",
      amount: "49.99",
      payerEmail: "buyer@example.com",
    });
  });
});

describe("verifyMercadoPagoSignature", () => {
  const secret = "webhook-secret";
  const sign = (manifest: string) => createHmac("sha256", secret).update(manifest).digest("hex");

  function header(dataId: string, requestId: string, ts = Math.floor(Date.now() / 1000)) {
    const v1 = sign(`id:${dataId};request-id:${requestId};ts:${ts};`);
    return `ts=${ts},v1=${v1}`;
  }

  it("accepts a signature over the documented manifest", () => {
    expect(
      verifyMercadoPagoSignature({
        signatureHeader: header("123", "req-1"),
        requestId: "req-1",
        dataId: "123",
        secret,
      }),
    ).toBe(true);
  });

  it("lowercases the id, the way Mercado Pago's own examples do", () => {
    expect(
      verifyMercadoPagoSignature({
        signatureHeader: header("abc", "req-1"),
        requestId: "req-1",
        dataId: "ABC",
        secret,
      }),
    ).toBe(true);
  });

  it("rejects a tampered id, a wrong secret, and a missing header", () => {
    expect(
      verifyMercadoPagoSignature({
        signatureHeader: header("123", "req-1"),
        requestId: "req-1",
        dataId: "456",
        secret,
      }),
    ).toBe(false);
    expect(
      verifyMercadoPagoSignature({
        signatureHeader: header("123", "req-1"),
        requestId: "req-1",
        dataId: "123",
        secret: "other-secret",
      }),
    ).toBe(false);
    expect(
      verifyMercadoPagoSignature({ signatureHeader: null, requestId: "r", dataId: "123", secret }),
    ).toBe(false);
  });

  it("rejects a replay from outside the tolerance window", () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect(
      verifyMercadoPagoSignature({
        signatureHeader: header("123", "req-1", old),
        requestId: "req-1",
        dataId: "123",
        secret,
      }),
    ).toBe(false);
  });
});
