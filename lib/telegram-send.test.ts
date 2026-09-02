import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getCredential = vi.fn();

vi.mock("./credentials", () => ({
  getCredential: (...args: unknown[]) => getCredential(...(args as [])),
  getCredentialSync: () => undefined,
}));

const fetchMock = vi.fn();

beforeEach(() => {
  getCredential.mockReset().mockResolvedValue("bot-token");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function ok(body: unknown, status = 200): Response {
  return { ok: status < 400, status, text: async () => JSON.stringify(body) } as unknown as Response;
}

describe("sendTelegramText", () => {
  it("posts to sendMessage with the chat id", async () => {
    const { sendTelegramText } = await import("./telegram-send");
    fetchMock.mockResolvedValue(ok({ ok: true, result: { message_id: 7 } }));

    const result = await sendTelegramText("12345", "Hola");

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/botbot-token/sendMessage");
    expect(JSON.parse(init.body as string)).toEqual({ chat_id: "12345", text: "Hola" });
  });

  // The Bot API answers a blocked bot with HTTP 200 and `ok: false`, so
  // trusting the status alone would report a message nobody received as sent.
  it("reports a 200 body with ok:false as a failure", async () => {
    const { sendTelegramText } = await import("./telegram-send");
    fetchMock.mockResolvedValue(ok({ ok: false, description: "bot was blocked by the user" }));

    const result = await sendTelegramText("12345", "Hola");

    expect(result.ok).toBe(false);
    expect(result.status).toBe(200);
    expect(result.body).toContain("blocked");
  });

  it("does not call out at all when no token is configured", async () => {
    const { sendTelegramText } = await import("./telegram-send");
    getCredential.mockResolvedValue(undefined);

    const result = await sendTelegramText("12345", "Hola");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      status: 0,
      body: "Telegram credentials are not configured.",
    });
  });
});

describe("sendTelegramMedia", () => {
  it("maps each media type to its own Bot API method and field", async () => {
    const { sendTelegramMedia } = await import("./telegram-send");
    fetchMock.mockResolvedValue(ok({ ok: true }));

    for (const [type, method, field] of [
      ["image", "sendPhoto", "photo"],
      ["audio", "sendAudio", "audio"],
      ["video", "sendVideo", "video"],
    ] as const) {
      fetchMock.mockClear();
      await sendTelegramMedia({ chatId: "1", type, url: "https://cdn.example.com/f", caption: "hey" });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/${method}`);
      expect(JSON.parse(init.body as string)).toEqual({
        chat_id: "1",
        [field]: "https://cdn.example.com/f",
        caption: "hey",
      });
    }
  });

  it("omits the caption key entirely when there is none", async () => {
    const { sendTelegramMedia } = await import("./telegram-send");
    fetchMock.mockResolvedValue(ok({ ok: true }));

    await sendTelegramMedia({ chatId: "1", type: "image", url: "https://cdn.example.com/f" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).not.toHaveProperty("caption");
  });
});

describe("fetchTelegramFile", () => {
  it("trades the file id for a path and downloads from the file host", async () => {
    const { fetchTelegramFile } = await import("./telegram-send");
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { file_path: "voice/file_1.oga" } }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => new TextEncoder().encode("audio-bytes").buffer,
      } as unknown as Response);

    const data = await fetchTelegramFile("file-id");

    expect(data.toString()).toBe("audio-bytes");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.telegram.org/file/botbot-token/voice/file_1.oga",
    );
  });

  it("throws when getFile refuses, rather than downloading nothing", async () => {
    const { fetchTelegramFile } = await import("./telegram-send");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: false }),
    } as unknown as Response);

    await expect(fetchTelegramFile("file-id")).rejects.toThrow("getFile failed");
  });
});
