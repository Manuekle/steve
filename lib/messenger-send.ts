import { getCredential, getCredentialSync } from "./credentials";

type MediaType = "audio" | "image" | "video";

type GraphResult = {
  ok: boolean;
  status: number;
  body: string;
};

async function graphSend(recipientId: string, message: Record<string, unknown>): Promise<GraphResult> {
  const pageToken =
    (await getCredential("FACEBOOK_PAGE_ACCESS_TOKEN")) ??
    getCredentialSync("FACEBOOK_PAGE_ACCESS_TOKEN");
  if (!pageToken) {
    return { ok: false, status: 0, body: "Messenger credentials are not configured." };
  }

  const url = new URL("https://graph.facebook.com/v21.0/me/messages");
  url.searchParams.set("access_token", pageToken);

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message,
      messaging_type: "RESPONSE",
    }),
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  const body = await response.text();
  return { ok: response.ok, status: response.status, body };
}

/** Send a Messenger media attachment by public HTTPS URL. */
export async function sendMessengerMedia(opts: {
  recipientId: string;
  type: MediaType;
  url: string;
}): Promise<GraphResult> {
  return graphSend(opts.recipientId, {
    attachment: { type: opts.type, payload: { url: opts.url } },
  });
}

/**
 * Upload raw media bytes via the Messenger Attachment Upload API and send
 * them, without needing a public URL — used for AI-generated media (see
 * agent/tools/generate_media.ts), which only exists in memory.
 * https://developers.facebook.com/docs/messenger-platform/send-messages/saving-assets
 */
export async function sendMessengerMediaBytes(opts: {
  recipientId: string;
  type: MediaType;
  data: Uint8Array;
  mimeType: string;
  filename: string;
}): Promise<GraphResult> {
  const pageToken =
    (await getCredential("FACEBOOK_PAGE_ACCESS_TOKEN")) ??
    getCredentialSync("FACEBOOK_PAGE_ACCESS_TOKEN");
  if (!pageToken) {
    return { ok: false, status: 0, body: "Messenger credentials are not configured." };
  }

  const form = new FormData();
  form.append("message", JSON.stringify({ attachment: { type: opts.type, payload: { is_reusable: true } } }));
  form.append("filedata", new Blob([new Uint8Array(opts.data)], { type: opts.mimeType }), opts.filename);

  const uploadUrl = new URL("https://graph.facebook.com/v21.0/me/message_attachments");
  uploadUrl.searchParams.set("access_token", pageToken);
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });
  const uploadBody = await uploadResponse.text();
  if (!uploadResponse.ok) {
    return { ok: false, status: uploadResponse.status, body: uploadBody };
  }
  let attachmentId: string | undefined;
  try {
    attachmentId = (JSON.parse(uploadBody) as { attachment_id?: string }).attachment_id;
  } catch {
    // fall through to the error below
  }
  if (!attachmentId) {
    return { ok: false, status: uploadResponse.status, body: `Upload succeeded but returned no attachment id: ${uploadBody}` };
  }

  return graphSend(opts.recipientId, {
    attachment: { type: opts.type, payload: { attachment_id: attachmentId } },
  });
}
