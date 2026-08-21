export type FinancialSummaryEmail = {
  recipientEmail: string;
  periodLabel: string;
  revenueCents: number;
  expensesCents: number;
  netProfitCents: number;
  outstandingCents: number;
};

export function hasEmailConfiguration(config: { apiKey?: string; fromEmail?: string }) {
  return Boolean(config.apiKey?.trim() && config.fromEmail?.trim());
}

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export function buildFinancialSummaryEmail(summary: FinancialSummaryEmail) {
  const rows = [
    ["Revenue", money(summary.revenueCents)],
    ["Expenses", money(summary.expensesCents)],
    ["Net profit", money(summary.netProfitCents)],
    ["Outstanding invoices", money(summary.outstandingCents)],
  ].map(([label, value]) => `<tr><td style="padding:12px 0;border-bottom:1px solid #ddd">${label}</td><td style="padding:12px 0;border-bottom:1px solid #ddd;text-align:right;font-weight:700">${value}</td></tr>`).join("");
  return {
    subject: `LedgerWise financial summary — ${summary.periodLabel}`,
    html: `<main style="max-width:620px;margin:0 auto;padding:32px;font-family:Arial,sans-serif;color:#171717"><p style="font-size:11px;font-weight:700;letter-spacing:1.4px">LEDGERWISE / FINANCIAL SUMMARY</p><h1 style="font-size:34px;line-height:1;margin:20px 0 28px">Your business at a glance.</h1><p style="color:#555">${summary.periodLabel}</p><table style="width:100%;border-collapse:collapse;margin-top:24px">${rows}</table><p style="margin-top:32px;color:#666;font-size:13px;line-height:1.6">This summary is based on the invoices and expenses recorded in your LedgerWise workspace during the selected period.</p></main>`,
  };
}

export async function sendFinancialSummaryEmail(summary: FinancialSummaryEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!hasEmailConfiguration({ apiKey, fromEmail })) throw new Error("Dedicated email delivery is not configured.");
  const content = buildFinancialSummaryEmail(summary);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromEmail, to: [summary.recipientEmail], subject: content.subject, html: content.html }),
  });
  if (!response.ok) throw new Error(`Email provider rejected the summary (${response.status}).`);
  const result = await response.json() as { id?: string };
  return result.id ?? null;
}
