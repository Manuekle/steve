import { type NextRequest, NextResponse } from "next/server";
import { apiError, missingField, withApiErrors } from "@/lib/api-error";
import { getCredential, saveCredentials } from "@/lib/credentials";
import { MetaApiError } from "@/lib/meta-ads";
import {
  META_GRAPH_VERSION,
  exchangeEmbeddedSignupCode,
  getWabaPhoneNumber,
  listWabaPhoneNumbers,
  subscribeAppToWaba,
} from "@/lib/meta-whatsapp";
import { createNumber, updateNumber } from "@/lib/number-store";
import { toE164 } from "@/lib/phone-format";

// WhatsApp Embedded Signup (one-click Meta connect).
//
// GET answers what the browser needs to open Meta's popup: the App ID and the
// WhatsApp Configuration ID. The App Secret never crosses this line — it stays
// server-side for the POST below.
//
// POST trades the popup's `code` for a business access token, verifies the
// WABA and the number against the Graph API, subscribes this app to the WABA
// (so webhooks start flowing), stores the credentials, and files the number
// in the directory as a `meta` line. The popup is the only place the operator
// types anything Meta-owned; nothing is pasted into Settings.

export const GET = withApiErrors(async function GET() {
  const appId = (await getCredential("META_APP_ID"))?.trim();
  const configId = (await getCredential("META_WA_CONFIG_ID"))?.trim();
  const verifyTokenConfigured = Boolean((await getCredential("WHATSAPP_VERIFY_TOKEN"))?.trim());
  return NextResponse.json({
    configured: Boolean(appId && configId),
    ...(appId ? { appId } : {}),
    ...(configId ? { configId } : {}),
    version: META_GRAPH_VERSION,
    verifyTokenConfigured,
  });
});

type EmbeddedBody = {
  code?: unknown;
  wabaId?: unknown;
  phoneNumberId?: unknown;
  label?: unknown;
};

export const POST = withApiErrors(async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json");
  }
  const input = (body ?? {}) as EmbeddedBody;
  if (typeof input.code !== "string" || !input.code.trim()) return missingField("code");
  if (typeof input.wabaId !== "string" || !input.wabaId.trim()) return missingField("wabaId");

  const appId = (await getCredential("META_APP_ID"))?.trim();
  // WHATSAPP_APP_SECRET is the Meta App Secret: the same value the manual
  // setup pastes from App Settings > Basic. META_APP_SECRET (Meta Ads) stays
  // as fallback for installs that Registered one app for everything.
  const appSecret =
    (await getCredential("WHATSAPP_APP_SECRET"))?.trim() ||
    (await getCredential("META_APP_SECRET"))?.trim();
  if (!appId || !appSecret) return apiError("not_configured");

  let accessToken: string;
  try {
    ({ accessToken } = await exchangeEmbeddedSignupCode({
      appId,
      appSecret,
      code: input.code,
    }));
  } catch (error) {
    if (error instanceof MetaApiError) {
      return apiError("upstream_failed", { message: error.message });
    }
    throw error;
  }

  const wabaId = input.wabaId.trim();
  const numbers = await listWabaPhoneNumbers({ accessToken, wabaId });
  if (numbers.length === 0) return apiError("not_found", { message: "No phone numbers on this WhatsApp Business Account." });
  const wanted = typeof input.phoneNumberId === "string" ? input.phoneNumberId.trim() : "";
  const target = wanted ? numbers.find((entry) => entry.id === wanted) : numbers[0];
  if (!target) return apiError("not_found", { message: "That phone number is not on this WhatsApp Business Account." });

  // Proves the new token can actually see the number before anything is stored.
  const verified = await getWabaPhoneNumber({ accessToken, phoneNumberId: target.id });

  await subscribeAppToWaba({ accessToken, wabaId });

  await saveCredentials({
    WHATSAPP_ACCESS_TOKEN: accessToken,
    WHATSAPP_PHONE_NUMBER_ID: verified.id,
    WHATSAPP_WABA_ID: wabaId,
  });

  // File the line in the directory so agents can be bound to it. A pasted
  // display number that does not parse to E.164 still leaves working
  // credentials behind — the number entry is a courtesy, never the guarantee.
  const e164 = toE164(verified.displayPhoneNumber);
  let number: unknown = null;
  if (e164) {
    const label =
      (typeof input.label === "string" && input.label.trim()) ||
      verified.verifiedName ||
      verified.displayPhoneNumber;
    const created = await createNumber({
      e164,
      label,
      capabilities: ["whatsapp"],
      provider: "meta",
      providerNumberId: verified.id,
    });
    if (created.ok) {
      number = created.number;
    } else if (created.reason === "duplicate") {
      const updated = await updateNumber(created.holder.id, {
        provider: "meta",
        providerNumberId: verified.id,
      });
      number = updated.ok ? updated.number : created.holder;
    }
  }

  return NextResponse.json({
    ok: true,
    wabaId,
    phoneNumberId: verified.id,
    displayPhoneNumber: verified.displayPhoneNumber,
    ...(e164 ? { e164 } : {}),
    ...(number ? { number } : {}),
  });
});
