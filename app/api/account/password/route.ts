import { type NextRequest, NextResponse } from "next/server";
import { apiError, withApiErrors } from "@/lib/api-error";
import { changePassword, getSessionAccountEmail, SESSION_COOKIE } from "@/lib/auth/store";

// POST /api/account/password — change the signed-in account's own password.
//
// Different from /api/auth/reset-password: that one runs with no session at
// all, off an emailed token, and drops every open session. This one keeps
// the request's own session alive — see changePassword's comment.

export const POST = withApiErrors(async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const email = await getSessionAccountEmail(token);
  if (!email || !token) return apiError("unauthorized");

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json");
  }

  if (!body.currentPassword) return apiError("missing_field", { field: "currentPassword" });
  if (!body.newPassword) return apiError("missing_field", { field: "newPassword" });

  const result = await changePassword(email, body.currentPassword, body.newPassword, token);
  if (!result.ok) {
    if (result.reason === "wrong_password") return apiError("wrong_password", { field: "currentPassword" });
    return apiError("invalid_field", {
      field: "newPassword",
      message: "The new password needs to be at least 10 characters.",
    });
  }

  return NextResponse.json({ ok: true });
});
