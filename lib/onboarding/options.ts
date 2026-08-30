/**
 * The answer sets, with no `node:fs` anywhere near them.
 *
 * They live apart from `store.ts` because the onboarding form is a client
 * component and needs them to render: importing them from the store dragged
 * its `node:fs/promises` import into the browser chunk, and Turbopack refused
 * to build it — "the chunking context does not support external modules".
 * Data that both sides read belongs in a module neither side has to apologise
 * for importing.
 */

export const INDUSTRIES = [
  "retail",
  "services",
  "health",
  "education",
  "realEstate",
  "hospitality",
  "software",
  "other",
] as const;

export const VOLUMES = ["0-50", "51-200", "201-500", "501-1000", "1001-5000", "5000+"] as const;

/**
 * The API host each CRM talks to, which is the only reason this question is
 * asked: the answer goes into `HTTP_ALLOWLIST`, so `http_request` can reach it
 * without the owner hunting for the hostname. `null` is "nothing to allow" —
 * either the CRM is self-hosted on a domain we cannot guess, or the answer was
 * "other" or "none".
 */
export const CRMS: readonly { readonly host: string | null; readonly id: string }[] = [
  { host: "api.hubapi.com", id: "hubspot" },
  { host: null, id: "odoo" },
  { host: "api.clientify.net", id: "clientify" },
  { host: "services.leadconnectorhq.com", id: "ghl" },
  { host: null, id: "bitrix24" },
  { host: "api.notion.com", id: "notion" },
  { host: "api.activecampaign.com", id: "activecampaign" },
  { host: "api.pipedrive.com", id: "pipedrive" },
  { host: "www.zohoapis.com", id: "zoho" },
  { host: "api.escala.com", id: "escala" },
  { host: null, id: "other" },
  { host: null, id: "none" },
];

/** The five things this app actually does, in the words of what you get. */
export const GOALS = ["inbox", "ads", "automations", "knowledge", "commerce"] as const;

/** The host to allow for a CRM answer, if that CRM has one. */
export function crmHost(id: string): string | null {
  return CRMS.find((crm) => crm.id === id)?.host ?? null;
}
