import { getCredential, getCredentialSync } from "./credentials";

type MediaType = "audio" | "image" | "video";

type GraphResult = {
  ok: boolean;
  status: number;
  body: string;
};

async function graphSend(payload: Record<string, unknown>): Promise<GraphResult> {
  const token =
    (await getCredential("WHATSAPP_ACCESS_TOKEN")) ?? getCredentialSync("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId =
    (await getCredential("WHATSAPP_PHONE_NUMBER_ID")) ??
    getCredentialSync("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) {
    return { ok: false, status: 0, body: "WhatsApp credentials are not configured." };
  }

  const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  const body = await response.text();
  return { ok: response.ok, status: response.status, body };
}

function digits(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

/** Check if a timestamp is within the WhatsApp 24h free-form messaging window. */
export function isWithin24hWindow(lastMessageAt: string | undefined): boolean {
  if (!lastMessageAt) return false;
  const last = new Date(lastMessageAt).getTime();
  if (!Number.isFinite(last)) return false;
  return Date.now() - last < 24 * 60 * 60 * 1000;
}

export async function sendWhatsAppText(to: string, text: string): Promise<GraphResult> {
  return graphSend({
    to: digits(to),
    type: "text",
    text: { body: text },
  });
}

/**
 * Send a WhatsApp HSM template message. Required when outside the 24h
 * free-form window. Templates must be pre-approved in Meta Business Suite.
 *
 * @param to - Phone number
 * @param templateName - Template name (from Meta Business Suite)
 * @param lang - Language code (default: "es" for Spanish)
 * @param params - Optional template parameters (variables)
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  lang = "es",
  params?: string[],
): Promise<GraphResult> {
  const components: Record<string, unknown>[] = [];
  if (params && params.length > 0) {
    components.push({
      type: "body",
      parameters: params.map((p) => ({ type: "text", text: p })),
    });
  }
  return graphSend({
    to: digits(to),
    type: "template",
    template: {
      name: templateName,
      language: { code: lang },
      ...(components.length > 0 ? { components } : {}),
    },
  });
}

export async function sendWhatsAppMedia(opts: {
  to: string;
  type: MediaType;
  url: string;
  caption?: string;
}): Promise<GraphResult> {
  const media: Record<string, string> = { link: opts.url };
  if (opts.caption && opts.type !== "audio") media.caption = opts.caption;
  return graphSend({
    to: digits(opts.to),
    type: opts.type,
    [opts.type]: media,
  });
}

/**
 * Upload raw media bytes to the WhatsApp Cloud API and send them, without
 * needing a public URL — used for AI-generated media (see agent/tools/
 * generate_media.ts), which only exists in memory.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media#upload-media
 */
export async function sendWhatsAppMediaBytes(opts: {
  to: string;
  type: MediaType;
  data: Uint8Array;
  mimeType: string;
  filename: string;
  caption?: string;
}): Promise<GraphResult> {
  const token =
    (await getCredential("WHATSAPP_ACCESS_TOKEN")) ?? getCredentialSync("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId =
    (await getCredential("WHATSAPP_PHONE_NUMBER_ID")) ??
    getCredentialSync("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) {
    return { ok: false, status: 0, body: "WhatsApp credentials are not configured." };
  }

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([new Uint8Array(opts.data)], { type: opts.mimeType }), opts.filename);

  const uploadResponse = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/media`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });
  const uploadBody = await uploadResponse.text();
  if (!uploadResponse.ok) {
    return { ok: false, status: uploadResponse.status, body: uploadBody };
  }
  let mediaId: string | undefined;
  try {
    mediaId = (JSON.parse(uploadBody) as { id?: string }).id;
  } catch {
    // fall through to the error below
  }
  if (!mediaId) {
    return { ok: false, status: uploadResponse.status, body: `Upload succeeded but returned no media id: ${uploadBody}` };
  }

  const media: Record<string, string> = { id: mediaId };
  if (opts.caption && opts.type !== "audio") media.caption = opts.caption;
  return graphSend({
    to: digits(opts.to),
    type: opts.type,
    [opts.type]: media,
  });
}
