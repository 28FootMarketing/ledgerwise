import express, { type Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { stripeWebhookHandler } from "../stripe";
import { financialSummaryHandler } from "../summaryScheduler";

// Builds the LedgerWise Express app with every API route registered.
//
// It intentionally does NOT call listen() and does NOT serve static assets, so
// the same app can run in two environments:
//   - as a long-lived Node server (server/_core/index.ts), which adds Vite in
//     development, static file serving in production, and binds a port;
//   - as a Vercel serverless function (api/index.ts), where Vercel serves the
//     client build (dist/public) directly and only forwards API requests here.
export function createApp(): Express {
  const app = express();

  // Stripe needs the raw request body to verify the webhook signature, so this
  // route is registered before the JSON body parser below.
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);
  app.post("/api/scheduled/financial-summary", financialSummaryHandler);

  // Configure body parser with a larger size limit for file uploads.
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  return app;
}
