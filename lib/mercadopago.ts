// Minimal Mercado Pago REST client — one call, no SDK, mirroring lib/stripe.ts.
//
// Checkout Pro works by creating a "preference" (what is being sold, for how
// much) and handing the buyer the hosted URL it returns. The app never sees a
// card, same as with Stripe.
//
// Two things differ from Stripe and both are easy to get wrong:
//   - the amount is a plain decimal, not the currency's smallest unit;
//   - the currency is an uppercase ISO code the account must actually be
//     enabled for — a Mexican account cannot charge in ARS.

/** Currencies Checkout Pro accepts, by the country the account belongs to.
 *  Sent uppercase; anything else is refused before the request goes out, so a
 *  typo reads as a clear error instead of a 400 from someone else's API. */
const CURRENCIES = new Set(["ARS", "BRL", "CLP", "COP", "MXN", "PEN", "UYU"]);

export function isMercadoPagoCurrency(currency: string): boolean {
  return CURRENCIES.has(currency.trim().toUpperCase());
}

/**
 * Creates a Checkout Pro preference and returns its hosted checkout URL.
 *
 * A test access token (`TEST-…`) yields a preference whose real `init_point`
 * still resolves, but only `sandbox_init_point` takes test cards — so the
 * sandbox URL is preferred when the token is a test one, and a test run
 * doesn't silently send someone to a live checkout.
 */
export async function createPaymentPreference(opts: {
  readonly accessToken: string;
  readonly amount: string;
  readonly currency: string;
  readonly productName: string;
}): Promise<string> {
  const unitPrice = Number(opts.amount);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    throw new Error(`Invalid amount: ${opts.amount}`);
  }
  const currency = opts.currency.trim().toUpperCase();
  if (!isMercadoPagoCurrency(currency)) {
    throw new Error(
      `Mercado Pago does not accept ${currency}. Use one of: ${[...CURRENCIES].join(", ")}.`,
    );
  }

  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      authorization: `Bearer ${opts.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      items: [
        {
          title: opts.productName,
          quantity: 1,
          unit_price: unitPrice,
          currency_id: currency,
        },
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const data = (await response.json()) as {
    init_point?: string;
    sandbox_init_point?: string;
    message?: string;
  };
  const isTestToken = opts.accessToken.startsWith("TEST-");
  const url = isTestToken ? (data.sandbox_init_point ?? data.init_point) : data.init_point;
  if (!response.ok || !url) {
    throw new Error(`Mercado Pago ${response.status}: ${data.message ?? "unknown error"}`);
  }
  return url;
}
