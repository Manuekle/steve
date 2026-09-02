// The half of a payment that happens after the link is sent.
//
// Both provider webhooks end here, so "what a paid link does to the business"
// is written once: the ledger entry is settled, and the contact the link was
// sent to carries the fact afterwards — in a note a human reads on the
// contact, and in attributes an automation's `{{...}}` template can render.
//
// Deliberately not done here: changing `status`. The statuses this app has
// (open / waiting_human / followup_due / closed) describe the state of the
// conversation, and a customer who just paid is very often mid-conversation.
// Closing them automatically would hide them from the inbox at the exact
// moment someone should be thanking them.

import { listContacts, upsertContact } from "./business-store";
import { settlePayment, type PaymentProvider, type PaymentRecord } from "./payment-store";

export type SettleOutcome =
  /** No link of ours matches — a payment made outside this app. */
  | { readonly kind: "unmatched" }
  /** Already settled by an earlier delivery of the same event. */
  | { readonly kind: "duplicate"; readonly record: PaymentRecord }
  | { readonly kind: "settled"; readonly record: PaymentRecord; readonly contactId?: string };

function paidNote(record: PaymentRecord): string {
  const amount = record.amountPaid ?? record.amount;
  const when = new Date(record.paidAt ?? Date.now()).toLocaleString("es-AR");
  const via = record.provider === "stripe" ? "Stripe" : "Mercado Pago";
  return `Pago recibido: ${amount} ${record.currency.toUpperCase()} — ${record.productName} (${via}, ${when})`;
}

export async function settlePaymentAndMarkContact(input: {
  readonly provider: PaymentProvider;
  readonly reference: string;
  readonly amountPaid?: string;
  readonly payerEmail?: string;
  readonly providerPaymentId?: string;
}): Promise<SettleOutcome> {
  const settled = await settlePayment(input);
  if (!settled) return { kind: "unmatched" };
  if (settled.alreadyPaid) return { kind: "duplicate", record: settled.record };

  const record = settled.record;
  if (!record.contactId) return { kind: "settled", record };

  const contact = (await listContacts()).find((c) => c.id === record.contactId);
  if (!contact) return { kind: "settled", record };

  const note = paidNote(record);
  await upsertContact({
    id: contact.id,
    notes: contact.notes ? `${contact.notes}\n${note}` : note,
    attributes: {
      ...contact.attributes,
      last_payment_status: "paid",
      last_payment_amount: record.amountPaid ?? record.amount,
      last_payment_currency: record.currency.toUpperCase(),
      last_payment_product: record.productName,
      last_payment_provider: record.provider,
      last_payment_at: record.paidAt ?? new Date().toISOString(),
    },
  });

  return { kind: "settled", record, contactId: contact.id };
}
