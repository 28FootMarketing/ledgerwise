import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { createInvoiceCheckout } from "../stripe";
import * as db from "../db";

export const paymentsRouter = router({
  createInvoiceCheckout: protectedProcedure.input(z.object({ invoiceId: z.number().int().positive() })).mutation(({ ctx, input }) => {
    const originHeader = ctx.req.headers.origin;
    const origin = typeof originHeader === "string" ? originHeader : "";
    if (!origin.startsWith("http")) throw new Error("A trusted site origin is required to create a checkout link.");
    return createInvoiceCheckout({ userId: ctx.user.id, invoiceId: input.invoiceId, origin });
  }),
  createPublicInvoiceCheckout: publicProcedure.input(z.object({ publicToken: z.string().min(16).max(32), origin: z.string().url() })).mutation(async ({ input }) => {
    const invoice = await db.getPublicInvoice(input.publicToken);
    if (!invoice) throw new Error("Invoice not found.");
    return createInvoiceCheckout({ userId: invoice.userId, invoiceId: invoice.id, origin: input.origin });
  }),
});
