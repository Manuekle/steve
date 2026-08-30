import { createMemoryState } from "@chat-adapter/state-memory";
import { createInstagramAdapter } from "@chat-adapter/instagram";
import type { Message, Thread } from "chat";
import { chatSdkChannel, messageToUserContent } from "eve/channels/chat-sdk";
import { defineChannel } from "eve/channels";
import { getCredentialSync } from "../../lib/credentials";

// Instagram Direct Messages channel.
//
// Uses Meta's Instagram API with Instagram Login (@chat-adapter/instagram) —
// a native Instagram integration that does NOT require a linked Facebook
// Page. This is a separate product from Messenger; see agent/channels/
// messenger.ts for Facebook Page DMs.
//
// Credentials are read from the local credential store (~/.steve/credentials.json)
// with fallback to environment variables. The webhook is served at
// POST /eve/v1/instagram (and GET for verification).
//
// When credentials are missing the channel degrades to a no-op (no routes),
// so the app starts fine without Instagram configured. Configure them in
// /settings and restart.

const appSecret = getCredentialSync("INSTAGRAM_APP_SECRET");
const accessToken = getCredentialSync("INSTAGRAM_ACCESS_TOKEN");
const accountId = getCredentialSync("INSTAGRAM_ACCOUNT_ID");
const verifyToken = getCredentialSync("INSTAGRAM_VERIFY_TOKEN");

const channel =
  appSecret && accessToken && accountId && verifyToken
    ? (() => {
        const { bot, channel, send } = chatSdkChannel({
          userName: "steve",
          adapters: { instagram: createInstagramAdapter() },
          state: createMemoryState(),
          streaming: false,
        });

        // Pass the sender's Instagram-scoped id (IGSID) as session auth so
        // agent/hooks/persist.ts can capture it on Contact.externalId —
        // the id send_media needs to message this contact proactively.
        const auth = (message: Message) => ({
          authenticator: "instagram",
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
