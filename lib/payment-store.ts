// What happened to the payment links this business sent.
//
// The `send_payment_link` step creates a hosted checkout and messages the
// link over WhatsApp — and until this store existed, that was the end of it:
// the money could arrive and the app would never know, because a Payment Link
// is paid on Stripe's or Mercado Pago's domain, not here. The only way back
// is the provider's webhook, and a webhook arrives naming *its* object, not
// our contact. This file is that missing join.
//
// One record per link, written when the link is created and settled when the
// webhook confirms the money. `reference` is whatever the provider will hand
// back later, which differs by provider on purpose:
//
//   Stripe        the payment link id (`plink_…`). `checkout.session.completed`
//                 carries it as `payment_link`, guaranteed, with no dependence
//                 on metadata propagating from a link to a session.
//   Mercado Pago  our own opaque id, sent as the preference's
//                 `external_reference` and echoed back on the payment.
//
// Kept in ~/.steve/payments.json with the same 0600 mode and atomic rename as
// the other stores here. It holds amounts and payer emails, not card data —
// no processor ever hands that to an integrator, and this app never asks.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";

const STORE_FILE = join(homedir(), ".steve", "payments.json");

export type PaymentProvider = "stripe" | "mercadopago";

export type PaymentRecord = {
  readonly id: string;
  readonly provider: PaymentProvider;
  /** The provider-side handle its webhook will name. See the note above. */
  readonly reference: string;
  readonly contactId?: string;
  readonly amount: string;
  readonly currency: string;
  readonly productName: string;
  readonly checkoutUrl?: string;
  readonly createdAt: string;
  readonly status: "pending" | "paid";
  readonly paidAt?: string;
  /** What the provider says was actually collected, which is not always what
   *  was asked for — a partial capture or a currency conversion both land
   *  here, and silently overwriting the asked-for amount would hide that. */
  readonly amountPaid?: string;
  readonly payerEmail?: string;
  /** The provider's own payment id, for reconciling against its dashboard. */
  readonly providerPaymentId?: string;
};

type PaymentStore = { readonly payments: PaymentRecord[] };

let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function readStore(): Promise<PaymentStore> {
  try {
    const parsed = JSON.parse(await readFile(STORE_FILE, "utf-8")) as PaymentStore;
    return Array.isArray(parsed?.payments) ? parsed : { payments: [] };
  } catch {
    return { payments: [] };
  }
}

async function writeStore(store: PaymentStore): Promise<void> {
  await mkdir(dirname(STORE_FILE), { recursive: true });
  const tmp = `${STORE_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2) + "\n", { encoding: "utf-8", mode: 0o600 });
  await rename(tmp, STORE_FILE);
}

/** An opaque reference for providers that let us choose one. */
export function newPaymentReference(): string {
  return `steve_${randomBytes(12).toString("hex")}`;
}

export async function listPayments(): Promise<PaymentRecord[]> {
  return (await readStore()).payments;
}

export async function recordPendingPayment(input: {
  readonly provider: PaymentProvider;
  readonly reference: string;
  readonly contactId?: string;
  readonly amount: string;
  readonly currency: string;
  readonly productName: string;
  readonly checkoutUrl?: string;
}): Promise<PaymentRecord> {
  return enqueue(async () => {
    const store = await readStore();
    const record: PaymentRecord = {
      id: `pay_${randomBytes(8).toString("hex")}`,
      createdAt: new Date().toISOString(),
      status: "pending",
      ...input,
    };
    await writeStore({ payments: [record, ...store.payments].slice(0, 5_000) });
    return record;
  });
}

/**
 * Marks the link behind `reference` paid, and answers with the record so the
 * caller can act on the contact it names.
 *
 * `undefined` means no link of ours matches — an event for a payment made
 * outside this app, which is a normal thing to receive and nothing to fail on.
 * A record already `paid` is returned unchanged: providers redeliver, and a
 * second delivery must not append a second note to the contact.
 */
export async function settlePayment(input: {
  readonly provider: PaymentProvider;
  readonly reference: string;
  readonly amountPaid?: string;
  readonly payerEmail?: string;
  readonly providerPaymentId?: string;
}): Promise<{ readonly record: PaymentRecord; readonly alreadyPaid: boolean } | undefined> {
  return enqueue(async () => {
    const store = await readStore();
    const index = store.payments.findIndex(
      (payment) => payment.provider === input.provider && payment.reference === input.reference,
    );
    if (index === -1) return undefined;

    const current = store.payments[index];
    if (current.status === "paid") return { record: current, alreadyPaid: true };

    const settled: PaymentRecord = {
      ...current,
      status: "paid",
      paidAt: new Date().toISOString(),
      ...(input.amountPaid ? { amountPaid: input.amountPaid } : {}),
      ...(input.payerEmail ? { payerEmail: input.payerEmail } : {}),
      ...(input.providerPaymentId ? { providerPaymentId: input.providerPaymentId } : {}),
    };
    const payments = [...store.payments];
    payments[index] = settled;
    await writeStore({ payments });
    return { record: settled, alreadyPaid: false };
  });
}
