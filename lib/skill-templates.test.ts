import { describe, expect, it } from "vitest";
import { slugifySkill } from "./skill-store";
import {
  countPlaceholders,
  getSkillTemplate,
  SKILL_TEMPLATES,
  TEMPLATE_PLACEHOLDER,
  templateContent,
} from "./skill-templates";
import type { Locale } from "./i18n/dictionaries";

const LOCALES: readonly Locale[] = ["es", "en"];

describe("slugifySkill", () => {
  it("folds accents instead of dropping them", () => {
    // Eve places a skill package at $HOME/.agents/skills/<slug>/, so the slug
    // has to be ASCII — but dropping the accent gives `atenci-n-al-cliente`,
    // which nobody can read in a log.
    expect(slugifySkill("Atención al cliente")).toBe("atencion-al-cliente");
    expect(slugifySkill("Devoluciones")).toBe("devoluciones");
    expect(slugifySkill("Objeción de precio")).toBe("objecion-de-precio");
  });

  it("never returns an empty slug", () => {
    expect(slugifySkill("")).toBe("skill");
    expect(slugifySkill("¿?¡!")).toBe("skill");
  });

  it("bounds the length so it stays a usable directory name", () => {
    expect(slugifySkill("a".repeat(200)).length).toBeLessThanOrEqual(48);
  });
});

describe("skill templates", () => {
  it("ships every template in both languages", () => {
    // An English reader who picks a template and gets a Spanish body has to
    // rewrite it rather than fill it in — which is the opposite of what a
    // starting point is for.
    for (const template of SKILL_TEMPLATES) {
      for (const locale of LOCALES) {
        const content = templateContent(template, locale);
        expect(content.name.trim(), `${template.id}/${locale}`).not.toBe("");
        expect(content.summary.trim(), `${template.id}/${locale}`).not.toBe("");
        expect(content.markdown.trim(), `${template.id}/${locale}`).not.toBe("");
      }
    }
  });

  it("does not serve the same body for both languages", () => {
    for (const template of SKILL_TEMPLATES) {
      expect(template.es.markdown, template.id).not.toBe(template.en.markdown);
      expect(template.es.name, template.id).not.toBe(template.en.name);
    }
  });

  it("every template carries the three things a skill needs to route", () => {
    for (const template of SKILL_TEMPLATES) {
      for (const locale of LOCALES) {
        const content = templateContent(template, locale);
        // The description is what eve advertises on every turn and routes on.
        // An empty one is a skill the model can never decide to load.
        expect(content.description.trim().length, `${template.id}/${locale}`).toBeGreaterThan(20);
        expect(content.markdown, `${template.id}/${locale}`).toMatch(/## (Cuándo usarla|When to use it)/);
      }
    }
  });

  it("each template says when NOT to use it, or names the hard limits", () => {
    // The section people never write, and the one that stops a skill from
    // firing on every message.
    for (const template of SKILL_TEMPLATES) {
      for (const locale of LOCALES) {
        const markdown = templateContent(template, locale).markdown;
        const guards =
          /## (Cuándo NO usarla|When NOT to use it)/.test(markdown) ||
          /## (Qué nunca hacemos|What we never do)/.test(markdown) ||
          /## (Reglas duras|Hard rules)/.test(markdown);
        expect(guards, `${template.id}/${locale} has no guard section`).toBe(true);
      }
    }
  });

  it("every template has blanks for the owner to fill", () => {
    // A template with nothing marked would read as finished, and its invented
    // policy would go straight to a customer.
    for (const template of SKILL_TEMPLATES) {
      for (const locale of LOCALES) {
        const markdown = templateContent(template, locale).markdown;
        expect(countPlaceholders(markdown), `${template.id}/${locale}`).toBeGreaterThan(0);
      }
    }
  });

  it("has unique ids", () => {
    const ids = SKILL_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("looks a template up by id", () => {
    expect(templateContent(getSkillTemplate("objecion-precio")!, "es").name).toBe(
      "Objeción de precio",
    );
    expect(templateContent(getSkillTemplate("objecion-precio")!, "en").name).toBe(
      "Price objection",
    );
    expect(getSkillTemplate("nope")).toBeUndefined();
  });
});

describe("countPlaceholders", () => {
  it("counts what is still unfilled", () => {
    expect(countPlaceholders("nada que completar")).toBe(0);
    expect(countPlaceholders(`el plazo es ${TEMPLATE_PLACEHOLDER}`)).toBe(1);
    expect(countPlaceholders(`${TEMPLATE_PLACEHOLDER} y ${TEMPLATE_PLACEHOLDER}`)).toBe(2);
  });
});
