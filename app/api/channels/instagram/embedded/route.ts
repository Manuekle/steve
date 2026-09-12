import { NextResponse } from "next/server";
import { apiError, withApiErrors } from "@/lib/api-error";
import { getCredential, saveCredentials } from "@/lib/credentials";
import {
  IG_LOGIN_SCOPES,
  igEmbeddedCallbackUrl,
  refreshLongLivedToken,
} from "@/lib/meta-instagram";
import { MetaApiError } from "@/lib/meta-ads";

// Instagram Business Login (one-click connect).
//
// GET answers what the browser needs to open Meta's authorization window:
// the Instagram App ID, the registered redirect URI, and the scopes. The
// Instagram App Secret never crosses this line — the code exchange happens
// in the callback route, server-side.
//
// POST { action: "refresh" } rolls the stored long-lived token (60-day
// expiry) for another 60 days. Reconnecting through the popup does the same
// thing, but a quiet refresh keeps the channel alive without another login.

export const GET = withApiErrors(async function GET() {
  const igAppId = (await getCredential("INSTAGRAM_APP_ID"))?.trim();
  const igSecret = (await getCredential("INSTAGRAM_LOGIN_SECRET"))?.trim();
  const connected = Boolean(
    (await getCredential("INSTAGRAM_ACCESS_TOKEN"))?.trim() &&
      (await getCredential("INSTAGRAM_ACCOUNT_ID"))?.trim(),
  );
  const verifyTokenConfigured = Boolean((await getCredential("INSTAGRAM_VERIFY_TOKEN"))?.trim());
  return NextResponse.json({
    configured: Boolean(igAppId && igSecret),
    ...(igAppId ? { igAppId } : {}),
    redirectUri: igEmbeddedCallbackUrl(),
    scopes: [...IG_LOGIN_SCOPES],
    connected,
    verifyTokenConfigured,
  });
});

export const POST = withApiErrors(async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json");
  }
  if ((body as { action?: unknown } | null)?.action !== "refresh") {
    return apiError("invalid_body");
  }
  const current = (await getCredential("INSTAGRAM_ACCESS_TOKEN"))?.trim();
  if (!current) return apiError("not_configured");
  try {
    const refreshed = await refreshLongLivedToken({ longToken: current });
    await saveCredentials({ INSTAGRAM_ACCESS_TOKEN: refreshed.accessToken });
    return NextResponse.json({
      ok: true,
      ...(typeof refreshed.expiresIn === "number" ? { expiresIn: refreshed.expiresIn } : {}),
    });
  } catch (error) {
    if (error instanceof MetaApiError) {
      return apiError("upstream_failed", { message: error.message });
    }
    throw error;
  }
});
