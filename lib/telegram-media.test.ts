import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchTelegramFile = vi.fn();
const transcribeAudio = vi.fn();

vi.mock("./telegram-send", () => ({
  fetchTelegramFile: (...args: unknown[]) => fetchTelegramFile(...(args as [])),
}));
vi.mock("./elevenlabs", () => ({
  transcribeAudio: (...args: unknown[]) => transcribeAudio(...(args as [])),
}));

beforeEach(() => {
  fetchTelegramFile.mockReset().mockResolvedValue(Buffer.from("audio-bytes"));
  transcribeAudio.mockReset().mockResolvedValue("quiero agendar un turno");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function body(update: unknown): string {
  return JSON.stringify(update);
}

describe("transcribeVoiceNote", () => {
  it("leaves a plain text update byte-for-byte alone", async () => {
    const { transcribeVoiceNote } = await import("./telegram-media");
    const raw = body({ message: { text: "Hola", chat: { id: 1 } } });

    expect(await transcribeVoiceNote(raw)).toBe(raw);
    expect(fetchTelegramFile).not.toHaveBeenCalled();
  });

  it("leaves a body that is not JSON alone instead of throwing", async () => {
    const { transcribeVoiceNote } = await import("./telegram-media");
    expect(await transcribeVoiceNote("not json")).toBe("not json");
  });

  it("writes a voice note's transcript into message.text", async () => {
    const { transcribeVoiceNote } = await import("./telegram-media");
    const raw = body({
      message: { chat: { id: 1 }, voice: { file_id: "f1", mime_type: "audio/ogg" } },
    });

    const result = JSON.parse(await transcribeVoiceNote(raw)) as { message: { text: string } };

    expect(fetchTelegramFile).toHaveBeenCalledWith("f1");
    expect(transcribeAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        data: Buffer.from("audio-bytes"),
        mimeType: "audio/ogg",
        filename: "voice.ogg",
      }),
    );
    // Bounded, because this runs before the webhook's 200 and Telegram
    // redelivers anything it waits too long for.
    expect(transcribeAudio.mock.calls[0][0].abortSignal).toBeInstanceOf(AbortSignal);
    expect(result.message.text).toBe("[Nota de voz]: quiero agendar un turno");
  });

  it("handles an audio file the same way as a voice note", async () => {
    const { transcribeVoiceNote } = await import("./telegram-media");
    const raw = body({ message: { chat: { id: 1 }, audio: { file_id: "f2" } } });

    const result = JSON.parse(await transcribeVoiceNote(raw)) as { message: { text: string } };

    expect(fetchTelegramFile).toHaveBeenCalledWith("f2");
    expect(result.message.text).toContain("[Nota de voz]:");
  });

  it("keeps text the sender typed above the transcript", async () => {
    const { transcribeVoiceNote } = await import("./telegram-media");
    const raw = body({ message: { chat: { id: 1 }, text: "escuchá", audio: { file_id: "f3" } } });

    const result = JSON.parse(await transcribeVoiceNote(raw)) as { message: { text: string } };

    expect(result.message.text).toBe("escuchá\n[Nota de voz]: quiero agendar un turno");
  });

  // A rejected body is a 401 and a Telegram retry loop, so a transcription
  // that could not run must still produce a deliverable update.
  it("degrades to a marker when transcription fails", async () => {
    const { transcribeVoiceNote } = await import("./telegram-media");
    transcribeAudio.mockRejectedValue(new Error("ElevenLabs API key is not configured."));
    const raw = body({ message: { chat: { id: 1 }, voice: { file_id: "f4" } } });

    const result = JSON.parse(await transcribeVoiceNote(raw)) as { message: { text: string } };

    expect(result.message.text).toBe("[Nota de voz recibida, no se pudo transcribir]");
  });

  it("degrades to a marker when the file download fails", async () => {
    const { transcribeVoiceNote } = await import("./telegram-media");
    fetchTelegramFile.mockRejectedValue(new Error("Telegram getFile failed for f5."));
    const raw = body({ message: { chat: { id: 1 }, voice: { file_id: "f5" } } });

    const result = JSON.parse(await transcribeVoiceNote(raw)) as { message: { text: string } };

    expect(result.message.text).toBe("[Nota de voz recibida, no se pudo transcribir]");
  });

  it("ignores a voice object with no file id", async () => {
    const { transcribeVoiceNote } = await import("./telegram-media");
    const raw = body({ message: { chat: { id: 1 }, voice: { duration: 3 } } });

    expect(await transcribeVoiceNote(raw)).toBe(raw);
    expect(fetchTelegramFile).not.toHaveBeenCalled();
  });
});
