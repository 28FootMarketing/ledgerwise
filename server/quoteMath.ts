export type QuoteLineDraft = { serviceCatalogId?: number | null; description: string; category?: string | null; quantity: number; unitAmountCents: number; billingFrequency: "one_time" | "monthly" };

export function calculateQuoteTotals(items: QuoteLineDraft[]) {
  if (!items.length) throw new Error("A quote needs at least one line item.");
  const normalized = items.map(item => {
    if (!item.description.trim()) throw new Error("Each quote line needs a description.");
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error("Quote quantities must be positive whole numbers.");
    if (!Number.isInteger(item.unitAmountCents) || item.unitAmountCents < 0) throw new Error("Quote prices must be non-negative whole cents.");
    return { ...item, description: item.description.trim(), lineTotalCents: item.quantity * item.unitAmountCents };
  });
  return { items: normalized, oneTimeCents: normalized.filter(item => item.billingFrequency === "one_time").reduce((sum, item) => sum + item.lineTotalCents, 0), monthlyCents: normalized.filter(item => item.billingFrequency === "monthly").reduce((sum, item) => sum + item.lineTotalCents, 0) };
}
