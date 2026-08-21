import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { accountingRouter } from "./routers/accounting";
import { insightsRouter } from "./routers/insights";
import { paymentsRouter } from "./routers/payments";
import { quotesRouter } from "./routers/quotes";
import { settingsRouter } from "./routers/settings";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    // Supabase sessions live client-side (supabase-js manages the token in
    // storage). There is no server-held cookie to clear — the client calls
    // supabase.auth.signOut() directly. This stays as a no-op success so any
    // existing caller of trpc.auth.logout.mutate() keeps working.
    logout: publicProcedure.mutation(() => ({ success: true } as const)),
  }),
  accounting: accountingRouter,
  insights: insightsRouter,
  payments: paymentsRouter,
  quotes: quotesRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
