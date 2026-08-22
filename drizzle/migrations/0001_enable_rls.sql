-- LedgerWise RLS lockdown.
--
-- Access model: every request goes through the server (api/index.ts), which
-- authenticates the Supabase JWT and then queries Postgres using the SERVICE
-- ROLE connection string. The service role bypasses RLS, and ownership is
-- enforced in the query layer (every statement filters by userId).
--
-- Therefore the correct posture for the anon/authenticated roles is: no direct
-- table access at all. Enabling RLS with no permissive policy denies every
-- row to those roles, which is exactly what we want — it closes the PostgREST
-- data API surface while leaving the server (service role) fully functional.
--
-- Run this AFTER 0000_*.sql.

ALTER TABLE "ledge_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledge_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledge_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledge_journalEntries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledge_journalLines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledge_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledge_invoiceLineItems" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledge_serviceCatalog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledge_quotes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledge_quoteLineItems" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledge_expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledge_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledge_expenseTags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledge_journalEntryTags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledge_summarySettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledge_summaryDeliveries" ENABLE ROW LEVEL SECURITY;

-- No policies are created on purpose. With RLS enabled and zero policies,
-- the anon and authenticated roles can read/write nothing directly through
-- the PostgREST/data API. All legitimate access continues via the service
-- role from the server. If you later expose any table directly to the client,
-- add explicit per-user policies (e.g. USING ("userId" = <mapped auth uid>)).
