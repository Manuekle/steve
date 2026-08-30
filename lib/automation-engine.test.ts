import { describe, it, expect } from "vitest";
import {
  parseDurationMs,
  cronMatches,
  matchKeyword,
  matchInbound,
  automationMatchesChannel,
  formatPlaybook,
} from "./automation-engine";
import type { Automation, Contact } from "./types";

// ── parseDurationMs ──────────────────────────────────────────────

describe("parseDurationMs", () => {
  it("parses minutes (default unit)", () => {
    expect(parseDurationMs("30")).toBe(30 * 60_000);
  });

  it("parses seconds", () => {
    expect(parseDurationMs("10s")).toBe(10_000);
    expect(parseDurationMs("10 sec")).toBe(10_000);
  });

  it("parses minutes explicit", () => {
    expect(parseDurationMs("5m")).toBe(5 * 60_000);
    expect(parseDurationMs("5 min")).toBe(5 * 60_000);
  });

  it("parses hours", () => {
    expect(parseDurationMs("2h")).toBe(2 * 3_600_000);
    expect(parseDurationMs("2 hr")).toBe(2 * 3_600_000);
  });

  it("parses days", () => {
    expect(parseDurationMs("1d")).toBe(86_400_000);
  });

  it("parses milliseconds", () => {
    expect(parseDurationMs("500ms")).toBe(500);
  });

  it("returns undefined for invalid input", () => {
    expect(parseDurationMs(undefined)).toBeUndefined();
    expect(parseDurationMs("")).toBeUndefined();
    expect(parseDurationMs("abc")).toBeUndefined();
  });

  it("handles decimal values", () => {
    expect(parseDurationMs("1.5h")).toBe(1.5 * 3_600_000);
  });
});

// ── cronMatches ──────────────────────────────────────────────────

describe("cronMatches", () => {
  it("matches wildcard *", () => {
    const date = new Date("2025-06-15T10:30:00Z");
    expect(cronMatches("* * * * *", date)).toBe(true);
  });

  it("matches specific minute", () => {
    const date = new Date("2025-06-15T10:30:00Z");
    expect(cronMatches("30 * * * *", date)).toBe(true);
    expect(cronMatches("29 * * * *", date)).toBe(false);
  });

  it("matches specific hour", () => {
    const date = new Date("2025-06-15T10:30:00Z");
    expect(cronMatches("* 10 * * *", date)).toBe(true);
    expect(cronMatches("* 11 * * *", date)).toBe(false);
  });

  it("matches comma-separated values", () => {
    const date = new Date("2025-06-15T10:00:00Z");
    expect(cronMatches("0 9,10,11 * * *", date)).toBe(true);
    expect(cronMatches("0 8,9,10 * * *", date)).toBe(true); // 10 is in the list
    expect(cronMatches("0 12,13 * * *", date)).toBe(false);
  });

  it("matches ranges", () => {
    const date = new Date("2025-06-15T10:00:00Z");
    expect(cronMatches("0 9-17 * * *", date)).toBe(true);
    expect(cronMatches("0 18-23 * * *", date)).toBe(false);
  });

  it("matches steps", () => {
    const date = new Date("2025-06-15T10:00:00Z");
    expect(cronMatches("*/15 * * * *", date)).toBe(true); // 0,15,30,45
    expect(cronMatches("*/15 * * * *", new Date("2025-06-15T10:10:00Z"))).toBe(false);
  });

  it("rejects invalid cron expressions", () => {
    const date = new Date("2025-06-15T10:30:00Z");
    expect(cronMatches("* * *", date)).toBe(false); // too few fields
    expect(cronMatches("* * * * * *", date)).toBe(false); // too many fields
  });
});

// ── automationMatchesChannel ──────────────────────────────────────

describe("automationMatchesChannel", () => {
  it("matches 'all' channel", () => {
    const auto = { channel: "all" } as Automation;
    expect(automationMatchesChannel(auto, "web")).toBe(true);
    expect(automationMatchesChannel(auto, "whatsapp")).toBe(true);
  });

  it("matches specific channel", () => {
    const auto = { channel: "whatsapp" } as Automation;
    expect(automationMatchesChannel(auto, "whatsapp")).toBe(true);
    expect(automationMatchesChannel(auto, "web")).toBe(false);
  });
});

// ── matchKeyword ─────────────────────────────────────────────────

describe("matchKeyword", () => {
  const auto: Automation = {
    id: "test",
    name: "Test",
    description: "",
    trigger: "keyword",
    triggerValue: "precio, price, cuento",
    channel: "all",
    status: "active",
    responseCount: 0,
    createdAt: "",
  };

  it("matches keyword case-insensitively", () => {
    expect(matchKeyword(auto, "¿Cuál es el precio?")).toBe(true);
    expect(matchKeyword(auto, "What is the PRICE?")).toBe(true);
  });

  it("matches partial words", () => {
    expect(matchKeyword(auto, "quiero saber el precio final")).toBe(true);
  });

  it("returns false for non-keyword triggers", () => {
    const other = { ...auto, trigger: "new_chat" as const };
    expect(matchKeyword(other, "precio")).toBe(false);
  });

  it("returns false when no match", () => {
    expect(matchKeyword(auto, "hola")).toBe(false);
  });
});

// ── matchInbound ─────────────────────────────────────────────────

describe("matchInbound", () => {
  const autos: Automation[] = [
    {
      id: "kw",
      name: "Keyword",
      description: "",
      trigger: "keyword",
      triggerValue: "ayuda",
      channel: "all",
      status: "active",
      responseCount: 0,
      createdAt: "",
    },
    {
      id: "nc",
      name: "NewChat",
      description: "",
      trigger: "new_chat",
      triggerValue: "",
      channel: "web",
      status: "active",
      responseCount: 0,
      createdAt: "",
    },
    {
      id: "paused",
      name: "Paused",
      description: "",
      trigger: "keyword",
      triggerValue: "test",
      channel: "all",
      status: "paused",
      responseCount: 0,
      createdAt: "",
    },
  ];

  it("matches keyword trigger", () => {
    const matched = matchInbound({
      automations: autos,
      channel: "web",
      message: "necesito ayuda",
      isNewSession: false,
    });
    expect(matched.map((a) => a.id)).toContain("kw");
  });

  it("matches new_chat trigger", () => {
    const matched = matchInbound({
      automations: autos,
      channel: "web",
      message: "hola",
      isNewSession: true,
    });
    expect(matched.map((a) => a.id)).toContain("nc");
  });

  it("skips paused automations", () => {
    const matched = matchInbound({
      automations: autos,
      channel: "web",
      message: "test",
      isNewSession: false,
    });
    expect(matched.map((a) => a.id)).not.toContain("paused");
  });

  it("filters by channel", () => {
    const matched = matchInbound({
      automations: autos,
      channel: "whatsapp",
      message: "hola",
      isNewSession: true,
    });
    // nc is web-only, should not match on whatsapp
    expect(matched.map((a) => a.id)).not.toContain("nc");
  });
});

// ── formatPlaybook ───────────────────────────────────────────────

describe("formatPlaybook", () => {
  it("returns default playbook when no automations", () => {
    const result = formatPlaybook([]);
    expect(result).toContain("No active automations");
  });

  it("includes contact info when provided", () => {
    const contact: Contact = {
      id: "ct-1",
      name: "Test User",
      phone: "+54111234",
      email: "test@example.com",
      channel: "whatsapp",
      status: "open",
      source: "webhook",
      attributes: { budget: "1000" },
      lastMessageAt: "",
      createdAt: "",
    };
    const result = formatPlaybook([], contact);
    expect(result).toContain("Test User");
    expect(result).toContain("+54111234");
    expect(result).toContain("budget=1000");
  });

  it("lists active automations with steps", () => {
    const auto: Automation = {
      id: "auto-1",
      name: "Welcome",
      description: "",
      trigger: "new_chat",
      triggerValue: "",
      channel: "all",
      status: "active",
      responseCount: 5,
      createdAt: "",
      steps: [
        { id: "s1", type: "message", config: { message: "Hola!" } },
        { id: "s2", type: "wait", config: { duration: "5m" } },
      ],
    };
    const result = formatPlaybook([auto]);
    expect(result).toContain("Welcome");
    expect(result).toContain("Send this exact text: Hola!");
    expect(result).toContain("Wait 5m");
  });

  it("does not list paused automations", () => {
    const auto: Automation = {
      id: "auto-2",
      name: "Paused",
      description: "",
      trigger: "keyword",
      triggerValue: "test",
      channel: "all",
      status: "paused",
      responseCount: 0,
      createdAt: "",
    };
    const result = formatPlaybook([auto]);
    expect(result).not.toContain("Paused");
  });
});
