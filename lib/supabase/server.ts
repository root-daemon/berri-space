import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Creates a Supabase client for server-side operations.
 * Uses the service role key for admin-level access.
 *
 * IMPORTANT: Only use this in server-side code (API routes, server components, server actions).
 * Never expose the service role key to the client.
 */
export function createServerSupabaseClient(): SupabaseClient<Database> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL environment variable. " +
        "Add it to your .env.local file."
    );
  }

  if (!supabaseServiceKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY environment variable. " +
        "Add it to your .env.local file."
    );
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      // Disable auto-refresh since we're using service role key
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Singleton instance for server-side use
let serverClient: SupabaseClient<Database> | null = null;

/**
 * Returns a singleton Supabase client for server-side operations.
 * Reuses the same client instance across requests for efficiency.
 */
export function getServerSupabaseClient(): SupabaseClient<Database> {
  if (!serverClient) {
    serverClient = createServerSupabaseClient();
  }
  return serverClient;
}
