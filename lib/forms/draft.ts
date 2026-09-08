// The edits the builder makes, as functions.
//
// Every one of these takes a step list and returns a new one. No state, no
// store, no React: the builder screen is then a thin thing that holds a draft
// and calls these, and the awkward part of editing a form — that questions,
// options and the conditions pointing at them are the same graph — is tested
// here rather than discovered in the UI.
//
// The rule that shapes most of this: a reference to something you just deleted
// is worse than the deletion. Removing a question that gates a later step, or
// an option a condition names, prunes the condition on the way out, so a draft
// is never saveable-but-broken.

import type {
  Form,
  FormChoice,
  FormField,
  FormFieldType,
  FormStep,
} from "@/lib/types";

/** Ids only have to be unique inside one form and legal in `stepsSchema`. */
function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

export const CHOICE_TYPES: readonly FormFieldType[] = ["single_choice", "multi_choice"];

export function isChoiceType(type: FormFieldType): boolean {
  return CHOICE_TYPES.includes(type);
}

/** A new option, worth nothing until someone says what it's worth. */
export function newChoice(label = ""): FormChoice {
  return { id: newId("ch"), label, points: 0 };
}

/**
 * A new question. A choice question arrives with two options rather than none:
 * an empty option list is invalid, so a field that starts empty would make the
 * form unsaveable the moment it is added.
 */
export function newField(type: FormFieldType = "single_choice", label = ""): FormField {
  const base = { id: newId("fd"), type, label, required: false } as const;
  if (!isChoiceType(type)) return base;
  return { ...base, choices: [newChoice(), newChoice()] };
}

/** A step with no title of its own. Empty string rather than absent would be
 *  a heading the public page renders as a blank line — see `optionalText` in
 *  lib/forms/schema.ts. */
export function newStep(title?: string): FormStep {
  return { id: newId("st"), title, fields: [newField()] };
}

// ── Steps ──────────────────────────────────────────────────────────

export function addStep(steps: readonly FormStep[], at?: number): readonly FormStep[] {
  const step = newStep();
  const index = at ?? steps.length;
  return [...steps.slice(0, index), step, ...steps.slice(index)];
}

export function updateStep(
  steps: readonly FormStep[],
  stepId: string,
  patch: Partial<FormStep>,
): readonly FormStep[] {
  return steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step));
}

/** Removing a step takes its questions with it, so anything gated on one of
 *  them loses its condition too. */
export function removeStep(steps: readonly FormStep[], stepId: string): readonly FormStep[] {
  const doomed = steps.find((step) => step.id === stepId);
  if (!doomed) return steps;
  const orphaned = new Set(doomed.fields.map((field) => field.id));
  return pruneConditions(
    steps.filter((step) => step.id !== stepId),
    orphaned,
  );
}

/**
 * Move a step one place up or down. A move that would put a step in front of
 * the question it depends on is refused rather than silently allowed and then
 * flagged by the validator — the arrow simply does nothing, which is what
 * "this can't go there" looks like without a dialog.
 */
export function moveStep(
  steps: readonly FormStep[],
  stepId: string,
  direction: -1 | 1,
): readonly FormStep[] {
  const from = steps.findIndex((step) => step.id === stepId);
  if (from < 0) return steps;
  const to = from + direction;
  if (to < 0 || to >= steps.length) return steps;
  const next = [...steps];
  [next[from], next[to]] = [next[to], next[from]];
  return conditionsHold(next) ? next : steps;
}

/** A copy of a step, ids and all regenerated so nothing collides. Its own
 *  condition rides along; conditions pointing *at* it do not follow the copy,
 *  because the copy's questions are new questions. */
export function duplicateStep(steps: readonly FormStep[], stepId: string): readonly FormStep[] {
  const index = steps.findIndex((step) => step.id === stepId);
  if (index < 0) return steps;
  const source = steps[index];
  const copy: FormStep = {
    ...source,
    id: newId("st"),
    fields: source.fields.map((field) => ({
      ...field,
      id: newId("fd"),
      choices: field.choices?.map((choice) => ({ ...choice, id: newId("ch") })),
    })),
  };
  return [...steps.slice(0, index + 1), copy, ...steps.slice(index + 1)];
}

// ── Fields ─────────────────────────────────────────────────────────

export function addField(
  steps: readonly FormStep[],
  stepId: string,
  type: FormFieldType = "single_choice",
): readonly FormStep[] {
  return steps.map((step) =>
    step.id === stepId ? { ...step, fields: [...step.fields, newField(type)] } : step,
  );
}

/**
 * Patch one question. Two type changes need cleaning up after: leaving the
 * choice types drops the options (and any condition reading them), and
 * arriving at one has to bring options with it.
 */
export function updateField(
  steps: readonly FormStep[],
  fieldId: string,
  patch: Partial<FormField>,
): readonly FormStep[] {
  let becameTyped = false;
  const next = steps.map((step) => ({
    ...step,
    fields: step.fields.map((field) => {
      if (field.id !== fieldId) return field;
      const merged = { ...field, ...patch } as FormField;
      if (patch.type === undefined || patch.type === field.type) return merged;
      if (isChoiceType(merged.type)) {
        const kept = merged.choices?.length ? merged.choices : [newChoice(), newChoice()];
        return { ...merged, choices: kept, maps: undefined };
      }
      becameTyped = true;
      return { ...merged, choices: undefined };
    }),
  }));
  return becameTyped ? pruneConditions(next, new Set([fieldId])) : next;
}

export function removeField(steps: readonly FormStep[], fieldId: string): readonly FormStep[] {
  // A step with no questions is not a step. Removing the last one removes the
  // step, which is what someone deleting it is asking for either way.
  const stripped = steps
    .map((step) => ({ ...step, fields: step.fields.filter((field) => field.id !== fieldId) }))
    .filter((step) => step.fields.length > 0);
  return pruneConditions(stripped, new Set([fieldId]));
}

export function moveField(
  steps: readonly FormStep[],
  stepId: string,
  fieldId: string,
  direction: -1 | 1,
): readonly FormStep[] {
  return steps.map((step) => {
    if (step.id !== stepId) return step;
    const from = step.fields.findIndex((field) => field.id === fieldId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= step.fields.length) return step;
    const fields = [...step.fields];
    [fields[from], fields[to]] = [fields[to], fields[from]];
    return { ...step, fields };
  });
}

// ── Choices ────────────────────────────────────────────────────────

export function addChoice(steps: readonly FormStep[], fieldId: string): readonly FormStep[] {
  return mapField(steps, fieldId, (field) => ({
    ...field,
    choices: [...(field.choices ?? []), newChoice()],
  }));
}

export function updateChoice(
  steps: readonly FormStep[],
  fieldId: string,
  choiceId: string,
  patch: Partial<FormChoice>,
): readonly FormStep[] {
  return mapField(steps, fieldId, (field) => ({
    ...field,
    choices: field.choices?.map((choice) =>
      choice.id === choiceId ? { ...choice, ...patch } : choice,
    ),
  }));
}

/** The last option can't go: a choice question with none is invalid, and a
 *  respondent staring at a question with nothing to pick is worse. */
export function removeChoice(
  steps: readonly FormStep[],
  fieldId: string,
  choiceId: string,
): readonly FormStep[] {
  const field = allFieldsOf(steps).find((candidate) => candidate.id === fieldId);
  if (!field?.choices || field.choices.length <= 1) return steps;
  const stripped = mapField(steps, fieldId, (target) => ({
    ...target,
    choices: target.choices?.filter((choice) => choice.id !== choiceId),
  }));
  return pruneChoiceFromConditions(stripped, fieldId, choiceId);
}

/**
 * A whole new option order, given as ids — what a drag hands back.
 *
 * Ids that name nothing are dropped and anything the caller forgot is kept at
 * the end, so a stale list from a drag that raced an edit reorders what it can
 * instead of deleting the difference.
 */
export function reorderChoices(
  steps: readonly FormStep[],
  fieldId: string,
  choiceIds: readonly string[],
): readonly FormStep[] {
  return mapField(steps, fieldId, (field) => {
    if (!field.choices) return field;
    const byId = new Map(field.choices.map((choice) => [choice.id, choice]));
    const ordered = choiceIds
      .map((id) => byId.get(id))
      .filter((choice): choice is FormChoice => Boolean(choice));
    const seen = new Set(ordered.map((choice) => choice.id));
    const rest = field.choices.filter((choice) => !seen.has(choice.id));
    return { ...field, choices: [...ordered, ...rest] };
  });
}

/** The same, for the questions inside one step. Nothing constrains this order:
 *  a condition can only name a question from an *earlier step*, so shuffling
 *  within one can never strand it. */
export function reorderFields(
  steps: readonly FormStep[],
  stepId: string,
  fieldIds: readonly string[],
): readonly FormStep[] {
  return steps.map((step) => {
    if (step.id !== stepId) return step;
    const byId = new Map(step.fields.map((field) => [field.id, field]));
    const ordered = fieldIds
      .map((id) => byId.get(id))
      .filter((field): field is FormField => Boolean(field));
    const seen = new Set(ordered.map((field) => field.id));
    const rest = step.fields.filter((field) => !seen.has(field.id));
    return { ...step, fields: [...ordered, ...rest] };
  });
}

export function moveChoice(
  steps: readonly FormStep[],
  fieldId: string,
  choiceId: string,
  direction: -1 | 1,
): readonly FormStep[] {
  return mapField(steps, fieldId, (field) => {
    const choices = field.choices;
    if (!choices) return field;
    const from = choices.findIndex((choice) => choice.id === choiceId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= choices.length) return field;
    const next = [...choices];
    [next[from], next[to]] = [next[to], next[from]];
    return { ...field, choices: next };
  });
}

// ── Conditions ─────────────────────────────────────────────────────

/** The questions a given step is allowed to depend on: choice questions asked
 *  before it. This is what the condition picker lists. */
export function conditionSources(
  steps: readonly FormStep[],
  stepIndex: number,
): readonly FormField[] {
  return steps
    .slice(0, Math.max(0, stepIndex))
    .flatMap((step) => step.fields)
    .filter((field) => isChoiceType(field.type) && (field.choices?.length ?? 0) > 0);
}

/** True when every condition in the list points backwards at a real choice
 *  question. Used to veto a reorder before it happens. */
export function conditionsHold(steps: readonly FormStep[]): boolean {
  const sourceIndex = new Map<string, number>();
  steps.forEach((step, index) => {
    for (const field of step.fields) sourceIndex.set(field.id, index);
  });
  return steps.every((step, index) => {
    if (!step.showIf) return true;
    const from = sourceIndex.get(step.showIf.fieldId);
    return from !== undefined && from < index;
  });
}

/** Drop conditions that name any of `fieldIds`. */
function pruneConditions(
  steps: readonly FormStep[],
  fieldIds: ReadonlySet<string>,
): readonly FormStep[] {
  return steps.map((step) =>
    step.showIf && fieldIds.has(step.showIf.fieldId) ? omitShowIf(step) : step,
  );
}

/** Drop one option from every condition reading it, and drop the condition
 *  entirely once nothing is left to match. */
function pruneChoiceFromConditions(
  steps: readonly FormStep[],
  fieldId: string,
  choiceId: string,
): readonly FormStep[] {
  return steps.map((step) => {
    if (step.showIf?.fieldId !== fieldId) return step;
    const equals = step.showIf.equals.filter((id) => id !== choiceId);
    if (equals.length === 0) return omitShowIf(step);
    return { ...step, showIf: { ...step.showIf, equals } };
  });
}

function omitShowIf(step: FormStep): FormStep {
  const { showIf: _dropped, ...rest } = step;
  return rest;
}

function mapField(
  steps: readonly FormStep[],
  fieldId: string,
  change: (field: FormField) => FormField,
): readonly FormStep[] {
  return steps.map((step) => ({
    ...step,
    fields: step.fields.map((field) => (field.id === fieldId ? change(field) : field)),
  }));
}

function allFieldsOf(steps: readonly FormStep[]): readonly FormField[] {
  return steps.flatMap((step) => step.fields);
}

// ── Drafts ─────────────────────────────────────────────────────────

/** The parts of a form the builder owns. Everything else on a `Form` — slug,
 *  webhook, status, timestamps — is edited by its own card and left alone. */
export type FormDraft = Pick<Form, "name" | "description" | "steps" | "scoring"> &
  Pick<Partial<Form>, "thankYou">;

export function draftOf(form: Form): FormDraft {
  return {
    name: form.name,
    description: form.description,
    steps: form.steps,
    scoring: form.scoring,
    thankYou: form.thankYou,
  };
}

/** Whether anything at all changed, so the save button can say so. Structural
 *  comparison rather than reference: every helper above returns new objects,
 *  so identity would report a change for an edit that undid itself. */
export function draftChanged(a: FormDraft, b: FormDraft): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}
