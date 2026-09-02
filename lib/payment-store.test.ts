import { describe, it, expect, beforeEach, vi } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Same isolation trick lib/media-store.test.ts uses: the store reads
// homedir() at module scope, so homedir has to point at a temp directory
// before the module is imported — otherwise this would write into the real
// ~/.steve/payments.json.
const TEST_DIR = join(tmpdir(), `steve-payments-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => TEST_DIR };
});

const { listPayments, newPaymentReference, recordPendingPayment, settlePayment } = await import(
  "./payment-store"
);

const link = {
  provider: "stripe",
  reference: "plink_123",
  contactId: "ct_1",
  amount: "49.99",
  currency: "usd",
  productName: "Consultoría",
} as const;

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("payment ledger", () => {
  it("records a link as pending and settles it once the webhook confirms", async () => {
    await recordPendingPayment(link);
    expect((await listPayments())[0].status).toBe("pending");

    const settled = await settlePayment({
      provider: "stripe",
      reference: "plink_123",
      amountPaid: "49.99",
      payerEmail: "buyer@example.com",
      providerPaymentId: "cs_1",
    });

    expect(settled?.alreadyPaid).toBe(false);
    expect(settled?.record.status).toBe("paid");
    expect(settled?.record.contactId).toBe("ct_1");
    expect(settled?.record.payerEmail).toBe("buyer@example.com");
    expect(settled?.record.paidAt).toBeTruthy();
  });

  // Both processors deliver at least once and redeliver on their own
  // schedule. A second delivery must not read as a second sale.
  it("reports a redelivery as already paid instead of settling twice", async () => {
    await recordPendingPayment(link);
    await settlePayment({ provider: "stripe", reference: "plink_123" });
    const again = await settlePayment({ provider: "stripe", reference: "plink_123" });

    expect(again?.alreadyPaid).toBe(true);
    expect((await listPayments()).filter((p) => p.status === "paid")).toHaveLength(1);
  });

  it("ignores a payment made outside this app", async () => {
    await recordPendingPayment(link);
    expect(await settlePayment({ provider: "stripe", reference: "plink_someone_else" })).toBeUndefined();
  });

  // The two processors are namespaced apart: nothing stops Mercado Pago from
  // one day using an id shaped like a Stripe one.
  it("does not match a reference across providers", async () => {
    await recordPendingPayment(link);
    expect(await settlePayment({ provider: "mercadopago", reference: "plink_123" })).toBeUndefined();
  });

  it("mints references that do not collide", () => {
    const references = new Set(Array.from({ length: 200 }, () => newPaymentReference()));
    expect(references.size).toBe(200);
  });
});
