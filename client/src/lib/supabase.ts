import { createClient } from "@supabase/supabase-js";

// Public anon-key client. Safe to ship in the browser bundle — the anon key is
// designed for client use and is gated by Row Level Security on the database.
// Set these in Vercel as build-time vars (VITE_ prefix = exposed to client).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  // Surfaced at runtime rather than throwing at import so the print/public
  // invoice routes (which do not need auth) still render if auth is unset.
  console.error(
    "[Supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not configured. Auth will not work until they are set."
  );
}

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Current access token (JWT) for Authorization headers, or null if signed out. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
