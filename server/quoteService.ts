export type StoredQuote = { id: number; customerId: number; issueAt: Date; notes: string | null; monthlyCents: number; convertedInvoiceId: number | null };
export type StoredQuoteLine = { quoteId: number; description: string; quantity: number; unitAmountCents: number; billingFrequency: "one_time" | "monthly" };

export function assertQuoteWorkspace(userId: number, quote: { userId: number } | undefined) {
  if (!quote || quote.userId !== userId) throw new Error("Quote not found in this workspace.");
}

export function assembleQuoteRecords<T extends { id: number; customerId: number }>(quotes: T[], items: StoredQuoteLine[], customers: Array<{ id: number }>) {
  const itemsByQuote = new Map<number, StoredQuoteLine[]>(); items.forEach(item => itemsByQuote.set(item.quoteId, [...(itemsByQuote.get(item.quoteId) ?? []), item]));
  const customerById = new Map(customers.map(customer => [customer.id, customer]));
  return quotes.map(quote => ({ ...quote, items: itemsByQuote.get(quote.id) ?? [], customer: customerById.get(quote.customerId) }));
}

export function buildInvoiceFromQuote(quote: StoredQuote, items: StoredQuoteLine[], invoiceNumber: string, dueAt: Date) {
  if (quote.convertedInvoiceId) return { alreadyConverted: true as const, invoiceId: quote.convertedInvoiceId };
  if (!items.length) throw new Error("A quote needs at least one line item before conversion.");
  return { alreadyConverted: false as const, input: { customerId: quote.customerId, number: invoiceNumber, issueAt: quote.issueAt, dueAt, notes: [quote.notes, quote.monthlyCents ? "Monthly services shown as the first billing period." : null].filter(Boolean).join("\n") || null, items: items.map(item => ({ description: item.billingFrequency === "monthly" ? `${item.description} (monthly)` : item.description, quantity: item.quantity, unitAmountCents: item.unitAmountCents })) } };
}
