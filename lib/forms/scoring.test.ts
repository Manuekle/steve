import { describe, it, expect } from "vitest";
import {
  answersAsAttributes,
  contactFieldsFrom,
  maxScore,
  qualify,
  scoreAnswers,
  stepIsVisible,
  temperatureFor,
  visibleSteps,
} from "./scoring";
import type { Form, FormAnswer } from "@/lib/types";

const form: Form = {
  id: "fm-1",
  slug: "qualifier",
  name: "Lead qualifier",
  description: "",
  status: "published",
  scoring: { hot: 25, warm: 10 },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  steps: [
    {
      id: "st-1",
      fields: [
        {
          id: "fd-source",
          type: "single_choice",
          label: "Where do your leads come from?",
          required: true,
          choices: [
            { id: "ch-none", label: "No leads yet", points: 0 },
            { id: "ch-fb", label: "Facebook Ads", points: 15 },
            { id: "ch-google", label: "Google Ads", points: 15 },
          ],
        },
      ],
    },
    {
      id: "st-2",
      fields: [
        {
          id: "fd-budget",
          type: "single_choice",
          label: "Monthly budget",
          required: true,
          choices: [
            { id: "ch-low", label: "Under 500", points: 5 },
            { id: "ch-high", label: "Over 5000", points: 15 },
          ],
        },
      ],
    },
    {
      id: "st-3",
      // Only asked of people who already run ads.
      showIf: { fieldId: "fd-source", equals: ["ch-fb", "ch-google"] },
      fields: [
        {
          id: "fd-tools",
          type: "multi_choice",
          label: "What do you already use?",
          required: false,
          choices: [
            { id: "ch-crm", label: "A CRM", points: 5 },
            { id: "ch-sheet", label: "A spreadsheet", points: 2 },
          ],
        },
      ],
    },
    {
      id: "st-4",
      fields: [
        { id: "fd-name", type: "text", label: "Your name", required: true, maps: "name" },
        { id: "fd-email", type: "email", label: "Your email", required: true, maps: "email" },
      ],
    },
  ],
};

describe("scoreAnswers", () => {
  it("adds up the points on the picked choices", () => {
    const answers: FormAnswer[] = [
      { fieldId: "fd-source", value: "ch-fb" },
      { fieldId: "fd-budget", value: "ch-high" },
    ];
    expect(scoreAnswers(form, answers)).toBe(30);
  });

  it("adds every pick on a multi-choice question", () => {
    const answers: FormAnswer[] = [{ fieldId: "fd-tools", value: ["ch-crm", "ch-sheet"] }];
    expect(scoreAnswers(form, answers)).toBe(7);
  });

  it("counts a zero-point choice as answered, not as missing", () => {
    expect(scoreAnswers(form, [{ fieldId: "fd-source", value: "ch-none" }])).toBe(0);
  });

  it("ignores unscored contact fields", () => {
    const answers: FormAnswer[] = [
      { fieldId: "fd-name", value: "Ana" },
      { fieldId: "fd-email", value: "ana@example.com" },
    ];
    expect(scoreAnswers(form, answers)).toBe(0);
  });

  it("ignores answers naming a choice the form no longer has", () => {
    // Editing a form must not silently rescore answers already collected.
    expect(scoreAnswers(form, [{ fieldId: "fd-source", value: "ch-deleted" }])).toBe(0);
  });

  it("ignores answers to a field that no longer exists", () => {
    expect(scoreAnswers(form, [{ fieldId: "fd-gone", value: "whatever" }])).toBe(0);
  });
});

describe("temperatureFor", () => {
  it("treats the thresholds as inclusive", () => {
    expect(temperatureFor(25, form.scoring)).toBe("hot");
    expect(temperatureFor(10, form.scoring)).toBe("warm");
  });

  it("buckets everything under the warm threshold as cold", () => {
    expect(temperatureFor(9, form.scoring)).toBe("cold");
    expect(temperatureFor(0, form.scoring)).toBe("cold");
  });

  it("puts anything over the hot threshold in hot", () => {
    expect(temperatureFor(1000, form.scoring)).toBe("hot");
  });
});

describe("maxScore", () => {
  it("counts one pick per single-choice question and every positive pick on a multi", () => {
    // 15 (source) + 15 (budget) + 5 + 2 (tools, both) = 37.
    expect(maxScore(form)).toBe(37);
  });
});

describe("qualify", () => {
  it("returns the score, the ceiling and the bucket together", () => {
    const result = qualify(form, [
      { fieldId: "fd-source", value: "ch-fb" },
      { fieldId: "fd-budget", value: "ch-low" },
    ]);
    expect(result).toEqual({ score: 20, maxScore: 37, temperature: "warm" });
  });
});

describe("stepIsVisible", () => {
  const condition = { fieldId: "fd-source", equals: ["ch-fb", "ch-google"] };

  it("is visible with no condition", () => {
    expect(stepIsVisible(undefined, [])).toBe(true);
  });

  it("is visible when the answer is one of the listed choices", () => {
    expect(stepIsVisible(condition, [{ fieldId: "fd-source", value: "ch-google" }])).toBe(true);
  });

  it("is hidden when the answer is a different choice", () => {
    expect(stepIsVisible(condition, [{ fieldId: "fd-source", value: "ch-none" }])).toBe(false);
  });

  it("is hidden while the question it depends on is unanswered", () => {
    expect(stepIsVisible(condition, [])).toBe(false);
    expect(stepIsVisible(condition, [{ fieldId: "fd-source", value: [] }])).toBe(false);
  });

  it("matches when any pick on a multi-choice answer is listed", () => {
    expect(stepIsVisible(condition, [{ fieldId: "fd-source", value: ["ch-none", "ch-fb"] }])).toBe(true);
  });
});

describe("visibleSteps", () => {
  it("drops the conditional step for someone who has no leads yet", () => {
    const steps = visibleSteps(form, [{ fieldId: "fd-source", value: "ch-none" }]);
    expect(steps.map((s) => s.id)).toEqual(["st-1", "st-2", "st-4"]);
  });

  it("keeps it for someone who runs ads", () => {
    const steps = visibleSteps(form, [{ fieldId: "fd-source", value: "ch-fb" }]);
    expect(steps.map((s) => s.id)).toEqual(["st-1", "st-2", "st-3", "st-4"]);
  });
});

describe("contactFieldsFrom", () => {
  it("picks up only the mapped questions", () => {
    const fields = contactFieldsFrom(form, [
      { fieldId: "fd-name", value: "  Ana  " },
      { fieldId: "fd-email", value: "ana@example.com" },
      { fieldId: "fd-source", value: "ch-fb" },
    ]);
    expect(fields).toEqual({ name: "Ana", email: "ana@example.com" });
  });

  it("skips blank answers", () => {
    expect(contactFieldsFrom(form, [{ fieldId: "fd-name", value: "   " }])).toEqual({});
  });
});

describe("answersAsAttributes", () => {
  it("keys by question label and resolves choice ids to their labels", () => {
    const attributes = answersAsAttributes(form, [
      { fieldId: "fd-source", value: "ch-fb" },
      { fieldId: "fd-tools", value: ["ch-crm", "ch-sheet"] },
      { fieldId: "fd-name", value: "Ana" },
    ]);
    expect(attributes).toEqual({
      "Where do your leads come from?": "Facebook Ads",
      "What do you already use?": "A CRM, A spreadsheet",
      "Your name": "Ana",
    });
  });

  it("leaves out fields the form no longer has", () => {
    expect(answersAsAttributes(form, [{ fieldId: "fd-gone", value: "x" }])).toEqual({});
  });
});
