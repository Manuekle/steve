import { createMemoryState } from "@chat-adapter/state-memory";
import { createMessengerAdapter } from "@chat-adapter/messenger";
import type { Message, Thread } from "chat";
import { chatSdkChannel, messageToUserContent } from "eve/channels/chat-sdk";
import { defineChannel } from "eve/channels";
import { getCredentialSync } from "../../lib/credentials";

// Facebook Messenger channel (Facebook Page DMs only — see agent/channels/
// instagram.ts for Instagram DMs, which use a separate native API and do
// not go through a Facebook Page).
//
// Uses Meta's Messenger Platform API through the Chat SDK Messenger adapter.
// Inbound messages from Facebook users start or resume durable eve
// sessions; the agent's reply is posted back to the same conversation.
//
// Credentials are read from the local credential store (~/.steve/credentials.json)
// with fallback to environment variables. The webhook is served at
// POST /eve/v1/messenger (and GET for verification).
//
// When credentials are missing the channel degrades to a no-op (no routes),
// so the app starts fine without Messenger configured. Configure them in
// /settings and restart.

const appSecret = getCredentialSync("FACEBOOK_APP_SECRET");
const pageToken = getCredentialSync("FACEBOOK_PAGE_ACCESS_TOKEN");
const verifyToken = getCredentialSync("FACEBOOK_VERIFY_TOKEN");

const channel =
  appSecret && pageToken && verifyToken
    ? (() => {
        const { bot, channel, send } = chatSdkChannel({
          userName: "steve",
          adapters: { messenger: createMessengerAdapter() },
          state: createMemoryState(),
          streaming: false,
        });

        // Pass the sender's Messenger PSID as session auth so
        // agent/hooks/persist.ts can capture it on Contact.externalId —
        // the id send_media needs to message this contact proactively.
        const auth = (message: Message) => ({
          authenticator: "messenger",
          principalType: "user",
          principalId: message.author.userId,
          attributes: {},
        });

        bot.onDirectMessage(async (thread: Thread, message: Message) => {
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
