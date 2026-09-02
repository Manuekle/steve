import { getCredential, getCredentialSync } from "./credentials";

type MediaType = "audio" | "image" | "video";

type TelegramResult = {
  ok: boolean;
  status: number;
  body: string;
};

/** Bot API method for each media kind, and the body field it reads the file
 *  from. Telegram names both after the media type rather than taking a
 *  generic "attachment", so the two travel together. */
const METHOD_BY_TYPE = {
  image: { method: "sendPhoto", field: "photo" },
  audio: { method: "sendAudio", field: "audio" },
  video: { method: "sendVideo", field: "video" },
} as const;

async function botToken(): Promise<string | undefined> {
  return (await getCredential("TELEGRAM_BOT_TOKEN")) ?? getCredentialSync("TELEGRAM_BOT_TOKEN");
}

async function botApi(
  method: string,
  body: Record<string, unknown>,
): Promise<TelegramResult> {
  const token = await botToken();
  if (!token) {
    return { ok: false, status: 0, body: "Telegram credentials are not configured." };
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  const text = await response.text();
  // The Bot API answers 200 with `{"ok":false}` for a refusal as often as it
  // answers 4xx, so the HTTP status alone would report a blocked bot as a
  // successful send.
  let apiOk = response.ok;
  try {
    apiOk = apiOk && (JSON.parse(text) as { ok?: unknown }).ok === true;
  } catch {
    apiOk = false;
  }
  return { ok: apiOk, status: response.status, body: text };
}

/**
 * Send a plain-text Telegram message.
 *
 * The recipient is a chat id, not a phone number — `Contact.externalId`, which
 * agent/hooks/persist.ts captures from the sender's auth attributes on their
 * first message. Telegram has no messaging window and no template system:
 * a bot may message any chat that has ever started it, so unlike WhatsApp
 * there is nothing to fall back to and unlike Instagram nothing expires.
 */
export async function sendTelegramText(chatId: string, text: string): Promise<TelegramResult> {
  return botApi("sendMessage", { chat_id: chatId, text });
}

/** Send media by public HTTPS URL. Telegram fetches the URL itself. */
export async function sendTelegramMedia(opts: {
  chatId: string;
  type: MediaType;
  url: string;
  caption?: string;
}): Promise<TelegramResult> {
  const { method, field } = METHOD_BY_TYPE[opts.type];
  return botApi(method, {
    chat_id: opts.chatId,
    [field]: opts.url,
    ...(opts.caption ? { caption: opts.caption } : {}),
  });
}

/**
 * Upload raw media bytes and send them, without needing a public URL — used
 * for AI-generated media (see agent/tools/generate_media.ts), which only
 * exists in memory. Telegram takes the upload and the send as one
 * multipart request, so there is no two-step attachment id to carry.
 */
export async function sendTelegramMediaBytes(opts: {
  chatId: string;
  type: MediaType;
  data: Uint8Array;
  mimeType: string;
  filename: string;
  caption?: string;
}): Promise<TelegramResult> {
  const token = await botToken();
  if (!token) {
    return { ok: false, status: 0, body: "Telegram credentials are not configured." };
  }

  const { method, field } = METHOD_BY_TYPE[opts.type];
  const form = new FormData();
  form.append("chat_id", opts.chatId);
  if (opts.caption) form.append("caption", opts.caption);
  form.append(field, new Blob([new Uint8Array(opts.data)], { type: opts.mimeType }), opts.filename);

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });
  const text = await response.text();
  let apiOk = response.ok;
  try {
    apiOk = apiOk && (JSON.parse(text) as { ok?: unknown }).ok === true;
  } catch {
    apiOk = false;
  }
  return { ok: apiOk, status: response.status, body: text };
}

/**
 * Download one inbound file by its Telegram file id.
 *
 * Two calls: `getFile` trades the id for a short-lived path, then the file
 * itself comes from Telegram's separate file host. Used by the voice-note
 * transcription in agent/channels/telegram.ts, which is the only inbound
 * media eve's own Telegram parser does not carry.
 */
export async function fetchTelegramFile(fileId: string): Promise<Buffer> {
  const token = await botToken();
  if (!token) throw new Error("Telegram credentials are not configured.");

  const lookup = await fetch(`https://api.telegram.org/bot${token}/getFile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  const payload = (await lookup.json()) as { ok?: boolean; result?: { file_path?: string } };
  const filePath = payload.result?.file_path;
  if (!payload.ok || !filePath) {
    throw new Error(`Telegram getFile failed for ${fileId}.`);
  }

  const download = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`, {
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });
  if (!download.ok) {
    throw new Error(`Telegram file download failed with ${download.status}.`);
  }
  return Buffer.from(await download.arrayBuffer());
}
