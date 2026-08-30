// Minimal Stripe REST client — one call, no SDK. The secret key doubles as
// the HTTP Basic Auth username (Stripe's convention); the password is left
// blank.

const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf",
  "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

/** Stripe wants the amount in the currency's smallest unit (cents, unless zero-decimal). */
function toSmallestUnit(amount: string, currency: string): number {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid amount: ${amount}`);
  const factor = ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? 1 : 100;
  return Math.round(value * factor);
}

/** Creates a one-time Stripe Payment Link and returns its hosted checkout URL. */
export async function createPaymentLink(opts: {
  readonly secretKey: string;
  readonly amount: string;
  readonly currency: string;
  readonly productName: string;
}): Promise<string> {
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
  const data = (await response.json()) as { url?: string; error?: { message?: string } };
  if (!response.ok || !data.url) {
    throw new Error(`Stripe ${response.status}: ${data.error?.message ?? "unknown error"}`);
  }
  return data.url;
}
