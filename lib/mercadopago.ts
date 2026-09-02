import { createHmac, timingSafeEqual } from "node:crypto";

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
  /** Echoed back on the payment, which is how the webhook finds the contact
   *  this checkout was created for — see lib/payment-store.ts. */
  readonly externalReference?: string;
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
      ...(opts.externalReference ? { external_reference: opts.externalReference } : {}),
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

/**
 * One payment, read back from Mercado Pago.
 *
 * The webhook is a notification, not a statement: it says "payment 123
 * changed", and nothing about it is trustworthy on its own — anyone can POST
 * that shape. Fetching the payment with the account's own token is what turns
 * it into a fact, and it is also the only way to learn the status, since the
 * notification does not carry one.
 */
export type MercadoPagoPayment = {
  readonly id: string;
  readonly status: string;
  readonly externalReference?: string;
  readonly amount?: string;
  readonly payerEmail?: string;
};

export async function getPayment(opts: {
  readonly accessToken: string;
  readonly paymentId: string;
}): Promise<MercadoPagoPayment> {
  const response = await fetch(
    `https://api.mercadopago.com/v1/payments/${encodeURIComponent(opts.paymentId)}`,
    {
      headers: { authorization: `Bearer ${opts.accessToken}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  const data = (await response.json()) as {
    id?: number | string;
    status?: string;
    external_reference?: string;
    transaction_amount?: number;
    payer?: { email?: string };
    message?: string;
  };
  if (!response.ok || !data.status) {
    throw new Error(`Mercado Pago ${response.status}: ${data.message ?? "unknown error"}`);
  }
  return {
    id: String(data.id ?? opts.paymentId),
    status: data.status,
    externalReference: data.external_reference || undefined,
    amount: typeof data.transaction_amount === "number" ? String(data.transaction_amount) : undefined,
    payerEmail: data.payer?.email || undefined,
  };
}

/**
 * Verifies the `x-signature` header Mercado Pago sends with a notification.
 *
 * The signed manifest is `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`,
 * HMAC-SHA256 with the secret from the webhook's own configuration screen —
 * not the access token. The id is lowercased first, which MP's own examples
 * do and which matters because their ids are sometimes sent uppercase.
 *
 * Missing pieces are a failure, never a pass: an unsigned notification is
 * exactly what an attacker sends.
 */
export function verifyMercadoPagoSignature(opts: {
  readonly signatureHeader: string | null;
  readonly requestId: string | null;
  readonly dataId: string | null;
  readonly secret: string;
  /** Seconds. Mirrors the tolerance lib/stripe.ts uses against replay. */
  readonly toleranceSeconds?: number;
}): boolean {
  if (!opts.signatureHeader || !opts.dataId) return false;

  const parts = new Map<string, string>();
  for (const entry of opts.signatureHeader.split(",")) {
    const separator = entry.indexOf("=");
    if (separator === -1) continue;
    parts.set(entry.slice(0, separator).trim(), entry.slice(separator + 1).trim());
  }
  const timestamp = parts.get("ts");
  const signature = parts.get("v1");
  if (!timestamp || !signature) return false;

  const tolerance = opts.toleranceSeconds ?? 300;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > tolerance) return false;

  const manifest = `id:${opts.dataId.toLowerCase()};request-id:${opts.requestId ?? ""};ts:${timestamp};`;
  const expected = createHmac("sha256", opts.secret).update(manifest).digest("hex");

  const a = Buffer.from(expected, "utf-8");
  const b = Buffer.from(signature, "utf-8");
  return a.length === b.length && timingSafeEqual(a, b);
}
