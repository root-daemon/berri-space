/**
 * Auth utilities for server-side use.
 *
 * This module provides helpers for:
 * - Getting the current authenticated user from the database
 * - Syncing Clerk users to the database
 * - Looking up users by various identifiers
 *
 * @example
 * ```ts
 * import { requireDbUser, AuthenticationError } from "@/lib/auth";
 *
 * export async function GET() {
 *   try {
 *     const user = await requireDbUser();
 *     // user is now the database record
 *   } catch (error) {
 *     if (error instanceof AuthenticationError) {
 *       return Response.json({ error: error.message }, { status: 401 });
 *     }
 *     throw error;
 *   }
 * }
 * ```
 */

export {
  requireDbUser,
  getDbUser,
  getDbUserByClerkId,
  getDbUserById,
  AuthenticationError,
} from "./user";

export type { DbUser } from "@/lib/supabase/types";
