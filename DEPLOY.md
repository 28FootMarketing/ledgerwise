# LedgerWise — Deployment (Vercel + Supabase)

Non-Manus rebuild. Auth is Supabase, DB is Supabase Postgres, AI is OpenRouter,
owner alerts are Telegram, email is Resend. Ships as a Vite SPA plus a single
Vercel serverless function (`api/index.ts`) that runs the tRPC API, the Stripe
webhook, and the daily summary cron.

## 1. Supabase

1. Create (or reuse) a Supabase project.
2. Run the migrations in order, in the SQL editor or via `pnpm db:push`:
   - `drizzle/migrations/0000_aspiring_living_lightning.sql`
   - `drizzle/migrations/0001_enable_rls.sql`
3. Grab these from Project Settings:
   - Project URL → `SUPABASE_URL` and `VITE_SUPABASE_URL`
   - `anon` public key → `VITE_SUPABASE_ANON_KEY`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY` (server only, never client)
   - Connection string (Connenct → "Transaction pooler", port 6543) → `DATABASE_URL`
     - The pooled URL is required for serverless. The driver is already set to
       `prepare: false` to be pgbouncer-safe.
4. Auth → Email: confirm email sign-in (magic link) is enabled. Add your Vercel
   production URL to Auth → URL Configuration → Redirect URLs.

## 2. Environment variables (set in Vercel → Project → Settings → Environment Variables)

Server (all environments):

```
DATABASE_URL=postgresql://postgres.<ref>:<password>@<host>:6543/postgres
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
OWNER_EMAIL=<your email — first login with it becomes admin>

OPENROUTER_API_KEY=<openrouter key>
# optional overrides:
# OPENROUTER_MODEL=openai/gpt-4o-mini
# OPENROUTER_API_URL=https://openrouter.ai/api/v1

RESEND_API_KEY=<resend_api_key>
RESEND_FROM_EMAIL=LedgerWise <summaries@mail.28footsystems.com>

STRIPE_SECRET_KEY=<sk_live_or_test>
STRIPE_WEBHOOK_SECRET=<whsec_...>

TELEGRAM_BOT_TOKEN=<bot token>
TELEGRAM_CHAT_ID=1238597047

CRON_SECRET=<random long string>
```

Client (build-time, must be prefixed VITE_):

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_STRIPE_PUBLISHABLE_KEY=<pk_live_or_test>   # only if the client reads it
```

Notes:
- `RESEND_API_KEY` above is the scoped LedgerWise sending key already issued for
  `mail.28footsystems.com`. Rotate it in the Resend dashboard if it ever leaks.
- `CRON_SECRET`: Vercel Cron automatically sends `Authorization: Bearer $CRON_SECRET`
  to the cron path, which is how the summary endpoint authenticates. Set it and
  the endpoint is protected; leave it unset and the endpoint refuses to run.

## 3. Stripe

- Webhook endpoint URL: `https://<your-domain>/api/stripe/webhook`
- Events to send: `checkout.session.completed`, `payment_intent.succeeded`
- Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

## 4. Deploy

```
# from the project root
vercel            # first run links/creates the project
vercel --prod     # production deploy
```

`vercel.json` already sets:
- build command `pnpm run build`, output `dist/public`
- `/api/*` → serverless function `api/index.ts`
- SPA fallback for all non-API routes
- daily cron at 13:00 UTC → `/api/scheduled/financial-summary`

## 5. Local development

```
cp .env.example .env   # fill in the same server vars as above
pnpm install
pnpm dev               # Vite + Express on http://localhost:3000
pnpm test              # 40 tests
pnpm check             # typecheck
```

## What changed from the original build

- Manus OAuth → Supabase Auth (magic link). Server verifies the JWT via the
  service-role client; `users.authUserId` maps to `auth.users.id`.
- Manus Forge LLM → OpenRouter (server-side only).
- MySQL/TiDB + Drizzle mysql-core → Supabase Postgres + Drizzle pg-core.
- Manus heartbeat cron → Vercel Cron hitting one daily endpoint that scans all
  enabled summary schedules and sends the ones due today (idempotent).
- Manus notification service → Telegram Bot API (CORA chat id).
- Long-running Express server → Vite SPA + single Vercel serverless function.
- Removed dead Manus modules (storage, image gen, maps, voice, data API) and
  demo scaffolding (ComponentShowcase, AIChatBox, Map).
- Live Manus/TiDB/Stripe secrets removed from the source tree entirely.
