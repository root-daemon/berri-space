"use server";

/**
 * Server Actions for File Operations
 *
 * These actions can be called directly from client components.
 * All actions enforce permissions and return serializable results.
 */

import {
  prepareUpload,
  confirmUpload,
  getDownloadUrl,
  getFile,
  listFiles,
  deleteFile,
  restoreFile,
  renameFile,
  moveFile,
  FileError,
  type FileWithAccess,
  type PrepareUploadInput,
  type PrepareUploadResult,
  type ConfirmUploadInput,
  type GetDownloadUrlInput,
  type GetDownloadUrlResult,
  type MoveFileInput,
} from "./index";
import { PermissionError } from "@/lib/permissions";
import { AuthenticationError } from "@/lib/auth";
import { StorageError } from "./storage";

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
// UPLOAD ACTIONS
// ============================================================================

/**
 * Prepares a file upload by generating a signed URL.
 *
 * Call this before uploading a file. After the upload completes,
 * call confirmUploadAction to create the database record.
 *
 * @param input - Upload preparation parameters
 */
export async function prepareUploadAction(
  input: PrepareUploadInput
): Promise<ActionResult<PrepareUploadResult>> {
  try {
    const result = await prepareUpload(input);
    return { success: true, data: result };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Confirms a file upload and creates the database record.
 *
 * Call this after successfully uploading to the signed URL.
 *
 * @param input - Upload confirmation parameters
 */
export async function confirmUploadAction(
  input: ConfirmUploadInput
): Promise<ActionResult<FileWithAccess>> {
  try {
    const result = await confirmUpload(input);
    return { success: true, data: result };
  } catch (error) {
    return handleError(error);
  }
}

// ============================================================================
// DOWNLOAD ACTIONS
// ============================================================================

/**
 * Gets a signed download URL for a file.
 *
 * @param input - Download URL parameters
 */
export async function getDownloadUrlAction(
  input: GetDownloadUrlInput
): Promise<ActionResult<GetDownloadUrlResult>> {
  try {
    const result = await getDownloadUrl(input);
    return { success: true, data: result };
  } catch (error) {
    return handleError(error);
  }
}

// ============================================================================
// READ ACTIONS
// ============================================================================

/**
 * Gets a single file by ID.
 *
 * @param fileId - The file ID
 */
export async function getFileAction(
  fileId: string
): Promise<ActionResult<FileWithAccess | null>> {
  try {
    const file = await getFile(fileId);
    return { success: true, data: file };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Lists files in a folder.
 *
 * @param folderId - The folder ID (null/undefined for root folder)
 */
export async function listFilesAction(
  folderId?: string | null
): Promise<ActionResult<FileWithAccess[]>> {
  try {
    const files = await listFiles(folderId ?? null);
    return { success: true, data: files };
  } catch (error) {
    return handleError(error);
  }
}

// ============================================================================
// MUTATION ACTIONS
// ============================================================================

/**
 * Soft-deletes a file.
 *
 * @param fileId - The file ID to delete
 */
export async function deleteFileAction(
  fileId: string
): Promise<ActionResult<FileWithAccess>> {
  try {
    const file = await deleteFile(fileId);
    return { success: true, data: file };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Restores a soft-deleted file.
 *
 * @param fileId - The file ID to restore
 */
export async function restoreFileAction(
  fileId: string
): Promise<ActionResult<FileWithAccess>> {
  try {
    const file = await restoreFile(fileId);
    return { success: true, data: file };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Renames a file.
 *
 * @param fileId - The file ID to rename
 * @param newName - The new filename
 */
export async function renameFileAction(
  fileId: string,
  newName: string
): Promise<ActionResult<FileWithAccess>> {
  try {
    const file = await renameFile(fileId, newName);
    return { success: true, data: file };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Moves a file to a different folder.
 *
 * @param input - Move file input
 */
export async function moveFileAction(
  input: MoveFileInput
): Promise<ActionResult<FileWithAccess>> {
  try {
    const file = await moveFile(input);
    return { success: true, data: file };
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

  if (error instanceof FileError) {
    return {
      success: false,
      error: error.message,
      code: error.code,
    };
  }

  if (error instanceof StorageError) {
    return {
      success: false,
      error: error.message,
      code: error.code,
    };
  }

  // Unknown error
  console.error("Unexpected error in file action:", error);
  return {
    success: false,
    error: "An unexpected error occurred",
    code: "UNKNOWN_ERROR",
  };
}
