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

// Enum types
export type {
  OrgRole,
  ResourceRole,
  ResourceType,
  GranteeType,
  PermissionType,
} from "./types";

// Database interface
export type { Database } from "./types";

// Table row types
export type {
  DbUser,
  DbUserInsert,
  DbUserUpdate,
  DbOrganization,
  DbOrganizationInsert,
  DbOrganizationUpdate,
  DbOrganizationMember,
  DbOrganizationMemberInsert,
  DbTeam,
  DbTeamInsert,
  DbTeamUpdate,
  DbTeamMember,
  DbTeamMemberInsert,
  DbFolder,
  DbFolderInsert,
  DbFolderUpdate,
  DbFile,
  DbFileInsert,
  DbFileUpdate,
  DbResourcePermission,
  DbResourcePermissionInsert,
  DbPublicLink,
  DbRedaction,
  DbAuditLog,
} from "./types";
