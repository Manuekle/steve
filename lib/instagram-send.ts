import { getCredential, getCredentialSync } from "./credentials";

type MediaType = "audio" | "image" | "video";

type GraphResult = {
  ok: boolean;
  status: number;
  body: string;
};

async function graphSend(recipientId: string, message: Record<string, unknown>): Promise<GraphResult> {
  const accessToken =
    (await getCredential("INSTAGRAM_ACCESS_TOKEN")) ?? getCredentialSync("INSTAGRAM_ACCESS_TOKEN");
  const accountId =
    (await getCredential("INSTAGRAM_ACCOUNT_ID")) ?? getCredentialSync("INSTAGRAM_ACCOUNT_ID");
  if (!accessToken || !accountId) {
    return { ok: false, status: 0, body: "Instagram credentials are not configured." };
  }

  const response = await fetch(`https://graph.instagram.com/v21.0/${accountId}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message,
    }),
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  const body = await response.text();
  return { ok: response.ok, status: response.status, body };
}

/** Send an Instagram DM media attachment by public HTTPS URL. */
export async function sendInstagramMedia(opts: {
  recipientId: string;
  type: MediaType;
  url: string;
}): Promise<GraphResult> {
  return graphSend(opts.recipientId, {
    attachment: { type: opts.type, payload: { url: opts.url } },
  });
}

/**
 * Upload raw media bytes via the Instagram Attachment Upload API and send
 * them, without needing a public URL — used for AI-generated media (see
 * agent/tools/generate_media.ts), which only exists in memory.
 */
export async function sendInstagramMediaBytes(opts: {
  recipientId: string;
  type: MediaType;
  data: Uint8Array;
  mimeType: string;
  filename: string;
}): Promise<GraphResult> {
  const accessToken =
    (await getCredential("INSTAGRAM_ACCESS_TOKEN")) ?? getCredentialSync("INSTAGRAM_ACCESS_TOKEN");
  const accountId =
    (await getCredential("INSTAGRAM_ACCOUNT_ID")) ?? getCredentialSync("INSTAGRAM_ACCOUNT_ID");
  if (!accessToken || !accountId) {
    return { ok: false, status: 0, body: "Instagram credentials are not configured." };
  }

  const form = new FormData();
  form.append("message", JSON.stringify({ attachment: { type: opts.type, payload: { is_reusable: true } } }));
  form.append("filedata", new Blob([new Uint8Array(opts.data)], { type: opts.mimeType }), opts.filename);

  const uploadResponse = await fetch(`https://graph.instagram.com/v21.0/${accountId}/message_attachments`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
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

/**
 * Send a plain-text Instagram DM.
 *
 * The recipient is an IGSID, not a phone number — `Contact.externalId`, which
 * agent/hooks/persist.ts captures from the sender's auth context on their
 * first message. Unlike WhatsApp there is no template fallback: outside the
 * messaging window Meta refuses the call, and the refusal is what callers
 * report rather than a success nobody received.
 */
export async function sendInstagramText(recipientId: string, text: string): Promise<GraphResult> {
  return graphSend(recipientId, { text });
}
