import { z } from "zod";
import * as db from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

const nullableText = z.string().trim().max(5000).optional().nullable();
const id = z.number().int().positive();
const contactInput = z.object({
  kind: z.enum(["customer", "vendor"]),
  name: z.string().trim().min(1).max(180),
  email: z.string().email().max(320).optional().nullable(),
  phone: z.string().trim().max(48).optional().nullable(),
  address: nullableText,
  notes: nullableText,
});

export const accountingRouter = router({
  contacts: router({
    list: protectedProcedure.input(z.object({ kind: z.enum(["customer", "vendor"]).optional() })).query(async ({ ctx, input }) => {
      return db.listContacts(ctx.user.id, input.kind);
    }),
    create: protectedProcedure.input(contactInput).mutation(async ({ ctx, input }) => {
      await db.createContact({ userId: ctx.user.id, ...input });
      return { success: true };
    }),
    update: protectedProcedure.input(contactInput.omit({ kind: true }).extend({ id })).mutation(async ({ ctx, input }) => {
      const { id: contactId, ...data } = input;
      await db.updateContact(ctx.user.id, contactId, data);
      return { success: true };
    }),
  }),
  accounts: router({
    list: protectedProcedure.query(({ ctx }) => db.listAccountsWithBalances(ctx.user.id)),
    create: protectedProcedure.input(z.object({
      code: z.string().trim().min(1).max(24),
      name: z.string().trim().min(1).max(120),
      type: z.enum(["asset", "liability", "equity", "income", "expense"]),
      description: nullableText,
    })).mutation(async ({ ctx, input }) => {
      await db.createAccount({ userId: ctx.user.id, ...input });
      return { success: true };
    }),
  }),
  tags: router({
    list: protectedProcedure.query(({ ctx }) => db.listTags(ctx.user.id)),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(64) })).mutation(async ({ ctx, input }) => {
      await db.createTag(ctx.user.id, input.name);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
      await db.deleteTag(ctx.user.id, input.id);
      return { success: true };
    }),
  }),
  ledger: router({
    list: protectedProcedure.query(({ ctx }) => db.listJournalEntries(ctx.user.id)),
    create: protectedProcedure.input(z.object({
      postedAt: z.date(),
      memo: z.string().trim().max(280).optional().nullable(),
      tagIds: z.array(id).max(12).optional(),
      lines: z.array(z.object({
        accountId: id,
        debitCents: z.number().int().min(0),
        creditCents: z.number().int().min(0),
        description: z.string().trim().max(280).optional().nullable(),
      })).min(2),
    })).mutation(async ({ ctx, input }) => {
      const journalEntryId = await db.createManualJournalEntry({ userId: ctx.user.id, ...input });
      return { success: true, journalEntryId };
    }),
  }),
  expenses: router({
    list: protectedProcedure.input(z.object({ start: z.date().optional(), end: z.date().optional() }).optional()).query(({ ctx, input }) => {
      return db.listExpenses(ctx.user.id, input?.start && input.end ? { start: input.start, end: input.end } : undefined);
    }),
    create: protectedProcedure.input(z.object({
      vendorId: id.optional().nullable(),
      expenseAccountId: id,
      paymentAccountId: id,
      amountCents: z.number().int().positive(),
      incurredAt: z.date(),
      notes: nullableText,
      tagIds: z.array(id).max(12).optional(),
    })).mutation(async ({ ctx, input }) => {
      await db.createExpense({ userId: ctx.user.id, ...input });
      return { success: true };
    }),
  }),
  invoices: router({
    list: protectedProcedure.query(({ ctx }) => db.listInvoices(ctx.user.id)),
    get: protectedProcedure.input(z.object({ id })).query(({ ctx, input }) => db.getInvoice(ctx.user.id, input.id)),
    getPublic: publicProcedure.input(z.object({ publicToken: z.string().min(16).max(32) })).query(({ input }) => db.getPublicInvoice(input.publicToken)),
    create: protectedProcedure.input(z.object({
      customerId: id,
      number: z.string().trim().min(1).max(48),
      issueAt: z.date(),
      dueAt: z.date(),
      notes: nullableText,
      taxCents: z.number().int().min(0).optional(),
      items: z.array(z.object({
        description: z.string().trim().min(1).max(280),
        quantity: z.number().int().positive(),
        unitAmountCents: z.number().int().min(0),
      })).min(1),
    })).mutation(async ({ ctx, input }) => {
      const invoiceId = await db.createInvoice({ userId: ctx.user.id, ...input });
      return { success: true, invoiceId };
    }),
    send: protectedProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
      await db.sendInvoice(ctx.user.id, input.id);
      return { success: true };
    }),
  }),
  dashboard: router({
    overview: protectedProcedure.query(({ ctx }) => db.getFinancialSummary(ctx.user.id)),
  }),
  reports: router({
    financialSummary: protectedProcedure.input(z.object({ start: z.date(), end: z.date(), tagId: id.optional() })).query(({ ctx, input }) => {
      return db.getFinancialSummary(ctx.user.id, input);
    }),
    profitAndLoss: protectedProcedure.input(z.object({ start: z.date(), end: z.date(), tagId: id.optional() })).query(({ ctx, input }) => {
      return db.getProfitAndLoss(ctx.user.id, input);
    }),
    tagSummary: protectedProcedure.input(z.object({ start: z.date().optional(), end: z.date().optional(), tagId: id.optional() }).optional()).query(({ ctx, input }) => {
      return db.getTagSummary(ctx.user.id, input?.start && input.end ? { start: input.start, end: input.end, tagId: input.tagId } : input?.tagId ? { start: new Date(0), end: new Date(), tagId: input.tagId } : undefined);
    }),
  }),
});
