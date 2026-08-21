import { supabase } from "@/lib/supabase";

/**
 * Starts the Supabase sign-in flow. Preserves the void-returning,
 * call-from-handler signature the previous auth helper used, so existing
 * callers (`onClick={() => startLogin()}`) keep working unchanged.
 *
 * Uses a magic-link (OTP) email: the user enters their address, Supabase
 * emails a sign-in link, and detectSessionInUrl completes the session on
 * return. Swap for signInWithOAuth({ provider }) if you wire social logins.
 */
export const startLogin = (email?: string) => {
  const address = email ?? window.prompt("Enter your email to receive a sign-in link:")?.trim();
  if (!address) return;

  void supabase.auth
    .signInWithOtp({
      email: address,
      options: { emailRedirectTo: window.location.origin },
    })
    .then(({ error }) => {
      if (error) {
        console.error("[Auth] Sign-in link request failed:", error.message);
        window.alert(`Could not send the sign-in link: ${error.message}`);
      } else {
        window.alert(`Check ${address} for your sign-in link.`);
      }
    });
};

export const signOut = () => supabase.auth.signOut();
