import type { Request, Response } from "express";
import { parse as parseCookie } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import { createHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import { sendFinancialSummaryEmail } from "./summaryEmail";

export function summaryCron(cadence: "weekly" | "monthly", dayOfWeek = 1, dayOfMonth = 1) {
  return cadence === "weekly" ? `0 0 13 * * ${dayOfWeek}` : `0 0 13 ${dayOfMonth} * *`;
}

export async function configureSummarySchedule(input: { settingsId: number; scheduleCronTaskUid?: string | null; cadence: "weekly" | "monthly"; dayOfWeek: number; dayOfMonth: number; userSession: string }) {
  const cron = summaryCron(input.cadence, input.dayOfWeek, input.dayOfMonth);
  if (input.scheduleCronTaskUid) {
    await updateHeartbeatJob(input.scheduleCronTaskUid, { cron, enable: true, description: "LedgerWise financial summary email" }, input.userSession);
    return input.scheduleCronTaskUid;
  }
  const job = await createHeartbeatJob({
    name: `ledgerwise-summary-${input.settingsId}`,
    cron,
    path: "/api/scheduled/financial-summary",
    description: "LedgerWise financial summary email",
  }, input.userSession);
  await db.setSummaryScheduleTask(input.settingsId, job.taskUid);
  return job.taskUid;
}

export async function financialSummaryHandler(req: Request, res: Response) {
  let taskUid: string | undefined;
  try {
    const user = await sdk.authenticateRequest(req);
    taskUid = user.taskUid;
    if (!user.isCron || !taskUid) return res.status(403).json({ error: "cron-only" });
    const settings = await db.getSummarySettingsByTaskUid(taskUid);
    if (!settings || settings.enabled !== "yes") return res.json({ ok: true, skipped: "inactive-or-orphan" });
    const now = new Date();
    const periodEnd = settings.cadence === "weekly"
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodStart = new Date(periodEnd);
    if (settings.cadence === "weekly") periodStart.setUTCDate(periodStart.getUTCDate() - 7);
    else periodStart.setUTCMonth(periodStart.getUTCMonth() - 1);
    if (await db.hasSummaryDelivery(settings.id, periodStart, periodEnd)) return res.json({ ok: true, skipped: "already-delivered" });
    const summary = await db.getFinancialSummary(settings.userId, { start: periodStart, end: periodEnd });
    const providerMessageId = await sendFinancialSummaryEmail({
      recipientEmail: settings.recipientEmail,
      periodLabel: `${periodStart.toLocaleDateString()} – ${periodEnd.toLocaleDateString()}`,
      ...summary,
    });
    await db.recordSummaryDelivery({ settingsId: settings.id, periodStart, periodEnd, deliveryStatus: "sent", providerMessageId });
    return res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Financial summary]", message);
    return res.status(500).json({ error: message, context: { taskUid }, timestamp: new Date().toISOString() });
  }
}

export function sessionTokenFromRequest(req: Request) {
  return parseCookie(req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
}
