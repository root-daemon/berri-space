/**
 * Supabase client utilities.
 *
 * This module provides:
 * - Server-side Supabase client for API routes and server components
 * - Database types for TypeScript
 */

export {
  createServerSupabaseClient,
  getServerSupabaseClient,
} from "./server";

export type {
  Database,
  DbUser,
  DbUserInsert,
  DbUserUpdate,
} from "./types";
