import {
  isCurrentTurnBoundaryEvent,
  type ClientSession,
  type HandleMessageStreamEvent,
  type SessionState,
} from "eve/client";

export type SavedEveChat = {
  readonly events?: readonly HandleMessageStreamEvent[];
  readonly session?: SessionState;
};

async function nextEventOrQuiet(
  iterator: AsyncIterator<HandleMessageStreamEvent>,
  quietMs: number | undefined,
): Promise<IteratorResult<HandleMessageStreamEvent> | "quiet"> {
  if (quietMs === undefined) return iterator.next();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      iterator.next(),
      new Promise<"quiet">((resolve) => {
        timer = setTimeout(() => resolve("quiet"), quietMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Replay the saved session's missing events without dispatching a new turn. */
export async function restoreEveChat(
  saved: SavedEveChat,
  session: Pick<ClientSession, "state" | "stream">,
  signal: AbortSignal,
  persist: (chat: SavedEveChat) => void,
): Promise<SavedEveChat> {
  const events = [...(saved.events ?? [])];
  let latest: SavedEveChat = { events, session: saved.session };
  let canBeIdle = false;

  try {
    while (!signal.aborted) {
      const streamAbort = new AbortController();
      const iterator = session
        .stream({
          startIndex: events.length,
          signal: AbortSignal.any([signal, streamAbort.signal]),
        })[Symbol.asyncIterator]();
      try {
        for (;;) {
          const next = await nextEventOrQuiet(iterator, canBeIdle ? 500 : undefined);
          if (next === "quiet" || signal.aborted) return latest;
          if (next.done) break;
          const event = next.value;
          events.push(event);
          // Raw stream reads need not advance the continuation token. Keep
          // the last observed token alongside the exact consumed cursor.
          const state = { ...session.state, ...latest.session, streamIndex: events.length };
          latest = {
            events,
            session:
              event.type === "session.waiting"
                ? { ...state, continuationToken: event.data.continuationToken }
                : event.type === "session.failed"
                  ? { streamIndex: events.length }
                  : state,
          };
          if (event.type === "session.completed" || event.type === "session.failed") return latest;
          // An old approval may already have an answer later in the log.
          // Only return when its tail is quiet, not at the historical prompt.
          canBeIdle =
            isCurrentTurnBoundaryEvent(event) ||
            event.type === "input.requested" ||
            event.type === "authorization.required";
        }
      } finally {
        // Abort before return(): an async generator queues return() behind a
        // pending next(), which would otherwise hang on a quiet live stream.
        streamAbort.abort();
        void Promise.resolve(iterator.return?.(undefined)).catch(() => {});
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return latest;
  } catch {
    // A timeout or network outage must not erase the conversation or reset
    // its cursor. The next attachment resumes after what we actually read.
    return latest;
  } finally {
    // One serialization, O(n), instead of writing every prefix, O(n²).
    // An unmounted restore no longer owns the shared storage slot.
    if (!signal.aborted) persist(latest);
  }
}
