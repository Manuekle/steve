import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * The endpoint a phone call reaches when the voice agent uses a tool.
 *
 * The bug this route exists to fix is not a crash, it is a silence: a caller
 * asks for a turno, the agent says "listo", and no calendar event, reminder or
 * contact is ever created. So the tests here are mostly about the two things
 * that make that silence possible again — a tool that answers success without
 * having done the work, and a refusal that reaches the model as something it
 * cannot read out loud.
 */

const TEST_DIR = join(tmpdir(), `senka-voice-tools-${Date.now()}-${Math.random().toString(36).slice(2)}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => TEST_DIR };
});

const booked = vi.fn();
const slots = vi.fn();
vi.mock("@/lib/calendar", () => ({
  bookCalendarEvent: (...args: unknown[]) => booked(...args),
  checkCalendarSlots: (...args: unknown[]) => slots(...args),
}));

vi.mock("@/lib/rag", () => ({
  RagError: class RagError extends Error {},
  searchKnowledge: async () => [],
}));

vi.mock("@/lib/payments", () => ({ createCheckoutLink: async () => null }));
vi.mock("@/lib/whatsapp-send", () => ({
  sendWhatsAppText: async () => ({ ok: false, status: 0, body: "" }),
}));

const route = await import("@/app/api/webhooks/elevenlabs/tools/[agentId]/[tool]/route");
const { createAgent, listContacts, listReminders } = await import("@/lib/business-store");
const { voiceToolsSecret, VOICE_TOOL_SECRET_HEADER } = await import("@/lib/voice-tools");

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  booked.mockReset();
  slots.mockReset();
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

type AnyRequest = Parameters<typeof route.POST>[0];

async function call(
  agentId: string,
  tool: string,
  body: unknown,
  opts: { secret?: string | null } = {},
) {
  const secret = opts.secret === undefined ? await voiceToolsSecret() : opts.secret;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) headers[VOICE_TOOL_SECRET_HEADER] = secret;
  const request = new Request(`http://localhost/api/webhooks/elevenlabs/tools/${agentId}/${tool}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const response = await route.POST(request as AnyRequest, {
    params: Promise.resolve({ agentId, tool }),
  });
  return { response, body: (await response.json()) as Record<string, unknown> };
}

async function seedAgent(tools: string[] = []) {
  return createAgent({
    name: "Recepción",
    description: "",
    systemPrompt: "Atendé el teléfono.",
    tools,
  });
}

/** Far enough ahead that the future check can never flake on a slow run. */
function future(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

describe("voice tool auth", () => {
  it("rejects a call with no secret", async () => {
    const agent = await seedAgent();
    const { response } = await call(agent.id, "save_contact", { name: "Ana" }, { secret: null });
    expect(response.status).toBe(401);
  });

  it("rejects a call with the wrong secret", async () => {
    const agent = await seedAgent();
    const { response } = await call(agent.id, "save_contact", { name: "Ana" }, { secret: "nope" });
    expect(response.status).toBe(401);
    expect(await listContacts()).toHaveLength(0);
  });

  it("refuses an unknown tool in words the agent can say", async () => {
    const agent = await seedAgent();
    const { response, body } = await call(agent.id, "launch_missiles", {});
    expect(response.status).toBe(200);
    expect(body.success).toBe(false);
  });
});

describe("capability scoping", () => {
  it("refuses a capability the agent does not have", async () => {
    const agent = await seedAgent(["knowledge"]);
    const { body } = await call(agent.id, "book_appointment", {
      start_iso: future(60),
      summary: "Turno",
    });
    expect(body.success).toBe(false);
    expect(booked).not.toHaveBeenCalled();
  });

  it("allows everything when the agent has nothing picked", async () => {
    const agent = await seedAgent([]);
    const { body } = await call(agent.id, "save_contact", { name: "Ana", phone: "+5491155550000" });
    expect(body.success).toBe(true);
  });
});

describe("book_appointment", () => {
  it("books the event and saves the caller", async () => {
    const agent = await seedAgent(["calendar"]);
    booked.mockResolvedValue({ event_id: "ev_1", link: "https://cal", meetLink: "https://meet" });

    const start = future(120);
    const { body } = await call(agent.id, "book_appointment", {
      start_iso: start,
      summary: "Turno con Ana",
      duration_min: 45,
      contact_name: "Ana Pérez",
      contact_phone: "+5491155550000",
    });

    expect(body.success).toBe(true);
    expect(body.event_id).toBe("ev_1");
    expect(booked).toHaveBeenCalledTimes(1);
    const args = booked.mock.calls[0][0] as { start: string; end: string; summary: string };
    expect(args.start).toBe(start);
    // 45 minutes, not the 30-minute default.
    expect(new Date(args.end).getTime() - new Date(args.start).getTime()).toBe(45 * 60_000);

    const contacts = await listContacts();
    expect(contacts).toHaveLength(1);
    expect(contacts[0].name).toBe("Ana Pérez");
    expect(contacts[0].channel).toBe("voice");
  });

  it("refuses a date in the past instead of booking one", async () => {
    const agent = await seedAgent(["calendar"]);
    const { body } = await call(agent.id, "book_appointment", {
      start_iso: new Date(Date.now() - 60_000).toISOString(),
      summary: "Turno",
    });
    expect(body.success).toBe(false);
    expect(booked).not.toHaveBeenCalled();
  });

  it("reports a calendar failure as a failure, and never as a booking", async () => {
    const agent = await seedAgent(["calendar"]);
    booked.mockRejectedValue(new Error("Calendar API 403: insufficient permissions"));

    const { response, body } = await call(agent.id, "book_appointment", {
      start_iso: future(120),
      summary: "Turno",
      contact_name: "Ana",
    });

    // 200 so the model reads the sentence rather than seeing an opaque failure.
    expect(response.status).toBe(200);
    expect(body.success).toBe(false);
    expect(String(body.message)).toContain("403");
    // The lead survives a calendar outage.
    expect(await listContacts()).toHaveLength(1);
  });
});

describe("set_reminder", () => {
  it("creates a reminder against the caller", async () => {
    const agent = await seedAgent(["reminders"]);
    const when = future(240);
    const { body } = await call(agent.id, "set_reminder", {
      datetime_iso: when,
      message: "Llamar para confirmar",
      contact_name: "Ana",
      contact_phone: "+5491155550000",
    });

    expect(body.success).toBe(true);
    const reminders = await listReminders();
    expect(reminders).toHaveLength(1);
    expect(reminders[0].datetime).toBe(when);
    expect(reminders[0].contact_id).toBe(body.contact_id);
  });

  it("refuses when there is nobody to remind", async () => {
    const agent = await seedAgent(["reminders"]);
    const { body } = await call(agent.id, "set_reminder", {
      datetime_iso: future(240),
      message: "Llamar",
    });
    expect(body.success).toBe(false);
    expect(await listReminders()).toHaveLength(0);
  });
});

describe("check_availability", () => {
  it("defaults to the next fortnight and returns readable slots", async () => {
    const agent = await seedAgent(["calendar"]);
    const start = future(60);
    slots.mockResolvedValue([{ start, end: future(120) }]);

    const { body } = await call(agent.id, "check_availability", {});

    expect(body.success).toBe(true);
    const args = slots.mock.calls[0][0] as { start: string; end: string; durationMin: number };
    expect(args.durationMin).toBe(30);
    const span = new Date(args.end).getTime() - new Date(args.start).getTime();
    expect(span).toBe(14 * 24 * 60 * 60 * 1000);
    expect((body.slots as Array<{ start_iso: string }>)[0].start_iso).toBe(start);
  });
});

describe("argument cleaning", () => {
  it("treats a dictated 'null' as an absent value", async () => {
    const agent = await seedAgent(["contacts"]);
    const { body } = await call(agent.id, "save_contact", {
      name: "  Ana  ",
      email: "null",
      phone: "undefined",
    });
    expect(body.success).toBe(true);
    const [contact] = await listContacts();
    expect(contact.name).toBe("Ana");
    expect(contact.email).toBeUndefined();
    expect(contact.phone).toBeUndefined();
  });
});
