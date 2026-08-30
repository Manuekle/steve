// Human labels for a contact's status and source, shared by the CRM board and
// the Leads table so the two can never call the same state different things.
//
// `source` is a free-form string on `Contact` — channels, forms and webhooks
// all write their own value — so an unknown one falls back to the raw string
// rather than rendering a missing translation key at the reader.

import type { ContactStatus } from "./types";

type Translate = (key: string, params?: Record<string, string | number>) => string;

export function contactStatusLabel(t: Translate, status: ContactStatus): string {
  return t(`contactStatus.${status}`);
}

export function contactSourceLabel(t: Translate, source: string): string {
  const key = `contactSource.${source}`;
  const translated = t(key);
  return translated === key ? source : translated;
}
