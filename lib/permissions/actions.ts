"use server";

/**
 * Server Actions for Permission Management
 *
 * These actions can be called directly from client components.
 * All actions enforce permissions and return serializable results.
 */

import { getServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentOrganization } from "@/lib/auth";
import {
  canUserAccess,
  getEffectiveRole,
  canGrantRole,
  canRevokePermission,
  PermissionError,
} from "./index";
import { AuthenticationError } from "@/lib/auth";
import type {
  ResourceType,
  ResourceRole,
  GranteeType,
  DbResourcePermission,
} from "@/lib/supabase/types";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Standard result type for server actions.
 */
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string };

/**
 * Permission entry with grantee details.
 */
export interface PermissionEntry {
  id: string;
  granteeType: GranteeType;
  granteeId: string;
  granteeName: string;
  granteeEmail?: string; // Only for user grantees
  role: ResourceRole;
  permissionType: "grant" | "deny";
  grantedBy: string;
  createdAt: string;
}

/**
 * Resource permissions list result.
 */
export interface ResourcePermissionsResult {
  ownerTeam?: {
    id: string;
    name: string;
  };
  permissions: PermissionEntry[];
  userRole: ResourceRole; // Current user's effective role on the resource
}

/**
 * Grantee lookup result.
 */
interface GranteeInfo {
  type: GranteeType;
  id: string;
  name: string;
  email?: string;
}

// ============================================================================
// LIST PERMISSIONS
// ============================================================================

/**
 * Lists all explicit permissions for a resource.
 *
 * Returns:
 * - Owner team information (if applicable)
 * - All explicit permissions (grants + denies) with grantee details
 *
 * Permission: User must have `grant_access` permission on the resource.
 */
export async function listResourcePermissionsAction(
  resourceType: ResourceType,
  resourceId: string
): Promise<ActionResult<ResourcePermissionsResult>> {
  try {
    const user = await getCurrentUser();
    const { organization } = await getCurrentOrganization();
    const supabase = getServerSupabaseClient();

    // Check permission to list permissions (grant_access required)
    const permissionCheck = await canUserAccess(
      user.id,
      resourceType,
      resourceId,
      "grant_access"
    );

    if (!permissionCheck.allowed) {
      return {
        success: false,
        error: permissionCheck.reason || "Permission denied",
        code: "PERMISSION_DENIED",
      };
    }

    // Get resource metadata to find owner team
    let ownerTeamId: string | null = null;
    if (resourceType === "folder") {
      const { data: folder } = await supabase
        .from("folders")
        .select("owner_team_id")
        .eq("id", resourceId)
        .is("deleted_at", null)
        .single();

      if (!folder) {
        return {
          success: false,
          error: "Resource not found",
          code: "NOT_FOUND",
        };
      }

      ownerTeamId = folder.owner_team_id;
    } else {
      const { data: file } = await supabase
        .from("files")
        .select("owner_team_id")
        .eq("id", resourceId)
        .is("deleted_at", null)
        .single();

      if (!file) {
        return {
          success: false,
          error: "Resource not found",
          code: "NOT_FOUND",
        };
      }

      ownerTeamId = file.owner_team_id;
    }

    // Get owner team info if exists
    let ownerTeam: { id: string; name: string } | undefined;
    if (ownerTeamId) {
      const { data: team } = await supabase
        .from("teams")
        .select("id, name")
        .eq("id", ownerTeamId)
        .eq("organization_id", organization.id)
        .single();

      if (team) {
        ownerTeam = { id: team.id, name: team.name };
      }
    }

    // Get all explicit permissions for this resource
    const { data: permissions, error: permissionsError } = await supabase
      .from("resource_permissions")
      .select("*")
      .eq("resource_type", resourceType)
      .eq("resource_id", resourceId)
      .order("created_at", { ascending: false });

    if (permissionsError) {
      return {
        success: false,
        error: permissionsError.message,
        code: "DB_ERROR",
      };
    }

    // Enrich permissions with grantee details
    const enrichedPermissions: PermissionEntry[] = [];

    for (const perm of permissions || []) {
      if (perm.grantee_type === "user") {
        const { data: granteeUser } = await supabase
          .from("users")
          .select("id, email, name")
          .eq("id", perm.grantee_id)
          .single();

        if (granteeUser) {
          enrichedPermissions.push({
            id: perm.id,
            granteeType: "user",
            granteeId: perm.grantee_id,
            granteeName: granteeUser.name || granteeUser.email,
            granteeEmail: granteeUser.email,
            role: perm.role,
            permissionType: perm.permission_type,
            grantedBy: perm.granted_by,
            createdAt: perm.created_at,
          });
        }
      } else {
        // Team grantee
        const { data: granteeTeam } = await supabase
          .from("teams")
          .select("id, name")
          .eq("id", perm.grantee_id)
          .eq("organization_id", organization.id)
          .single();

        if (granteeTeam) {
          enrichedPermissions.push({
            id: perm.id,
            granteeType: "team",
            granteeId: perm.grantee_id,
            granteeName: granteeTeam.name,
            role: perm.role,
            permissionType: perm.permission_type,
            grantedBy: perm.granted_by,
            createdAt: perm.created_at,
          });
        }
      }
    }

    // Get current user's effective role
    const userEffectiveRole = await getEffectiveRole(user.id, resourceType, resourceId);

    return {
      success: true,
      data: {
        ownerTeam,
        permissions: enrichedPermissions,
        userRole: userEffectiveRole || "viewer", // Fallback to viewer if null (shouldn't happen since they have grant_access)
      },
    };
  } catch (error) {
    return handleError(error);
  }
}

// ============================================================================
// GRANT PERMISSION
// ============================================================================

/**
 * Grants a permission to a user or team.
 *
 * @param resourceType - 'folder' or 'file'
 * @param resourceId - Resource UUID
 * @param granteeType - 'user' or 'team'
 * @param granteeIdentifier - Email for users, name for teams
 * @param role - Role to grant (admin, editor, viewer)
 *
 * Permission: User must have `grant_access` permission and be able to grant the requested role.
 */
export async function grantResourcePermissionAction(
  resourceType: ResourceType,
  resourceId: string,
  granteeType: GranteeType,
  granteeIdentifier: string,
  role: ResourceRole
): Promise<ActionResult<PermissionEntry>> {
  try {
    const user = await getCurrentUser();
    const { organization } = await getCurrentOrganization();
    const supabase = getServerSupabaseClient();

    // Check permission to grant access
    const permissionCheck = await canUserAccess(
      user.id,
      resourceType,
      resourceId,
      "grant_access"
    );

    if (!permissionCheck.allowed) {
      return {
        success: false,
        error: permissionCheck.reason || "Permission denied",
        code: "PERMISSION_DENIED",
      };
    }

    // Validate that grantor can grant this role
    if (!canGrantRole(permissionCheck.role, role)) {
      return {
        success: false,
        error: `You cannot grant ${role} role. Your role (${permissionCheck.role}) is insufficient.`,
        code: "INVALID_ROLE",
      };
    }

    // Find grantee by identifier
    const grantee = await findGranteeByIdentifier(
      granteeIdentifier,
      granteeType,
      organization.id
    );

    if (!grantee) {
      return {
        success: false,
        error:
          granteeType === "user"
            ? `User with email "${granteeIdentifier}" not found in organization`
            : `Team "${granteeIdentifier}" not found in organization`,
        code: "NOT_FOUND",
      };
    }

    // Verify grantee type matches
    if (grantee.type !== granteeType) {
      return {
        success: false,
        error: `Expected ${granteeType} but found ${grantee.type}`,
        code: "TYPE_MISMATCH",
      };
    }

    // Check if permission already exists
    const { data: existing } = await supabase
      .from("resource_permissions")
      .select("id, role, permission_type")
      .eq("resource_type", resourceType)
      .eq("resource_id", resourceId)
      .eq("grantee_type", granteeType)
      .eq("grantee_id", grantee.id)
      .single();

    if (existing) {
      // Update existing permission
      const { data: updated, error: updateError } = await supabase
        .from("resource_permissions")
        .update({
          role,
          permission_type: "grant",
          granted_by: user.id,
        })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (updateError) {
        return {
          success: false,
          error: updateError.message,
          code: "DB_ERROR",
        };
      }

      return {
        success: true,
        data: {
          id: updated.id,
          granteeType: granteeType,
          granteeId: grantee.id,
          granteeName: grantee.name,
          granteeEmail: grantee.email,
          role: updated.role,
          permissionType: updated.permission_type,
          grantedBy: updated.granted_by,
          createdAt: updated.created_at,
        },
      };
    }

    // Create new permission
    const { data: newPermission, error: insertError } = await supabase
      .from("resource_permissions")
      .insert({
        resource_type: resourceType,
        resource_id: resourceId,
        grantee_type: granteeType,
        grantee_id: grantee.id,
        role,
        permission_type: "grant",
        granted_by: user.id,
      })
      .select("*")
      .single();

    if (insertError) {
      return {
        success: false,
        error: insertError.message,
        code: "DB_ERROR",
      };
    }

    return {
      success: true,
      data: {
        id: newPermission.id,
        granteeType: granteeType,
        granteeId: grantee.id,
        granteeName: grantee.name,
        granteeEmail: grantee.email,
        role: newPermission.role,
        permissionType: newPermission.permission_type,
        grantedBy: newPermission.granted_by,
        createdAt: newPermission.created_at,
      },
    };
  } catch (error) {
    return handleError(error);
  }
}

// ============================================================================
// REVOKE PERMISSION
// ============================================================================

/**
 * Revokes a permission from a user or team.
 *
 * Permission: Only admins can revoke permissions.
 */
export async function revokeResourcePermissionAction(
  resourceType: ResourceType,
  resourceId: string,
  granteeType: GranteeType,
  granteeId: string
): Promise<ActionResult<void>> {
  try {
    const user = await getCurrentUser();
    const supabase = getServerSupabaseClient();

    // Check permission - must be admin to revoke
    const permissionCheck = await canUserAccess(
      user.id,
      resourceType,
      resourceId,
      "revoke_access"
    );

    if (!permissionCheck.allowed) {
      return {
        success: false,
        error: permissionCheck.reason || "Permission denied",
        code: "PERMISSION_DENIED",
      };
    }

    // Verify user can revoke (admin only)
    if (!canRevokePermission(permissionCheck.role)) {
      return {
        success: false,
        error: "Only admins can revoke permissions",
        code: "PERMISSION_DENIED",
      };
    }

    // Get resource to check owner team
    let ownerTeamId: string | null = null;
    if (resourceType === "folder") {
      const { data: folder } = await supabase
        .from("folders")
        .select("owner_team_id")
        .eq("id", resourceId)
        .is("deleted_at", null)
        .single();

      if (!folder) {
        return {
          success: false,
          error: "Resource not found",
          code: "NOT_FOUND",
        };
      }

      ownerTeamId = folder.owner_team_id;
    } else {
      const { data: file } = await supabase
        .from("files")
        .select("owner_team_id")
        .eq("id", resourceId)
        .is("deleted_at", null)
        .single();

      if (!file) {
        return {
          success: false,
          error: "Resource not found",
          code: "NOT_FOUND",
        };
      }

      ownerTeamId = file.owner_team_id;
    }

    // Prevent revoking owner team's implicit admin access
    if (granteeType === "team" && ownerTeamId === granteeId) {
      return {
        success: false,
        error: "Cannot revoke owner team's access",
        code: "INVALID_OPERATION",
      };
    }

    // Delete the permission
    const { error: deleteError } = await supabase
      .from("resource_permissions")
      .delete()
      .eq("resource_type", resourceType)
      .eq("resource_id", resourceId)
      .eq("grantee_type", granteeType)
      .eq("grantee_id", granteeId);

    if (deleteError) {
      return {
        success: false,
        error: deleteError.message,
        code: "DB_ERROR",
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    return handleError(error);
  }
}

// ============================================================================
// UPDATE PERMISSION
// ============================================================================

/**
 * Updates an existing permission's role.
 *
 * Permission: Only admins can update permissions.
 */
export async function updateResourcePermissionAction(
  resourceType: ResourceType,
  resourceId: string,
  granteeType: GranteeType,
  granteeId: string,
  newRole: ResourceRole
): Promise<ActionResult<PermissionEntry>> {
  try {
    const user = await getCurrentUser();
    const { organization } = await getCurrentOrganization();
    const supabase = getServerSupabaseClient();

    // Check permission - must be admin to update
    const permissionCheck = await canUserAccess(
      user.id,
      resourceType,
      resourceId,
      "revoke_access"
    );

    if (!permissionCheck.allowed) {
      return {
        success: false,
        error: permissionCheck.reason || "Permission denied",
        code: "PERMISSION_DENIED",
      };
    }

    // Verify user can revoke/update (admin only)
    if (!canRevokePermission(permissionCheck.role)) {
      return {
        success: false,
        error: "Only admins can update permissions",
        code: "PERMISSION_DENIED",
      };
    }

    // Validate that admin can grant this role (admins can grant any role)
    if (!canGrantRole(permissionCheck.role, newRole)) {
      return {
        success: false,
        error: `Cannot grant ${newRole} role`,
        code: "INVALID_ROLE",
      };
    }

    // Get resource to check owner team
    let ownerTeamId: string | null = null;
    if (resourceType === "folder") {
      const { data: folder } = await supabase
        .from("folders")
        .select("owner_team_id")
        .eq("id", resourceId)
        .is("deleted_at", null)
        .single();

      if (!folder) {
        return {
          success: false,
          error: "Resource not found",
          code: "NOT_FOUND",
        };
      }

      ownerTeamId = folder.owner_team_id;
    } else {
      const { data: file } = await supabase
        .from("files")
        .select("owner_team_id")
        .eq("id", resourceId)
        .is("deleted_at", null)
        .single();

      if (!file) {
        return {
          success: false,
          error: "Resource not found",
          code: "NOT_FOUND",
        };
      }

      ownerTeamId = file.owner_team_id;
    }

    // Prevent modifying owner team's implicit admin access
    if (granteeType === "team" && ownerTeamId === granteeId) {
      return {
        success: false,
        error: "Cannot modify owner team's access",
        code: "INVALID_OPERATION",
      };
    }

    // Find existing permission
    const { data: existing, error: findError } = await supabase
      .from("resource_permissions")
      .select("*")
      .eq("resource_type", resourceType)
      .eq("resource_id", resourceId)
      .eq("grantee_type", granteeType)
      .eq("grantee_id", granteeId)
      .single();

    if (findError || !existing) {
      return {
        success: false,
        error: "Permission not found",
        code: "NOT_FOUND",
      };
    }

    // Update the permission
    const { data: updated, error: updateError } = await supabase
      .from("resource_permissions")
      .update({
        role: newRole,
        granted_by: user.id,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (updateError) {
      return {
        success: false,
        error: updateError.message,
        code: "DB_ERROR",
      };
    }

    // Get grantee details for response
    let granteeName = "";
    let granteeEmail: string | undefined;

    if (granteeType === "user") {
      const { data: granteeUser } = await supabase
        .from("users")
        .select("id, email, name")
        .eq("id", granteeId)
        .single();

      if (granteeUser) {
        granteeName = granteeUser.name || granteeUser.email;
        granteeEmail = granteeUser.email;
      }
    } else {
      const { data: granteeTeam } = await supabase
        .from("teams")
        .select("id, name")
        .eq("id", granteeId)
        .eq("organization_id", organization.id)
        .single();

      if (granteeTeam) {
        granteeName = granteeTeam.name;
      }
    }

    return {
      success: true,
      data: {
        id: updated.id,
        granteeType: granteeType,
        granteeId: granteeId,
        granteeName,
        granteeEmail,
        role: updated.role,
        permissionType: updated.permission_type,
        grantedBy: updated.granted_by,
        createdAt: updated.created_at,
      },
    };
  } catch (error) {
    return handleError(error);
  }
}

// ============================================================================
// GET RESOURCE INFO
// ============================================================================

/**
 * Gets resource information (type, name) by ID.
 * Tries folder first, then file.
 */
export async function getResourceInfoAction(
  resourceId: string
): Promise<ActionResult<{ type: ResourceType; name: string }>> {
  try {
    const user = await getCurrentUser();
    const supabase = getServerSupabaseClient();

    // Try folder first
    const { data: folder, error: folderError } = await supabase
      .from("folders")
      .select("id, name")
      .eq("id", resourceId)
      .is("deleted_at", null)
      .single();

    if (folder && !folderError) {
      // Check permission
      const role = await getEffectiveRole(user.id, "folder", resourceId);
      if (!role) {
        return {
          success: false,
          error: "No access to this resource",
          code: "PERMISSION_DENIED",
        };
      }

      return {
        success: true,
        data: { type: "folder" as ResourceType, name: folder.name },
      };
    }

    // Try file
    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("id, name")
      .eq("id", resourceId)
      .is("deleted_at", null)
      .single();

    if (file && !fileError) {
      // Check permission
      const role = await getEffectiveRole(user.id, "file", resourceId);
      if (!role) {
        return {
          success: false,
          error: "No access to this resource",
          code: "PERMISSION_DENIED",
        };
      }

      return {
        success: true,
        data: { type: "file" as ResourceType, name: file.name },
      };
    }

    return {
      success: false,
      error: "Resource not found",
      code: "NOT_FOUND",
    };
  } catch (error) {
    return handleError(error);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Finds a grantee (user or team) by identifier.
 * For users: tries to find by email
 * For teams: tries to find by name
 *
 * @param identifier - Email for users, name for teams
 * @param granteeType - 'user' or 'team'
 * @param organizationId - Organization ID to scope the search
 * @returns Grantee info or null if not found
 */
async function findGranteeByIdentifier(
  identifier: string,
  granteeType: GranteeType,
  organizationId: string
): Promise<GranteeInfo | null> {
  const supabase = getServerSupabaseClient();

  if (granteeType === "user") {
    // Find user by email
    const { data: user } = await supabase
      .from("users")
      .select("id, email, name")
      .eq("email", identifier.trim().toLowerCase())
      .single();

    if (!user) {
      return null;
    }

    // Verify user is in the organization
    const { data: membership } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (!membership) {
      return null;
    }

    return {
      type: "user",
      id: user.id,
      name: user.name || user.email,
      email: user.email,
    };
  } else {
    // Find team by name
    const { data: team } = await supabase
      .from("teams")
      .select("id, name")
      .eq("name", identifier.trim())
      .eq("organization_id", organizationId)
      .single();

    if (!team) {
      return null;
    }

    return {
      type: "team",
      id: team.id,
      name: team.name,
    };
  }
}

/**
 * Error handler for server actions.
 */
function handleError(error: unknown): ActionResult<never> {
  if (error instanceof AuthenticationError) {
    return {
      success: false,
      error: error.message,
      code: "AUTH_ERROR",
    };
  }

  if (error instanceof PermissionError) {
    return {
      success: false,
      error: error.message,
      code: "PERMISSION_DENIED",
    };
  }

  console.error("Permission action error:", error);
  return {
    success: false,
    error: "An unexpected error occurred",
    code: "UNKNOWN_ERROR",
  };
}
