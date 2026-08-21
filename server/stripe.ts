import type { Request, Response } from "express";
import Stripe from "stripe";
import * as db from "./db";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured. Add a Stripe key in the project payment settings.");
  return new Stripe(key);
}

export function paymentReferenceFromEvent(event: Stripe.Event): { invoiceId: number; checkoutSessionId?: string; paymentIntentId?: string } | null {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== "paid") return null;
    const invoiceId = Number(session.metadata?.invoiceId);
    return Number.isInteger(invoiceId) && invoiceId > 0 ? { invoiceId, checkoutSessionId: session.id, paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined } : null;
  }
  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const invoiceId = Number(intent.metadata?.invoiceId);
    return Number.isInteger(invoiceId) && invoiceId > 0 ? { invoiceId, paymentIntentId: intent.id } : null;
  }
  return null;
}

export async function processStripePaymentEvent(event: Stripe.Event, settleInvoice: typeof db.markInvoicePaidByStripe = db.markInvoicePaidByStripe) {
  const reference = paymentReferenceFromEvent(event);
  if (!reference) return { processed: false };
  await settleInvoice(reference);
  return { processed: true, reference };
}

export async function createInvoiceCheckout(input: { userId: number; invoiceId: number; origin: string }) {
  const invoice = await db.getInvoice(input.userId, input.invoiceId);
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status !== "sent" && invoice.status !== "overdue") throw new Error("Send the invoice before creating a payment link.");
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: invoice.customer?.email ?? undefined,
    client_reference_id: String(input.userId),
    success_url: `${input.origin}/invoices/${invoice.id}/print?payment=success`,
    cancel_url: `${input.origin}/invoices/${invoice.id}/print?payment=cancelled`,
    metadata: { invoiceId: String(invoice.id), userId: String(input.userId), invoiceNumber: invoice.number },
    payment_intent_data: { metadata: { invoiceId: String(invoice.id), userId: String(input.userId) } },
    allow_promotion_codes: true,
    line_items: invoice.items.map(item => ({
      quantity: item.quantity,
      price_data: { currency: "usd", unit_amount: item.unitAmountCents, product_data: { name: item.description } },
    })),
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  await db.setInvoiceCheckoutSession(input.userId, invoice.id, session.id);
  return { url: session.url };
}

export async function stripeWebhookHandler(req: Request, res: Response) {
  try {
    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string") return res.status(400).json({ error: "Missing Stripe signature." });
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) return res.status(500).json({ error: "Stripe webhook secret is not configured." });
    const event = getStripe().webhooks.constructEvent(req.body, signature, webhookSecret);
    if (event.id.startsWith("evt_test_")) return res.json({ verified: true });
    await processStripePaymentEvent(event);
    return res.json({ received: true });
  } catch (error) {
    console.error("[Stripe webhook]", error);
    return res.status(400).json({ error: "Webhook signature or payment processing failed." });
  }
}
