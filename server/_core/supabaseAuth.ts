import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Request } from "express";
import { ForbiddenError } from "@shared/_core/errors";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

let _adminClient: SupabaseClient | null = null;

/**
 * Service-role Supabase client, server-only. Used exclusively to validate
 * bearer tokens the browser sends — never exposed to the client bundle.
 */
function getAdminClient(): SupabaseClient {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
    throw new Error(
      "Supabase auth is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  if (!_adminClient) {
    _adminClient = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _adminClient;
}

function bearerTokenFromRequest(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice(7);
  }
  return null;
}

/**
 * Verifies the request's Supabase access token against Supabase Auth, then
 * syncs the local `users` row (auto-provisioned on first sign-in). Throws
 * ForbiddenError on any failure — callers treat auth as optional and catch it.
 */
export async function authenticateRequest(req: Request): Promise<User> {
  const token = bearerTokenFromRequest(req);
  if (!token) {
    throw ForbiddenError("Missing bearer token");
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw ForbiddenError("Invalid or expired session");
  }

  const authUser = data.user;
  const signedInAt = new Date();

  let user = await db.getUserByAuthUserId(authUser.id);

  if (!user) {
    await db.upsertUser({
      authUserId: authUser.id,
      name:
        (authUser.user_metadata?.name as string | undefined) ??
        authUser.email?.split("@")[0] ??
        null,
      email: authUser.email ?? null,
      loginMethod: authUser.app_metadata?.provider ?? "email",
      lastSignedIn: signedInAt,
    });
    user = await db.getUserByAuthUserId(authUser.id);
  } else {
    await db.upsertUser({
      authUserId: authUser.id,
      lastSignedIn: signedInAt,
    });
  }

  if (!user) {
    throw ForbiddenError("User could not be provisioned");
  }

  return user;
}
