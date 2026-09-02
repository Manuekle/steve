import { type NextRequest, NextResponse } from "next/server";
import { apiError, withApiErrors } from "@/lib/api-error";
import { getCredential } from "@/lib/credentials";
import { verifyStripeWebhookSignature } from "@/lib/stripe";
import { settlePaymentAndMarkContact } from "@/lib/payment-settle";

// POST /api/webhooks/stripe — the operator's *own* Stripe account calling,
// about a customer of theirs who paid a link the agent sent.
//
// Not to be confused with /api/billing/webhook, which is the vendor's account
// telling this installation about its own subscription. Two Stripe accounts,
// two secrets, two endpoints, money moving in opposite directions — see the
// note at the top of lib/stripe.ts. This one's secret is configured by the
// operator in Settings, because it is theirs.
//
// Public in middleware.ts: Stripe carries no session cookie, and the HMAC
// signature over the raw body is what stands in for auth.

/** The shape of `checkout.session.completed`'s object that this route reads. */
type StripeCheckoutSession = {
  readonly id?: string;
  readonly payment_link?: string;
  readonly payment_status?: string;
  readonly amount_total?: number;
  readonly currency?: string;
  readonly customer_details?: { readonly email?: string };
};

type StripeEvent = {
  readonly id: string;
  readonly type: string;
  readonly data: { readonly object: Record<string, unknown> };
};

/** Stripe reports totals in the currency's smallest unit; the ledger keeps
 *  decimals, the same way the amount was entered on the automation step. */
const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf",
  "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

function fromSmallestUnit(total: number | undefined, currency: string | undefined): string | undefined {
  if (typeof total !== "number") return undefined;
  const factor = ZERO_DECIMAL.has((currency ?? "").toLowerCase()) ? 1 : 100;
  return String(total / factor);
}

export const POST = withApiErrors(async function POST(request: NextRequest) {
  // Raw bytes first: the signature is over exactly what Stripe sent, and a
  // JSON.parse/stringify round trip is not guaranteed to reproduce it.
  const rawBody = await request.text();

  const webhookSecret = await getCredential("STRIPE_MERCHANT_WEBHOOK_SECRET");
  if (!webhookSecret) {
    // 500, not the 200 `not_configured` carries: Stripe drops an event it
    // was told was delivered, and retries one that failed for ~3 days. The
    // second is what an operator who is still pasting the secret wants.
    return apiError("server_error", {
      message:
        "Add the Stripe webhook signing secret in Settings > Stripe before pointing Stripe at this endpoint.",
    });
  }

  const verified = verifyStripeWebhookSignature({
    rawBody,
    signatureHeader: request.headers.get("stripe-signature"),
    webhookSecret,
  });
  if (!verified) {
    return apiError("unauthorized", { message: "Invalid Stripe signature." });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return apiError("invalid_json");
  }

  // Anything else is acknowledged rather than refused: Stripe retries a
  // non-2xx for days, and an event this app never asked for is not an error.
  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as StripeCheckoutSession;
  // A completed session can still be unpaid — a bank debit that has not
  // cleared reports `unpaid` here and settles later.
  if (session.payment_status && session.payment_status !== "paid") {
    return NextResponse.json({ received: true, settled: false, reason: "not paid yet" });
  }
  // Sessions that did not come from one of our payment links (a Checkout the
  // operator built elsewhere on the same account) have nothing to match.
  if (!session.payment_link) {
    return NextResponse.json({ received: true, settled: false, reason: "no payment link" });
  }

  const outcome = await settlePaymentAndMarkContact({
    provider: "stripe",
    reference: session.payment_link,
    amountPaid: fromSmallestUnit(session.amount_total, session.currency),
    payerEmail: session.customer_details?.email,
    providerPaymentId: session.id,
  });

  return NextResponse.json({ received: true, outcome: outcome.kind });
});

// This URL gets pasted into the Stripe dashboard and opened by hand at least
// once, so a GET says what it is instead of a bare 405.
export const GET = withApiErrors(function GET() {
  return apiError("method_not_allowed", {
    message: "This endpoint only accepts POST from Stripe.",
  });
});
