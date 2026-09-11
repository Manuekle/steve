"use client";

import { useEffect, useState } from "react";

import { TextShimmer } from "@/components/motion/text-shimmer";
import { useT } from "@/lib/i18n/provider";

/**
 * The screen between clicking a conversation and reading it.
 *
 * It used to be a spinner and the words "Cargando agente…" on a flat page,
 * then a lit room — a lamp, a beam, dust in it, and a glass plate holding the
 * label. The plate was the mistake. A card drawn around a wait makes the wait
 * look like content that failed to arrive, and its border is where the light
 * stops, which is the one thing light never does.
 *
 * So: no surface at all. A cone thrown from a fixture above the top of the
 * screen, the pool it makes where it lands, a ring turning in it, and one
 * line of text the light travels across. It is the register Fig 06 works in
 * on the landing — the boxes came off those cards too, and what stayed was
 * the words.
 *
 * The light is built out of the same rig the marketing pages light with
 * (`.lp-spot`, `.lp-arc`): a conic cone rather than a blurred blob, and dead
 * still, because a light that pulses is a notification and a light that sits
 * still is a room.
 *
 * ## What makes it informative rather than decorative
 *
 * - The label names the actual work. Restoring a conversation and connecting
 *   to the agent take different amounts of time, and a person who knows which
 *   one they are waiting on waits differently.
 * - The ring is the only thing claiming the app is still working, and it is
 *   the smallest thing on screen. The lighting does not spin or fill: a light
 *   that is simply on claims something is happening without pretending to
 *   measure how much is left.
 * - After a few seconds a second line admits it is slow. A wait with no
 *   acknowledgement reads as a hang, and the next thing somebody does is
 *   reload — which, on this screen, throws away the replay in progress.
 * - `role="status"` with a live region, so the same two facts reach a screen
 *   reader instead of only the sighted.
 *
 * The scene is drawn in `app/globals.css` (`.chat-loading`), not in utility
 * classes: the cone, its pool and the ring are gradients and masks that only
 * make sense read together.
 */

/** When the wait stops being normal and starts needing an explanation. */
const SLOW_AFTER_MS = 2_500;

export type AgentLoadingMode = "connecting" | "restoring";

export function AgentLoading({ mode = "connecting" }: { readonly mode?: AgentLoadingMode }) {
  const t = useT();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="chat-loading">
      <span aria-hidden className="chat-loading__cone" />
      <span aria-hidden className="chat-loading__pool" />

      <div className="chat-loading__stage">
        {/* Decoration, not a second live region: the label below already
            announces what is loading, and a ring that also called itself
            "Loading" would make this screen say it twice. */}
        <span aria-hidden className="chat-loading__spinner" />

        {/* Only the browser knows whether there is a conversation in
            storage to replay, so the server renders the other label and
            React is told that is expected rather than a bug. */}
        <p
          aria-live="polite"
          className="chat-loading__label"
          role="status"
          suppressHydrationWarning
        >
          <TextShimmer duration={2.6}>
            {t(mode === "restoring" ? "chat.loadingRestoring" : "chat.loadingConnecting")}
          </TextShimmer>
        </p>

        {/* Kept mounted so its arrival does not move the spinner and label. */}
        <p className="chat-loading__hint" data-visible={slow ? "true" : undefined}>
          {t("chat.loadingSlow")}
        </p>
      </div>
    </div>
  );
}
