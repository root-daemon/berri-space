"use server";

/**
 * Server Actions for Folder Operations
 *
 * These actions can be called directly from client components.
 * All actions enforce permissions and return serializable results.
 */

import {
  listFolders,
  getFolder,
  getFolderPath,
  createFolder,
  renameFolder,
  deleteFolder,
  restoreFolder,
  FolderError,
  type FolderWithAccess,
  type CreateFolderInput,
  type RenameFolderInput,
} from "./index";
import { PermissionError } from "@/lib/permissions";
import { AuthenticationError } from "@/lib/auth";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Standard result type for server actions.
 */
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string };

// ============================================================================
// LIST ACTIONS
// ============================================================================

/**
 * Lists folders in a directory.
 *
 * @param parentFolderId - Parent folder ID, or null/undefined for root
 */
export async function listFoldersAction(
  parentFolderId?: string | null
): Promise<ActionResult<FolderWithAccess[]>> {
  try {
    const folders = await listFolders(parentFolderId);
    return { success: true, data: folders };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Gets a single folder by ID.
 */
export async function getFolderAction(
  folderId: string
): Promise<ActionResult<FolderWithAccess | null>> {
  try {
    const folder = await getFolder(folderId);
    return { success: true, data: folder };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Gets the breadcrumb path for a folder.
 */
export async function getFolderPathAction(
  folderId: string
): Promise<ActionResult<FolderWithAccess[]>> {
  try {
    const path = await getFolderPath(folderId);
    return { success: true, data: path };
  } catch (error) {
    return handleError(error);
  }
}

// ============================================================================
// MUTATION ACTIONS
// ============================================================================

/**
 * Creates a new folder.
 */
export async function createFolderAction(
  input: CreateFolderInput
): Promise<ActionResult<FolderWithAccess>> {
  try {
    const folder = await createFolder(input);
    return { success: true, data: folder };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Renames a folder.
 */
export async function renameFolderAction(
  input: RenameFolderInput
): Promise<ActionResult<FolderWithAccess>> {
  try {
    const folder = await renameFolder(input);
    return { success: true, data: folder };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Soft-deletes a folder.
 */
export async function deleteFolderAction(
  folderId: string
): Promise<ActionResult<FolderWithAccess>> {
  try {
    const folder = await deleteFolder(folderId);
    return { success: true, data: folder };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Restores a soft-deleted folder.
 */
export async function restoreFolderAction(
  folderId: string
): Promise<ActionResult<FolderWithAccess>> {
  try {
    const folder = await restoreFolder(folderId);
    return { success: true, data: folder };
  } catch (error) {
    return handleError(error);
  }
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

function handleError(error: unknown): ActionResult<never> {
  if (error instanceof AuthenticationError) {
    return {
      success: false,
      error: error.message,
      code: error.code,
    };
  }

  if (error instanceof PermissionError) {
    return {
      success: false,
      error: error.message,
      code: "PERMISSION_DENIED",
    };
  }

  if (error instanceof FolderError) {
    return {
      success: false,
      error: error.message,
      code: error.code,
    };
  }

  // Unknown error
  console.error("Unexpected error in folder action:", error);
  return {
    success: false,
    error: "An unexpected error occurred",
    code: "UNKNOWN_ERROR",
  };
}
