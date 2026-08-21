# LedgerWise

Full-stack double-entry bookkeeping and accounting app: contacts, chart of
accounts, journal entries, expenses, invoicing with Stripe checkout, tag-based
reporting, a Profit & Loss report, an AI finance assistant, and scheduled
financial-summary emails.

## Stack

- **Frontend:** React 19 + Vite, Wouter, TanStack Query, tRPC client, Tailwind CSS + shadcn/ui (Radix)
- **Backend:** Express + tRPC, running as a single Vercel serverless function (`api/index.ts`)
- **Auth:** Supabase Auth (email magic link)
- **Database:** Supabase Postgres via Drizzle ORM (pg-core)
- **AI:** OpenRouter (server-side)
- **Email:** Resend · **Owner alerts:** Telegram
- **Payments:** Stripe Checkout + webhooks
- **Testing:** Vitest · **Deploy:** Vercel (+ Vercel Cron for daily summaries)

## Project layout

| Path | Purpose |
| --- | --- |
| `client/` | React application (pages, components, shadcn/ui) |
| `server/` | Express + tRPC API, routers, services, and Vitest tests |
| `server/_core/` | Auth (`supabaseAuth.ts`), LLM (`llm.ts`), tRPC/context wiring |
| `api/index.ts` | Vercel serverless entry — mounts the Express app |
| `shared/` | Types and constants shared across client and server |
| `drizzle/` | Postgres schema and SQL migrations (incl. RLS) |

## Local development

Requires Node.js 22+ and pnpm 10+.

```bash
cp .env.example .env    # fill in the server + VITE_ vars
pnpm install
pnpm db:push            # apply Drizzle migrations to your Supabase Postgres
pnpm dev                # Vite + Express on http://localhost:3000
```

### Scripts

- `pnpm dev` — development server
- `pnpm build` — production client build (`dist/public`)
- `pnpm check` — TypeScript typecheck
- `pnpm test` — Vitest suite
- `pnpm db:push` / `pnpm db:generate` — Drizzle migrations

## Deployment

See **[DEPLOY.md](./DEPLOY.md)** for the full Vercel + Supabase setup: migrations,
the complete environment-variable list, Stripe webhook, and Vercel Cron.

Summary: the Vercel project builds the SPA to `dist/public` and serves the
Express API from `api/index.ts`; pushes to `main` deploy to production.

## Environment variables

All variables are documented in [`.env.example`](./.env.example) and DEPLOY.md.
Server secrets (`DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`,
`RESEND_API_KEY`, `STRIPE_*`, `TELEGRAM_*`, `CRON_SECRET`) and the build-time
`VITE_*` client keys are set in Vercel → Settings → Environment Variables.

> `.env` files and all secrets are excluded from source control by `.gitignore`
> and must never be committed.

## License

MIT
