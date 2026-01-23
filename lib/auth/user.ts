import { auth, currentUser } from "@clerk/nextjs/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import type { DbUser } from "@/lib/supabase/types";

/**
 * Error thrown when authentication or user sync fails.
 */
export class AuthenticationError extends Error {
  constructor(
    message: string,
    public code:
      | "NOT_AUTHENTICATED"
      | "USER_FETCH_FAILED"
      | "DB_SYNC_FAILED"
      | "DB_QUERY_FAILED"
  ) {
    super(message);
    this.name = "AuthenticationError";
  }
}

/**
 * Syncs a Clerk user to the database.
 * Creates a new DB user if one doesn't exist, or updates the existing record.
 *
 * This operation is idempotent - safe to call multiple times.
 *
 * @param clerkUserId - The Clerk user ID
 * @param email - User's email from Clerk
 * @param name - User's display name from Clerk (optional)
 * @returns The database user record
 */
async function syncUserToDatabase(
  clerkUserId: string,
  email: string,
  name: string | null
): Promise<DbUser> {
  const supabase = getServerSupabaseClient();

  // Use upsert to handle both create and update in one atomic operation
  // This is idempotent - running it multiple times has the same effect
  const { data, error } = await supabase
    .from("users")
    .upsert(
      {
        clerk_user_id: clerkUserId,
        email,
        name,
      },
      {
        onConflict: "clerk_user_id",
        // Update email and name on conflict (they may have changed in Clerk)
      }
    )
    .select("*")
    .single();

  if (error) {
    throw new AuthenticationError(
      `Failed to sync user to database: ${error.message}`,
      "DB_SYNC_FAILED"
    );
  }

  if (!data) {
    throw new AuthenticationError(
      "User sync succeeded but no data returned",
      "DB_SYNC_FAILED"
    );
  }

  return data as DbUser;
}

/**
 * Gets the current authenticated user from the database.
 *
 * This function:
 * 1. Validates the Clerk authentication
 * 2. Fetches full user data from Clerk
 * 3. Syncs the user to the database (creates if new)
 * 4. Returns the database user record
 *
 * Use this in API routes and server components that need the DB user.
 *
 * @throws {AuthenticationError} If the user is not authenticated or sync fails
 * @returns The database user record
 *
 * @example
 * ```ts
 * // In an API route
 * export async function GET() {
 *   try {
 *     const user = await requireDbUser();
 *     return Response.json({ user });
 *   } catch (error) {
 *     if (error instanceof AuthenticationError) {
 *       return Response.json({ error: error.message }, { status: 401 });
 *     }
 *     throw error;
 *   }
 * }
 * ```
 */
export async function requireDbUser(): Promise<DbUser> {
  // Step 1: Get Clerk auth context
  const { userId } = await auth();

  if (!userId) {
    throw new AuthenticationError(
      "User is not authenticated",
      "NOT_AUTHENTICATED"
    );
  }

  // Step 2: Fetch full user data from Clerk
  const clerkUser = await currentUser();

  if (!clerkUser) {
    throw new AuthenticationError(
      "Failed to fetch user from Clerk",
      "USER_FETCH_FAILED"
    );
  }

  // Step 3: Extract required fields
  const email = clerkUser.emailAddresses.find(
    (e) => e.id === clerkUser.primaryEmailAddressId
  )?.emailAddress;

  if (!email) {
    throw new AuthenticationError(
      "User does not have a primary email address",
      "USER_FETCH_FAILED"
    );
  }

  const name =
    clerkUser.fullName ||
    clerkUser.firstName ||
    clerkUser.username ||
    null;

  // Step 4: Sync to database and return
  return syncUserToDatabase(clerkUser.id, email, name);
}

/**
 * Gets the current user from the database without throwing.
 * Returns null if the user is not authenticated.
 *
 * Use this when you want to optionally use user data but don't want to
 * require authentication.
 *
 * @returns The database user record or null
 */
export async function getDbUser(): Promise<DbUser | null> {
  try {
    return await requireDbUser();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return null;
    }
    throw error;
  }
}

/**
 * Gets a database user by their Clerk user ID.
 * Does NOT sync - only queries existing records.
 *
 * Use this when you already have a Clerk user ID and want to look up
 * their DB record without triggering a sync.
 *
 * @param clerkUserId - The Clerk user ID to look up
 * @returns The database user record or null if not found
 */
export async function getDbUserByClerkId(
  clerkUserId: string
): Promise<DbUser | null> {
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("clerk_user_id", clerkUserId)
    .single();

  if (error) {
    // Not found is expected - return null
    if (error.code === "PGRST116") {
      return null;
    }
    throw new AuthenticationError(
      `Failed to query user: ${error.message}`,
      "DB_QUERY_FAILED"
    );
  }

  return data as DbUser | null;
}

/**
 * Gets a database user by their database UUID.
 *
 * @param userId - The database UUID
 * @returns The database user record or null if not found
 */
export async function getDbUserById(userId: string): Promise<DbUser | null> {
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    // Not found is expected - return null
    if (error.code === "PGRST116") {
      return null;
    }
    throw new AuthenticationError(
      `Failed to query user: ${error.message}`,
      "DB_QUERY_FAILED"
    );
  }

  return data as DbUser | null;
}
