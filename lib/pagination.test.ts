import { describe, expect, it } from "vitest";
import { pageItems } from "./pagination";

describe("pageItems", () => {
  it("lists every page when they all fit", () => {
    expect(pageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("gaps only where pages are actually skipped", () => {
    // Near the start there is nothing to skip on the left.
    expect(pageItems(2, 12)).toEqual([1, 2, 3, 4, 5, "gap", 12]);
    // Near the end, nothing to skip on the right.
    expect(pageItems(11, 12)).toEqual([1, "gap", 8, 9, 10, 11, 12]);
    // In the middle, both sides collapse.
    expect(pageItems(6, 12)).toEqual([1, "gap", 5, 6, 7, "gap", 12]);
  });

  it("holds a constant width so buttons do not move as you page", () => {
    const widths = new Set<number>();
    for (let page = 1; page <= 12; page++) {
      widths.add(pageItems(page, 12).length);
    }
    expect([...widths]).toEqual([7]);
  });

  it("never emits a page outside the range", () => {
    for (let page = 1; page <= 20; page++) {
      for (const item of pageItems(page, 20)) {
        if (item === "gap") continue;
        expect(item).toBeGreaterThanOrEqual(1);
        expect(item).toBeLessThanOrEqual(20);
      }
    }
  });

  it("never repeats a page", () => {
    for (let page = 1; page <= 20; page++) {
      const numbers = pageItems(page, 20).filter((i): i is number => i !== "gap");
      expect(new Set(numbers).size).toBe(numbers.length);
    }
  });

  it("always keeps the first and last page reachable", () => {
    for (let page = 1; page <= 20; page++) {
      const items = pageItems(page, 20);
      expect(items[0]).toBe(1);
      expect(items.at(-1)).toBe(20);
      expect(items).toContain(page);
    }
  });
});
