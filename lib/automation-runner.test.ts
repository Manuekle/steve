import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Contact, WorkflowStep } from "./types";

// The runner reaches for a lot of integrations at import time. Only the send
// paths matter here; the rest are stubbed so a unit test never touches the
// network, the credential file, or the store on disk.
const sendWhatsAppText = vi.fn(async () => ({ ok: true, status: 200, body: "{}" }));
const sendWhatsAppTemplate = vi.fn(async () => ({ ok: true, status: 200, body: "{}" }));
const sendInstagramText = vi.fn(async () => ({ ok: true, status: 200, body: "{}" }));
const sendTelegramText = vi.fn(async () => ({ ok: true, status: 200, body: "{}" }));

let credentials: Record<string, string | undefined> = {};

vi.mock("./whatsapp-send", () => ({
  isWithin24hWindow: (last: string | undefined) =>
    !!last && Date.now() - new Date(last).getTime() < 24 * 60 * 60 * 1000,
  sendWhatsAppText: (...args: unknown[]) => sendWhatsAppText(...(args as [])),
  sendWhatsAppTemplate: (...args: unknown[]) => sendWhatsAppTemplate(...(args as [])),
}));
vi.mock("./instagram-send", () => ({
  sendInstagramText: (...args: unknown[]) => sendInstagramText(...(args as [])),
}));
vi.mock("./telegram-send", () => ({
  sendTelegramText: (...args: unknown[]) => sendTelegramText(...(args as [])),
}));
vi.mock("./credentials", () => ({
  getCredential: async (key: string) => credentials[key],
  getCredentialSync: (key: string) => credentials[key],
}));
vi.mock("./business-store", () => ({ upsertContact: vi.fn(async () => undefined) }));
vi.mock("./google-sheets", () => ({ appendRow: vi.fn(), SHEETS_SCOPE: "sheets" }));
vi.mock("./google-auth", () => ({ getGoogleToken: vi.fn(async () => undefined) }));
vi.mock("./calendar", () => ({ bookCalendarEvent: vi.fn(), checkCalendarSlots: vi.fn(async () => []) }));
vi.mock("./payments", () => ({ createCheckoutLink: vi.fn(async () => null) }));
vi.mock("./connection-http", () => ({ connectedApiHosts: vi.fn(async () => []), connectionAuthHeaders: vi.fn(async () => ({})) }));

function contactOn(channel: Contact["channel"], extra: Partial<Contact> = {}): Contact {
  return {
    id: "c1",
    name: "Ana",
    channel,
    status: "open",
    source: "test",
    attributes: {},
    lastMessageAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...extra,
  } as Contact;
}

const messageStep: WorkflowStep = {
  id: "s1",
  type: "message",
  config: { message: "Hola {{contact.name}}" },
};

beforeEach(() => {
  credentials = {};
  sendWhatsAppText.mockClear().mockResolvedValue({ ok: true, status: 200, body: "{}" });
  sendWhatsAppTemplate.mockClear().mockResolvedValue({ ok: true, status: 200, body: "{}" });
  sendInstagramText.mockClear().mockResolvedValue({ ok: true, status: 200, body: "{}" });
  sendTelegramText.mockClear().mockResolvedValue({ ok: true, status: 200, body: "{}" });
});

afterEach(() => {
  vi.resetModules();
});

describe("renderTemplate", () => {
  it("fills contact fields and runtime extras", async () => {
    const { renderTemplate } = await import("./automation-runner");
    const contact = contactOn("whatsapp", { phone: "+5491100000000" });
    expect(renderTemplate("Hola {{contact.name}} — {{link}}", contact, { link: "u" })).toBe("Hola Ana — u");
  });

  it("leaves unknown placeholders alone rather than emptying them", async () => {
    const { renderTemplate } = await import("./automation-runner");
    expect(renderTemplate("{{contact.nope}}", contactOn("whatsapp"))).toBe("{{contact.nope}}");
  });
});

describe("message step", () => {
  it("replies to a WhatsApp contact inside the 24h window as free-form text", async () => {
    const { runAutomationSteps } = await import("./automation-runner");
    const [outcome] = await runAutomationSteps([messageStep], contactOn("whatsapp", { phone: "+5491100000000" }));

    expect(sendWhatsAppText).toHaveBeenCalledWith("+5491100000000", "Hola Ana");
    expect(outcome.status).toBe("done");
  });

  it("replies to an Instagram contact as a DM addressed by IGSID", async () => {
    const { runAutomationSteps } = await import("./automation-runner");
    const [outcome] = await runAutomationSteps([messageStep], contactOn("instagram", { externalId: "IGSID42" }));

    expect(sendInstagramText).toHaveBeenCalledWith("IGSID42", "Hola Ana");
    expect(sendWhatsAppText).not.toHaveBeenCalled();
    expect(outcome.status).toBe("done");
  });

  it("reports a refused send as failed instead of done", async () => {
    sendWhatsAppText.mockResolvedValue({ ok: false, status: 401, body: '{"error":{"message":"expired token"}}' });
    const { runAutomationSteps } = await import("./automation-runner");
    const [outcome] = await runAutomationSteps([messageStep], contactOn("whatsapp", { phone: "+5491100000000" }));

    expect(outcome.status).toBe("failed");
    expect(outcome.detail).toContain("401");
  });

  it("reports a refused Instagram DM as failed", async () => {
    sendInstagramText.mockResolvedValue({ ok: false, status: 400, body: "outside the messaging window" });
    const { runAutomationSteps } = await import("./automation-runner");
    const [outcome] = await runAutomationSteps([messageStep], contactOn("instagram", { externalId: "IGSID42" }));

    expect(outcome.status).toBe("failed");
    expect(outcome.detail).toContain("outside the messaging window");
  });

  it("says which channel is unreachable rather than always blaming WhatsApp", async () => {
    const { runAutomationSteps } = await import("./automation-runner");
    const [outcome] = await runAutomationSteps([messageStep], contactOn("instagram"));

    expect(outcome.status).toBe("skipped");
    expect(outcome.detail).toContain("IGSID");
  });

  it("falls back to the approved template outside the 24h window", async () => {
    credentials = { WHATSAPP_TEMPLATE_NAME: "hello", WHATSAPP_TEMPLATE_LANG: "es" };
    const stale = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { runAutomationSteps } = await import("./automation-runner");
    const [outcome] = await runAutomationSteps(
      [messageStep],
      contactOn("whatsapp", { phone: "+5491100000000", lastMessageAt: stale }),
    );

    expect(sendWhatsAppTemplate).toHaveBeenCalled();
    expect(sendWhatsAppText).not.toHaveBeenCalled();
    expect(outcome.status).toBe("done");
  });

  it("fails, without breaking the run, when no template is configured outside the window", async () => {
    const stale = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { runAutomationSteps } = await import("./automation-runner");
    const outcomes = await runAutomationSteps(
      [messageStep, { id: "s2", type: "update_contact", config: { contactStatus: "closed" } }],
      contactOn("whatsapp", { phone: "+5491100000000", lastMessageAt: stale }),
    );

    expect(outcomes[0].status).toBe("failed");
    expect(outcomes[0].detail).toContain("WHATSAPP_TEMPLATE_NAME");
    expect(outcomes).toHaveLength(2);
  });
});

describe("notify_whatsapp step", () => {
  const notify: WorkflowStep = {
    id: "n1",
    type: "notify_whatsapp",
    config: { phone: "+5491199999999", message: "Nuevo lead" },
  };

  it("reports a refusal as failed", async () => {
    credentials = { WHATSAPP_TEMPLATE_NAME: "alert" };
    sendWhatsAppTemplate.mockResolvedValue({ ok: false, status: 400, body: "template not approved" });
    const { runAutomationSteps } = await import("./automation-runner");
    const [outcome] = await runAutomationSteps([notify], undefined);

    expect(outcome.status).toBe("failed");
    expect(outcome.detail).toContain("template not approved");
  });
});

describe("replyToContact", () => {
  it("has nothing to send to a web-chat contact", async () => {
    const { replyToContact } = await import("./automation-runner");
    expect(await replyToContact(contactOn("web"), "hola")).toBeNull();
  });

  // Telegram used to fall through to the same `null` as web chat, so every
  // follow-up, welcome and automation message to a Telegram lead was silently
  // skipped rather than sent.
  it("sends to a Telegram contact on its chat id", async () => {
    const { replyToContact } = await import("./automation-runner");

    const delivery = await replyToContact(contactOn("telegram", { externalId: "998877" }), "hola");

    expect(sendTelegramText).toHaveBeenCalledWith("998877", "hola");
    expect(delivery).toEqual({ ok: true, detail: "Sent to 998877 as a Telegram message." });
  });

  it("reports a refused Telegram send rather than claiming it went out", async () => {
    const { replyToContact } = await import("./automation-runner");
    sendTelegramText.mockResolvedValue({
      ok: false,
      status: 200,
      body: '{"ok":false,"description":"bot was blocked by the user"}',
    });

    const delivery = await replyToContact(contactOn("telegram", { externalId: "998877" }), "hola");

    expect(delivery?.ok).toBe(false);
    expect(delivery?.detail).toContain("blocked");
  });

  it("skips a Telegram contact saved before its first message", async () => {
    const { replyToContact } = await import("./automation-runner");
    expect(await replyToContact(contactOn("telegram"), "hola")).toBeNull();
  });
});
