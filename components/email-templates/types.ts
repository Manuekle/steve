/**
 * What a built-in email template declares about itself, beside the component.
 *
 * It lives in its own file so each template can import the type without
 * reaching for `index.ts`, which imports every template back.
 */
export type EmailTemplateDefinition = {
  readonly label: string;
  readonly description: string;
  /** Default subject line. `{{variable}}` placeholders are filled from the
   *  same values the body is rendered with. */
  readonly subject: string;
  /** The props the editor offers as inputs, in the order they're shown. */
  readonly variables: readonly string[];
  /** Realistic values for every variable, so the preview shows an email
   *  rather than a page of blanks, and a test send is worth reading. */
  readonly sample: Record<string, unknown>;
};
