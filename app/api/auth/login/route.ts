import { NextResponse, type NextRequest } from "next/server";
import { login, sessionCookie } from "@/lib/auth/store";

/**
 * One deliberate omission: no rate limit here.
 *
 * This is a small self-hosted install — a handful of accounts, not a public
 * SaaS — and scrypt already costs ~100ms a try, which is the throttle. A real
 * limiter needs shared state this app does not have — the store is a file,
 * and a per-process counter is not a limit once anything runs more than one
 * process. Naming the gap beats a token gesture that reads as one.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;

  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const result = await login(body.email, body.password);
  if (!result.ok) {
    // One message for both halves. "That email does not exist" is a way of
    // asking the server to confirm addresses.
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie(result.token, request.nextUrl.protocol === "https:"));
  return response;
}
