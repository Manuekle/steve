import { defineTool } from "eve/tools";
import { z } from "zod";
import { findOrdersForCustomer, getShopifyConfig } from "../../lib/shopify";

export default defineTool({
  description:
    "Look up a customer's recent Shopify orders by email, phone, or name. " +
    "Use this to answer 'where is my order', 'did my payment go through', or " +
    "'what did I buy'. Returns order number, payment and fulfilment status, " +
    "total, items, and any tracking links. Read-only: it never changes an order.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Email, phone, or full name of the customer. Prefer the email or phone " +
          "already on the contact over asking again.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("How many recent orders to return. Default 5."),
  }),
  outputSchema: z.object({
    configured: z.boolean(),
    found: z.boolean(),
    customerName: z.string().optional(),
    orders: z.array(
      z.object({
        name: z.string(),
        createdAt: z.string(),
        financialStatus: z.string().optional(),
        fulfillmentStatus: z.string().optional(),
        total: z.string().optional(),
        items: z.array(z.string()),
        trackingUrls: z.array(z.string()),
      }),
    ),
    error: z.string().optional(),
  }),
  async execute(input) {
    // Answered before the call so the agent can say "no está conectada la
    // tienda" instead of inventing an order.
    if (!(await getShopifyConfig())) {
      return {
        configured: false,
        found: false,
        orders: [],
        error:
          "Shopify is not connected. Add SHOPIFY_SHOP_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN in Settings → Shopify.",
      };
    }

    try {
      const { orders, customerName } = await findOrdersForCustomer(input.query, input.limit ?? 5);
      return {
        configured: true,
        found: orders.length > 0,
        ...(customerName ? { customerName } : {}),
        orders: orders.map((order) => ({
          name: order.name,
          createdAt: order.createdAt,
          ...(order.financialStatus ? { financialStatus: order.financialStatus } : {}),
          ...(order.fulfillmentStatus ? { fulfillmentStatus: order.fulfillmentStatus } : {}),
          ...(order.totalPrice
            ? { total: `${order.totalPrice} ${order.currency ?? ""}`.trim() }
            : {}),
          items: order.lineItems.map((item) => `${item.quantity}x ${item.title}`),
          trackingUrls: [...order.trackingUrls],
        })),
      };
    } catch (error) {
      return {
        configured: true,
        found: false,
        orders: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
