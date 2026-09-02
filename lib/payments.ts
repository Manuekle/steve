// Creating a payment link, in one place.
//
// Two callers need exactly this: the `send_payment_link` automation step, and
// the agent's tool of the same name. They must agree on which processor gets
// used, on how the currency is validated, and — since the merchant webhooks
// exist — on writing the link into the ledger so a payment can find its way
// back to the contact. Two copies of that would drift, and the half that
// drifts is the half that stops recording money.

import { getCredential } from "./credentials";
import { createPaymentLink } from "./stripe";
import { createPaymentPreference, isMercadoPagoCurrency } from "./mercadopago";
import { newPaymentReference, recordPendingPayment } from "./payment-store";

export type PaymentProvider = "stripe" | "mercadopago";
export type PaymentChoice = { readonly provider: PaymentProvider; readonly key: string };

/**
 * Which processor creates a payment link, and with which key.
 *
 * An explicit `paymentProvider` on the step always wins — if someone picked
 * Mercado Pago and its token is missing, that is an error worth surfacing, not
 * a reason to silently charge through Stripe instead. With nothing picked, the
 * currency decides: Mercado Pago cannot bill in USD or EUR, and Stripe is the
 * safe default everywhere it is configured.
 */
export async function resolvePaymentProvider(
  requested: PaymentProvider | undefined,
  currency: string,
): Promise<PaymentChoice | null> {
  const stripeKey = (await getCredential("STRIPE_SECRET_KEY"))?.trim();
  const mercadoKey = (await getCredential("MERCADOPAGO_ACCESS_TOKEN"))?.trim();

  if (requested === "stripe") return stripeKey ? { provider: "stripe", key: stripeKey } : null;
  if (requested === "mercadopago") {
    return mercadoKey ? { provider: "mercadopago", key: mercadoKey } : null;
  }

  // Nothing picked. Only Mercado Pago can take a local currency it supports,
  // so prefer it there; otherwise Stripe, then whatever is left.
  if (mercadoKey && isMercadoPagoCurrency(currency) && !stripeKey) {
    return { provider: "mercadopago", key: mercadoKey };
  }
  if (stripeKey) return { provider: "stripe", key: stripeKey };
  if (mercadoKey && isMercadoPagoCurrency(currency)) {
    return { provider: "mercadopago", key: mercadoKey };
  }
  return null;
}


export type CreatedPaymentLink = {
  readonly url: string;
  readonly provider: PaymentProvider;
  /** What the provider's webhook will name later. See lib/payment-store.ts. */
  readonly reference: string;
};

/**
 * Create the link and write it down before anyone sees it.
 *
 * `null` means no processor is configured — a normal state on a fresh
 * installation, and the caller says so in its own words rather than throwing
 * a stack trace at a customer.
 */
export async function createCheckoutLink(input: {
  readonly amount: string;
  readonly currency: string;
  readonly productName: string;
  readonly requested?: PaymentProvider;
  readonly contactId?: string;
}): Promise<CreatedPaymentLink | null> {
  const chosen = await resolvePaymentProvider(input.requested, input.currency);
  if (!chosen) return null;

  let url: string;
  let reference: string;
  if (chosen.provider === "mercadopago") {
    reference = newPaymentReference();
    url = await createPaymentPreference({
      accessToken: chosen.key,
      amount: input.amount,
      currency: input.currency,
      productName: input.productName,
      externalReference: reference,
    });
  } else {
    const created = await createPaymentLink({
      secretKey: chosen.key,
      amount: input.amount,
      currency: input.currency,
      productName: input.productName,
    });
    reference = created.id;
    url = created.url;
  }

  await recordPendingPayment({
    provider: chosen.provider,
    reference,
    contactId: input.contactId,
    amount: input.amount,
    currency: input.currency,
    productName: input.productName,
    checkoutUrl: url,
  });

  return { url, provider: chosen.provider, reference };
}
