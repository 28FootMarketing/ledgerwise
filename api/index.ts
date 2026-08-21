import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApp } from "../server/_core/app";

// Single Express app instance reused across warm invocations. Vercel routes
// every /api/* request here (see vercel.json rewrites); Express then dispatches
// to the tRPC middleware, Stripe webhook, or cron handler.
const app = createApp();

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req as unknown as any, res as unknown as any);
}
