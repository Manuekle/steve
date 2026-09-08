import { describe, expect, it } from "vitest";
import {
  composePrompt,
  emptyBrief,
  isBriefEmpty,
  normalizeBrief,
  readiness,
  shouldRecompose,
} from "./agent-brief";

describe("normalizeBrief", () => {
  it("fills in everything a partial patch left out", () => {
    const brief = normalizeBrief({ role: "Recepcionista" });
    expect(brief.role).toBe("Recepcionista");
    expect(brief.goal).toBe("");
    expect(brief.language).toBe("auto");
    expect(brief.rules).toEqual([]);
  });

  it("drops blank and non-string list entries rather than composing them", () => {
    const brief = normalizeBrief({
      rules: ["  confirmar el teléfono ", "", "   ", 7 as unknown as string],
    });
    expect(brief.rules).toEqual(["confirmar el teléfono"]);
  });

  it("keeps a hand-edited prompt flagged across a patch", () => {
    expect(normalizeBrief({ promptCustomized: true }).promptCustomized).toBe(true);
    // Absent means "not customized" — never a stray `false` that reads as a
    // decision somebody made.
    expect("promptCustomized" in normalizeBrief({ role: "x" })).toBe(false);
  });
});

describe("composePrompt", () => {
  it("returns nothing for a brief nobody has filled in", () => {
    expect(composePrompt(emptyBrief())).toBe("");
    expect(isBriefEmpty(emptyBrief())).toBe(true);
  });

  it("writes each answered field as its own line, and skips the rest", () => {
    const prompt = composePrompt(
      normalizeBrief({
        role: "Recepcionista de la clínica",
        goal: "Que el paciente se vaya con un turno",
        rules: ["Confirmá nombre y teléfono"],
        avoid: ["Nunca des un diagnóstico"],
        handoff: "Si piden un reintegro",
      }),
    );
    expect(prompt).toContain("**Rol:** Recepcionista de la clínica");
    expect(prompt).toContain("- Confirmá nombre y teléfono");
    expect(prompt).toContain("- Nunca des un diagnóstico");
    expect(prompt).toContain("Si piden un reintegro");
    // Nothing was said about the audience, so nothing is claimed about it.
    expect(prompt).not.toContain("Con quién hablás");
  });

  it("says which language to answer in, or to mirror the customer", () => {
    const auto = composePrompt(normalizeBrief({ role: "x", language: "auto" }));
    expect(auto).toContain("el idioma en el que te escriben");
    const fixed = composePrompt(normalizeBrief({ role: "x", language: "en" }));
    expect(fixed).toContain("inglés");
  });

  it("writes in English when the builder is in English", () => {
    const prompt = composePrompt(normalizeBrief({ role: "Clinic receptionist" }), { locale: "en" });
    expect(prompt).toContain("**Role:** Clinic receptionist");
    expect(prompt).toContain("Always answer in the language the customer writes in.");
  });
});

describe("shouldRecompose", () => {
  it("stops rewriting a prompt somebody took over by hand", () => {
    expect(shouldRecompose(emptyBrief())).toBe(true);
    expect(shouldRecompose(normalizeBrief({ promptCustomized: true }))).toBe(false);
  });
});

describe("readiness", () => {
  const full = {
    name: "Recepción",
    description: "Atiende turnos",
    systemPrompt: "x".repeat(60),
    tools: ["calendar"],
    brief: normalizeBrief({ role: "Recepcionista", goal: "Agendar" }),
  };

  it("is not ready while a required check is open", () => {
    const state = readiness({
      agent: { ...full, tools: [] },
      channelAssigned: true,
      knowledgeDocuments: 3,
    });
    expect(state.ready).toBe(false);
    expect(state.checks.find((check) => check.id === "capabilities")?.done).toBe(false);
  });

  it("is ready with every required check done, even with the optional ones open", () => {
    const state = readiness({ agent: full, channelAssigned: false, knowledgeDocuments: 0 });
    expect(state.ready).toBe(true);
    // ...and says so honestly: the score still counts what is missing.
    expect(state.score).toBeLessThan(100);
  });

  it("scores a fully set-up agent at 100", () => {
    const state = readiness({ agent: full, channelAssigned: true, knowledgeDocuments: 2 });
    expect(state.score).toBe(100);
  });

  it("treats a two-line prompt as not written yet", () => {
    const state = readiness({
      agent: { ...full, systemPrompt: "Atendé bien" },
      channelAssigned: true,
      knowledgeDocuments: 1,
    });
    expect(state.checks.find((check) => check.id === "prompt")?.done).toBe(false);
  });
});
