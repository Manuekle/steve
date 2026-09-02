import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleCron } from "./schedule-cron";

beforeEach(() => {
  delete process.env.STEVE_CRON_DEFAULT;
  delete process.env.STEVE_CRON_REMINDERS;
  delete process.env.STEVE_CRON_META_LEADS;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.STEVE_CRON_DEFAULT;
  delete process.env.STEVE_CRON_REMINDERS;
  delete process.env.STEVE_CRON_META_LEADS;
});

describe("scheduleCron", () => {
  it("keeps the schedule's own cadence when nothing overrides it", () => {
    expect(scheduleCron("reminders", "* * * * *")).toBe("* * * * *");
  });

  it("takes a per-schedule override", () => {
    process.env.STEVE_CRON_REMINDERS = "0 3 * * *";
    expect(scheduleCron("reminders", "* * * * *")).toBe("0 3 * * *");
  });

  it("takes a default that covers every schedule", () => {
    process.env.STEVE_CRON_DEFAULT = "0 3 * * *";
    expect(scheduleCron("reminders", "* * * * *")).toBe("0 3 * * *");
    expect(scheduleCron("prospect", "*/5 * * * *")).toBe("0 3 * * *");
  });

  it("prefers the per-schedule override over the default", () => {
    process.env.STEVE_CRON_DEFAULT = "0 3 * * *";
    process.env.STEVE_CRON_REMINDERS = "0 9 * * *";
    expect(scheduleCron("reminders", "* * * * *")).toBe("0 9 * * *");
  });

  // The file name carries a hyphen; the variable cannot.
  it("maps a hyphenated schedule name to an underscored variable", () => {
    process.env.STEVE_CRON_META_LEADS = "0 4 * * *";
    expect(scheduleCron("meta-leads", "*/5 * * * *")).toBe("0 4 * * *");
  });

  it("ignores an empty value rather than treating it as a schedule", () => {
    process.env.STEVE_CRON_REMINDERS = "   ";
    expect(scheduleCron("reminders", "* * * * *")).toBe("* * * * *");
  });

  // A typo here would fail the deployment on a cron parser's error, naming a
  // schedule nobody was thinking about.
  it("falls back, loudly, on an expression with the wrong field count", () => {
    process.env.STEVE_CRON_REMINDERS = "0 3 * *";
    expect(scheduleCron("reminders", "* * * * *")).toBe("* * * * *");
    expect(console.warn).toHaveBeenCalled();
  });
});
