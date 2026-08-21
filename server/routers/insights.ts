import { z } from "zod";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const guidance = `You are the LedgerWise finance assistant. Answer only from the supplied authenticated business data. Never invent money amounts, invoices, dates, account balances, vendors, trends, or facts. If the data cannot answer the question, say exactly what information is missing. State money amounts in USD based on cents from the data. Do not present tax, legal, audit, investment, or regulatory advice as professional advice. Keep answers concise and explain the relevant data basis.`;

export const insightsRouter = router({
  ask: protectedProcedure.input(z.object({ question: z.string().trim().min(1).max(1200) })).mutation(async ({ ctx, input }) => {
    const context = await db.getAssistantContext(ctx.user.id);
    const response = await invokeLLM({
      messages: [
        { role: "system", content: guidance },
        { role: "user", content: `Authenticated financial data:\n${JSON.stringify(context)}\n\nQuestion: ${input.question}` },
      ],
      maxTokens: 700,
    });
    const rawContent = response.choices[0]?.message.content;
    return { answer: typeof rawContent === "string" ? rawContent : "I could not generate an answer from the current records." };
  }),
  categorizeExpense: protectedProcedure.input(z.object({ description: z.string().trim().min(2).max(280), amountCents: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const context = await db.getAssistantContext(ctx.user.id);
    const response = await invokeLLM({
      messages: [
        { role: "system", content: `${guidance} Categorize an expense using only the supplied chart of accounts. If no account is a credible match, return accountId null.` },
        { role: "user", content: `Chart of accounts: ${JSON.stringify(context.accounts)}\nExpense description: ${input.description}\nAmount cents: ${input.amountCents}` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "expense_category",
          strict: true,
          schema: {
            type: "object",
            properties: { accountId: { type: ["integer", "null"] }, rationale: { type: "string" } },
            required: ["accountId", "rationale"],
            additionalProperties: false,
          },
        },
      },
      maxTokens: 250,
    });
    const rawContent = response.choices[0]?.message.content;
    const content = typeof rawContent === "string" ? rawContent : "";
    if (!content) throw new Error("The expense categorizer did not return a result.");
    return JSON.parse(content) as { accountId: number | null; rationale: string };
  }),
});
