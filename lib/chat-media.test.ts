import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "chat";

const messageToUserContent = vi.fn();
const transcribeAudio = vi.fn();

vi.mock("eve/channels/chat-sdk", () => ({
  messageToUserContent: (...args: unknown[]) => messageToUserContent(...(args as [])),
}));
vi.mock("./elevenlabs", () => ({
  transcribeAudio: (...args: unknown[]) => transcribeAudio(...(args as [])),
}));

function messageWith(text: string, attachments: Message["attachments"] = []): Message {
  return { text, attachments } as unknown as Message;
}

beforeEach(() => {
  messageToUserContent.mockReset().mockReturnValue("fallback");
  transcribeAudio.mockReset();
});

describe("messageToAgentContent", () => {
  it("delegates to messageToUserContent when there are no attachments", async () => {
    const { messageToAgentContent } = await import("./chat-media");
    const message = messageWith("Hola");
    const result = await messageToAgentContent(message);
    expect(messageToUserContent).toHaveBeenCalledWith(message);
    expect(result).toBe("fallback");
  });

  it("keeps a url-based attachment as a file part built from the url", async () => {
    const { messageToAgentContent } = await import("./chat-media");
    const message = messageWith("Mirá esto", [
      { type: "image", url: "https://cdn.example.com/photo.jpg", mimeType: "image/jpeg", name: "photo.jpg" },
    ] as unknown as Message["attachments"]);
    const result = await messageToAgentContent(message);
    expect(result).toEqual([
      { type: "text", text: "Mirá esto" },
      { type: "file", data: new URL("https://cdn.example.com/photo.jpg"), filename: "photo.jpg", mediaType: "image/jpeg" },
    ]);
  });

  it("fetches and base64-encodes an image attachment with no url", async () => {
    const { messageToAgentContent } = await import("./chat-media");
    const fetchData = vi.fn(async () => Buffer.from("bytes"));
    const message = messageWith("", [
      { type: "image", mimeType: "image/png", name: "pic.png", fetchData },
    ] as unknown as Message["attachments"]);
    const result = await messageToAgentContent(message);
    expect(fetchData).toHaveBeenCalled();
    expect(result).toEqual([
      { type: "file", data: Buffer.from("bytes").toString("base64"), filename: "pic.png", mediaType: "image/png" },
    ]);
  });

  it("transcribes an audio attachment and inlines the text", async () => {
    const { messageToAgentContent } = await import("./chat-media");
    const fetchData = vi.fn(async () => Buffer.from("audio-bytes"));
    transcribeAudio.mockResolvedValue("hola, quiero agendar un turno");
    const message = messageWith("", [
      { type: "audio", mimeType: "audio/ogg", name: "voice", fetchData },
    ] as unknown as Message["attachments"]);
    const result = await messageToAgentContent(message);
    expect(transcribeAudio).toHaveBeenCalledWith({
      data: Buffer.from("audio-bytes"),
      mimeType: "audio/ogg",
      filename: "voice",
    });
    expect(result).toEqual([{ type: "text", text: "[Nota de voz]: hola, quiero agendar un turno" }]);
  });

  it("falls back to a marker when transcription fails, without throwing", async () => {
    const { messageToAgentContent } = await import("./chat-media");
    const fetchData = vi.fn(async () => Buffer.from("audio-bytes"));
    transcribeAudio.mockRejectedValue(new Error("ElevenLabs API key is not configured."));
    const message = messageWith("", [
      { type: "audio", mimeType: "audio/ogg", name: "voice", fetchData },
    ] as unknown as Message["attachments"]);
    const result = await messageToAgentContent(message);
    expect(result).toEqual([{ type: "text", text: "[Nota de voz recibida, no se pudo transcribir]" }]);
  });

  it("skips an attachment whose fetchData throws instead of failing the whole message", async () => {
    const { messageToAgentContent } = await import("./chat-media");
    const fetchData = vi.fn(async () => {
      throw new Error("network error");
    });
    const message = messageWith("Hola igual", [
      { type: "image", mimeType: "image/png", name: "broken.png", fetchData },
    ] as unknown as Message["attachments"]);
    const result = await messageToAgentContent(message);
    expect(result).toEqual([{ type: "text", text: "Hola igual" }]);
  });
});
