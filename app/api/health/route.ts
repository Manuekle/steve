import { NextResponse } from "next/server";
import { getMaskedCredentials } from "@/lib/credentials";
import { resolveProvider } from "@/lib/ai-provider";
import { listAutomations } from "@/lib/business-store";
import { withApiErrors } from "@/lib/api-error";
import { PROVIDER_CREDENTIAL_KEY, type AiProvider } from "@/lib/model-catalog";

// GET /api/health — what the sidebar's status dot reads.
//
// Deliberately cheap: it answers "is this instance able to do its job right
// now", not "is every integration perfect". The dot is glanceable, so it has
// only three states and each one has to mean something a person can act on.

export type HealthStatus = "ok" | "degraded" | "down";

const CHANNEL_KEYS = {
  whatsapp: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN"],
  messenger: ["FACEBOOK_APP_SECRET", "FACEBOOK_PAGE_ACCESS_TOKEN", "FACEBOOK_VERIFY_TOKEN"],
  instagram: ["INSTAGRAM_APP_SECRET", "INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_ACCOUNT_ID", "INSTAGRAM_VERIFY_TOKEN"],
} as const;

export const GET = withApiErrors(async function GET() {
  // The store is the only hard dependency: with it unreadable nothing on any
  // page can load, which is the one condition worth painting red.
  let storeOk = true;
  try {
    await listAutomations();
  } catch {
    storeOk = false;
  }

  let aiOk = false;
  let provider: AiProvider = "gateway";
  let channelsConnected = 0;
  try {
    const masked = await getMaskedCredentials();
    // Which key counts depends on the selected provider: an Anthropic setup
    // with no Gateway key is fully configured, not degraded.
    provider = resolveProvider();
    const providerKey = PROVIDER_CREDENTIAL_KEY[provider];
    aiOk = Boolean(masked[providerKey] || process.env[providerKey]);
    channelsConnected = Object.values(CHANNEL_KEYS).filter((keys) =>
      keys.every((key) => masked[key]),
    ).length;
  } catch {
    // Credentials unreadable is a degraded state, not a dead one — the web
    // chat still works off whatever is in the environment.
  }

  // Without a model key the agent cannot answer anyone: the app is up but it
  // isn't doing its job, which is exactly what amber is for.
  const status: HealthStatus = !storeOk ? "down" : aiOk ? "ok" : "degraded";

  return NextResponse.json({
    status,
    checks: {
      store: storeOk,
      ai: aiOk,
      provider,
      channels: { connected: channelsConnected, total: Object.keys(CHANNEL_KEYS).length },
    },
    mode: "self-hosted",
    environment: process.env.NODE_ENV === "production" ? "production" : "sandbox",
    node: process.version,
    uptimeSeconds: Math.round(process.uptime()),
  });
});
