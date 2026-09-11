import { describe, expect, it } from "vitest";
import { es } from "./dictionary-es";
import { en } from "./dictionary-en";

// The two dictionaries have to stay the same shape.
//
// Nothing enforced that before this file, and the failure is quiet in exactly
// the wrong way: `t()` falls back to the *key* when a line is missing, so a
// screen shipped without its English half renders `numbers.fieldAgentHint`
// under a form field and every automated check still passes. Nobody sees it
// until somebody switches the language.
//
// Adding a key to one file and forgetting the other is a one-line mistake that
// takes a release to notice, which is precisely the thing a test is for.

const esKeys = Object.keys(es).sort();
const enKeys = Object.keys(en).sort();

/** `{name}` placeholders a template will interpolate. Same set on both sides
 *  or one language silently drops a value. */
function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

describe("dictionary parity", () => {
  it("has the same keys in both languages", () => {
    const missingInEn = esKeys.filter((key) => !(key in en));
    const missingInEs = enKeys.filter((key) => !(key in es));
    expect(missingInEn, "keys present in es but missing in en").toEqual([]);
    expect(missingInEs, "keys present in en but missing in es").toEqual([]);
  });

  it("has no empty translations", () => {
    // An empty string is worse than a missing key: `t()` returns it happily and
    // the label just vanishes.
    for (const [key, value] of Object.entries(es)) {
      expect(value.trim(), `es.${key} is empty`).not.toBe("");
    }
    for (const [key, value] of Object.entries(en)) {
      expect(value.trim(), `en.${key} is empty`).not.toBe("");
    }
  });

  it("interpolates the same placeholders in both languages", () => {
    for (const key of esKeys) {
      const english = en[key];
      if (!english) continue;
      expect(placeholders(english), `${key} placeholders differ`).toEqual(
        placeholders(es[key]),
      );
    }
  });

  it("covers every surface added alongside the runtime work", () => {
    // A spot check with teeth: these are the four screens that shipped without
    // any dictionary entries at all, and the prefixes are what a reviewer would
    // grep for.
    for (const prefix of ["runtime.", "stack.", "numbers.", "skills.", "mcp."]) {
      const count = esKeys.filter((key) => key.startsWith(prefix)).length;
      expect(count, `no ${prefix}* keys`).toBeGreaterThan(5);
    }
  });
});
