import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { normalizeShopDomain } from "./shopify";

vi.mock("./credentials", () => ({
  getCredential: vi.fn(async (key: string) => store[key]),
}));

let store: Record<string, string | undefined> = {};

beforeEach(() => {
  store = {};
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeShopDomain", () => {
  it("accepts the bare handle, the domain, and a pasted admin URL", () => {
    expect(normalizeShopDomain("mi-tienda")).toBe("mi-tienda.myshopify.com");
    expect(normalizeShopDomain("mi-tienda.myshopify.com")).toBe("mi-tienda.myshopify.com");
    expect(normalizeShopDomain("https://mi-tienda.myshopify.com/admin/orders")).toBe(
      "mi-tienda.myshopify.com",
    );
  });

  it("returns empty for empty input", () => {
    expect(normalizeShopDomain("   ")).toBe("");
  });
});

describe("getShopifyConfig", () => {
  it("is null until both the domain and the token are set", async () => {
    const { getShopifyConfig } = await import("./shopify");
    expect(await getShopifyConfig()).toBeNull();

    store.SHOPIFY_SHOP_DOMAIN = "mi-tienda";
    expect(await getShopifyConfig()).toBeNull();

    store.SHOPIFY_ADMIN_ACCESS_TOKEN = "shpat_abc";
    expect(await getShopifyConfig()).toEqual({
      shop: "mi-tienda.myshopify.com",
      token: "shpat_abc",
    });
  });

  it("refuses a domain outside myshopify.com, so the field can't be aimed elsewhere", async () => {
    const { getShopifyConfig } = await import("./shopify");
    store.SHOPIFY_ADMIN_ACCESS_TOKEN = "shpat_abc";
    for (const domain of ["evil.example.com", "localhost:3000", "169.254.169.254"]) {
      store.SHOPIFY_SHOP_DOMAIN = domain;
      expect(await getShopifyConfig()).toBeNull();
    }
  });
});

describe("findOrdersForCustomer", () => {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

  beforeEach(() => {
    store.SHOPIFY_SHOP_DOMAIN = "mi-tienda.myshopify.com";
    store.SHOPIFY_ADMIN_ACCESS_TOKEN = "shpat_abc";
  });

  it("finds the customer, then reads their orders", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ customers: [{ id: 7, first_name: "Ada", last_name: "L" }] }))
      .mockResolvedValueOnce(
        json({
          orders: [
            {
              id: 1,
              name: "#1001",
              created_at: "2026-08-01T00:00:00Z",
              financial_status: "paid",
              fulfillment_status: null,
              total_price: "49.99",
              currency: "ARS",
              line_items: [{ title: "Remera", quantity: 2 }],
              fulfillments: [{ tracking_urls: ["https://t/1"], tracking_url: "https://t/1" }],
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { findOrdersForCustomer } = await import("./shopify");
    const result = await findOrdersForCustomer("ada@example.com");

    expect(result.customerName).toBe("Ada L");
    expect(result.orders).toHaveLength(1);
    const order = result.orders[0];
    // Shopify returns null for "nothing shipped yet"; that must not read as unknown.
    expect(order.fulfillmentStatus).toBe("unfulfilled");
    expect(order.lineItems).toEqual([{ title: "Remera", quantity: 2 }]);
    // The same URL arrives twice from Shopify; it should be listed once.
    expect(order.trackingUrls).toEqual(["https://t/1"]);

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "https://mi-tienda.myshopify.com/admin/api/",
    );
    expect(fetchMock.mock.calls[0][1].headers["X-Shopify-Access-Token"]).toBe("shpat_abc");
  });

  it("returns no orders, not an error, when nobody matches", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ customers: [] })));
    const { findOrdersForCustomer } = await import("./shopify");
    await expect(findOrdersForCustomer("nadie@example.com")).resolves.toEqual({ orders: [] });
  });

  it("surfaces an API failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ errors: "Invalid API key or access token" }), { status: 401 }),
      ),
    );
    const { findOrdersForCustomer } = await import("./shopify");
    await expect(findOrdersForCustomer("x@example.com")).rejects.toThrow(/401.*Invalid API key/);
  });
});
