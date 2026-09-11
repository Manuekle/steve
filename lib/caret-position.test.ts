import { describe, it, expect } from "vitest";
import { getTextareaCaretPoint } from "./caret-position";

describe("getTextareaCaretPoint", () => {
  it("returns fallback coordinates when element is null or undefined or in node environment", () => {
    // @ts-expect-error testing null
    const result = getTextareaCaretPoint(null, 0);
    expect(result).toEqual({ top: 0, left: 0, lineHeight: 20 });
  });
});
