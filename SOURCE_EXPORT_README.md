# LedgerWise Source Package

This archive contains the LedgerWise full-stack source code, including the React interface, Express and tRPC server, Drizzle schema and migrations, and Vitest coverage.

## Local setup

Install Node.js 22 or later and pnpm 10 or later. From the project root, run `pnpm install`, then set the required environment variables in a local `.env` file. This archive intentionally excludes secrets, generated dependencies, logs, and build output.

The application needs a valid `DATABASE_URL`, OAuth configuration, session secret, and the platform-specific integration variables documented in the project’s template README. Stripe checkout and webhook behavior additionally require Stripe keys. Dedicated transactional email activation remains optional until a verified sender and provider credentials are configured.

## Database and verification

Run the reviewed SQL migrations in `drizzle/migrations/` against your MySQL-compatible database in sequence. Then use `pnpm check` for TypeScript validation and `pnpm test` for the automated suite. Start the development server with `pnpm dev`.

> Do not commit `.env` files, database credentials, Stripe secrets, or transactional-email keys to source control.
