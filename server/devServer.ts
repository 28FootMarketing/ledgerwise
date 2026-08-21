import "dotenv/config";
import { createServer } from "http";
import { createApp } from "./_core/app";
import { setupVite, serveStatic } from "./_core/vite";

/**
 * Local development / self-hosted entrypoint. On Vercel this file is NOT the
 * entrypoint — api/index.ts is, and the SPA is served statically. This exists
 * so `pnpm dev` and `pnpm start` work exactly as before.
 */
async function startServer() {
  const app = createApp();
  const server = createServer(app);

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
