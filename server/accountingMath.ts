export type JournalLineDraft = {
  accountId: number;
  debitCents: number;
  creditCents: number;
  description?: string | null;
};

export type InvoiceItemDraft = {
  description: string;
  quantity: number;
  unitAmountCents: number;
};

export function calculateInvoiceTotals(items: InvoiceItemDraft[], taxCents = 0) {
  if (!Number.isInteger(taxCents) || taxCents < 0) {
    throw new Error("Tax must be a non-negative whole number of cents.");
  }

  const normalizedItems = items.map(item => {
    if (!item.description.trim()) throw new Error("Each invoice line requires a description.");
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error("Invoice quantities must be positive whole numbers.");
    }
    if (!Number.isInteger(item.unitAmountCents) || item.unitAmountCents < 0) {
      throw new Error("Invoice unit amounts must be non-negative whole cents.");
    }
    return { ...item, lineTotalCents: item.quantity * item.unitAmountCents };
  });

  const subtotalCents = normalizedItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
  return { items: normalizedItems, subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

export function validateBalancedJournalLines(lines: JournalLineDraft[]) {
  if (lines.length < 2) throw new Error("A journal entry needs at least two lines.");

  const debitCents = lines.reduce((sum, line) => sum + line.debitCents, 0);
  const creditCents = lines.reduce((sum, line) => sum + line.creditCents, 0);

  lines.forEach(line => {
    const hasDebit = Number.isInteger(line.debitCents) && line.debitCents > 0;
    const hasCredit = Number.isInteger(line.creditCents) && line.creditCents > 0;
    if (hasDebit === hasCredit) {
      throw new Error("Each journal line must contain either a debit or a credit, but not both.");
    }
  });

  if (debitCents !== creditCents) {
    throw new Error("Journal entry debits and credits must balance.");
  }
  return { debitCents, creditCents };
}

export function effectiveInvoiceStatus(
  status: "draft" | "sent" | "paid" | "overdue",
  dueAt: Date,
  referenceDate = new Date(),
) {
  if (status === "sent" && dueAt.getTime() < referenceDate.getTime()) return "overdue" as const;
  return status;
}

export function summarizeFinancials(
  invoices: Array<{ status: "draft" | "sent" | "paid" | "overdue"; dueAt: Date; totalCents: number }>,
  expenseRows: Array<{ amountCents: number }>,
  referenceDate = new Date(),
) {
  const revenueCents = invoices
    .filter(invoice => effectiveInvoiceStatus(invoice.status, invoice.dueAt, referenceDate) !== "draft")
    .reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const outstandingCents = invoices
    .filter(invoice => {
      const status = effectiveInvoiceStatus(invoice.status, invoice.dueAt, referenceDate);
      return status === "sent" || status === "overdue";
    })
    .reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const expensesCents = expenseRows.reduce((sum, expense) => sum + expense.amountCents, 0);

  return {
    revenueCents,
    expensesCents,
    netProfitCents: revenueCents - expensesCents,
    outstandingCents,
    invoiceCount: invoices.length,
  };
}

export type ProfitLossExpense = { accountId: number; accountCode: string; accountName: string; amountCents: number };

export function isCostOfGoodsSoldAccount(account: Pick<ProfitLossExpense, "accountCode" | "accountName">) {
  const label = account.accountName.toLowerCase();
  return account.accountCode.startsWith("51") || label.includes("cost of goods") || label.includes("cogs");
}

function groupProfitLossLines(lines: ProfitLossExpense[]) {
  const grouped = new Map<string, { accountId: number; code: string; name: string; amountCents: number }>();
  lines.forEach(line => {
    const key = `${line.accountId}:${line.accountCode}`;
    const current = grouped.get(key) ?? { accountId: line.accountId, code: line.accountCode, name: line.accountName, amountCents: 0 };
    current.amountCents += line.amountCents;
    grouped.set(key, current);
  });
  return Array.from(grouped.values()).sort((left, right) => left.code.localeCompare(right.code));
}

export function calculateProfitAndLoss(revenueCents: number, expenseRows: ProfitLossExpense[]) {
  const costOfGoodsSold = groupProfitLossLines(expenseRows.filter(isCostOfGoodsSoldAccount));
  const operatingExpenses = groupProfitLossLines(expenseRows.filter(expense => !isCostOfGoodsSoldAccount(expense)));
  const costOfGoodsSoldCents = costOfGoodsSold.reduce((sum, row) => sum + row.amountCents, 0);
  const operatingExpenseCents = operatingExpenses.reduce((sum, row) => sum + row.amountCents, 0);
  const grossProfitCents = revenueCents - costOfGoodsSoldCents;
  const operatingProfitCents = grossProfitCents - operatingExpenseCents;
  return { revenueCents, revenue: [{ code: "4000", name: "Sales revenue", amountCents: revenueCents }], costOfGoodsSold, costOfGoodsSoldCents, grossProfitCents, operatingExpenses, operatingExpenseCents, operatingProfitCents, netProfitCents: operatingProfitCents };
}
