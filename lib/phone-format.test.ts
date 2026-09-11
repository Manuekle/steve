import { describe, expect, it } from "vitest";
import { formatE164, toE164 } from "./phone-format";

describe("toE164", () => {
  it("normalizes the ways one number gets written", () => {
    // The whole point of the directory's uniqueness check: these are one line,
    // and if they normalize differently it will hold all of them and think
    // they are four.
    const forms = ["+54 9 11 5555 1111", "+5491155551111", "+54-9-11-5555-1111", "+54 (9) 11 5555 1111"];
    const normalized = new Set(forms.map(toE164));
    expect(normalized.size).toBe(1);
    expect([...normalized][0]).toBe("+5491155551111");
  });

  it("adds the plus when the country code is there without it", () => {
    expect(toE164("5491155551111")).toBe("+5491155551111");
  });

  it("refuses what cannot be a number", () => {
    expect(toE164("")).toBeNull();
    expect(toE164("   ")).toBeNull();
    expect(toE164("12345")).toBeNull(); // shorter than any real E.164
    expect(toE164("+1234567890123456")).toBeNull(); // 16 digits, E.164 caps at 15
    expect(toE164("no es un número")).toBeNull();
  });

  it("takes the shortest and longest E.164 lengths", () => {
    expect(toE164("+123456")).toBe("+123456");
    expect(toE164("+123456789012345")).toBe("+123456789012345");
  });
});

describe("formatE164", () => {
  it("shows the number exactly as stored", () => {
    // Deliberate: see the note on formatE164. A grouping guess with no country
    // metadata reads worse than the raw E.164, not better.
    expect(formatE164("+5491155551111")).toBe("+5491155551111");
    expect(formatE164("+123456")).toBe("+123456");
  });

  it("round-trips back through toE164", () => {
    const e164 = "+5491155551111";
    expect(toE164(formatE164(e164))).toBe(e164);
  });
});
