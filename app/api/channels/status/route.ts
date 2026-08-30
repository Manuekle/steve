import { getMaskedCredentials } from "@/lib/credentials";
import { NextResponse } from "next/server";
import { withApiErrors } from "@/lib/api-error";

// GET /api/channels/status
// Reports whether each channel's credentials are fully configured.
// The dashboard uses this to show real connected/disconnected state
// instead of hardcoding everything as "connected".

type ChannelStatus = {
  id: "web" | "whatsapp" | "messenger" | "instagram";
  label: string;
  connected: boolean;
  missing: string[];
};

const WHATSAPP_KEYS = [
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_VERIFY_TOKEN",
] as const;

const MESSENGER_KEYS = [
  "FACEBOOK_APP_SECRET",
  "FACEBOOK_PAGE_ACCESS_TOKEN",
  "FACEBOOK_VERIFY_TOKEN",
] as const;

const INSTAGRAM_KEYS = [
  "INSTAGRAM_APP_SECRET",
  "INSTAGRAM_ACCESS_TOKEN",
  "INSTAGRAM_ACCOUNT_ID",
  "INSTAGRAM_VERIFY_TOKEN",
] as const;

export const GET = withApiErrors(async function GET() {
  const masked = await getMaskedCredentials();

  const whatsappMissing = WHATSAPP_KEYS.filter((k) => !masked[k]);
  const messengerMissing = MESSENGER_KEYS.filter((k) => !masked[k]);
  const instagramMissing = INSTAGRAM_KEYS.filter((k) => !masked[k]);

  const channels: ChannelStatus[] = [
    {
      id: "web",
      label: "Web Chat",
      connected: true,
      missing: [],
    },
    {
      id: "whatsapp",
      label: "WhatsApp",
      connected: whatsappMissing.length === 0,
      missing: whatsappMissing,
    },
    {
      id: "messenger",
      label: "Messenger",
      connected: messengerMissing.length === 0,
      missing: messengerMissing,
    },
    {
      id: "instagram",
      label: "Instagram",
      connected: instagramMissing.length === 0,
      missing: instagramMissing,
    },
  ];

  // Return a simple map for the dashboard to consume.
  const statusMap: Record<string, boolean> = {};
  for (const ch of channels) {
    statusMap[ch.id] = ch.connected;
  }

  return NextResponse.json({ channels, status: statusMap });
});
