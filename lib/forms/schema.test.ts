import { describe, it, expect } from "vitest";
import { parseScoring, parseSteps, validateDraft } from "./schema";
import type { FormField, FormStep } from "@/lib/types";

function ok(): FormStep[] {
  return [
    {
      id: "st-1",
      title: "Where from?",
      fields: [
        {
          id: "fd-source",
          type: "single_choice",
          label: "Where do your leads come from?",
          required: true,
          choices: [
            { id: "ch-none", label: "No leads yet", points: 0 },
            { id: "ch-fb", label: "Facebook", points: 12 },
          ],
        },
      ],
    },
    {
      id: "st-2",
      showIf: { fieldId: "fd-source", equals: ["ch-fb"] },
      fields: [{ id: "fd-name", type: "text", label: "Your name", required: true, maps: "name" }],
    },
  ];
}

/** Swap the first question of one step. `FormStep.fields` is readonly, so a
 *  fixture is corrupted by rebuilding it rather than by writing into it. */
function withField(steps: FormStep[], stepIndex: number, patch: Partial<FormField>): FormStep[] {
  const next = [...steps];
  const step = next[stepIndex];
  next[stepIndex] = {
    ...step,
    fields: [{ ...step.fields[0], ...patch }, ...step.fields.slice(1)],
  };
  return next;
}

/** The codes a bad payload produced, for asserting without pinning wording. */
function codes(input: unknown): string[] {
  const result = parseSteps(input);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe("parseSteps", () => {
  it("accepts a well-formed list", () => {
    const result = parseSteps(ok());
    expect(result.ok).toBe(true);
  });

  it("rejects an empty list and a non-array", () => {
    expect(parseSteps([]).ok).toBe(false);
    expect(parseSteps("steps").ok).toBe(false);
    expect(parseSteps(undefined).ok).toBe(false);
  });

  it("rejects a step with no questions", () => {
    const noFields = ok();
    noFields[0] = { ...noFields[0], fields: [] };
    expect(parseSteps(noFields).ok).toBe(false);
  });

  it("names a blank label rather than leaving it to a shape error", () => {
    expect(codes(withField(ok(), 0, { label: "   " }))).toEqual(["labelRequired"]);
    const blankOption = withField(ok(), 0, {
      choices: [
        { id: "ch-none", label: "", points: 0 },
        { id: "ch-fb", label: "Facebook", points: 12 },
      ],
    });
    expect(codes(blankOption)).toEqual(["optionLabelRequired"]);
  });

  it("catches duplicate ids at every level", () => {
    const dupStep = [...ok(), { ...ok()[0], id: "st-1" }];
    expect(codes(dupStep)).toContain("duplicateStepId");

    expect(codes(withField(ok(), 1, { id: "fd-source" }))).toContain("duplicateFieldId");

    const dupChoice = withField(ok(), 0, {
      choices: [
        { id: "ch-fb", label: "A", points: 0 },
        { id: "ch-fb", label: "B", points: 1 },
      ],
    });
    expect(codes(dupChoice)).toContain("duplicateChoiceId");
  });

  it("requires options on a choice question and forbids them elsewhere", () => {
    expect(codes(withField(ok(), 0, { choices: [] }))).toContain("choicesRequired");

    const stray = withField(ok(), 1, { choices: [{ id: "ch-a", label: "A", points: 0 }] });
    expect(codes(stray)).toContain("choicesNotAllowed");
  });

  it("refuses to map a choice question onto a contact field", () => {
    expect(codes(withField(ok(), 0, { maps: "name" }))).toContain("choiceCannotMap");
  });

  it("rejects a condition that points nowhere, forward, or at a typed question", () => {
    const missing = ok();
    missing[1] = { ...missing[1], showIf: { fieldId: "fd-ghost", equals: ["ch-fb"] } };
    expect(codes(missing)).toContain("conditionUnknownField");

    const forward = [ok()[1], ok()[0]];
    expect(codes(forward)).toContain("conditionNotEarlier");

    const typed = ok();
    typed.push({
      id: "st-3",
      showIf: { fieldId: "fd-name", equals: ["ch-fb"] },
      fields: [{ id: "fd-note", type: "text", label: "Note", required: false }],
    });
    expect(codes(typed)).toContain("conditionNotChoice");
  });

  it("rejects a condition naming an option the question no longer has", () => {
    const stale = ok();
    stale[1] = { ...stale[1], showIf: { fieldId: "fd-source", equals: ["ch-gone"] } };
    expect(codes(stale)).toContain("conditionUnknownChoice");
  });

  it("strips iconSvg, which is seed data and never arrives over the wire", () => {
    const injected = withField(ok(), 0, {
      choices: [
        { id: "ch-none", label: "No leads yet", points: 0 },
        { id: "ch-fb", label: "Facebook", points: 12, iconSvg: "<svg onload=\"alert(1)\"></svg>" },
      ],
    });
    const result = parseSteps(injected);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps[0].fields[0].choices?.[1]).not.toHaveProperty("iconSvg");
  });

  it("drops optional text that was typed into and then cleared", () => {
    const cleared = ok();
    cleared[0] = { ...cleared[0], title: "  ", description: "" };
    const result = parseSteps(cleared);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Not "": the public page falls back to the form name only when a step
    // has no title at all, so an empty one renders as a blank heading.
    expect(result.steps[0].title).toBeUndefined();
    expect(result.steps[0].description).toBeUndefined();
  });

  it("trims the text it keeps", () => {
    const result = parseSteps(withField(ok(), 0, { label: "  Padded  " }));
    expect(result.ok && result.steps[0].fields[0].label).toBe("Padded");
  });
});

describe("parseScoring", () => {
  it("accepts thresholds in order", () => {
    expect(parseScoring({ hot: 25, warm: 10 }).ok).toBe(true);
  });

  it("rejects a hot threshold at or below warm, which makes warm unreachable", () => {
    const result = parseScoring({ hot: 10, warm: 10 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].code).toBe("hotBelowWarm");
    expect(parseScoring({ hot: 5, warm: 10 }).ok).toBe(false);
  });

  it("rejects negatives and fractions", () => {
    expect(parseScoring({ hot: 25, warm: -1 }).ok).toBe(false);
    expect(parseScoring({ hot: 25.5, warm: 10 }).ok).toBe(false);
  });
});

describe("validateDraft", () => {
  it("reports steps and scoring problems together", () => {
    const issues = validateDraft({ steps: [], scoring: { hot: 1, warm: 5 } });
    expect(issues.map((i) => i.code)).toContain("hotBelowWarm");
    expect(issues.length).toBeGreaterThan(1);
  });

  it("says nothing about a valid draft", () => {
    expect(validateDraft({ steps: ok(), scoring: { hot: 20, warm: 8 } })).toHaveLength(0);
  });
});
