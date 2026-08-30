// Delivering a form response to the operator's own endpoint.
//
// A webhook belongs to a form, not to the account: which endpoint gets the
// answers is a per-form decision, so the URL lives on the form and the
// Connections page only mirrors what is already set. This module is the whole
// delivery path — everything the receiver sees is built here.
//
// Two rules shape it. The respondent must never pay for a slow or broken
// endpoint, so a failure is swallowed and the submission still succeeds; and
// the URL is typed by a signed-in operator but still goes through the shared
// SSRF guard, because "our own admin typed it" is not a reason to let the
// server POST at 169.254.169.254.

import { assertPublicHttpsUrl } from "@/lib/http-guard";
import { allFields, maxScore } from "@/lib/forms/scoring";
import type { Form, FormResponse } from "@/lib/types";

/** Long enough for a cold Lambda on the other end, short enough that a dead
 *  endpoint doesn't hold a respondent on the loading state. */
const TIMEOUT_MS = 5000;

export type FormWebhookPayload = {
  readonly event: "form.response";
  readonly form: { readonly id: string; readonly slug: string; readonly name: string };
  readonly response: {
    readonly id: string;
    /** False while the respondent is still going. The id is stable across a
     *  form's steps, so a receiver can upsert on it rather than collecting
     *  one row per step. */
    readonly partial: boolean;
    readonly score: number;
    readonly maxScore: number;
    readonly temperature: string;
    readonly contactId?: string;
    readonly startedAt: string;
    readonly updatedAt: string;
  };
  /** Answers keyed by question label as well as field id: an id is stable but
   *  unreadable, and a receiver writing a spreadsheet column wants the label. */
  readonly answers: ReadonlyArray<{
    readonly fieldId: string;
    readonly label: string;
    readonly value: string | readonly string[];
  }>;
};

export function buildFormWebhookPayload(form: Form, response: FormResponse): FormWebhookPayload {
  const labels = new Map(allFields(form).map((field) => [field.id, field.label]));
  return {
    event: "form.response",
    form: { id: form.id, slug: form.slug, name: form.name },
    response: {
      id: response.id,
      partial: Boolean(response.partial),
      score: response.score,
      maxScore: maxScore(form),
      temperature: response.temperature,
      ...(response.contactId ? { contactId: response.contactId } : {}),
      startedAt: response.startedAt,
      updatedAt: response.updatedAt,
    },
    answers: response.answers.map((answer) => ({
      fieldId: answer.fieldId,
      label: labels.get(answer.fieldId) ?? answer.fieldId,
      value: answer.value,
    })),
  };
}

/**
 * POST one response to the form's webhook. Never throws and never rejects:
 * the respondent's submission is already stored by the time this runs, and a
 * 500 from someone else's endpoint is not their problem.
 */
export async function deliverFormWebhook(form: Form, response: FormResponse): Promise<void> {
  const raw = form.webhookUrl?.trim();
  if (!raw) return;

  let url: URL;
  try {
    url = assertPublicHttpsUrl(raw);
  } catch {
    // A URL that can't pass the guard was either never valid or points
    // somewhere this server must not reach. Nothing to retry.
    return;
  }

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Steve-Forms-Webhook/1",
      },
      body: JSON.stringify(buildFormWebhookPayload(form, response)),
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Timed out, refused, or redirected. Delivery is best-effort by design.
  }
}
