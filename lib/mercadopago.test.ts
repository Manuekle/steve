import { describe, expect, it, vi, afterEach } from "vitest";
import { createPaymentPreference, isMercadoPagoCurrency } from "./mercadopago";

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
