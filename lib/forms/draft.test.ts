import { describe, it, expect } from "vitest";
import {
  addChoice,
  addField,
  addStep,
  conditionSources,
  conditionsHold,
  draftChanged,
  duplicateStep,
  moveChoice,
  moveField,
  moveStep,
  newField,
  removeChoice,
  removeField,
  removeStep,
  reorderChoices,
  reorderFields,
  updateChoice,
  updateField,
  updateStep,
} from "./draft";
import type { FormStep } from "@/lib/types";

/** Two questions on step one, a gated step two, a contact step three — the
 *  shape every template in the app ends up with. */
function steps(): readonly FormStep[] {
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
            { id: "ch-google", label: "Google", points: 12 },
          ],
        },
      ],
    },
    {
      id: "st-2",
      title: "When?",
      showIf: { fieldId: "fd-source", equals: ["ch-fb", "ch-google"] },
      fields: [
        {
          id: "fd-when",
          type: "single_choice",
          label: "When do you need it?",
          required: true,
          choices: [{ id: "ch-now", label: "This week", points: 12 }],
        },
      ],
    },
    {
      id: "st-3",
      title: "Contact",
      fields: [
        { id: "fd-name", type: "text", label: "Your name", required: true, maps: "name" },
        { id: "fd-email", type: "email", label: "Your email", required: true, maps: "email" },
      ],
    },
  ];
}

describe("steps", () => {
  it("adds a step at the end by default and in place when given an index", () => {
    expect(addStep(steps())).toHaveLength(4);
    expect(addStep(steps(), 1)[1].fields).toHaveLength(1);
    expect(addStep(steps(), 1)[2].id).toBe("st-2");
  });

  it("patches only the named step", () => {
    const next = updateStep(steps(), "st-2", { title: "Timing" });
    expect(next[1].title).toBe("Timing");
    expect(next[0].title).toBe("Where from?");
  });

  it("drops conditions that pointed at a deleted step's questions", () => {
    const next = removeStep(steps(), "st-1");
    expect(next).toHaveLength(2);
    expect(next[0].showIf).toBeUndefined();
  });

  it("moves a step and refuses a move that would outrun its condition", () => {
    // st-3 up one is fine: nothing depends on it.
    expect(moveStep(steps(), "st-3", -1).map((s) => s.id)).toEqual(["st-1", "st-3", "st-2"]);
    // st-2 up one would place it ahead of the question that gates it.
    expect(moveStep(steps(), "st-2", -1).map((s) => s.id)).toEqual(["st-1", "st-2", "st-3"]);
  });

  it("ignores a move off either end", () => {
    expect(moveStep(steps(), "st-1", -1).map((s) => s.id)).toEqual(["st-1", "st-2", "st-3"]);
    expect(moveStep(steps(), "st-3", 1).map((s) => s.id)).toEqual(["st-1", "st-2", "st-3"]);
  });

  it("duplicates a step with fresh ids", () => {
    const next = duplicateStep(steps(), "st-1");
    expect(next).toHaveLength(4);
    expect(next[1].id).not.toBe("st-1");
    expect(next[1].fields[0].id).not.toBe("fd-source");
    expect(next[1].fields[0].choices?.[0].id).not.toBe("ch-none");
    expect(next[1].fields[0].choices).toHaveLength(3);
  });
});

describe("fields", () => {
  it("adds a choice question already holding options", () => {
    const next = addField(steps(), "st-3", "multi_choice");
    const added = next[2].fields[2];
    expect(added.type).toBe("multi_choice");
    expect(added.choices).toHaveLength(2);
  });

  it("brings options along when a typed question becomes a choice one", () => {
    const next = updateField(steps(), "fd-name", { type: "single_choice" });
    expect(next[2].fields[0].choices).toHaveLength(2);
    // A choice question can't fill a contact field, so the mapping goes.
    expect(next[2].fields[0].maps).toBeUndefined();
  });

  it("drops options and dependent conditions when a choice question becomes typed", () => {
    const next = updateField(steps(), "fd-source", { type: "text" });
    expect(next[0].fields[0].choices).toBeUndefined();
    expect(next[1].showIf).toBeUndefined();
  });

  it("removes a question and prunes what depended on it", () => {
    const next = removeField(steps(), "fd-source");
    // Its step held nothing else, so the step goes with it.
    expect(next.map((s) => s.id)).toEqual(["st-2", "st-3"]);
    expect(next[0].showIf).toBeUndefined();
  });

  it("keeps a step alive when it has other questions", () => {
    const next = removeField(steps(), "fd-name");
    expect(next[2].fields.map((f) => f.id)).toEqual(["fd-email"]);
  });

  it("reorders questions inside one step only", () => {
    const next = moveField(steps(), "st-3", "fd-email", -1);
    expect(next[2].fields.map((f) => f.id)).toEqual(["fd-email", "fd-name"]);
    expect(moveField(steps(), "st-3", "fd-name", -1)[2].fields.map((f) => f.id)).toEqual([
      "fd-name",
      "fd-email",
    ]);
  });
});

describe("choices", () => {
  it("adds and patches options", () => {
    expect(addChoice(steps(), "fd-source")[0].fields[0].choices).toHaveLength(4);
    const next = updateChoice(steps(), "fd-source", "ch-fb", { points: 20 });
    expect(next[0].fields[0].choices?.[1].points).toBe(20);
  });

  it("removes an option and takes it out of conditions reading it", () => {
    const next = removeChoice(steps(), "fd-source", "ch-fb");
    expect(next[0].fields[0].choices).toHaveLength(2);
    expect(next[1].showIf?.equals).toEqual(["ch-google"]);
  });

  it("drops a condition once its last matching option is gone", () => {
    let next = removeChoice(steps(), "fd-source", "ch-fb");
    next = removeChoice(next, "fd-source", "ch-google");
    expect(next[1].showIf).toBeUndefined();
  });

  it("refuses to remove the only option left", () => {
    const next = removeChoice(steps(), "fd-when", "ch-now");
    expect(next[1].fields[0].choices).toHaveLength(1);
  });

  it("reorders options", () => {
    const next = moveChoice(steps(), "fd-source", "ch-google", -1);
    expect(next[0].fields[0].choices?.map((c) => c.id)).toEqual(["ch-none", "ch-google", "ch-fb"]);
  });
});

describe("conditions", () => {
  it("offers only choice questions asked earlier", () => {
    expect(conditionSources(steps(), 0)).toHaveLength(0);
    expect(conditionSources(steps(), 1).map((f) => f.id)).toEqual(["fd-source"]);
    // fd-name and fd-email are typed, so they can't gate anything.
    expect(conditionSources(steps(), 2).map((f) => f.id)).toEqual(["fd-source", "fd-when"]);
  });

  it("reports a forward-pointing condition", () => {
    expect(conditionsHold(steps())).toBe(true);
    const broken = [steps()[1], steps()[0], steps()[2]];
    expect(conditionsHold(broken)).toBe(false);
  });
});

describe("draftChanged", () => {
  const base = {
    name: "A",
    description: "",
    steps: steps(),
    scoring: { hot: 20, warm: 10 },
    thankYou: undefined,
  };

  it("compares by value, so an edit that undid itself is not a change", () => {
    expect(draftChanged(base, { ...base, steps: steps() })).toBe(false);
    expect(draftChanged(base, { ...base, name: "B" })).toBe(true);
  });
});

describe("newField", () => {
  it("gives choice types options and typed ones none", () => {
    expect(newField("single_choice").choices).toHaveLength(2);
    expect(newField("email").choices).toBeUndefined();
  });
});

describe("reorder", () => {
  it("puts a field's options in the given order", () => {
    const next = reorderChoices(steps(), "fd-source", ["ch-google", "ch-none", "ch-fb"]);
    expect(next[0].fields[0].choices?.map((c) => c.id)).toEqual([
      "ch-google",
      "ch-none",
      "ch-fb",
    ]);
  });

  it("keeps options the caller forgot, and ignores ids that name nothing", () => {
    // What a drag that raced an edit hands back: a stale list.
    const next = reorderChoices(steps(), "fd-source", ["ch-fb", "ch-ghost"]);
    expect(next[0].fields[0].choices?.map((c) => c.id)).toEqual([
      "ch-fb",
      "ch-none",
      "ch-google",
    ]);
  });

  it("reorders questions inside one step and leaves the others alone", () => {
    const next = reorderFields(steps(), "st-3", ["fd-email", "fd-name"]);
    expect(next[2].fields.map((f) => f.id)).toEqual(["fd-email", "fd-name"]);
    expect(next[0].fields.map((f) => f.id)).toEqual(["fd-source"]);
  });

  it("ignores a step id that isn't there", () => {
    const next = reorderFields(steps(), "st-ghost", ["fd-email"]);
    expect(next.map((s) => s.id)).toEqual(["st-1", "st-2", "st-3"]);
  });
});
