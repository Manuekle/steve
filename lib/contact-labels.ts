// Human labels for a contact's status and source, shared by the CRM board and
// the Leads table so the two can never call the same state different things.
//
// `source` is a free-form string on `Contact` — channels, forms and webhooks
// all write their own value — so an unknown one falls back to the raw string
// rather than rendering a missing translation key at the reader.

import type { StatusVariant } from "@/components/ui/status-badge";
import type { ContactStatus } from "./types";

type Translate = (key: string, params?: Record<string, string | number>) => string;

export function contactStatusLabel(t: Translate, status: ContactStatus): string {
  return t(`contactStatus.${status}`);
}

/**
 * Which pill a contact's status wears.
 *
 * Shared for the same reason the labels are: the Leads table used to print the
 * status as bare text while every other surface in the product showed a pill,
 * so the one column a reader scans for "who needs me" was the one with no
 * colour in it. `waiting_human` is the only warning here on purpose — it is
 * the state that means a person has to do something.
 */
export const CONTACT_STATUS_VARIANT: Readonly<Record<ContactStatus, StatusVariant>> = {
  open: "in-progress",
  waiting_human: "warning",
  followup_due: "pending",
  closed: "success",
};

export function contactSourceLabel(t: Translate, source: string): string {
  const key = `contactSource.${source}`;
  const translated = t(key);
  return translated === key ? source : translated;
}
