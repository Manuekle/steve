import { NextResponse } from "next/server";
import { getCredential } from "@/lib/credentials";
import { apiError, withApiErrors } from "@/lib/api-error";
import { SITE_URL, SITE_URL_IS_CONFIGURED } from "@/lib/site";

// GET/POST /api/channels/telegram/webhook
//
// Telegram is the one channel whose webhook cannot be pasted into a vendor
// dashboard: the bot's callback URL is set by calling `setWebhook` on the Bot
// API with the token. Left to the operator that is a curl command copied out
// of a source comment, and getting it wrong is silent — the bot simply never
// receives anything.
//
// GET reports what Telegram currently has registered (including the last
// delivery error it saw, which is the only way to find out that the URL is
// wrong from this side). POST registers this installation's own webhook URL.
// Both are session-gated by middleware.ts like every other /api route.

/** Where eve mounts the Telegram channel. Must match agent/channels/telegram.ts. */
const WEBHOOK_PATH = "/eve/v1/telegram";

/** Everything this channel acts on. Anything else is delivery Telegram would
 *  bill us the round trip for and eve would discard. */
const ALLOWED_UPDATES = ["message", "callback_query"] as const;

async function callBotApi(
  token: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; description?: string; result?: unknown }> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  return (await response.json()) as { ok: boolean; description?: string; result?: unknown };
}

export const GET = withApiErrors(async function GET() {
  const token = await getCredential("TELEGRAM_BOT_TOKEN");
  if (!token) return apiError("not_configured", { message: "TELEGRAM_BOT_TOKEN is not set." });

  const info = await callBotApi(token, "getWebhookInfo");
  if (!info.ok) {
    return apiError("upstream_failed", { detail: info.description ?? "getWebhookInfo failed." });
  }

  const result = (info.result ?? {}) as {
    url?: string;
    pending_update_count?: number;
    last_error_message?: string;
  };
  return NextResponse.json({
    expectedUrl: `${SITE_URL}${WEBHOOK_PATH}`,
    registeredUrl: result.url || null,
    // Registered *and* pointing here — a bot re-pointed at a colleague's
    // tunnel reads as "configured" everywhere else in the UI.
    matches: result.url === `${SITE_URL}${WEBHOOK_PATH}`,
    pendingUpdates: result.pending_update_count ?? 0,
    lastError: result.last_error_message || null,
  });
});

export const POST = withApiErrors(async function POST() {
  const token = await getCredential("TELEGRAM_BOT_TOKEN");
  const secret = await getCredential("TELEGRAM_WEBHOOK_SECRET_TOKEN");
  if (!token || !secret) {
    return apiError("not_configured", {
      message: "TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET_TOKEN are both required.",
    });
  }
  // Telegram refuses a non-public URL outright, and its refusal names neither
  // the setting nor the fix.
  if (!SITE_URL_IS_CONFIGURED || SITE_URL.startsWith("http://")) {
    return apiError("not_configured", {
      message: "Set NEXT_PUBLIC_SITE_URL to this installation's public HTTPS origin first.",
    });
  }

  const url = `${SITE_URL}${WEBHOOK_PATH}`;
  const result = await callBotApi(token, "setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ALLOWED_UPDATES,
  });
  if (!result.ok) {
    return apiError("upstream_failed", { detail: result.description ?? "setWebhook failed." });
  }

  return NextResponse.json({ registered: true, url });
});
