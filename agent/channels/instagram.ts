import { createMemoryState } from "@chat-adapter/state-memory";
import { createInstagramAdapter } from "@chat-adapter/instagram";
import type { Message, Thread } from "chat";
import { chatSdkChannel } from "eve/channels/chat-sdk";
import { defineChannel } from "eve/channels";
import { getCredentialSync } from "../../lib/credentials";
import { messageToAgentContent } from "../../lib/chat-media";

// Instagram Direct Messages channel.
//
// Uses Meta's Instagram API with Instagram Login (@chat-adapter/instagram) —
// a native Instagram integration that does NOT require a linked Facebook
// Page — no Facebook Page is involved anywhere in this channel.
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

/**
 * Drop webhook deliveries the adapter cannot parse.
 *
 * `@chat-adapter/instagram` (4.38.1, and still 4.39.0) walks every delivery as
 * `for (const event of entry.messaging)` with no guard, but Instagram sends
 * plenty of entries that carry no `messaging` array at all — the same way
 * WhatsApp posts read receipts under the very field you subscribed to for
 * messages. Those throw `entry.messaging is not iterable` out of
 * `handleWebhook`, which Eve reports as a failed channel dispatch.
 *
 * The body cannot be rewritten on the way through: the adapter verifies the
 * HMAC over the exact bytes it receives, so a filtered payload would fail its
 * own signature check. What is safe is to look at a clone and decline to call
 * the adapter at all when the delivery holds nothing it could act on.
 *
 * Deliberately narrow: it skips only when *no* entry has a `messaging` array.
 * A delivery that carries real messages is passed through untouched, because
 * silently dropping a customer's message would be worse than the crash this
 * exists to prevent. Remove once the adapter guards its own loop.
 */
function skipUnparsableDeliveries<T extends { handleWebhook: (...args: never[]) => unknown }>(
  adapter: T,
): T {
  const original = adapter.handleWebhook.bind(adapter) as (
    request: Request,
    options?: unknown,
  ) => Promise<Response>;

  const guarded = async (request: Request, options?: unknown): Promise<Response> => {
    if (request.method !== "POST") return original(request, options);

    let entries: unknown[] = [];
    try {
      const payload = JSON.parse(await request.clone().text()) as { entry?: unknown };
      entries = Array.isArray(payload.entry) ? payload.entry : [];
    } catch {
      // Not JSON we understand: let the adapter answer, including its own
      // signature rejection, exactly as it would have.
      return original(request, options);
    }

    const actionable = entries.some(
      (entry) => Array.isArray((entry as { messaging?: unknown } | null)?.messaging),
    );
    if (entries.length > 0 && !actionable) {
      console.log("[instagram] delivery with no messaging entries, skipped", {
        entries: entries.length,
        keys: entries.map((entry) => Object.keys((entry ?? {}) as object)),
      });
      return new Response("", { status: 200 });
    }

    return original(request, options);
  };

  (adapter as { handleWebhook: unknown }).handleWebhook = guarded;
  return adapter;
}

const channel =
  appSecret && accessToken && accountId && verifyToken
    ? (() => {
        const { bot, channel, send } = chatSdkChannel({
          userName: "steve",
          // Credentials passed explicitly: the adapter's own fallback is
          // process.env, and Steve keeps these in the credential store so they
          // can be rotated from Settings. See agent/channels/whatsapp.ts.
          adapters: {
            instagram: skipUnparsableDeliveries(
              createInstagramAdapter({
                appSecret,
                accessToken,
                accountId,
                verifyToken,
              }),
            ),
          },
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
          await send(await messageToAgentContent(message), { thread, auth: auth(message) });
        });

        bot.onSubscribedMessage(async (thread: Thread, message: Message) => {
          await send(await messageToAgentContent(message), { thread, auth: auth(message) });
        });

        return channel;
      })()
    : defineChannel({ routes: [] });

export default channel;
