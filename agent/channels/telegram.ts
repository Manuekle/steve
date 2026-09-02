import { timingSafeEqual } from "node:crypto";
import { telegramChannel } from "eve/channels/telegram";
import { defineChannel } from "eve/channels";
import { getCredentialSync } from "../../lib/credentials";
import { transcribeVoiceNote } from "../../lib/telegram-media";

// Telegram bot channel.
//
// A first-class eve channel (not the chat-sdk bridge whatsapp.ts and
// instagram.ts use) — it mounts its own webhook at POST /eve/v1/telegram and
// handles auth, dispatch, and HITL internally. See
// node_modules/eve/docs/channels/telegram.mdx.
//
// Registering the webhook with Telegram is a one-time step eve does not do
// itself — there is no dashboard for it, only a `setWebhook` call on the Bot
// API. The Telegram card in /settings makes that call (and reports what
// Telegram currently has registered); see
// app/api/channels/telegram/webhook/route.ts.
//
// Photos and documents arrive on their own (eve fetches them under its
// default upload policy). Voice notes do not — eve's update parser has no
// attachment kind for them — so the webhook verifier transcribes those first;
// see lib/telegram-media.ts.
//
// When credentials are missing the channel degrades to a no-op (no routes),
// so the app starts fine without Telegram configured. Configure them in
// /settings and restart.

const botToken = getCredentialSync("TELEGRAM_BOT_TOKEN");
const webhookSecretToken = getCredentialSync("TELEGRAM_WEBHOOK_SECRET_TOKEN");
const botUsername = getCredentialSync("TELEGRAM_BOT_USERNAME");

/** Constant-time compare, on the same terms eve's own header check uses. */
function secretMatches(expected: string, received: string): boolean {
  if (expected.length !== received.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  } catch {
    return false;
  }
}

const channel =
  botToken && webhookSecretToken
    ? (() => {
        const secret = webhookSecretToken;

        /**
         * Verify the inbound webhook, and transcribe a voice note on the way
         * through.
         *
         * This does exactly what eve's built-in secret-token check does —
         * Telegram echoes the `setWebhook` secret in a header, and nothing
         * else about the request is signed, so the body may be rewritten once
         * that header checks out. Returning a string hands eve that string as
         * the verified body, which is the only hook early enough to turn a
         * voice note into text before eve's own parser discards it.
         */
        const webhookVerifier = async (request: Request, body: string): Promise<unknown> => {
          const received = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
          if (!received || !secretMatches(secret, received)) return false;
          return transcribeVoiceNote(body);
        };

        return telegramChannel({
          botUsername,
          credentials: { botToken, webhookVerifier },
        });
      })()
    : defineChannel({ routes: [] });

export default channel;
