import { z } from "zod";
import * as db from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { configureSummarySchedule, sessionTokenFromRequest } from "../summaryScheduler";

export const settingsRouter = router({
  summary: router({
    get: protectedProcedure.query(({ ctx }) => db.getSummarySettings(ctx.user.id)),
    save: protectedProcedure.input(z.object({
      recipientEmail: z.string().email(),
      cadence: z.enum(["weekly", "monthly"]),
      dayOfWeek: z.number().int().min(0).max(6),
      dayOfMonth: z.number().int().min(1).max(28),
      timezone: z.string().trim().min(1).max(64),
      enabled: z.enum(["yes", "no"]),
    })).mutation(async ({ ctx, input }) => {
      if (input.enabled === "yes" && !process.env.RESEND_API_KEY) {
        throw new Error("Add the dedicated email provider credentials before enabling scheduled delivery.");
      }
      await db.saveSummarySettings({ userId: ctx.user.id, ...input });
      const settings = await db.getSummarySettings(ctx.user.id);
      if (!settings) throw new Error("Summary settings could not be saved.");
      if (input.enabled === "yes") {
        const taskUid = await configureSummarySchedule({
          settingsId: settings.id,
          scheduleCronTaskUid: settings.scheduleCronTaskUid,
          cadence: input.cadence,
          dayOfWeek: input.dayOfWeek,
          dayOfMonth: input.dayOfMonth,
          userSession: sessionTokenFromRequest(ctx.req),
        });
        return { success: true, taskUid };
      }
      return { success: true, taskUid: settings.scheduleCronTaskUid ?? null };
    }),
  }),
});
