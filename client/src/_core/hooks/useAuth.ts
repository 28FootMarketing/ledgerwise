import { startLogin } from "@/const";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

/**
 * Auth state derived from the Supabase session plus the server's `auth.me`
 * record (the local users row, which carries role and profile). Keeps the same
 * return shape the app already consumes: { user, loading, error,
 * isAuthenticated, refresh, logout }.
 */
export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath } = options ?? {};
  const utils = trpc.useUtils();

  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setSessionLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setSessionLoading(false);
      // Any identity change invalidates the cached server user record.
      void utils.auth.me.invalidate();
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [utils]);

  // Only ask the server who we are once we actually hold a session, so the
  // public print/pay routes never fire an unauthenticated request.
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    enabled: Boolean(session),
  });

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    utils.auth.me.setData(undefined, null);
    await utils.auth.me.invalidate();
  }, [utils]);

  const loading =
    sessionLoading || (Boolean(session) && meQuery.isLoading);

  const state = useMemo(
    () => ({
      user: session ? meQuery.data ?? null : null,
      loading,
      error: meQuery.error ?? null,
      isAuthenticated: Boolean(session && meQuery.data),
    }),
    [session, meQuery.data, meQuery.error, loading]
  );

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (state.loading) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (redirectPath && window.location.pathname === redirectPath) return;

    if (redirectPath) {
      window.location.href = redirectPath;
    } else {
      startLogin();
    }
  }, [redirectOnUnauthenticated, redirectPath, state.loading, state.user]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
