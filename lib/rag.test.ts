import { describe, expect, it } from "vitest";
import { chunkText } from "./rag";

describe("chunkText", () => {
  it("returns a single chunk for text under the chunk size", () => {
    expect(chunkText("Plan mensual: $25.000")).toEqual(["Plan mensual: $25.000"]);
  });

  it("returns nothing for blank input", () => {
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("splits long text into overlapping chunks that cover the whole input", () => {
    const paragraph = "El plan mensual cuesta veinticinco mil pesos e incluye soporte. ";
    const text = paragraph.repeat(120);

    const chunks = chunkText(text);

    expect(chunks.length).toBeGreaterThan(1);
    // Overlap means the chunk lengths sum to more than the source, but every
    // chunk still has to fit the window.
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(1200);
    expect(chunks.join(" ")).toContain("veinticinco mil pesos");
  });

  it("terminates on text with no sentence or paragraph breaks", () => {
    // A minified JSON blob has no break the splitter can prefer; it must fall
    // back to a hard cut instead of looping on the same cursor.
    const text = "a".repeat(5000);
    const chunks = chunkText(text, { size: 100, overlap: 20 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true);
  });

  it("never emits an empty chunk", () => {
    const chunks = chunkText("línea\n\n\n\notra línea\n\n".repeat(200), { size: 200, overlap: 50 });
    expect(chunks.every((chunk) => chunk.trim().length > 0)).toBe(true);
  });
});
