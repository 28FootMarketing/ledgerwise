import type { Request, Response } from "express";
import * as db from "./db";
import { ENV } from "./_core/env";
import { sendFinancialSummaryEmail } from "./summaryEmail";

/**
 * Vercel Cron hits this once a day (see vercel.json). There is no per-user
 * external cron job to create or track — this handler scans every workspace
 * with delivery enabled and decides which are due today, using UTC dayOfWeek
 * / dayOfMonth against the settings the owner configured in-app. Idempotency
 * is enforced by hasSummaryDelivery, same as before.
 */
export function isDueToday(settings: { cadence: "weekly" | "monthly"; dayOfWeek: number; dayOfMonth: number }, now: Date): boolean {
  if (settings.cadence === "weekly") {
    return now.getUTCDay() === settings.dayOfWeek;
  }
  return now.getUTCDate() === settings.dayOfMonth;
}

function periodBoundsFor(cadence: "weekly" | "monthly", now: Date): { periodStart: Date; periodEnd: Date } {
  const periodEnd = cadence === "weekly"
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodStart = new Date(periodEnd);
  if (cadence === "weekly") periodStart.setUTCDate(periodStart.getUTCDate() - 7);
  else periodStart.setUTCMonth(periodStart.getUTCMonth() - 1);
  return { periodStart, periodEnd };
}

function isAuthorizedCronRequest(req: Request): boolean {
  if (!ENV.cronSecret) return false;
  const header = req.headers.authorization;
  return header === `Bearer ${ENV.cronSecret}`;
}

export async function financialSummaryHandler(req: Request, res: Response) {
  if (!isAuthorizedCronRequest(req)) {
    return res.status(403).json({ error: "cron-only" });
  }

  const now = new Date();
  const results: Array<{ settingsId: number; status: string }> = [];

  try {
    const dueSettings = await db.listEnabledSummarySettings();

    for (const settings of dueSettings) {
      if (!isDueToday(settings, now)) {
        continue;
      }

      const { periodStart, periodEnd } = periodBoundsFor(settings.cadence, now);

      if (await db.hasSummaryDelivery(settings.id, periodStart, periodEnd)) {
        results.push({ settingsId: settings.id, status: "already-delivered" });
        continue;
      }

      try {
        const summary = await db.getFinancialSummary(settings.userId, { start: periodStart, end: periodEnd });
        const providerMessageId = await sendFinancialSummaryEmail({
          recipientEmail: settings.recipientEmail,
          periodLabel: `${periodStart.toLocaleDateString()} – ${periodEnd.toLocaleDateString()}`,
          ...summary,
        });
        await db.recordSummaryDelivery({ settingsId: settings.id, periodStart, periodEnd, deliveryStatus: "sent", providerMessageId });
        results.push({ settingsId: settings.id, status: "sent" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[Financial summary] settingsId=${settings.id}`, message);
        await db.recordSummaryDelivery({ settingsId: settings.id, periodStart, periodEnd, deliveryStatus: "failed", errorMessage: message });
        results.push({ settingsId: settings.id, status: "failed" });
      }
    }

    return res.json({ ok: true, checked: dueSettings.length, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Financial summary]", message);
    return res.status(500).json({ error: message, timestamp: new Date().toISOString() });
  }
}
