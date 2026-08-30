import type { ComponentType } from "react";
import WelcomeTemplate, { templateMeta as welcomeMeta } from "./welcome";
import LeadNotificationTemplate, { templateMeta as leadMeta } from "./lead-notification";
import ReminderTemplate, { templateMeta as reminderMeta } from "./reminder";
import NewsletterTemplate, { templateMeta as newsletterMeta } from "./newsletter";
import InvoiceTemplate, { templateMeta as invoiceMeta } from "./invoice";
import type { EmailTemplateDefinition } from "./types";

export type { EmailTemplateDefinition } from "./types";

/**
 * The templates that ship with the app: real modules in this bundle, so they
 * are imported and rendered directly rather than compiled from their own
 * source. Their `.tsx` files are still read from disk by the editor — but only
 * to show, never to run.
 */
export type BuiltinTemplate = EmailTemplateDefinition & {
  readonly id: string;
  readonly component: ComponentType<Record<string, unknown>>;
};

/** `templateMeta` and the default export always travel together; this keeps
 *  the list below to one line per template instead of six. */
function builtin(
  id: string,
  component: unknown,
  meta: EmailTemplateDefinition,
): BuiltinTemplate {
  return { id, component: component as ComponentType<Record<string, unknown>>, ...meta };
}

export const BUILTIN_TEMPLATES: readonly BuiltinTemplate[] = [
  builtin("welcome", WelcomeTemplate, welcomeMeta),
  builtin("lead-notification", LeadNotificationTemplate, leadMeta),
  builtin("reminder", ReminderTemplate, reminderMeta),
  builtin("newsletter", NewsletterTemplate, newsletterMeta),
  builtin("invoice", InvoiceTemplate, invoiceMeta),
];

export function getBuiltinTemplate(id: string): BuiltinTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}
