import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/store";

/**
 * The gate.
 *
 * What it adds, precisely: the Next.js surface — the inbox, the contacts, the
 * model keys on Settings — had nothing in front of it. The Basic auth the
 * README describes guards the Eve channel, and `localDev()` waives it on
 * loopback; a reverse proxy can add another layer in front of everything. This
 * is the app's own lock, and the README already says Basic auth "is
 * appropriate for a controlled reference deployment, not identity".
 *
 * It runs on the Node runtime, not the edge one, because the real session
 * lookup happens here rather than in each page. The alternative — middleware
 * that only checks whether *some* cookie is present, with the real check in a
 * layout — leaves every API route ungated unless each one remembers to ask,
 * and "unless each one remembers" is how this kind of thing fails.
 *
 * Public by design, and each for a different reason:
 *
 *   The marketing pages, because they are the pitch. Someone who has not
 *   installed this yet has no account to log in with.
 *
 *   `/api/leads` and an automation's `/webhook`, because they are called by
 *   Meta and by whatever the operator wired up, not by a browser. A session
 *   cookie is not something a webhook can produce, so a shared secret stands
 *   in for one — and both routes require it rather than treating an absent
 *   secret as permission (see `verifySecret` in the leads route).
 *
 *   `/api/health`, because a monitor that has to log in is not a monitor.
 *
 *   `/f/<slug>` and `/api/f/<slug>`, because a form nobody can open collects
 *   nothing. Only published forms answer there, the route never returns the
 *   scoring, and it is rate-limited — see app/api/f/[slug]/route.ts.
 *
 *   `/api/demo-request`, the Enterprise "contact sales" form on /pricing — a
 *   prospect evaluating steve has no account yet either. Same rate-limit
 *   shape as `/api/f/<slug>`; see app/api/demo-request/route.ts.
 *
 *   `/api/billing/webhook`, because Stripe calls it directly and carries no
 *   session cookie to send. Its own HMAC signature check over the raw body
 *   stands in for auth — see lib/stripe.ts's verifyStripeWebhookSignature.
 *
 *   `/api/webhooks/elevenlabs`, same reasoning — ElevenLabs' post-call
 *   webhook calls it directly, verified by
 *   verifyElevenLabsWebhookSignature in lib/elevenlabs-agents.ts.
 *
 *   `/api/webhooks/stripe` and `/api/webhooks/mercadopago`, same reasoning
 *   again: the operator's own payment processor reporting that a link the
 *   agent sent was paid. Each verifies an HMAC over the raw body with the
 *   secret from Settings, and Mercado Pago additionally reads the payment
 *   back through its API before believing it.
 *
 *   `/eve`, because those are Eve's own routes and Eve does its own auth.
 *   Meta posts to `/eve/v1/whatsapp` and `/eve/v1/instagram` with no
 *   session cookie; each channel verifies an HMAC over the raw body with its
 *   App Secret before parsing anything. The browser
 *   chat protocol on `/eve/v1` carries the Basic auth in agent/channels/eve.ts,
 *   waived only on loopback. This also matches production, which runs with
 *   EVE_SELF_HOSTED=1: there Next never serves `/eve` at all and Caddy routes
 *   it straight to the Eve process, so gating it here only broke `next dev` —
 *   Meta's webhook verification got a 307 to /login.
 *
 * Everything else — the inbox, the contacts, the model keys on Settings, and
 * every route under `/api` not named above — needs a session.
 */
export const config = {
  runtime: "nodejs",
  // Static assets and Next's own internals never reach this.
  matcher: ["/((?!_next/static|_next/image|fonts|patterns|logos).*)"],
};

/** Prefix matches, so `/landing` covers nothing else and `/terms` covers its
 *  own subtree if it ever gets one. `/` is landing (rewritten from `/landing`). */
const PUBLIC_PATHS = [
  "/",
  "/landing",
  "/pricing",
  "/guide",
  "/terms",
  "/privacy",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/api/auth",
  "/api/health",
  "/api/leads",
  "/api/demo-request",
  "/f",
  "/api/f",
  "/api/billing/webhook",
  "/api/webhooks/elevenlabs",
  "/api/webhooks/stripe",
  "/api/webhooks/mercadopago",
  "/eve",
  // Files Next serves from the app directory rather than from `public/`.
  "/icon.svg",
  "/apple-icon",
  "/opengraph-image",
  "/robots.txt",
  "/sitemap.xml",
  "/favicon.ico",
];

/** `/api/automations/<id>/webhook` — the id is arbitrary, so it is matched by
 *  shape rather than listed. Only the webhook leaf is public; every other
 *  route under an automation is the operator's own screen. */
const WEBHOOK = /^\/api\/automations\/[^/]+\/webhook\/?$/;

function isPublic(pathname: string): boolean {
  if (WEBHOOK.test(pathname)) return true;
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  if (await verifySession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  // An API call gets a status it can act on. Bouncing `fetch` to an HTML login
  // page produces a parse error three layers away from the actual problem.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  // Where they were headed, so the login sends them back rather than dumping
  // everyone on the dashboard.
  if (pathname !== "/") login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}
