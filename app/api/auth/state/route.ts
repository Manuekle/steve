import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasAnyAccount, verifySession } from "@/lib/auth/store";
import { signupMode, signupNeedsInvite } from "@/lib/auth/signup-policy";

/**
 * What a public page needs to decide what to offer: has anyone claimed this
 * instance yet, and is whoever is asking already signed in.
 *
 * It used to return the owner's email so the login could prefill it. That was
 * a convenience paid for by handing an address to anyone who asked — on the
 * same install whose login route deliberately answers "wrong email or
 * password" to both halves precisely so it never confirms an address. The
 * prefill is gone; the two now agree.
 */
export async function GET(request: NextRequest) {
  const claimed = await hasAnyAccount();
  return NextResponse.json({
    claimed,
    signedIn: await verifySession(request.cookies.get(SESSION_COOKIE)?.value),
    // What the signup form should offer. Neither field is a permission — the
    // register route runs `decideSignup` itself and refuses regardless of what
    // the client did with these.
    signupMode: signupMode(),
    signupNeedsInvite: signupNeedsInvite(claimed),
  });
}
