import { createApp } from "./_core/app";

// Bundling entry for the Vercel serverless function.
//
// The project is ESM ("type": "module"). If Vercel compiles the function file
// on its own it leaves the relative `../server/...` imports unresolved and the
// Node ESM loader throws ERR_MODULE_NOT_FOUND at runtime. To avoid that, this
// file is pre-bundled by esbuild into a single self-contained `api/index.js`
// (see vercel.json's buildCommand): every local import (including `@shared/*`)
// is inlined, and only node_modules packages remain as external imports, which
// Vercel traces and installs normally.
//
// An Express app is a valid Node request handler, so we build it once per warm
// lambda and export it as the default handler.
const app = createApp();

export default function handler(req: unknown, res: unknown) {
  return (app as unknown as (req: unknown, res: unknown) => unknown)(req, res);
}
