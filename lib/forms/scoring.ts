// What a form's answers are worth.
//
// Deliberately pure and deliberately boring: given a form and a set of
// answers, it returns a number and a temperature, with no clock, no store and
// no network in the way. Qualification is the one part of this feature an
// operator has to be able to argue with — "why was this lead cold?" needs an
// answer better than "the model said so" — so the rule is arithmetic they can
// read off the builder screen.

import type {
  Form,
  FormAnswer,
  FormCondition,
  FormField,
  FormStep,
  LeadTemperature,
} from "@/lib/types";

/** The answers as a map, which is how every function below wants them. */
function byField(answers: readonly FormAnswer[]): Map<string, readonly string[]> {
  const map = new Map<string, readonly string[]>();
  for (const answer of answers) {
    map.set(answer.fieldId, Array.isArray(answer.value) ? answer.value : [answer.value as string]);
  }
  return map;
}

/** Every field in the form, flattened, so a lookup doesn't care which step a
 *  question lives on. */
export function allFields(form: Form): readonly FormField[] {
  return form.steps.flatMap((step) => step.fields);
}

/**
 * Whether a step's condition is met by the answers so far. A condition on a
 * question that hasn't been reached yet is not met — the step stays hidden
 * rather than appearing on the strength of a blank.
 */
export function stepIsVisible(
  condition: FormCondition | undefined,
  answers: readonly FormAnswer[],
): boolean {
  if (!condition) return true;
  const given = byField(answers).get(condition.fieldId);
  if (!given || given.length === 0) return false;
  return given.some((value) => condition.equals.includes(value));
}

/** The steps this particular respondent should see, in order. */
export function visibleSteps(form: Form, answers: readonly FormAnswer[]): readonly FormStep[] {
  return form.steps.filter((step) => stepIsVisible(step.showIf, answers));
}

/**
 * The score: the points on every choice the respondent picked, added up.
 * Unscored fields (a name, an email) contribute nothing — they say who the
 * lead is, not how good it is. An answer naming a choice the form no longer
 * has is ignored rather than counted as zero, so editing a form doesn't
 * silently rewrite the scores of answers already collected.
 */
export function scoreAnswers(form: Form, answers: readonly FormAnswer[]): number {
  const fields = new Map(allFields(form).map((field) => [field.id, field]));
  let total = 0;
  for (const answer of answers) {
    const field = fields.get(answer.fieldId);
    if (!field?.choices) continue;
    const picked = Array.isArray(answer.value) ? answer.value : [answer.value as string];
    for (const choiceId of picked) {
      const choice = field.choices.find((c) => c.id === choiceId);
      if (choice) total += choice.points;
    }
  }
  return total;
}

/** Which bucket a score falls in. Thresholds are inclusive. */
export function temperatureFor(score: number, scoring: Form["scoring"]): LeadTemperature {
  if (score >= scoring.hot) return "hot";
  if (score >= scoring.warm) return "warm";
  return "cold";
}

/** The highest score this form can produce, for showing a result as a share
 *  of what was on offer rather than as a bare number. */
export function maxScore(form: Form): number {
  return allFields(form).reduce((total, field) => {
    if (!field.choices || field.choices.length === 0) return total;
    const points = field.choices.map((choice) => choice.points);
    // One pick on a single-choice question, all of them on a multi.
    return total + (field.type === "multi_choice"
      ? points.filter((p) => p > 0).reduce((a, b) => a + b, 0)
      : Math.max(...points));
  }, 0);
}

export type Qualification = {
  readonly score: number;
  readonly maxScore: number;
  readonly temperature: LeadTemperature;
};

export function qualify(form: Form, answers: readonly FormAnswer[]): Qualification {
  const score = scoreAnswers(form, answers);
  return { score, maxScore: maxScore(form), temperature: temperatureFor(score, form.scoring) };
}

/**
 * The contact fields an answer set carries. Only the mapped questions —
 * everything else goes to `attributes`, where it is readable but not pretending
 * to be identity.
 */
export function contactFieldsFrom(
  form: Form,
  answers: readonly FormAnswer[],
): { name?: string; email?: string; phone?: string } {
  const fields = new Map(allFields(form).map((field) => [field.id, field]));
  const out: { name?: string; email?: string; phone?: string } = {};
  for (const answer of answers) {
    const mapping = fields.get(answer.fieldId)?.maps;
    if (!mapping) continue;
    const value = (Array.isArray(answer.value) ? answer.value[0] : answer.value)?.trim();
    if (value) out[mapping] = value;
  }
  return out;
}

/**
 * The answers as labelled text, for `Contact.attributes` and for anything that
 * has to show a response without the form next to it. Choice ids are resolved
 * to their labels: `"src-fb"` in a CRM export helps nobody.
 */
export function answersAsAttributes(
  form: Form,
  answers: readonly FormAnswer[],
): Record<string, string> {
  const fields = new Map(allFields(form).map((field) => [field.id, field]));
  const out: Record<string, string> = {};
  for (const answer of answers) {
    const field = fields.get(answer.fieldId);
    if (!field) continue;
    const picked = Array.isArray(answer.value) ? answer.value : [answer.value as string];
    const text = field.choices
      ? picked
          .map((id) => field.choices?.find((c) => c.id === id)?.label ?? id)
          .filter(Boolean)
          .join(", ")
      : picked.join(", ");
    if (text.trim()) out[field.label] = text.trim();
  }
  return out;
}
