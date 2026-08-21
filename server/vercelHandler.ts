import { createApp } from "./_core/app";

// Source for the Vercel serverless function. At build time this is bundled by
// esbuild into a single self-contained api/index.js (see vercel.json's
// buildCommand), so there are no relative ESM imports to resolve at runtime —
// only node_modules dependencies, which Vercel installs and traces normally.
//
// An Express app is a valid Node request handler, so we build it once per warm
// lambda and export it as the default handler. Vercel serves the client build
// (dist/public) statically; vercel.json rewrites forward /api/* and
// /manus-storage/* requests to this function.
export default createApp();
