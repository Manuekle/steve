import { createMemoryState } from "@chat-adapter/state-memory";
import { createWhatsAppAdapter } from "@chat-adapter/whatsapp";
import type { Message, Thread } from "chat";
import { chatSdkChannel, messageToUserContent } from "eve/channels/chat-sdk";
import { defineChannel } from "eve/channels";
import { getCredentialSync } from "../../lib/credentials";

// WhatsApp Business Cloud API channel.
//
// Uses Meta's official WhatsApp Business Cloud API through the Chat SDK
// WhatsApp adapter. Inbound messages from WhatsApp users start or resume
// durable eve sessions; the agent's reply is posted back to the same
// WhatsApp conversation.
//
// Credentials are read from the local credential store (~/.steve/credentials.json)
// with fallback to environment variables. The webhook is served at
// POST /eve/v1/whatsapp (and GET for verification).
//
// When credentials are missing the channel degrades to a no-op (no routes),
// so the app starts fine without WhatsApp configured. Configure them in
// /settings and restart.

const token = getCredentialSync("WHATSAPP_ACCESS_TOKEN");
const appSecret = getCredentialSync("WHATSAPP_APP_SECRET");
const phoneNumberId = getCredentialSync("WHATSAPP_PHONE_NUMBER_ID");
const verifyToken = getCredentialSync("WHATSAPP_VERIFY_TOKEN");

const channel =
  token && appSecret && phoneNumberId && verifyToken
    ? (() => {
        const { bot, channel, send } = chatSdkChannel({
          userName: "steve",
          adapters: { whatsapp: createWhatsAppAdapter() },
          state: createMemoryState(),
          streaming: false,
        });

        // Pass the sender's WhatsApp id (their phone number) as session auth
        // so agent/hooks/persist.ts can auto-populate Contact.phone without
        // asking the user for a number they already messaged us from.
        const auth = (message: Message) => ({
          authenticator: "whatsapp",
          principalType: "user",
          principalId: message.author.userId,
          attributes: {},
        });

        bot.onNewMention(async (thread: Thread, message: Message) => {
          await thread.subscribe();
          await send(messageToUserContent(message), { thread, auth: auth(message) });
        });

        bot.onSubscribedMessage(async (thread: Thread, message: Message) => {
          await send(messageToUserContent(message), { thread, auth: auth(message) });
        });

        return channel;
      })()
    : defineChannel({ routes: [] });

export default channel;
