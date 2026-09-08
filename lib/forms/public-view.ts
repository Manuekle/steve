// The form as a visitor is allowed to see it.
//
// Points and thresholds never leave the server: knowing which answer is worth
// fifteen tells a respondent which button to press, and a form that can be
// gamed is a scoring system that means nothing.
//
// This projection used to live inline in app/f/[slug]/page.tsx, which was fine
// while that page was the only thing rendering a form. The builder's preview
// renders the same component off an unsaved draft, so the two would have drifted
// — and the direction they drift in is "the preview shows a field the real page
// strips", which is the sort of bug you find after someone publishes.

import type { Form, FormCondition, FormFieldType } from "@/lib/types";

export type PublicFormView = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly thankYou?: string;
  readonly steps: ReadonlyArray<{
    readonly id: string;
    readonly title?: string;
    readonly description?: string;
    readonly showIf?: FormCondition;
    readonly fields: ReadonlyArray<{
      readonly id: string;
      readonly type: FormFieldType;
      readonly label: string;
      readonly help?: string;
      readonly required: boolean;
      readonly placeholder?: string;
      readonly choices?: ReadonlyArray<{
        readonly id: string;
        readonly label: string;
        readonly emoji?: string;
        readonly iconSvg?: string;
      }>;
    }>;
  }>;
};

/** Everything a respondent needs and nothing they don't. Takes a `Form` or the
 *  builder's unsaved draft of one — the slug only matters to the live page,
 *  which is the only caller that has one. */
export function toPublicView(
  form: Pick<Form, "name" | "description" | "steps"> &
    Partial<Pick<Form, "slug" | "thankYou">>,
): PublicFormView {
  return {
    slug: form.slug ?? "",
    name: form.name,
    description: form.description,
    thankYou: form.thankYou,
    steps: form.steps.map((step) => ({
      id: step.id,
      title: step.title,
      description: step.description,
      showIf: step.showIf,
      fields: step.fields.map((field) => ({
        id: field.id,
        type: field.type,
        label: field.label,
        help: field.help,
        required: field.required,
        placeholder: field.placeholder,
        choices: field.choices?.map((choice) => ({
          id: choice.id,
          label: choice.label,
          emoji: choice.emoji,
          iconSvg: choice.iconSvg,
        })),
      })),
    })),
  };
}
