// Minimal Stripe REST client — one call, no SDK. The secret key doubles as
// the HTTP Basic Auth username (Stripe's convention); the password is left
// blank.

import { createHmac, timingSafeEqual } from "node:crypto";

const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf",
  "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

/**
 * Two Stripe accounts, never the same one.
 *
 * The key on the Settings page is the *operator's* merchant account: it is
 * what `send_payment_link` charges their customers with, and its money is
 * theirs. This installation's own subscription (Pro/Managed) is money moving
 * the other way, to the vendor — so it runs on the vendor's account, supplied
 * by the environment of a hosted install and never typed into the UI. Sharing
 * one key made the operator bill themselves for their own plan.
 *
 * Env-only is the point: a self-hosted Enterprise install has no plan to buy
 * (see docs/commercial-licensing.md) and simply leaves these unset, which
 * turns checkout and the billing webhook off with a readable message.
 */
export function getPlatformStripeKey(): string | undefined {
  return process.env.STRIPE_PLATFORM_SECRET_KEY?.trim() || undefined;
}

export function getPlatformWebhookSecret(): string | undefined {
  return process.env.STRIPE_PLATFORM_WEBHOOK_SECRET?.trim() || undefined;
}

/** Stripe wants the amount in the currency's smallest unit (cents, unless zero-decimal). */
function toSmallestUnit(amount: string, currency: string): number {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid amount: ${amount}`);
  const factor = ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? 1 : 100;
  return Math.round(value * factor);
}

/**
 * Creates a one-time Stripe Payment Link.
 *
 * The id comes back with the URL because it is the only handle
 * `checkout.session.completed` will name later (`session.payment_link`), and
 * that is how a payment finds its way back to the contact it was sent to —
 * see lib/payment-store.ts.
 */
export async function createPaymentLink(opts: {
  readonly secretKey: string;
  readonly amount: string;
  readonly currency: string;
  readonly productName: string;
}): Promise<{ readonly id: string; readonly url: string }> {
  const unitAmount = toSmallestUnit(opts.amount, opts.currency);
  const body = new URLSearchParams({
    "line_items[0][price_data][currency]": opts.currency.toLowerCase(),
    "line_items[0][price_data][product_data][name]": opts.productName,
    "line_items[0][price_data][unit_amount]": String(unitAmount),
    "line_items[0][quantity]": "1",
  });
  const response = await fetch("https://api.stripe.com/v1/payment_links", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${opts.secretKey}:`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await response.json()) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };
  if (!response.ok || !data.url || !data.id) {
    throw new Error(`Stripe ${response.status}: ${data.error?.message ?? "unknown error"}`);
  }
  return { id: data.id, url: data.url };
}

/**
 * Opens a Stripe-hosted Checkout Session and returns its URL.
 *
 * Everything to do with a card happens on that page, on Stripe's domain: this
 * app never sees, stores, or transmits a card number, which is the only way
 * to add a payment method that does not drag the whole installation into PCI
 * scope. `mode: "setup"` saves a card for later; `mode: "subscription"` starts
 * a plan, priced inline so there is no Price object to keep in sync with
 * `lib/plans.ts`.
 */
export async function createCheckoutSession(opts: {
  readonly secretKey: string;
  readonly mode: "setup" | "subscription";
  readonly successUrl: string;
  readonly cancelUrl: string;
  /** Required for `mode: "subscription"`. */
  readonly plan?: { readonly name: string; readonly amount: number; readonly currency: string };
  /**
   * Round-tripped onto the Checkout Session (and, for a subscription, onto
   * the Subscription object too) so the webhook can tell which plan a
   * `checkout.session.completed` event is for — Stripe has no other way to
   * connect the two, since the price is built inline instead of from a
   * saved Price object.
   */
  readonly metadata?: Record<string, string>;
}): Promise<string> {
  const body = new URLSearchParams({
    mode: opts.mode,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
  });

  if (opts.mode === "subscription") {
    if (!opts.plan) throw new Error("A subscription checkout needs a plan.");
    const currency = opts.plan.currency.toLowerCase();
    body.set("line_items[0][price_data][currency]", currency);
    body.set("line_items[0][price_data][product_data][name]", opts.plan.name);
    body.set(
      "line_items[0][price_data][unit_amount]",
      String(toSmallestUnit(String(opts.plan.amount), currency)),
    );
    body.set("line_items[0][price_data][recurring][interval]", "month");
    body.set("line_items[0][quantity]", "1");
    for (const [key, value] of Object.entries(opts.metadata ?? {})) {
      body.set(`subscription_data[metadata][${key}]`, value);
    }
  }

  for (const [key, value] of Object.entries(opts.metadata ?? {})) {
    body.set(`metadata[${key}]`, value);
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${opts.secretKey}:`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await response.json()) as { url?: string; error?: { message?: string } };
  if (!response.ok || !data.url) {
    throw new Error(`Stripe ${response.status}: ${data.error?.message ?? "unknown error"}`);
  }
  return data.url;
}

/**
 * Verifies a `Stripe-Signature` header against the raw request body, by
 * hand — Stripe's algorithm (HMAC-SHA256 over `${timestamp}.${rawBody}`,
 * compared in constant time, with a tolerance window against replay) is
 * short and stable enough that reimplementing it stays in the spirit of
 * this file's "one call, no SDK" choice, rather than pulling in the full
 * `stripe` package just to check one signature. The one thing this must not
 * get wrong is comparing signatures in non-constant time — see
 * `timingSafeEqual` below, the same primitive `lib/auth/store.ts` already
 * uses for the same reason.
 *
 * The body MUST be the exact raw bytes Stripe sent, read before any JSON
 * parsing — the signature is computed over the raw payload, and a
 * re-serialized `JSON.stringify(JSON.parse(body))` is not guaranteed to
 * match byte for byte.
 */
export function verifyStripeWebhookSignature(opts: {
  readonly rawBody: string;
  readonly signatureHeader: string | null;
  readonly webhookSecret: string;
  /** Seconds. Stripe's own SDK defaults to 300. */
  readonly toleranceSeconds?: number;
}): boolean {
  if (!opts.signatureHeader) return false;

  const parts = new Map<string, string>();
  for (const entry of opts.signatureHeader.split(",")) {
    const [key, value] = entry.split("=");
    if (key && value) parts.set(key.trim(), value.trim());
  }
  const timestamp = parts.get("t");
  const signature = parts.get("v1");
  if (!timestamp || !signature) return false;

  const tolerance = opts.toleranceSeconds ?? 300;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > tolerance) return false;

  const expected = createHmac("sha256", opts.webhookSecret)
    .update(`${timestamp}.${opts.rawBody}`, "utf8")
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
