// What a form's structure is allowed to be.
//
// `PATCH /api/forms/[id]` has always accepted `steps` and `scoring` straight
// off the wire, which was fine while nothing but a seeded template could write
// them. The builder changes that: the shape now comes from a screen someone is
// editing live, so a half-finished step, a duplicated id or a threshold pair
// that makes "warm" unreachable can all reach the store — and from there the
// public page, which renders whatever it is handed.
//
// So the rules live here once, and both ends use them: the route refuses a bad
// payload, and the builder shows the same problems next to the field that
// caused them instead of waiting for a save to fail.

import { z } from "zod";
import type { Form, FormScoring, FormStep } from "@/lib/types";

// Ceilings, not opinions. Nothing here is a limit anyone drafting a real form
// will meet; they exist so a malformed or hostile payload can't turn into a
// page that takes a second to render.
const MAX_STEPS = 40;
const MAX_FIELDS_PER_STEP = 20;
const MAX_CHOICES = 40;
const MAX_LABEL = 300;
const MAX_TEXT = 2000;

/** Optional prose. A field someone typed into and then cleared arrives as "",
 *  which is not the same as absent to anything rendering it: the public page
 *  falls back to the form's name only when a step has *no* title, so an empty
 *  one is a blank heading. Normalizing here means neither the builder nor the
 *  renderer has to remember that. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === "" ? undefined : value));

const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "An id may only hold letters, digits, hyphens and underscores.");

// Labels are checked for emptiness in `structuralIssues`, not here: a blank
// one is the most ordinary state a half-written form is in, and it deserves
// "write the question" rather than zod's "expected string to have >=1
// characters" under a path nobody can read.
const choiceSchema = z.object({
  id: idSchema,
  label: z.string().trim().max(MAX_LABEL),
  emoji: optionalText(16),
  // `points` is deliberately signed: a disqualifying answer ("just browsing")
  // is worth asking about and can legitimately cost the lead points.
  points: z.number().int().min(-1000).max(1000),
});

const fieldSchema = z.object({
  id: idSchema,
  type: z.enum(["single_choice", "multi_choice", "text", "long_text", "email", "phone"]),
  label: z.string().trim().max(MAX_LABEL),
  help: optionalText(MAX_TEXT),
  required: z.boolean(),
  placeholder: optionalText(MAX_LABEL),
  choices: z.array(choiceSchema).max(MAX_CHOICES).optional(),
  maps: z.enum(["name", "email", "phone"]).optional(),
});

const conditionSchema = z.object({
  fieldId: idSchema,
  equals: z.array(idSchema).min(1).max(MAX_CHOICES),
});

const stepSchema = z.object({
  id: idSchema,
  title: optionalText(MAX_LABEL),
  description: optionalText(MAX_TEXT),
  fields: z.array(fieldSchema).min(1).max(MAX_FIELDS_PER_STEP),
  showIf: conditionSchema.optional(),
});

/** The wire shape. Note what is *not* here: `iconSvg`. It is rendered raw on
 *  the public page (`dangerouslySetInnerHTML`), so it stays a seed-data-only
 *  field — nothing arriving over the network can set it, and a payload that
 *  tries is stripped rather than rejected, since a client echoing back a form
 *  it was given shouldn't fail for carrying a key it never touched. */
export const stepsSchema = z.array(stepSchema).min(1).max(MAX_STEPS);

export const scoringSchema = z.object({
  hot: z.number().int().min(0).max(100000),
  warm: z.number().int().min(0).max(100000),
});

export type FormIssue = {
  /** Dot path into the payload, e.g. `steps.1.fields.0.label`. Empty for a
   *  problem that belongs to the form as a whole. */
  readonly path: string;
  /** Key in `lib/i18n/dictionaries.ts` under `forms.builder.issue.*`. */
  readonly code: string;
  /** English fallback, for logs and for anything reading the API raw. */
  readonly message: string;
};

/**
 * The rules zod can't express on its own: uniqueness, and whether a condition
 * points at something a respondent will actually have answered by the time the
 * step is reached.
 */
function structuralIssues(steps: readonly FormStep[]): FormIssue[] {
  const issues: FormIssue[] = [];
  const seenStepIds = new Set<string>();
  const seenFieldIds = new Set<string>();
  /** Choice ids per field, for checking a condition's `equals` list. */
  const choicesByField = new Map<string, Set<string>>();
  /** Which step index each field lives on, so a condition can be checked for
   *  pointing backwards. */
  const stepOfField = new Map<string, number>();

  steps.forEach((step, stepIndex) => {
    if (seenStepIds.has(step.id)) {
      issues.push({
        path: `steps.${stepIndex}.id`,
        code: "duplicateStepId",
        message: `Two steps share the id "${step.id}".`,
      });
    }
    seenStepIds.add(step.id);

    step.fields.forEach((field, fieldIndex) => {
      const at = `steps.${stepIndex}.fields.${fieldIndex}`;
      if (seenFieldIds.has(field.id)) {
        issues.push({
          path: `${at}.id`,
          code: "duplicateFieldId",
          message: `Two questions share the id "${field.id}".`,
        });
      }
      seenFieldIds.add(field.id);
      stepOfField.set(field.id, stepIndex);

      if (field.label.trim() === "") {
        issues.push({
          path: `${at}.label`,
          code: "labelRequired",
          message: "Every question needs a label.",
        });
      }

      const isChoice = field.type === "single_choice" || field.type === "multi_choice";
      if (isChoice) {
        if (!field.choices || field.choices.length === 0) {
          issues.push({
            path: `${at}.choices`,
            code: "choicesRequired",
            message: "A choice question needs at least one option.",
          });
        }
        // A mapped choice question would write a choice id into a contact's
        // name or email. The mapping belongs to typed fields.
        if (field.maps) {
          issues.push({
            path: `${at}.maps`,
            code: "choiceCannotMap",
            message: "A choice question can't fill a contact field.",
          });
        }
      } else if (field.choices && field.choices.length > 0) {
        issues.push({
          path: `${at}.choices`,
          code: "choicesNotAllowed",
          message: "Only choice questions carry options.",
        });
      }

      const seenChoiceIds = new Set<string>();
      field.choices?.forEach((choice, choiceIndex) => {
        if (choice.label.trim() === "") {
          issues.push({
            path: `${at}.choices.${choiceIndex}.label`,
            code: "optionLabelRequired",
            message: "Every option needs a label.",
          });
        }
        if (seenChoiceIds.has(choice.id)) {
          issues.push({
            path: `${at}.choices.${choiceIndex}.id`,
            code: "duplicateChoiceId",
            message: `Two options share the id "${choice.id}".`,
          });
        }
        seenChoiceIds.add(choice.id);
      });
      choicesByField.set(field.id, seenChoiceIds);
    });
  });

  // Conditions last: they can only be judged once every field id is known.
  steps.forEach((step, stepIndex) => {
    const condition = step.showIf;
    if (!condition) return;
    const at = `steps.${stepIndex}.showIf`;
    const source = stepOfField.get(condition.fieldId);
    if (source === undefined) {
      issues.push({
        path: `${at}.fieldId`,
        code: "conditionUnknownField",
        message: `This step depends on a question that doesn't exist ("${condition.fieldId}").`,
      });
      return;
    }
    // Not "earlier or equal": a step gated on one of its own questions can
    // never appear, because the answer arrives after the step is shown.
    if (source >= stepIndex) {
      issues.push({
        path: `${at}.fieldId`,
        code: "conditionNotEarlier",
        message: "A step can only depend on a question asked before it.",
      });
      return;
    }
    const known = choicesByField.get(condition.fieldId);
    if (!known || known.size === 0) {
      issues.push({
        path: `${at}.fieldId`,
        code: "conditionNotChoice",
        message: "A step can only depend on a choice question.",
      });
      return;
    }
    const unknown = condition.equals.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      issues.push({
        path: `${at}.equals`,
        code: "conditionUnknownChoice",
        message: `This condition names options that question no longer has (${unknown.join(", ")}).`,
      });
    }
  });

  return issues;
}

export type StepsResult =
  | { readonly ok: true; readonly steps: readonly FormStep[] }
  | { readonly ok: false; readonly issues: readonly FormIssue[] };

/** Parse and check an incoming step list. Returns the normalized steps —
 *  trimmed, with `iconSvg` and any other unknown key dropped. */
export function parseSteps(input: unknown): StepsResult {
  const parsed = stepsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: ["steps", ...issue.path.map(String)].join("."),
        code: "shape",
        message: issue.message,
      })),
    };
  }
  const steps = parsed.data as readonly FormStep[];
  const issues = structuralIssues(steps);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, steps };
}

export type ScoringResult =
  | { readonly ok: true; readonly scoring: FormScoring }
  | { readonly ok: false; readonly issues: readonly FormIssue[] };

export function parseScoring(input: unknown): ScoringResult {
  const parsed = scoringSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: ["scoring", ...issue.path.map(String)].join("."),
        code: "shape",
        message: issue.message,
      })),
    };
  }
  // `temperatureFor` tests `hot` first, so a hot threshold at or below warm
  // makes "warm" a bucket nothing can ever land in.
  if (parsed.data.hot <= parsed.data.warm) {
    return {
      ok: false,
      issues: [
        {
          path: "scoring.hot",
          code: "hotBelowWarm",
          message: "The hot threshold has to be above the warm one.",
        },
      ],
    };
  }
  return { ok: true, scoring: parsed.data };
}

/** Everything wrong with a draft, for the builder's own save button. Same
 *  rules the route enforces, run against the whole form at once. */
export function validateDraft(draft: Pick<Form, "steps" | "scoring">): readonly FormIssue[] {
  const steps = parseSteps(draft.steps);
  const scoring = parseScoring(draft.scoring);
  return [...(steps.ok ? [] : steps.issues), ...(scoring.ok ? [] : scoring.issues)];
}
