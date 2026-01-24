/**
 * Centralized Permission Engine
 *
 * This module provides the single source of truth for all permission checks.
 * All authorization decisions MUST go through this module.
 *
 * Permission Resolution Order (from get_effective_role database function):
 * 1. Resource not found / deleted → deny
 * 2. Resource is orphaned?
 *    - User is super_admin → admin
 *    - Otherwise → deny
 * 3. Explicit DENY on resource for user or team → deny
 * 4. User's team owns the resource → admin
 * 5. Explicit GRANT on resource → use that role
 * 6. inherit_permissions = false? → deny
 * 7. Walk up folder tree checking deny, ownership, grants, inheritance
 * 8. No match → deny
 *
 * Key Principles:
 * - Deny always wins over any grant
 * - Highest grant wins when multiple sources exist
 * - Inheritance can be broken at any level
 * - Super-admin has NO implicit access (except orphaned resources)
 * - Default to deny if ambiguous
 */

import { getServerSupabaseClient } from "@/lib/supabase/server";
import type { ResourceType, ResourceRole } from "@/lib/supabase/types";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Actions that can be performed on folders.
 * Maps to role requirements from permissions.md
 */
export type FolderAction =
  | "view"
  | "list"
  | "create_subfolder"
  | "rename"
  | "move"
  | "delete"
  | "restore"
  | "grant_access"
  | "deny_access"
  | "revoke_access"
  | "create_public_link"
  | "disable_public_link"
  | "break_inheritance";

/**
 * Actions that can be performed on files.
 * Maps to role requirements from permissions.md
 */
export type FileAction =
  | "view"
  | "download"
  | "upload"
  | "rename"
  | "move"
  | "delete"
  | "restore"
  | "grant_access"
  | "deny_access"
  | "revoke_access"
  | "create_public_link"
  | "disable_public_link"
  | "break_inheritance"
  | "ask_ai"
  | "view_redaction_indicator"
  | "view_redaction_details"
  | "create_redaction"
  | "remove_redaction";

/**
 * Union of all resource actions.
 */
export type ResourceAction = FolderAction | FileAction;

/**
 * Result of a permission check.
 */
export interface PermissionResult {
  /** Whether the action is allowed */
  allowed: boolean;
  /** The user's effective role on the resource (null if no access) */
  role: ResourceRole | null;
  /** Reason for denial (only set if allowed is false) */
  reason?: string;
}

// ============================================================================
// ACTION TO ROLE MAPPING
// ============================================================================

/**
 * Maps folder actions to minimum required role.
 * Based on the Role-Action Matrix in permissions.md
 */
const FOLDER_ACTION_ROLES: Record<FolderAction, ResourceRole> = {
  // Viewer actions
  view: "viewer",
  list: "viewer",

  // Editor actions
  create_subfolder: "editor",
  rename: "editor",
  grant_access: "editor", // Note: editors can only grant editor/viewer, not admin
  create_public_link: "editor",

  // Admin actions
  move: "admin",
  delete: "admin",
  restore: "admin",
  deny_access: "admin",
  revoke_access: "admin",
  disable_public_link: "admin",
  break_inheritance: "admin",
};

/**
 * Maps file actions to minimum required role.
 * Based on the Role-Action Matrix in permissions.md
 */
const FILE_ACTION_ROLES: Record<FileAction, ResourceRole> = {
  // Viewer actions
  view: "viewer",
  download: "viewer",
  view_redaction_indicator: "viewer",
  ask_ai: "viewer", // Note: public links cannot ask AI

  // Editor actions
  upload: "editor",
  rename: "editor",
  grant_access: "editor", // Note: editors can only grant editor/viewer
  create_public_link: "editor",

  // Admin actions
  move: "admin",
  delete: "admin",
  restore: "admin",
  deny_access: "admin",
  revoke_access: "admin",
  disable_public_link: "admin",
  break_inheritance: "admin",
  view_redaction_details: "admin",
  create_redaction: "admin",
  remove_redaction: "admin",
};

/**
 * Role hierarchy for comparison.
 * Higher number = higher privilege.
 */
const ROLE_HIERARCHY: Record<ResourceRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
};

// ============================================================================
// CORE PERMISSION FUNCTIONS
// ============================================================================

/**
 * Gets the effective role for a user on a resource.
 *
 * This calls the database function `get_effective_role` which implements
 * the full permission resolution logic including:
 * - Deny permissions
 * - Team ownership
 * - Permission inheritance
 * - Orphaned resource handling
 *
 * @param userId - The user's database UUID
 * @param resourceType - 'folder' or 'file'
 * @param resourceId - The resource's UUID
 * @returns The effective role or null if no access
 */
export async function getEffectiveRole(
  userId: string,
  resourceType: ResourceType,
  resourceId: string
): Promise<ResourceRole | null> {
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_effective_role", {
    p_user_id: userId,
    p_resource_type: resourceType,
    p_resource_id: resourceId,
  });

  if (error) {
    // Log error but default to deny for safety
    console.error("Permission check failed:", error.message);
    return null;
  }

  // The function returns null for no access, or a role string
  return data as ResourceRole | null;
}

/**
 * Checks if a role meets the minimum required role.
 *
 * @param userRole - The user's effective role
 * @param requiredRole - The minimum required role
 * @returns Whether the user's role is sufficient
 */
function roleAtLeast(
  userRole: ResourceRole | null,
  requiredRole: ResourceRole
): boolean {
  if (!userRole) return false;
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Main permission check function.
 *
 * This is the ONLY function that should be used for permission checks.
 * All API routes and server actions MUST call this before performing actions.
 *
 * @param userId - The user's database UUID
 * @param resourceType - 'folder' or 'file'
 * @param resourceId - The resource's UUID
 * @param action - The action being performed
 * @returns Permission result with allowed status and reason
 *
 * @example
 * ```ts
 * const result = await canUserAccess(userId, 'folder', folderId, 'delete');
 * if (!result.allowed) {
 *   return Response.json({ error: result.reason }, { status: 403 });
 * }
 * ```
 */
export async function canUserAccess(
  userId: string,
  resourceType: ResourceType,
  resourceId: string,
  action: ResourceAction
): Promise<PermissionResult> {
  // Get the required role for this action
  const actionRoles =
    resourceType === "folder" ? FOLDER_ACTION_ROLES : FILE_ACTION_ROLES;
  const requiredRole = actionRoles[action as keyof typeof actionRoles];

  if (!requiredRole) {
    // Unknown action - deny by default
    return {
      allowed: false,
      role: null,
      reason: `Unknown action: ${action}`,
    };
  }

  // Get the user's effective role on the resource
  const effectiveRole = await getEffectiveRole(userId, resourceType, resourceId);

  // Check if role is sufficient
  if (!roleAtLeast(effectiveRole, requiredRole)) {
    return {
      allowed: false,
      role: effectiveRole,
      reason: effectiveRole
        ? `Insufficient permissions. Required: ${requiredRole}, has: ${effectiveRole}`
        : "No access to this resource",
    };
  }

  return {
    allowed: true,
    role: effectiveRole,
  };
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick check for view access.
 * Equivalent to canUserAccess(userId, type, id, 'view').allowed
 */
export async function canView(
  userId: string,
  resourceType: ResourceType,
  resourceId: string
): Promise<boolean> {
  const result = await canUserAccess(userId, resourceType, resourceId, "view");
  return result.allowed;
}

/**
 * Quick check for edit access (editor or admin role).
 */
export async function canEdit(
  userId: string,
  resourceType: ResourceType,
  resourceId: string
): Promise<boolean> {
  const role = await getEffectiveRole(userId, resourceType, resourceId);
  return roleAtLeast(role, "editor");
}

/**
 * Quick check for admin access.
 */
export async function canAdmin(
  userId: string,
  resourceType: ResourceType,
  resourceId: string
): Promise<boolean> {
  const role = await getEffectiveRole(userId, resourceType, resourceId);
  return role === "admin";
}

/**
 * Asserts that a user has access, throwing if not.
 * Use this to simplify permission checks in routes.
 *
 * @throws {PermissionError} If the user doesn't have access
 *
 * @example
 * ```ts
 * await assertAccess(userId, 'folder', folderId, 'delete');
 * // If we get here, user has permission
 * await deleteFolder(folderId);
 * ```
 */
export async function assertAccess(
  userId: string,
  resourceType: ResourceType,
  resourceId: string,
  action: ResourceAction
): Promise<ResourceRole> {
  const result = await canUserAccess(userId, resourceType, resourceId, action);

  if (!result.allowed) {
    throw new PermissionError(
      result.reason || "Access denied",
      action,
      resourceType,
      resourceId
    );
  }

  return result.role!;
}

// ============================================================================
// ERROR CLASS
// ============================================================================

/**
 * Error thrown when a permission check fails.
 */
export class PermissionError extends Error {
  constructor(
    message: string,
    public action: ResourceAction,
    public resourceType: ResourceType,
    public resourceId: string
  ) {
    super(message);
    this.name = "PermissionError";
  }
}

// ============================================================================
// GRANT VALIDATION
// ============================================================================

/**
 * Validates that a user can grant a specific role to another user/team.
 *
 * Rules from permissions.md:
 * - Admins can grant: admin, editor, viewer
 * - Editors can grant: editor, viewer (NOT admin)
 * - Viewers cannot grant anything
 * - Nobody can grant a higher role than their own
 *
 * @param grantorRole - The role of the user granting permission
 * @param roleToGrant - The role being granted
 * @returns Whether the grant is allowed
 */
export function canGrantRole(
  grantorRole: ResourceRole | null,
  roleToGrant: ResourceRole
): boolean {
  if (!grantorRole) return false;

  // Viewers can never grant
  if (grantorRole === "viewer") return false;

  // Editors can only grant editor or viewer
  if (grantorRole === "editor") {
    return roleToGrant === "editor" || roleToGrant === "viewer";
  }

  // Admins can grant any role
  return true;
}

/**
 * Validates that a user can create a deny permission.
 * Only admins can create deny permissions.
 *
 * @param userRole - The user's effective role
 * @returns Whether the user can create deny permissions
 */
export function canCreateDeny(userRole: ResourceRole | null): boolean {
  return userRole === "admin";
}

/**
 * Validates that a user can revoke a permission.
 * Only admins can revoke permissions.
 *
 * @param userRole - The user's effective role
 * @returns Whether the user can revoke permissions
 */
export function canRevokePermission(userRole: ResourceRole | null): boolean {
  return userRole === "admin";
}
