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
 * For new users, also creates a default organization and team.
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
  // Uses service_role key via getServerSupabaseClient() to bypass RLS policies.
  // This is required to create users, organizations, and teams without permission checks.
  const supabase = getServerSupabaseClient();

  // First, check if user already exists
  const { data: existingUser, error: checkError } = await supabase
    .from("users")
    .select("id, clerk_user_id, email, name, created_at, updated_at")
    .eq("clerk_user_id", clerkUserId)
    .single();

  if (checkError && checkError.code !== "PGRST116") {
    // PGRST116 is "no rows returned" which is expected for new users
    console.error("[syncUserToDatabase] Error checking for existing user:", {
      clerkUserId,
      error: checkError.message,
      code: checkError.code,
    });
    throw new AuthenticationError(
      `Failed to check for existing user: ${checkError.message}`,
      "DB_SYNC_FAILED"
    );
  }

  if (existingUser) {
    // User exists - update email/name if changed
    const needsUpdate =
      existingUser.email !== email || existingUser.name !== name;

    if (needsUpdate) {
      console.log("[syncUserToDatabase] Updating existing user:", {
        userId: existingUser.id,
        clerkUserId,
      });
      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update({ email, name })
        .eq("id", existingUser.id)
        .select("id, clerk_user_id, email, name, created_at, updated_at")
        .single();

      if (updateError) {
        console.error("[syncUserToDatabase] Failed to update user:", {
          userId: existingUser.id,
          error: updateError.message,
          code: updateError.code,
        });
        throw new AuthenticationError(
          `Failed to update user: ${updateError.message}`,
          "DB_SYNC_FAILED"
        );
      }

      console.log("[syncUserToDatabase] User updated successfully:", {
        userId: updatedUser.id,
      });
      return updatedUser as DbUser;
    }

    return existingUser as DbUser;
  }

  // New user - create user, organization, and team
  console.log("[syncUserToDatabase] Creating new user and setup:", {
    clerkUserId,
    email,
    name,
  });

  // Step 1: Create the user
  const { data: newUser, error: userError } = await supabase
    .from("users")
    .insert({
      clerk_user_id: clerkUserId,
      email,
      name,
    })
    .select("id, clerk_user_id, email, name, created_at, updated_at")
    .single();

  if (userError || !newUser) {
    console.error("[syncUserToDatabase] Failed to create user:", {
      clerkUserId,
      error: userError?.message,
      code: userError?.code,
    });
    throw new AuthenticationError(
      `Failed to create user: ${userError?.message || "Unknown error"}`,
      "DB_SYNC_FAILED"
    );
  }

  console.log("[syncUserToDatabase] User created:", { userId: newUser.id });

  // Step 2: Create a personal organization for the user
  const orgName = name ? `${name}'s Workspace` : "My Workspace";
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: orgName })
    .select("id")
    .single();

  if (orgError || !org) {
    console.error("[syncUserToDatabase] Failed to create organization:", {
      userId: newUser.id,
      error: orgError?.message,
      code: orgError?.code,
    });
    // Cleanup: delete the user we just created
    const cleanupError = await supabase.from("users").delete().eq("id", newUser.id);
    if (cleanupError.error) {
      console.error("[syncUserToDatabase] Failed to cleanup user after org creation failure:", {
        userId: newUser.id,
        error: cleanupError.error.message,
      });
    }
    throw new AuthenticationError(
      `Failed to create organization: ${orgError?.message || "Unknown error"}`,
      "DB_SYNC_FAILED"
    );
  }

  console.log("[syncUserToDatabase] Organization created:", { orgId: org.id });

  // Step 3: Add user as super_admin of the organization
  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({
      organization_id: org.id,
      user_id: newUser.id,
      role: "super_admin",
    });

  if (memberError) {
    console.error("[syncUserToDatabase] Failed to create organization membership:", {
      userId: newUser.id,
      orgId: org.id,
      error: memberError.message,
      code: memberError.code,
    });
    // Cleanup
    await supabase.from("organizations").delete().eq("id", org.id);
    await supabase.from("users").delete().eq("id", newUser.id);
    throw new AuthenticationError(
      `Failed to create organization membership: ${memberError.message}`,
      "DB_SYNC_FAILED"
    );
  }

  console.log("[syncUserToDatabase] Organization membership created");

  // Step 4: Create a default team in the organization
  const { data: team, error: teamError } = await supabase
    .from("teams")
    .insert({
      organization_id: org.id,
      name: "Personal",
    })
    .select("id")
    .single();

  if (teamError || !team) {
    console.error("[syncUserToDatabase] Failed to create team:", {
      userId: newUser.id,
      orgId: org.id,
      error: teamError?.message,
      code: teamError?.code,
    });
    // Cleanup
    await supabase.from("organization_members").delete().eq("user_id", newUser.id);
    await supabase.from("organizations").delete().eq("id", org.id);
    await supabase.from("users").delete().eq("id", newUser.id);
    throw new AuthenticationError(
      `Failed to create team: ${teamError?.message || "Unknown error"}`,
      "DB_SYNC_FAILED"
    );
  }

  console.log("[syncUserToDatabase] Team created:", { teamId: team.id });

  // Step 5: Add user to the team
  const { error: teamMemberError } = await supabase
    .from("team_members")
    .insert({
      team_id: team.id,
      user_id: newUser.id,
    });

  if (teamMemberError) {
    console.error("[syncUserToDatabase] Failed to create team membership:", {
      userId: newUser.id,
      teamId: team.id,
      error: teamMemberError.message,
      code: teamMemberError.code,
    });
    // Cleanup
    await supabase.from("teams").delete().eq("id", team.id);
    await supabase.from("organization_members").delete().eq("user_id", newUser.id);
    await supabase.from("organizations").delete().eq("id", org.id);
    await supabase.from("users").delete().eq("id", newUser.id);
    throw new AuthenticationError(
      `Failed to create team membership: ${teamMemberError.message}`,
      "DB_SYNC_FAILED"
    );
  }

  console.log("[syncUserToDatabase] Team membership created - setup complete:", {
    userId: newUser.id,
    orgId: org.id,
    teamId: team.id,
  });

  return newUser as DbUser;
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
 * Alias for requireDbUser().
 * Gets the current authenticated user from the database.
 *
 * @throws {AuthenticationError} If the user is not authenticated or sync fails
 * @returns The database user record
 */
export const getCurrentUser = requireDbUser;

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
    .select("id, clerk_user_id, email, name, created_at, updated_at")
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
    .select("id, clerk_user_id, email, name, created_at, updated_at")
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
