import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const id = z.number().int().positive();
const quoteItem = z.object({ serviceCatalogId: id.optional().nullable(), description: z.string().trim().min(1).max(280), category: z.string().trim().max(96).optional().nullable(), quantity: z.number().int().positive(), unitAmountCents: z.number().int().nonnegative(), billingFrequency: z.enum(["one_time", "monthly"]) });

export const quotesRouter = router({
  services: router({
    list: protectedProcedure.query(({ ctx }) => db.listServices(ctx.user.id)),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(180), category: z.string().trim().min(1).max(96), description: z.string().trim().max(1000).optional().nullable(), defaultUnitAmountCents: z.number().int().nonnegative(), billingFrequency: z.enum(["one_time", "monthly"]) })).mutation(async ({ ctx, input }) => { await db.createService({ userId: ctx.user.id, ...input }); return { success: true }; }),
    archive: protectedProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => { await db.archiveService(ctx.user.id, input.id); return { success: true }; }),
  }),
  quotes: router({
    list: protectedProcedure.query(({ ctx }) => db.listQuotes(ctx.user.id)),
    get: protectedProcedure.input(z.object({ id })).query(async ({ ctx, input }) => { const quote = await db.getQuote(ctx.user.id, input.id); if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found in this workspace." }); return quote; }),
    create: protectedProcedure.input(z.object({ customerId: id, number: z.string().trim().min(1).max(48), title: z.string().trim().min(1).max(180), issueAt: z.date(), validUntil: z.date().optional().nullable(), notes: z.string().trim().max(3000).optional().nullable(), items: z.array(quoteItem).min(1).max(50) })).mutation(async ({ ctx, input }) => ({ quoteId: await db.createQuote({ userId: ctx.user.id, ...input }) })),
    delete: protectedProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => { await db.deleteQuote(ctx.user.id, input.id); return { success: true }; }),
    convertToInvoice: protectedProcedure.input(z.object({ quoteId: id, invoiceNumber: z.string().trim().min(1).max(48), dueAt: z.date() })).mutation(({ ctx, input }) => db.convertQuoteToInvoice({ userId: ctx.user.id, ...input })),
  }),
});
