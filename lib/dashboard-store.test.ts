import { describe, expect, it } from "vitest";
import { chatTitle, mergeChats } from "./dashboard-store";
import type { ChatSummary } from "./types";

/**
 * The history list reads two stores that both think they know about the same
 * conversation, and the rules for reconciling them are the whole reason the
 * list once showed every web-console chat as "Unknown": the server row carried
 * a placeholder title and a blanket object spread handed it the field.
 *
 * `mergeChats` is pure, so these are plain assertions — no localStorage, no
 * store to seed.
 */

function chat(overrides: Partial<ChatSummary> & { sessionId: string }): ChatSummary {
  return {
    channel: "web",
    id: `local-${overrides.sessionId}`,
    lastMessage: "",
    lastMessageAt: "2026-01-01T00:00:00.000Z",
    messageCount: 0,
    title: "",
    ...overrides,
  };
}

describe("mergeChats", () => {
  it("keeps the real title when the other store only has a placeholder", () => {
    const local = [chat({ sessionId: "s1", title: "¿Cómo vienen las ventas?" })];
    const server = [chat({ id: "conv-1", sessionId: "s1", title: "Unknown" })];

    expect(mergeChats(local, server)[0]?.title).toBe("¿Cómo vienen las ventas?");
  });

  it("treats the agent's own stand-in titles as no title at all", () => {
    const local = [chat({ sessionId: "s1", title: "Conversation" })];
    const server = [chat({ id: "conv-1", sessionId: "s1", title: "Unknown" })];

    expect(mergeChats(local, server)[0]?.title).toBe("");
  });

  it("prefers the server's title once it is a real one", () => {
    const local = [chat({ sessionId: "s1", title: "hola" })];
    const server = [chat({ id: "conv-1", sessionId: "s1", title: "Marta González" })];

    expect(mergeChats(local, server)[0]?.title).toBe("Marta González");
  });

  it("never replaces a message preview with an empty one", () => {
    const local = [chat({ sessionId: "s1", lastMessage: "Te paso el informe." })];
    const server = [chat({ id: "conv-1", sessionId: "s1", lastMessage: "" })];

    expect(mergeChats(local, server)[0]?.lastMessage).toBe("Te paso el informe.");
  });

  it("takes the higher message count — each store sees part of the conversation", () => {
    const local = [chat({ sessionId: "s1", messageCount: 6 })];
    const server = [chat({ id: "conv-1", sessionId: "s1", messageCount: 2 })];

    expect(mergeChats(local, server)[0]?.messageCount).toBe(6);
  });

  it("takes the later timestamp whichever store holds it", () => {
    const local = [chat({ sessionId: "s1", lastMessageAt: "2026-03-02T10:00:00.000Z" })];
    const server = [chat({ id: "conv-1", sessionId: "s1", lastMessageAt: "2026-03-01T10:00:00.000Z" })];

    expect(mergeChats(local, server)[0]?.lastMessageAt).toBe("2026-03-02T10:00:00.000Z");
  });

  it("keeps a flag set on either side", () => {
    const local = [chat({ sessionId: "s1", pinned: true })];
    const server = [chat({ id: "conv-1", sessionId: "s1", handoff: true })];

    const merged = mergeChats(local, server)[0];
    expect(merged?.pinned).toBe(true);
    expect(merged?.handoff).toBe(true);
  });

  it("keeps the id the browser is already holding", () => {
    const local = [chat({ sessionId: "s1", id: "conv-local" })];
    const server = [chat({ sessionId: "s1", id: "conv-server" })];

    expect(mergeChats(local, server)[0]?.id).toBe("conv-local");
  });

  it("keeps conversations that exist in only one store", () => {
    const local = [chat({ sessionId: "s1" })];
    const server = [chat({ id: "conv-2", sessionId: "s2" })];

    expect(mergeChats(local, server).map((row) => row.sessionId)).toEqual(["s1", "s2"]);
  });

  it("falls back to the row id when a conversation never reached eve", () => {
    const imported = { ...chat({ sessionId: "" }), id: "imported-1", sessionId: undefined };
    expect(mergeChats([imported], [])).toHaveLength(1);
  });
});

describe("chatTitle", () => {
  it("returns undefined for a placeholder so callers can localize the fallback", () => {
    expect(chatTitle(chat({ sessionId: "s1", title: "Unknown" }))).toBeUndefined();
    expect(chatTitle(chat({ sessionId: "s1", title: "Conversation" }))).toBeUndefined();
    expect(chatTitle(chat({ sessionId: "s1", title: "   " }))).toBeUndefined();
  });

  it("returns the title, trimmed, when there is one", () => {
    expect(chatTitle(chat({ sessionId: "s1", title: "  Presupuesto sillón  " }))).toBe(
      "Presupuesto sillón",
    );
  });
});
