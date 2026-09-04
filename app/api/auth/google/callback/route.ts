import { type NextRequest, NextResponse } from "next/server";
import { withApiErrors } from "@/lib/api-error";
import { accountExists, hasAnyAccount, loginWithVerifiedEmail, sessionCookie } from "@/lib/auth/store";
import { decideSignup } from "@/lib/auth/signup-policy";
import { getCredential } from "@/lib/credentials";
import { GOOGLE_LOGIN_OAUTH } from "@/lib/google-login-oauth";
import { exchangeCode, nextCookie, stateCookie, verifierCookie } from "@/lib/oauth-client";
import { safeNextPath } from "@/lib/safe-redirect";

// GET /api/auth/google/callback — where Google sends the browser back.
//
// Every exit is a redirect to /login (on failure) or straight past it (on
// success), because this is a browser tab, not a fetch caller. /login turns
// `?error=` into a sentence in the visitor's language, same as the existing
// `?reset=1` flag.

const PROVIDER = "google-login";

function toLogin(request: NextRequest, error: string): NextResponse {
  const url = new URL("/login", request.nextUrl.origin);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

export const GET = withApiErrors(async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // The consent screen has a Cancel button, and pressing it is not an error
  // worth a red banner.
  const denied = params.get("error");
  if (denied) return toLogin(request, denied === "access_denied" ? "google_denied" : "google_failed");

  const code = params.get("code");
  const state = params.get("state");
  const expectedState = request.cookies.get(stateCookie(PROVIDER))?.value;
  const verifier = request.cookies.get(verifierCookie(PROVIDER))?.value;
  const next = request.cookies.get(nextCookie(PROVIDER))?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    console.error(
      "[auth/google/callback] state check failed:",
      JSON.stringify({ hasCode: Boolean(code), hasState: Boolean(state), hasExpectedState: Boolean(expectedState), stateMatches: state === expectedState }),
    );
    return toLogin(request, "google_failed");
  }

  const clientId = await getCredential("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = await getCredential("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) return toLogin(request, "google_unconfigured");

  let result: NextResponse;
  try {
    const tokens = await exchangeCode({
      definition: { oauth: GOOGLE_LOGIN_OAUTH },
      clientId,
      clientSecret,
      code,
      redirectUri: `${request.nextUrl.origin}/api/auth/google/callback`,
      codeVerifier: verifier,
    });

    // `identityPath: "email"` on GOOGLE_LOGIN_OAUTH is what puts the verified
    // address here — see resolveAccountLabel in lib/oauth-client.ts. Google
    // only reaches this endpoint after the visitor has proven that inbox is
    // theirs, so there is no password to check on our end either.
    const email = tokens.accountLabel;
    if (!email) throw new Error("Google returned no email for this account.");

    // `loginWithVerifiedEmail` creates the account when it does not exist, so
    // this button is a registration endpoint as much as a sign-in one — and it
    // would be the way around lib/auth/signup-policy.ts if it did not ask.
    // Google proves the address belongs to whoever is holding it; it says
    // nothing about whether that person may have this installation.
    const refused =
      !(await accountExists(email)) &&
      !decideSignup({ email, instanceClaimed: await hasAnyAccount() }).allowed;

    if (refused) {
      // Assigned rather than returned: the one-shot cookies below have to be
      // cleared on this exit too, and an early return walks past them.
      result = toLogin(request, "signup_closed");
    } else {
      const session = await loginWithVerifiedEmail(email);
      // Not "/chat": that path rewrites to "/", which a later rewrite rule
      // (the unconditional "/" -> "/landing" in next.config.ts) re-matches and
      // sends on to the marketing page instead — see the identical bug fixed
      // for /landing itself in the redirect-loop commit. "/dashboard" is the
      // same destination the landing page's own "already signed in" button
      // already trusts (app/landing/_components/landing-hero.tsx).
      const destination = safeNextPath(next, "/dashboard");
      result = NextResponse.redirect(new URL(destination, request.nextUrl.origin));
      result.cookies.set(sessionCookie(session.token, request.nextUrl.protocol === "https:"));
    }
  } catch (error) {
    console.error(
      "[auth/google/callback] exchange or login failed:",
      error instanceof Error ? error.message : String(error),
    );
    result = toLogin(request, "google_failed");
  }

  // The code is spent either way, so the one-shot cookies go with it.
  result.cookies.delete({ name: stateCookie(PROVIDER), path: "/api/auth" });
  result.cookies.delete({ name: verifierCookie(PROVIDER), path: "/api/auth" });
  result.cookies.delete({ name: nextCookie(PROVIDER), path: "/api/auth" });
  return result;
});
