/**
 * Folder Service
 *
 * Server-side functions for folder operations.
 * All functions enforce permissions before performing actions.
 */

import { getServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentOrganization } from "@/lib/auth";
import {
  canUserAccess,
  assertAccess,
  getEffectiveRole,
  PermissionError,
} from "@/lib/permissions";
import type {
  DbFolder,
  DbFolderInsert,
  ResourceRole,
} from "@/lib/supabase/types";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Folder with computed access information for the current user.
 */
export interface FolderWithAccess extends DbFolder {
  /** The user's effective role on this folder */
  access: ResourceRole;
}

/**
 * Input for creating a new folder.
 */
export interface CreateFolderInput {
  name: string;
  parentFolderId?: string | null;
  ownerTeamId: string;
}

/**
 * Input for renaming a folder.
 */
export interface RenameFolderInput {
  folderId: string;
  newName: string;
}

/**
 * Input for moving a folder.
 */
export interface MoveFolderInput {
  folderId: string;
  targetParentFolderId: string | null; // null for root
}

/**
 * Error thrown for folder operations.
 */
export class FolderError extends Error {
  constructor(
    message: string,
    public code:
      | "NOT_FOUND"
      | "ALREADY_EXISTS"
      | "INVALID_INPUT"
      | "PERMISSION_DENIED"
      | "DB_ERROR"
      | "CIRCULAR_MOVE"
      | "MOVE_TO_SAME_LOCATION"
  ) {
    super(message);
    this.name = "FolderError";
  }
}

// ============================================================================
// LIST OPERATIONS
// ============================================================================

/**
 * Lists folders accessible to the current user.
 *
 * This function:
 * 1. Gets the user's organization
 * 2. Fetches all non-deleted folders in the org
 * 3. Filters to only folders the user can view
 * 4. Returns folders with their access level
 *
 * @param parentFolderId - Filter to children of this folder (null for root)
 * @returns Array of folders with access information
 */
export async function listFolders(
  parentFolderId?: string | null
): Promise<FolderWithAccess[]> {
  const user = await getCurrentUser();
  const { organization } = await getCurrentOrganization();
  const supabase = getServerSupabaseClient();

  // Build query for non-deleted folders in this org
  let query = supabase
    .from("folders")
    .select("*")
    .eq("organization_id", organization.id)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  // Filter by parent folder
  if (parentFolderId === null || parentFolderId === undefined) {
    query = query.is("parent_folder_id", null);
  } else {
    query = query.eq("parent_folder_id", parentFolderId);
  }

  const { data: folders, error } = await query;

  if (error) {
    console.error("Failed to list folders:", error.message);
    throw new FolderError(`Failed to list folders: ${error.message}`, "DB_ERROR");
  }

  if (!folders || folders.length === 0) {
    return [];
  }

  // Filter folders by permission and add access level
  const accessibleFolders: FolderWithAccess[] = [];

  for (const folder of folders) {
    const role = await getEffectiveRole(user.id, "folder", folder.id);
    if (role) {
      accessibleFolders.push({
        ...folder,
        access: role,
      });
    }
  }

  return accessibleFolders;
}

/**
 * Gets a single folder by ID with access check.
 *
 * @param folderId - The folder UUID
 * @returns The folder with access info, or null if not found/no access
 */
export async function getFolder(
  folderId: string
): Promise<FolderWithAccess | null> {
  const user = await getCurrentUser();
  const supabase = getServerSupabaseClient();

  // Check permission first
  const role = await getEffectiveRole(user.id, "folder", folderId);
  if (!role) {
    return null;
  }

  // Fetch folder
  const { data: folder, error } = await supabase
    .from("folders")
    .select("*")
    .eq("id", folderId)
    .is("deleted_at", null)
    .single();

  if (error || !folder) {
    return null;
  }

  return {
    ...folder,
    access: role,
  };
}

/**
 * Gets the folder path (breadcrumb) from root to the given folder.
 *
 * @param folderId - The folder UUID
 * @returns Array of folders from root to current, or empty if no access
 */
export async function getFolderPath(
  folderId: string
): Promise<FolderWithAccess[]> {
  const user = await getCurrentUser();
  const supabase = getServerSupabaseClient();

  // Check permission on the target folder
  const role = await getEffectiveRole(user.id, "folder", folderId);
  if (!role) {
    return [];
  }

  // Build path by walking up the tree
  const path: FolderWithAccess[] = [];
  let currentId: string | null = folderId;

  while (currentId) {
    const result = await supabase
      .from("folders")
      .select("id, organization_id, owner_team_id, parent_folder_id, name, inherit_permissions, created_by_user_id, created_at, updated_at, deleted_at, deleted_by")
      .eq("id", currentId)
      .is("deleted_at", null)
      .single();

    if (result.error || !result.data) break;

    const folderData = result.data as DbFolder;
    const folderRole = await getEffectiveRole(user.id, "folder", folderData.id);
    if (!folderRole) break;

    path.unshift({
      ...folderData,
      access: folderRole,
    });

    currentId = folderData.parent_folder_id;
  }

  return path;
}

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

/**
 * Creates a new folder.
 *
 * Permission rules:
 * - Root folders: User must be org member
 * - Subfolders: User must have edit permission on parent folder
 *
 * @param input - Folder creation input
 * @returns The created folder with access info
 */
export async function createFolder(
  input: CreateFolderInput
): Promise<FolderWithAccess> {
  const user = await getCurrentUser();
  const { organization } = await getCurrentOrganization();
  const supabase = getServerSupabaseClient();

  // Validate input
  const name = input.name.trim();
  if (!name) {
    throw new FolderError("Folder name cannot be empty", "INVALID_INPUT");
  }

  if (name.length > 255) {
    throw new FolderError("Folder name too long (max 255 characters)", "INVALID_INPUT");
  }

  // Check for invalid characters
  if (/[<>:"/\\|?*]/.test(name)) {
    throw new FolderError(
      "Folder name contains invalid characters",
      "INVALID_INPUT"
    );
  }

  // Permission check
  if (input.parentFolderId) {
    // Creating subfolder - need edit permission on parent
    await assertAccess(user.id, "folder", input.parentFolderId, "create_subfolder");
  }
  // Root folders: org membership is checked by getCurrentOrganization()

  // Verify owner team exists and belongs to the org
  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("id")
    .eq("id", input.ownerTeamId)
    .eq("organization_id", organization.id)
    .single();

  if (teamError || !team) {
    throw new FolderError("Invalid owner team", "INVALID_INPUT");
  }

  // Check for duplicate name in same parent
  const duplicateQuery = supabase
    .from("folders")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("name", name)
    .is("deleted_at", null);

  if (input.parentFolderId) {
    duplicateQuery.eq("parent_folder_id", input.parentFolderId);
  } else {
    duplicateQuery.is("parent_folder_id", null);
  }

  const { data: existing } = await duplicateQuery.single();

  if (existing) {
    throw new FolderError(
      `A folder named "${name}" already exists in this location`,
      "ALREADY_EXISTS"
    );
  }

  // Create the folder
  const folderData: DbFolderInsert = {
    organization_id: organization.id,
    owner_team_id: input.ownerTeamId,
    parent_folder_id: input.parentFolderId || null,
    name,
    created_by_user_id: user.id,
    inherit_permissions: true,
  };

  const { data: folder, error } = await supabase
    .from("folders")
    .insert(folderData)
    .select("*")
    .single();

  if (error) {
    console.error("Failed to create folder:", error.message);
    throw new FolderError(`Failed to create folder: ${error.message}`, "DB_ERROR");
  }

  // Owner team member gets admin access
  return {
    ...folder,
    access: "admin" as ResourceRole,
  };
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

/**
 * Moves a folder to a different parent.
 *
 * Permission: Admin only
 *
 * @param input - Move folder input
 * @returns The moved folder
 */
export async function moveFolder(
  input: MoveFolderInput
): Promise<FolderWithAccess> {
  const { folderId, targetParentFolderId } = input;

  // 1. Authenticate user
  const user = await getCurrentUser();
  const { organization } = await getCurrentOrganization();
  const supabase = getServerSupabaseClient();

  // 2. Get folder record, verify organization
  const { data: folder, error: folderError } = await supabase
    .from("folders")
    .select("*")
    .eq("id", folderId)
    .single();

  if (folderError || !folder) {
    throw new FolderError("Folder not found", "NOT_FOUND");
  }

  if (folder.organization_id !== organization.id) {
    throw new FolderError("Folder not found", "NOT_FOUND");
  }

  if (folder.deleted_at) {
    throw new FolderError("Cannot move a deleted folder", "NOT_FOUND");
  }

  // 3. Check move permission (admin only)
  await assertAccess(user.id, "folder", folderId, "move");

  // 4. Validate target parent exists and belongs to org
  if (targetParentFolderId) {
    const { data: targetParent, error: targetError } = await supabase
      .from("folders")
      .select("id, organization_id, deleted_at")
      .eq("id", targetParentFolderId)
      .single();

    if (targetError || !targetParent) {
      throw new FolderError("Target folder not found", "NOT_FOUND");
    }

    if (targetParent.organization_id !== organization.id) {
      throw new FolderError("Target folder not found", "NOT_FOUND");
    }

    if (targetParent.deleted_at) {
      throw new FolderError("Cannot move to a deleted folder", "NOT_FOUND");
    }

    // 5. Check user has create_subfolder permission on target parent
    const targetPermission = await canUserAccess(
      user.id,
      "folder",
      targetParentFolderId,
      "create_subfolder"
    );

    if (!targetPermission.allowed) {
      throw new PermissionError(
        "No permission to create folders in the target location",
        "create_subfolder",
        "folder",
        targetParentFolderId
      );
    }
  }

  // 6. Prevent circular moves:
  //    - Cannot move folder into itself
  if (folderId === targetParentFolderId) {
    throw new FolderError(
      "Cannot move folder into itself",
      "CIRCULAR_MOVE"
    );
  }

  //    - Cannot move folder into any descendant
  if (targetParentFolderId) {
    const targetPath = await getFolderPath(targetParentFolderId);
    const targetAncestorIds = targetPath.map((f) => f.id);

    // Check if source folder is an ancestor of target
    if (targetAncestorIds.includes(folderId)) {
      throw new FolderError(
        "Cannot move folder into its own descendant",
        "CIRCULAR_MOVE"
      );
    }
  }

  // 7. Prevent moving to same location (no-op)
  if (folder.parent_folder_id === targetParentFolderId) {
    // Return the folder as-is
    const role = await getEffectiveRole(user.id, "folder", folderId);
    if (!role) {
      throw new FolderError("Folder not found", "NOT_FOUND");
    }
    return {
      ...folder,
      access: role,
    };
  }

  // 8. Check for duplicate name in target parent
  const duplicateQuery = supabase
    .from("folders")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("name", folder.name)
    .neq("id", folderId)
    .is("deleted_at", null);

  if (targetParentFolderId) {
    duplicateQuery.eq("parent_folder_id", targetParentFolderId);
  } else {
    duplicateQuery.is("parent_folder_id", null);
  }

  const { data: existing } = await duplicateQuery.single();

  if (existing) {
    throw new FolderError(
      `A folder named "${folder.name}" already exists in the target location`,
      "ALREADY_EXISTS"
    );
  }

  // 9. Update DB: parent_folder_id
  const { data: movedFolder, error: updateError } = await supabase
    .from("folders")
    .update({
      parent_folder_id: targetParentFolderId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", folderId)
    .select("*")
    .single();

  if (updateError || !movedFolder) {
    console.error("Failed to move folder:", updateError?.message);
    throw new FolderError(
      `Failed to move folder: ${updateError?.message || "Unknown error"}`,
      "DB_ERROR"
    );
  }

  // 10. Return updated folder with access info
  const role = await getEffectiveRole(user.id, "folder", folderId);
  if (!role) {
    throw new FolderError("Folder not found", "NOT_FOUND");
  }

  return {
    ...movedFolder,
    access: role,
  };
}

/**
 * Renames a folder.
 *
 * Permission: Editor or above
 *
 * @param input - Rename input
 * @returns The updated folder
 */
export async function renameFolder(
  input: RenameFolderInput
): Promise<FolderWithAccess> {
  const user = await getCurrentUser();
  const { organization } = await getCurrentOrganization();
  const supabase = getServerSupabaseClient();

  // Validate input
  const newName = input.newName.trim();
  if (!newName) {
    throw new FolderError("Folder name cannot be empty", "INVALID_INPUT");
  }

  if (newName.length > 255) {
    throw new FolderError("Folder name too long (max 255 characters)", "INVALID_INPUT");
  }

  if (/[<>:"/\\|?*]/.test(newName)) {
    throw new FolderError(
      "Folder name contains invalid characters",
      "INVALID_INPUT"
    );
  }

  // Check permission
  const role = await assertAccess(user.id, "folder", input.folderId, "rename");

  // Get current folder to find parent
  const { data: currentFolder, error: fetchError } = await supabase
    .from("folders")
    .select("parent_folder_id, name")
    .eq("id", input.folderId)
    .is("deleted_at", null)
    .single();

  if (fetchError || !currentFolder) {
    throw new FolderError("Folder not found", "NOT_FOUND");
  }

  // Skip if name unchanged
  if (currentFolder.name === newName) {
    const folder = await getFolder(input.folderId);
    if (!folder) throw new FolderError("Folder not found", "NOT_FOUND");
    return folder;
  }

  // Check for duplicate name in same parent
  const duplicateQuery = supabase
    .from("folders")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("name", newName)
    .neq("id", input.folderId)
    .is("deleted_at", null);

  if (currentFolder.parent_folder_id) {
    duplicateQuery.eq("parent_folder_id", currentFolder.parent_folder_id);
  } else {
    duplicateQuery.is("parent_folder_id", null);
  }

  const { data: existing } = await duplicateQuery.single();

  if (existing) {
    throw new FolderError(
      `A folder named "${newName}" already exists in this location`,
      "ALREADY_EXISTS"
    );
  }

  // Update the folder
  const { data: folder, error } = await supabase
    .from("folders")
    .update({ name: newName })
    .eq("id", input.folderId)
    .select("*")
    .single();

  if (error) {
    console.error("Failed to rename folder:", error.message);
    throw new FolderError(`Failed to rename folder: ${error.message}`, "DB_ERROR");
  }

  return {
    ...folder,
    access: role,
  };
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

/**
 * Soft-deletes a folder.
 *
 * Permission: Admin only
 *
 * @param folderId - The folder UUID to delete
 * @returns The deleted folder
 */
export async function deleteFolder(folderId: string): Promise<FolderWithAccess> {
  const user = await getCurrentUser();
  const supabase = getServerSupabaseClient();

  // Check permission (admin required for delete)
  const role = await assertAccess(user.id, "folder", folderId, "delete");

  // Soft delete the folder
  const { data: folder, error } = await supabase
    .from("folders")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
    })
    .eq("id", folderId)
    .is("deleted_at", null) // Only delete if not already deleted
    .select("*")
    .single();

  if (error) {
    console.error("Failed to delete folder:", error.message);
    throw new FolderError(`Failed to delete folder: ${error.message}`, "DB_ERROR");
  }

  if (!folder) {
    throw new FolderError("Folder not found or already deleted", "NOT_FOUND");
  }

  return {
    ...folder,
    access: role,
  };
}

/**
 * Restores a soft-deleted folder.
 *
 * Permission: Admin only
 *
 * @param folderId - The folder UUID to restore
 * @returns The restored folder
 */
export async function restoreFolder(folderId: string): Promise<FolderWithAccess> {
  const user = await getCurrentUser();
  const { organization } = await getCurrentOrganization();
  const supabase = getServerSupabaseClient();

  // First, get the deleted folder to check its details
  const { data: deletedFolder, error: fetchError } = await supabase
    .from("folders")
    .select("*")
    .eq("id", folderId)
    .eq("organization_id", organization.id)
    .not("deleted_at", "is", null)
    .single();

  if (fetchError || !deletedFolder) {
    throw new FolderError("Deleted folder not found", "NOT_FOUND");
  }

  // For restore, we check if user would have admin on the restored folder
  // This is a bit tricky since the folder is deleted - we use the owner team
  const userTeams = await getUserTeamIds(user.id, organization.id);
  const isOwner = deletedFolder.owner_team_id && userTeams.includes(deletedFolder.owner_team_id);

  if (!isOwner) {
    // Check if user is super_admin
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organization.id)
      .single();

    if (!membership || membership.role !== "super_admin") {
      throw new PermissionError(
        "Only folder owners or super admins can restore folders",
        "restore",
        "folder",
        folderId
      );
    }
  }

  // Check for name conflict with existing folder
  const duplicateQuery = supabase
    .from("folders")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("name", deletedFolder.name)
    .is("deleted_at", null);

  if (deletedFolder.parent_folder_id) {
    duplicateQuery.eq("parent_folder_id", deletedFolder.parent_folder_id);
  } else {
    duplicateQuery.is("parent_folder_id", null);
  }

  const { data: existing } = await duplicateQuery.single();

  if (existing) {
    throw new FolderError(
      `Cannot restore: a folder named "${deletedFolder.name}" already exists`,
      "ALREADY_EXISTS"
    );
  }

  // Restore the folder
  const { data: restoredFolder, error } = await supabase
    .from("folders")
    .update({
      deleted_at: null,
      deleted_by: null,
    })
    .eq("id", folderId)
    .select("id, organization_id, owner_team_id, parent_folder_id, name, inherit_permissions, created_by_user_id, created_at, updated_at, deleted_at, deleted_by")
    .single();

  if (error) {
    console.error("Failed to restore folder:", error.message);
    throw new FolderError(`Failed to restore folder: ${error.message}`, "DB_ERROR");
  }

  return {
    ...(restoredFolder as DbFolder),
    access: "admin" as ResourceRole,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Gets all team IDs a user belongs to in an organization.
 */
async function getUserTeamIds(userId: string, orgId: string): Promise<string[]> {
  const supabase = getServerSupabaseClient();

  // First get all teams in the org
  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id")
    .eq("organization_id", orgId);

  if (teamsError || !teams) {
    return [];
  }

  const teamIds = teams.map((t) => t.id);
  if (teamIds.length === 0) {
    return [];
  }

  // Then get user's memberships in those teams
  const { data: memberships, error: membershipsError } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId)
    .in("team_id", teamIds);

  if (membershipsError || !memberships) {
    return [];
  }

  return memberships.map((m) => m.team_id);
}

// Re-export types
export type { DbFolder };
