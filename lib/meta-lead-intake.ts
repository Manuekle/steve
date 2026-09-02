import type { MetaLead } from "./meta-ads";
import type { Contact, LeadInput } from "./types";

/** Attribute that ties a contact back to the Meta lead it came from. */
export const META_LEAD_ID = "meta_lead_id";

/**
 * How recent a lead has to be for the poller to act on it.
 *
 * Meta keeps lead data for 90 days and hands back the whole history on every
 * read. Without this, the first poll after someone connects their Page would
 * message every lead of the last three months at once. A day is comfortably
 * wider than the poll interval, so nothing genuinely new is ever missed.
 */
export const LEAD_FRESHNESS_MS = 24 * 60 * 60 * 1000;

/** First non-empty value Meta returned for any of `names`. */
function field(lead: MetaLead, ...names: string[]): string | undefined {
  for (const name of names) {
    const entry = lead.field_data?.find((f) => f.name === name);
    const value = entry?.values?.find((v) => v?.trim());
    if (value) return value.trim();
  }
  return undefined;
}

/**
 * A Meta lead in this app's vocabulary.
 *
 * The channel is the load-bearing decision. A lead that left a phone number is
 * marked `whatsapp`, because that is the transport the automation will use to
 * answer it — leaving it as `form` would file the lead correctly and then make
 * every reply unreachable. One that left only an email stays `form`.
 *
 * Every answer the form collected is kept as an attribute, custom questions
 * included, so `{{contact.<question>}}` works in a step's message.
 */
export function metaLeadToInput(lead: MetaLead, formName?: string): LeadInput {
  const phone = field(lead, "phone_number", "phone");
  const email = field(lead, "email", "work_email");
  const first = field(lead, "first_name");
  const last = field(lead, "last_name");
  const name = field(lead, "full_name") ?? ([first, last].filter(Boolean).join(" ").trim() || undefined);

  const attributes: Record<string, string> = {
    [META_LEAD_ID]: lead.id,
    meta_form_id: lead.form_id,
  };
  for (const entry of lead.field_data ?? []) {
    const value = entry.values?.filter(Boolean).join(", ").trim();
    if (entry.name && value) attributes[entry.name] = value;
  }

  return {
    ...(name ? { name } : {}),
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    source: `meta-ads:${formName ?? lead.form_id}`,
    channel: phone ? "whatsapp" : "form",
    attributes,
  };
}

/** Lead ids this app has already taken in. */
export function ingestedLeadIds(contacts: readonly Contact[]): Set<string> {
  const ids = new Set<string>();
  for (const contact of contacts) {
    const id = contact.attributes?.[META_LEAD_ID];
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * The leads worth acting on: never seen before, and recent enough that acting
 * on them is still what the operator would want.
 */
export function selectNewLeads(
  leads: readonly MetaLead[],
  known: ReadonlySet<string>,
  now: Date = new Date(),
): MetaLead[] {
  return leads.filter((lead) => {
    if (known.has(lead.id)) return false;
    const created = new Date(lead.created_time).getTime();
    if (!Number.isFinite(created)) return false;
    return now.getTime() - created <= LEAD_FRESHNESS_MS;
  });
}
