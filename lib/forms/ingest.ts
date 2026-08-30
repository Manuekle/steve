// A submission becoming a lead.
//
// The public page calls this on every step, not only on the last one, so
// someone who abandons after question two is already in the inbox with the two
// answers they gave. That is what "captures leads even when they don't finish"
// means, and it is the reason the response is keyed by an id the page carries
// forward rather than appended blindly.

import { ingestLead, saveFormResponse, setContactStatus } from "@/lib/business-store";
import { answersAsAttributes, contactFieldsFrom, maxScore, qualify } from "@/lib/forms/scoring";
import { deliverFormWebhook } from "@/lib/forms/webhook";
import type { Form, FormAnswer, FormResponse } from "@/lib/types";

/** Attributes the app writes itself, namespaced so they can't collide with a
 *  question whose label happens to be "Score". */
const SCORE_KEY = "form_score";
const TEMPERATURE_KEY = "form_temperature";
const FORM_KEY = "form_name";

export type SubmissionInput = {
  readonly form: Form;
  readonly answers: readonly FormAnswer[];
  /** The response being appended to. Absent starts a new one. */
  readonly responseId?: string;
  /** True on the last step. False while the respondent is still going. */
  readonly complete: boolean;
};

/**
 * Score the answers, upsert the contact when they identify someone, and store
 * the response. A form with no contact-capture step — an anonymous survey —
 * produces a response and no contact, which is the correct outcome rather than
 * a failure.
 */
export async function recordSubmission(input: SubmissionInput): Promise<FormResponse> {
  const { form, answers, responseId, complete } = input;
  const { score, temperature } = qualify(form, answers);
  const identity = contactFieldsFrom(form, answers);
  const identified = Boolean(identity.email || identity.phone || identity.name);

  let contactId: string | undefined;
  if (identified) {
    const contact = await ingestLead({
      ...identity,
      channel: "form",
      // Distinguishes forms from each other on the Leads screen, where
      // `source` is the column people filter on.
      source: `form:${form.slug}`,
      message: complete
        ? `${form.name} — ${score}/${maxScore(form)}`
        : `${form.name} — ${score}/${maxScore(form)} (incompleto)`,
      attributes: {
        ...answersAsAttributes(form, answers),
        [FORM_KEY]: form.name,
        [SCORE_KEY]: `${score}/${maxScore(form)}`,
        [TEMPERATURE_KEY]: temperature,
      },
    });
    contactId = contact.id;
    // A hot lead is the one case where the form should interrupt someone.
    // Warm and cold stay in the pile `ingestLead` already put them in.
    if (temperature === "hot") await setContactStatus(contact.id, "waiting_human");
  }

  const response = await saveFormResponse({
    id: responseId,
    formId: form.id,
    answers,
    score,
    temperature,
    partial: !complete,
    contactId,
  });

  // After the write, never before: the response is stored whatever the
  // operator's endpoint does. Awaited rather than floated so the delivery
  // isn't cut short when the function is frozen after the reply, and
  // `deliverFormWebhook` neither throws nor takes longer than its own timeout.
  await deliverFormWebhook(form, response);

  return response;
}
