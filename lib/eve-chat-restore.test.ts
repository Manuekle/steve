import { afterEach, describe, expect, it, vi } from "vitest";
import type { HandleMessageStreamEvent, SessionState } from "eve/client";
import { restoreEveChat } from "./eve-chat-restore";

const event = (type: string, data: object = {}) => ({ type, data }) as HandleMessageStreamEvent;
const waiting = (token: string) => event("session.waiting", { continuationToken: token });
const saved = { session: { sessionId: "session-1", continuationToken: "old", streamIndex: 0 } };

function replay(events: HandleMessageStreamEvent[], error?: Error) {
  let streamSignal: AbortSignal | undefined;
  const stream = vi.fn(({ signal }: { signal?: AbortSignal }) => {
    streamSignal = signal;
    return (async function* () {
      yield* events;
      if (error) throw error;
      await new Promise<void>((_resolve, reject) => {
        if (signal?.aborted) reject(signal.reason);
        else signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    })();
  });
  return { session: { state: saved.session as SessionState, stream }, signal: () => streamSignal };
}

afterEach(() => vi.useRealTimers());

describe("chat replay", () => {
  it("persists a long history once instead of serializing every growing prefix", async () => {
    vi.useFakeTimers();
    const events = [...Array.from({ length: 1000 }, () => event("message.appended", { messageDelta: "text" })), waiting("latest")];
    const source = replay(events);
    const persist = vi.fn();
    const result = restoreEveChat(saved, source.session, new AbortController().signal, persist);
    await vi.advanceTimersByTimeAsync(600);
    expect((await result).events).toHaveLength(1001);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(source.signal()?.aborted).toBe(true);
  });

  it("replays past already answered historical approval prompts", async () => {
    vi.useFakeTimers();
    const events = [event("input.requested", { requests: [] }), waiting("first"), event("message.received", { message: "approved" }), waiting("latest")];
    const source = replay(events);
    const result = restoreEveChat(saved, source.session, new AbortController().signal, vi.fn());
    await vi.advanceTimersByTimeAsync(600);
    expect(await result).toMatchObject({ events, session: { continuationToken: "latest", streamIndex: 4 } });
  });

  it("retains the newest cursor and history after a transient stream failure", async () => {
    const events = [waiting("new-token"), event("message.appended", { messageDelta: "partial" })];
    const source = replay(events, new TypeError("fetch failed"));
    const result = await restoreEveChat(saved, source.session, new AbortController().signal, vi.fn());
    expect(result).toMatchObject({ events, session: { sessionId: "session-1", continuationToken: "new-token", streamIndex: 2 } });
    expect(source.signal()?.aborted).toBe(true);
  });

  it("preserves consumed events and the cursor when the restore budget expires", async () => {
    const events = [event("message.appended", { messageDelta: "partial" })];
    const source = replay(events, new DOMException("timeout", "TimeoutError"));
    const result = await restoreEveChat(saved, source.session, new AbortController().signal, vi.fn());
    expect(result).toMatchObject({ events, session: { streamIndex: 1 } });
  });

  it("does not persist an aborted restore over the newly selected chat", async () => {
    const controller = new AbortController();
    const persist = vi.fn();
    const source = replay([event("message.appended")]);
    const result = restoreEveChat(saved, source.session, controller.signal, persist);
    controller.abort();
    await result;
    expect(persist).not.toHaveBeenCalled();
    expect(source.signal()?.aborted).toBe(true);
  });

  it("returns a pending approval after a quiet tail and closes its stream", async () => {
    vi.useFakeTimers();
    const events = [event("input.requested", { requests: [] })];
    const source = replay(events);
    const result = restoreEveChat(saved, source.session, new AbortController().signal, vi.fn());
    await vi.advanceTimersByTimeAsync(600);
    expect((await result).events).toEqual(events);
    expect(source.signal()?.aborted).toBe(true);
  });

  it("keeps completed sessions addressable but clears failed session cursors", async () => {
    for (const type of ["session.completed", "session.failed"]) {
      const source = replay([event(type)]);
      const result = await restoreEveChat(saved, source.session, new AbortController().signal, vi.fn());
      expect(result.session?.sessionId).toBe(type === "session.completed" ? "session-1" : undefined);
      expect(result.session?.streamIndex).toBe(1);
      expect(source.signal()?.aborted).toBe(true);
    }
  });
});
