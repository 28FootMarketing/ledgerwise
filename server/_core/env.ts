export const ENV = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",

  // Supabase (auth + Postgres). SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are
  // server-only secrets used to verify bearer tokens issued by Supabase Auth.
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",

  // First user to sign in with this email is auto-promoted to admin.
  ownerEmail: process.env.OWNER_EMAIL ?? "",

  // OpenRouter (server-side only — never exposed to the client).
  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  openRouterApiUrl: process.env.OPENROUTER_API_URL ?? "https://openrouter.ai/api/v1",
  // openai/gpt-4o-mini reliably supports strict json_schema response_format
  // on OpenRouter, which categorizeExpense depends on. Swap via env var if
  // you want a different model — just confirm json_schema support first.
  openRouterModel: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",

  // Cron auth for /api/scheduled/* — set the same value in Vercel env vars
  // and vercel.json is configured to have Vercel Cron send it automatically.
  cronSecret: process.env.CRON_SECRET ?? "",

  // Owner ops notifications via Telegram Bot API (matches the 28FS CORA pattern).
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID ?? "",
};
