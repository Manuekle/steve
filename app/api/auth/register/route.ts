import { NextResponse, type NextRequest } from "next/server";
import { createAccount, sessionCookie } from "@/lib/auth/store";

/**
 * Open self-signup. Anyone who can reach this instance can create an account
 * on it — several people share the one inbox/business here, so the route has
 * to stay public rather than gated behind an existing session.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;

  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const result = await createAccount(body.email, body.password);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason === "email_exists" ? "email_exists" : "invalid" },
      { status: result.reason === "email_exists" ? 409 : 400 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie(result.token, request.nextUrl.protocol === "https:"));
  return response;
}
