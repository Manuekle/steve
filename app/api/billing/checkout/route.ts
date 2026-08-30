import { type NextRequest, NextResponse } from "next/server";
import { apiError, apiFailure, missingField, withApiErrors } from "@/lib/api-error";
import { getCredential } from "@/lib/credentials";
import { createCheckoutSession } from "@/lib/stripe";
import { getPlan, isPlanId } from "@/lib/plans";

// POST /api/billing/checkout — a Stripe-hosted page to finish on.
//
// `mode: "setup"` saves a card; `mode: "subscription"` starts a plan. Either
// way the card is entered on Stripe's own domain and this app never touches
// it. Nothing is charged here: the response is a URL the customer chooses to
// open and complete themselves.

export const POST = withApiErrors(async function POST(request: NextRequest) {
  const secretKey = await getCredential("STRIPE_SECRET_KEY");
  if (!secretKey) {
    return apiError("not_configured", {
      message: "Add a Stripe secret key in Settings before setting up billing.",
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json");
  }
  const input = body as { mode?: unknown; plan?: unknown } | null;
  const mode = input?.mode;
  if (mode !== "setup" && mode !== "subscription") return missingField("mode");

  const origin = request.nextUrl.origin;
  const successUrl = `${origin}/account/billing?checkout=success`;
  const cancelUrl = `${origin}/account/billing?checkout=cancelled`;

  try {
    if (mode === "setup") {
      const url = await createCheckoutSession({ secretKey, mode, successUrl, cancelUrl });
      return NextResponse.json({ url });
    }
    if (!isPlanId(input?.plan)) {
      return apiError("invalid_field", { field: "plan", message: "Unknown plan." });
    }
    const plan = getPlan(input.plan);
    if (plan.interval === "once") {
      return apiError("invalid_field", {
        field: "plan",
        message: "Enterprise is sold once, through sales — not through checkout.",
      });
    }
    const url = await createCheckoutSession({
      secretKey,
      mode,
      successUrl,
      cancelUrl,
      plan: { name: `steve ${plan.id}`, amount: plan.amount, currency: "usd" },
      // The webhook's only way to know which plan a checkout.session.completed
      // event is for — see lib/stripe.ts's verifyStripeWebhookSignature and
      // app/api/billing/webhook/route.ts.
      metadata: { plan: plan.id },
    });
    return NextResponse.json({ url });
  } catch (error) {
    return apiFailure(error, "upstream_failed");
  }
});
