# LedgerWise

Full-stack double-entry bookkeeping and accounting app: contacts, chart of
accounts, journal entries, expenses, invoicing with Stripe checkout, tag-based
reporting, a Profit & Loss report, an AI finance assistant, and scheduled
financial-summary emails.

## Stack

- **Frontend:** React 19 + Vite, Wouter, TanStack Query, tRPC client, Tailwind CSS + shadcn/ui (Radix)
- **Backend:** Express + tRPC server, Drizzle ORM over MySQL
- **Payments:** Stripe Checkout + webhooks
- **Testing:** Vitest
- **Deploy:** Vercel

## Project layout

| Path | Purpose |
| --- | --- |
| `client/` | React application (UI, pages, components) |
| `server/` | Express + tRPC API, routers, services, tests |
| `shared/` | Types and constants shared across client and server |
| `drizzle/` | Database schema and SQL migrations |

## Local setup

Requires Node.js 22+ and pnpm 10+.

```bash
pnpm install
# create a local .env (see below)
pnpm db:push   # generate + run Drizzle migrations
pnpm dev       # start the dev server
```

### Scripts

- `pnpm dev` — start the development server
- `pnpm build` — build client and server for production
- `pnpm start` — run the production build
- `pnpm check` — TypeScript typecheck
- `pnpm test` — run the Vitest suite
- `pnpm format` — Prettier

## Environment variables

Set these in a local `.env` (never commit secrets):

- `DATABASE_URL` — MySQL connection string
- OAuth / session configuration
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — for invoice checkout and webhooks
- Transactional email provider credentials (optional, for scheduled summaries)

> `.env` files, database credentials, and Stripe/email secrets are excluded from
> source control by `.gitignore` and must never be committed.

## Deployment

The Vercel project is linked to this repository. Pushes to `main` deploy to
production; other branches produce preview deployments.

## License

MIT
