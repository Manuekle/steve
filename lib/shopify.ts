// Minimal Shopify Admin REST client — read-only, no SDK.
//
// Scoped deliberately narrow: looking a customer's orders up by the email or
// phone the agent already has. That is the question an online shop actually
// gets on WhatsApp ("¿dónde está mi pedido?"), and answering it is worth more
// than a generic catalogue browser nobody asked for.
//
// Auth is a custom-app Admin API access token (`shpat_…`), sent in the
// X-Shopify-Access-Token header. There is no OAuth here on purpose: Shopify's
// OAuth is for public apps distributed through their App Store, which is a
// different product from one shop wiring up its own agent.

import { getCredential } from "./credentials";

/** Pinned rather than "latest": Shopify retires a version each year, and a
 *  silently moving target turns into a field disappearing mid-conversation. */
const API_VERSION = "2025-10";

export type ShopifyOrder = {
  readonly id: number;
  readonly name: string;
  readonly createdAt: string;
  readonly financialStatus?: string;
  readonly fulfillmentStatus?: string;
  readonly totalPrice?: string;
  readonly currency?: string;
  readonly trackingUrls: readonly string[];
  readonly lineItems: ReadonlyArray<{ readonly title: string; readonly quantity: number }>;
};

export type ShopifyConfig = {
  readonly shop: string;
  readonly token: string;
};

/**
 * Normalises whatever the operator pasted into the bare `xxx.myshopify.com`
 * host. People paste the admin URL, the storefront URL, or just the handle,
 * and all three should work rather than failing with a 404 from a malformed
 * hostname.
 */
export function normalizeShopDomain(raw: string): string {
  const trimmed = raw.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!trimmed) return "";
  return trimmed.includes(".") ? trimmed : `${trimmed}.myshopify.com`;
}

export async function getShopifyConfig(): Promise<ShopifyConfig | null> {
  const shop = normalizeShopDomain((await getCredential("SHOPIFY_SHOP_DOMAIN")) ?? "");
  const token = (await getCredential("SHOPIFY_ADMIN_ACCESS_TOKEN"))?.trim();
  if (!shop || !token) return null;
  // Only ever talk to a myshopify host: the domain comes from a settings
  // field, so treating it as an arbitrary URL would make this an SSRF hole
  // with a friendly label on it.
  if (!/^[a-z0-9-]+\.myshopify\.com$/i.test(shop)) return null;
  return { shop, token };
}

type RawOrder = {
  id?: number;
  name?: string;
  created_at?: string;
  financial_status?: string | null;
  fulfillment_status?: string | null;
  total_price?: string;
  currency?: string;
  line_items?: Array<{ title?: string; quantity?: number }>;
  fulfillments?: Array<{ tracking_urls?: string[]; tracking_url?: string | null }>;
};

function toOrder(raw: RawOrder): ShopifyOrder {
  const trackingUrls = (raw.fulfillments ?? []).flatMap((f) =>
    (f.tracking_urls ?? []).concat(f.tracking_url ? [f.tracking_url] : []),
  );
  return {
    id: raw.id ?? 0,
    name: raw.name ?? `#${raw.id ?? "?"}`,
    createdAt: raw.created_at ?? "",
    ...(raw.financial_status ? { financialStatus: raw.financial_status } : {}),
    // Shopify returns null (not "unfulfilled") for an order nothing has
    // shipped for yet, which reads as "unknown" unless it is spelled out.
    fulfillmentStatus: raw.fulfillment_status ?? "unfulfilled",
    ...(raw.total_price ? { totalPrice: raw.total_price } : {}),
    ...(raw.currency ? { currency: raw.currency } : {}),
    trackingUrls: [...new Set(trackingUrls)],
    lineItems: (raw.line_items ?? []).map((item) => ({
      title: item.title ?? "",
      quantity: item.quantity ?? 1,
    })),
  };
}

async function adminGet(
  config: ShopifyConfig,
  path: string,
  params: Record<string, string>,
): Promise<unknown> {
  const url = new URL(`https://${config.shop}/admin/api/${API_VERSION}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": config.token, accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json().catch(() => ({}))) as { errors?: unknown };
  if (!response.ok) {
    const detail =
      typeof body.errors === "string" ? body.errors : JSON.stringify(body.errors ?? response.status);
    throw new Error(`Shopify ${response.status}: ${detail}`);
  }
  return body;
}

/**
 * Recent orders for whoever matches `query` (an email, a phone, or a name).
 *
 * Two calls, because Shopify's order list has no "search by customer contact"
 * filter: find the customer first, then read their orders. Returns an empty
 * list rather than throwing when nobody matches — "no tenés pedidos" is an
 * answer, not an error.
 */
export async function findOrdersForCustomer(
  query: string,
  limit = 5,
): Promise<{ readonly orders: readonly ShopifyOrder[]; readonly customerName?: string }> {
  const config = await getShopifyConfig();
  if (!config) throw new Error("Shopify is not configured.");

  const search = (await adminGet(config, "customers/search.json", {
    query,
    limit: "5",
  })) as { customers?: Array<{ id?: number; first_name?: string; last_name?: string }> };

  const customer = search.customers?.[0];
  if (!customer?.id) return { orders: [] };

  const result = (await adminGet(config, "orders.json", {
    customer_id: String(customer.id),
    status: "any",
    limit: String(Math.min(Math.max(limit, 1), 20)),
  })) as { orders?: RawOrder[] };

  const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
  return {
    orders: (result.orders ?? []).map(toOrder),
    ...(name ? { customerName: name } : {}),
  };
}
