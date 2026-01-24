/**
 * Auth utilities for server-side use.
 *
 * This module provides helpers for:
 * - Getting the current authenticated user from the database
 * - Getting the current user's organization context
 * - Syncing Clerk users to the database
 * - Looking up users by various identifiers
 *
 * @example
 * ```ts
 * import { getCurrentUser, getCurrentOrganization, AuthenticationError } from "@/lib/auth";
 *
 * export async function GET() {
 *   try {
 *     const user = await getCurrentUser();
 *     const { organization, role } = await getCurrentOrganization();
 *     return Response.json({ user, organization, role });
 *   } catch (error) {
 *     if (error instanceof AuthenticationError) {
 *       return Response.json({ error: error.message }, { status: 401 });
 *     }
 *     throw error;
 *   }
 * }
 * ```
 */

// User functions
export {
  requireDbUser,
  getDbUser,
  getCurrentUser,
  getDbUserByClerkId,
  getDbUserById,
  AuthenticationError,
} from "./user";

// Organization functions
export {
  getCurrentOrganization,
  getOrganization,
  getOrganizationById,
  isUserSuperAdmin,
} from "./organization";

// Repair function for edge cases
export { repairUserSetup } from "./repair-user-setup";

// Re-export types for convenience
export type { DbUser } from "@/lib/supabase/types";
export type { OrganizationContext } from "./organization";
