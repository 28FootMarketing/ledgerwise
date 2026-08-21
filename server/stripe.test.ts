import { describe, expect, it } from "vitest";
import { paymentReferenceFromEvent, processStripePaymentEvent } from "./stripe";

describe("Stripe payment event routing", () => {
  it("extracts a paid invoice reference from a confirmed Checkout session", () => {
    const result = paymentReferenceFromEvent({
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_123", payment_status: "paid", payment_intent: "pi_test_123", metadata: { invoiceId: "42" } } },
    } as any);
    expect(result).toEqual({ invoiceId: 42, checkoutSessionId: "cs_test_123", paymentIntentId: "pi_test_123" });
  });

  it("does not settle an invoice from an unpaid Checkout completion", () => {
    const result = paymentReferenceFromEvent({
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_123", payment_status: "unpaid", metadata: { invoiceId: "42" } } },
    } as any);
    expect(result).toBeNull();
  });

  it("passes a confirmed payment reference into the invoice-settlement service", async () => {
    const settled: any[] = [];
    const result = await processStripePaymentEvent({
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_test_456", metadata: { invoiceId: "81" } } },
    } as any, async reference => { settled.push(reference); return { alreadyPaid: false, invoiceId: reference.invoiceId }; });
    expect(result).toMatchObject({ processed: true });
    expect(settled).toEqual([{ invoiceId: 81, paymentIntentId: "pi_test_456" }]);
  });
});
