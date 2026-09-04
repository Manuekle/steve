import { type NextRequest, NextResponse } from "next/server";
import { withApiErrors } from "@/lib/api-error";
import { loginWithVerifiedEmail, sessionCookie } from "@/lib/auth/store";
import { getCredential } from "@/lib/credentials";
import { GOOGLE_LOGIN_OAUTH } from "@/lib/google-login-oauth";
import { exchangeCode, nextCookie, stateCookie, verifierCookie } from "@/lib/oauth-client";

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

    const session = await loginWithVerifiedEmail(email);
    const destination = next?.startsWith("/") ? next : "/chat";
    result = NextResponse.redirect(new URL(destination, request.nextUrl.origin));
    result.cookies.set(sessionCookie(session.token, request.nextUrl.protocol === "https:"));
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
