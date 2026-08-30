import { describe, it, expect } from "vitest";
import { isWithin24hWindow } from "./whatsapp-send";

describe("isWithin24hWindow", () => {
  it("returns true when within 24h", () => {
    const recent = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(); // 12h ago
    expect(isWithin24hWindow(recent)).toBe(true);
  });

  it("returns true when just within 24h", () => {
    const recent = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(); // 23h ago
    expect(isWithin24hWindow(recent)).toBe(true);
  });

  it("returns false when outside 24h", () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25h ago
    expect(isWithin24hWindow(old)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isWithin24hWindow(undefined)).toBe(false);
  });

  it("returns false for invalid date", () => {
    expect(isWithin24hWindow("not-a-date")).toBe(false);
  });

  it("returns true for very recent message", () => {
    const now = new Date().toISOString();
    expect(isWithin24hWindow(now)).toBe(true);
  });
});
