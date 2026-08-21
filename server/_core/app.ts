import express, { type Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { stripeWebhookHandler } from "../stripe";
import { financialSummaryHandler } from "../summaryScheduler";

/**
 * Builds the Express app with all API routes wired. Static asset serving is
 * intentionally NOT included here:
 *  - On Vercel, the built SPA in dist/public is served by the platform's
 *    static/rewrite layer (see vercel.json), and this app runs only as the
 *    /api/* serverless function.
 *  - For local dev, server/devServer.ts wraps this with Vite middleware.
 */
export function createApp(): Express {
  const app = express();

  // Stripe needs the raw body to verify the webhook signature, so it is
  // registered before the JSON body parser.
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);

  // Daily financial-summary cron target (Vercel Cron -> see vercel.json).
  app.post("/api/scheduled/financial-summary", financialSummaryHandler);
  app.get("/api/scheduled/financial-summary", financialSummaryHandler);

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  return app;
}
