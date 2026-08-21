import { createApp } from "../server/_core/app";

// Vercel serverless entry point. An Express app is a valid Node request
// handler, so we build the app once (per warm lambda) and export it as the
// default handler. Vercel serves the client build (dist/public) statically;
// vercel.json rewrites forward /api/* and /manus-storage/* requests here.
const app = createApp();

export default app;
