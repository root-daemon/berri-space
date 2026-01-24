/**
 * Core File Operations
 *
 * This module provides the main functions for file operations including:
 * - Getting signed upload URLs (with permission checks)
 * - Getting signed download URLs (with permission checks)
 * - Creating file records in the database
 * - Listing files in a folder
 * - Deleting files
 *
 * All operations enforce permissions via the centralized permission engine.
 */

import { getServerSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentOrganization } from "@/lib/auth";
import {
  canUserAccess,
  assertAccess,
  canUserRestore,
  PermissionError,
} from "@/lib/permissions";
import {
  generateStoragePath,
  createSignedUploadUrl,
  createSignedDownloadUrl,
  createSignedDownloadUrlWithFilename,
  deleteStorageFile,
  moveStorageFile,
  getStorageFile,
  validateFileMetadata,
  validateFilename,
  StorageError,
  UPLOAD_URL_EXPIRY_SECONDS,
  DOWNLOAD_URL_EXPIRY_SECONDS,
} from "./storage";
import { processFullPipeline, isExtractable } from "@/lib/ai";
import type { Database } from "@/lib/supabase/types";

// Re-export error class
export { StorageError } from "./storage";

// Note: For client components, import constants from "@/lib/files/constants"
// The constants are NOT re-exported here to avoid pulling server code into client bundles

// ============================================================================
// TYPES
// ============================================================================

type DbFile = Database["public"]["Tables"]["files"]["Row"];

export interface FileWithAccess extends DbFile {
  /** User's effective role on this file */
  effectiveRole: "admin" | "editor" | "viewer";
}

export interface PrepareUploadInput {
  /** Target folder ID (null for root folder) */
  folderId: string | null;
  /** Original filename (stored as metadata, not used in storage path) */
  filename: string;
  /** MIME type of the file */
  mimeType: string;
  /** File size in bytes */
  sizeBytes: number;
}

export interface PrepareUploadResult {
  /** The signed URL for uploading */
  signedUrl: string;
  /** The token for resumable uploads */
  token: string;
  /** The file ID (UUID) - use this to confirm upload completion */
  fileId: string;
  /** The storage path (needed for confirmUpload) */
  storagePath: string;
  /** Expiration time of the upload URL in seconds */
  expiresIn: number;
}

export interface ConfirmUploadInput {
  /** The file ID returned from prepareUpload */
  fileId: string;
  /** The storage path returned from prepareUpload */
  storagePath: string;
  /** Target folder ID (null for root folder) */
  folderId: string | null;
  /** Original filename */
  filename: string;
  /** MIME type of the file */
  mimeType: string;
  /** Actual file size in bytes */
  sizeBytes: number;
}

export interface GetDownloadUrlInput {
  /** The file ID to download */
  fileId: string;
  /** Whether to force download (vs stream in browser) */
  forceDownload?: boolean;
}

export interface GetDownloadUrlResult {
  /** The signed download URL */
  signedUrl: string;
  /** Expiration time in seconds */
  expiresIn: number;
}

export interface MoveFileInput {
  /** The file ID to move */
  fileId: string;
  /** Target folder ID (null for root) */
  targetFolderId: string | null;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Prepares a file upload by validating metadata and generating a signed URL.
 *
 * This function:
 * 1. Authenticates the user
 * 2. Validates file metadata (size, MIME type)
 * 3. Checks upload permission on the target folder
 * 4. Generates a signed upload URL
 *
 * After uploading, call confirmUpload() to create the database record.
 *
 * @param input - Upload preparation parameters
 * @returns Signed upload URL and file ID
 * @throws AuthenticationError, PermissionError, FileError
 */
export async function prepareUpload(
  input: PrepareUploadInput
): Promise<PrepareUploadResult> {
  const { folderId, filename, mimeType, sizeBytes } = input;

  // 1. Authenticate user
  const user = await getCurrentUser();
  const { organization } = await getCurrentOrganization();

  // 2. Validate filename
  const filenameValidation = validateFilename(filename);
  if (!filenameValidation.valid) {
    throw new FileError(filenameValidation.error!, "INVALID_FILENAME");
  }

  // 3. Validate file metadata
  const metadataValidation = validateFileMetadata(mimeType, sizeBytes);
  if (!metadataValidation.valid) {
    throw new FileError(metadataValidation.error!, "INVALID_FILE_METADATA");
  }

  // 4. Check permission on target folder
  if (folderId) {
    // Uploading to a specific folder - check folder permission
    const permissionResult = await canUserAccess(
      user.id,
      "folder",
      folderId,
      "upload_file"
    );

    if (!permissionResult.allowed) {
      throw new PermissionError(
        permissionResult.reason || "No permission to upload files to this folder",
        "upload_file",
        "folder",
        folderId
      );
    }

    // Verify folder belongs to user's organization
    const supabase = getServerSupabaseClient();
    const { data: folder, error: folderError } = await supabase
      .from("folders")
      .select("id, organization_id, deleted_at")
      .eq("id", folderId)
      .single();

    if (folderError || !folder) {
      throw new FileError("Target folder not found", "FOLDER_NOT_FOUND");
    }

    if (folder.organization_id !== organization.id) {
      throw new FileError("Target folder not found", "FOLDER_NOT_FOUND");
    }

    if (folder.deleted_at) {
      throw new FileError("Cannot upload to a deleted folder", "FOLDER_DELETED");
    }
  }
  // If folderId is null, uploading to root - no folder permission check needed
  // (user just needs to be an org member, which getCurrentOrganization verifies)

  // 5. Generate file ID and storage path
  const fileId = crypto.randomUUID();
  const storagePath = generateStoragePath(organization.id, folderId, fileId);

  // 6. Create signed upload URL
  const uploadResult = await createSignedUploadUrl(storagePath);

  // 7. Store pending upload info (optional: could use a pending_uploads table)
  // For now, we'll rely on the client calling confirmUpload with correct data

  return {
    signedUrl: uploadResult.signedUrl,
    token: uploadResult.token,
    fileId,
    storagePath,
    expiresIn: UPLOAD_URL_EXPIRY_SECONDS,
  };
}

/**
 * Confirms a file upload and creates the database record.
 *
 * This should be called after the file has been successfully uploaded
 * to the signed URL. It creates the file record in the database.
 *
 * @param input - Upload confirmation parameters
 * @returns The created file record
 * @throws AuthenticationError, FileError
 */
export async function confirmUpload(
  input: ConfirmUploadInput
): Promise<FileWithAccess> {
  const { fileId, storagePath, folderId, filename, mimeType, sizeBytes } = input;

  // 1. Authenticate user
  const user = await getCurrentUser();
  const { organization } = await getCurrentOrganization();

  // 2. Validate the storage path matches expected format
  const expectedPath = generateStoragePath(organization.id, folderId, fileId);
  if (storagePath !== expectedPath) {
    throw new FileError("Invalid storage path", "INVALID_STORAGE_PATH");
  }

  // 3. Check for duplicate filename in the same folder
  const supabase = getServerSupabaseClient();
  const { data: existingFile } = await supabase
    .from("files")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("folder_id", folderId)
    .eq("name", filename)
    .is("deleted_at", null)
    .single();

  if (existingFile) {
    throw new FileError(
      "A file with this name already exists in this folder",
      "DUPLICATE_FILENAME"
    );
  }

  // 4. Create the file record
  const { data: file, error: insertError } = await supabase
    .from("files")
    .insert({
      id: fileId,
      organization_id: organization.id,
      folder_id: folderId,
      name: filename,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      created_by_user_id: user.id,
      inherit_permissions: true,
    })
    .select()
    .single();

  if (insertError) {
    console.error("Failed to create file record:", insertError.message);
    // Attempt to clean up the uploaded file
    try {
      await deleteStorageFile(storagePath);
    } catch (cleanupError) {
      console.error("Failed to clean up uploaded file:", cleanupError);
    }
    throw new FileError("Failed to create file record", "INSERT_FAILED");
  }

  // 5. Automatically trigger AI pipeline for extractable files (fire-and-forget)
  // This runs asynchronously and won't block the upload response
  if (isExtractable(mimeType)) {
    // Use fire-and-forget pattern - don't await, don't block response
    processDocumentForAI(fileId, organization.id, storagePath, mimeType, user.id).catch(
      (error) => {
        // Log error but don't fail the upload
        console.error(
          `[Auto-vectorization] Failed to process file ${fileId} for AI:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    );
  }

  return {
    ...file,
    effectiveRole: "admin", // Creator is always admin
  };
}

/**
 * Processes a document through the AI pipeline automatically.
 * This is called asynchronously after file upload and doesn't block the response.
 *
 * @param fileId - The file ID
 * @param organizationId - The organization ID
 * @param storagePath - The storage path of the file
 * @param mimeType - The MIME type of the file
 * @param userId - The user ID who uploaded the file
 */
async function processDocumentForAI(
  fileId: string,
  organizationId: string,
  storagePath: string,
  mimeType: string,
  userId: string
): Promise<void> {
  try {
    // Get admin Supabase client (service role) for pipeline operations
    const supabaseAdmin = createServerSupabaseClient();

    // Download file from storage
    const fileBuffer = await getStorageFile(storagePath);

    // Process through full pipeline (extract → commit → index)
    // This assumes no redactions are needed initially
    // Admins can add redactions later if needed, which will require re-indexing
    const result = await processFullPipeline(
      supabaseAdmin,
      fileId,
      organizationId,
      fileBuffer,
      mimeType,
      userId
    );

    if (!result.success) {
      console.error(
        `[Auto-vectorization] Pipeline failed for file ${fileId}:`,
        result.error
      );
    } else {
      console.log(
        `[Auto-vectorization] Successfully indexed file ${fileId} with ${result.chunkCount} chunks`
      );
    }
  } catch (error) {
    // Log but don't throw - this is fire-and-forget
    console.error(
      `[Auto-vectorization] Error processing file ${fileId}:`,
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Gets a signed download URL for a file.
 *
 * This function:
 * 1. Authenticates the user
 * 2. Verifies the file exists and belongs to user's organization
 * 3. Checks download permission
 * 4. Generates a signed download URL
 *
 * @param input - Download URL parameters
 * @returns Signed download URL
 * @throws AuthenticationError, PermissionError, FileError
 */
export async function getDownloadUrl(
  input: GetDownloadUrlInput
): Promise<GetDownloadUrlResult> {
  const { fileId, forceDownload = false } = input;

  // 1. Authenticate user
  const user = await getCurrentUser();
  const { organization } = await getCurrentOrganization();

  // 2. Get the file record
  const supabase = getServerSupabaseClient();
  const { data: file, error: fileError } = await supabase
    .from("files")
    .select("*")
    .eq("id", fileId)
    .single();

  if (fileError || !file) {
    throw new FileError("File not found", "FILE_NOT_FOUND");
  }

  // 3. Verify file belongs to user's organization
  if (file.organization_id !== organization.id) {
    throw new FileError("File not found", "FILE_NOT_FOUND");
  }

  // 4. Check if file is deleted
  if (file.deleted_at) {
    throw new FileError("File has been deleted", "FILE_DELETED");
  }

  // 5. Check download permission
  await assertAccess(user.id, "file", fileId, "download");

  // 6. Verify storage path exists
  if (!file.storage_path) {
    throw new FileError("File storage path is missing", "STORAGE_PATH_MISSING");
  }

  // 7. Generate signed download URL
  const downloadResult = forceDownload
    ? await createSignedDownloadUrlWithFilename(file.storage_path, file.name)
    : await createSignedDownloadUrl(file.storage_path);

  if (!downloadResult.signedUrl) {
    throw new FileError("Failed to generate download URL", "DOWNLOAD_URL_GENERATION_FAILED");
  }

  return {
    signedUrl: downloadResult.signedUrl,
    expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS,
  };
}

/**
 * Gets a single file by ID.
 *
 * @param fileId - The file ID
 * @returns The file with access info, or null if not found/no access
 */
export async function getFile(fileId: string): Promise<FileWithAccess | null> {
  // 1. Authenticate user
  const user = await getCurrentUser();
  const { organization } = await getCurrentOrganization();

  // 2. Get the file record
  const supabase = getServerSupabaseClient();
  const { data: file, error: fileError } = await supabase
    .from("files")
    .select("*")
    .eq("id", fileId)
    .single();

  if (fileError || !file) {
    return null;
  }

  // 3. Verify file belongs to user's organization
  if (file.organization_id !== organization.id) {
    return null;
  }

  // 4. Check view permission
  const permissionResult = await canUserAccess(user.id, "file", fileId, "view");
  if (!permissionResult.allowed) {
    return null;
  }

  return {
    ...file,
    effectiveRole: permissionResult.role as "admin" | "editor" | "viewer",
  };
}

/**
 * Lists files in a folder.
 *
 * @param folderId - The folder ID (null for root folder)
 * @returns List of files the user can view
 */
export async function listFiles(
  folderId: string | null
): Promise<FileWithAccess[]> {
  // 1. Authenticate user
  const user = await getCurrentUser();
  const { organization } = await getCurrentOrganization();

  // 2. If specific folder, check view permission
  if (folderId) {
    const folderPermission = await canUserAccess(
      user.id,
      "folder",
      folderId,
      "view"
    );
    if (!folderPermission.allowed) {
      return [];
    }
  }

  // 3. Query files in the folder
  const supabase = getServerSupabaseClient();
  const query = supabase
    .from("files")
    .select("*")
    .eq("organization_id", organization.id)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (folderId) {
    query.eq("folder_id", folderId);
  } else {
    query.is("folder_id", null);
  }

  const { data: files, error } = await query;

  if (error) {
    console.error("Failed to list files:", error.message);
    return [];
  }

  // 4. Check permissions for each file and build result
  const filesWithAccess: FileWithAccess[] = [];

  for (const file of files) {
    const permissionResult = await canUserAccess(
      user.id,
      "file",
      file.id,
      "view"
    );

    if (permissionResult.allowed && permissionResult.role) {
      filesWithAccess.push({
        ...file,
        effectiveRole: permissionResult.role as "admin" | "editor" | "viewer",
      });
    }
  }

  return filesWithAccess;
}

/**
 * Soft-deletes a file.
 *
 * @param fileId - The file ID to delete
 * @returns The deleted file record
 * @throws AuthenticationError, PermissionError, FileError
 */
export async function deleteFile(fileId: string): Promise<FileWithAccess> {
  // 1. Authenticate user
  const user = await getCurrentUser();
  const { organization } = await getCurrentOrganization();

  // 2. Get the file record
  const supabase = getServerSupabaseClient();
  const { data: file, error: fileError } = await supabase
    .from("files")
    .select("*")
    .eq("id", fileId)
    .single();

  if (fileError || !file) {
    throw new FileError("File not found", "FILE_NOT_FOUND");
  }

  // 3. Verify file belongs to user's organization
  if (file.organization_id !== organization.id) {
    throw new FileError("File not found", "FILE_NOT_FOUND");
  }

  // 4. Check if already deleted
  if (file.deleted_at) {
    throw new FileError("File is already deleted", "ALREADY_DELETED");
  }

  // 5. Check delete permission
  await assertAccess(user.id, "file", fileId, "delete");

  // 6. Soft-delete the file
  const { data: deletedFile, error: updateError } = await supabase
    .from("files")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
    })
    .eq("id", fileId)
    .select()
    .single();

  if (updateError || !deletedFile) {
    throw new FileError("Failed to delete file", "DELETE_FAILED");
  }

  return {
    ...deletedFile,
    effectiveRole: "admin",
  };
}

/**
 * Restores a soft-deleted file.
 *
 * @param fileId - The file ID to restore
 * @returns The restored file record
 * @throws AuthenticationError, PermissionError, FileError
 */
export async function restoreFile(fileId: string): Promise<FileWithAccess> {
  // 1. Authenticate user
  const user = await getCurrentUser();
  const { organization } = await getCurrentOrganization();

  // 2. Get the file record
  const supabase = getServerSupabaseClient();
  const { data: file, error: fileError } = await supabase
    .from("files")
    .select("*")
    .eq("id", fileId)
    .single();

  if (fileError || !file) {
    throw new FileError("File not found", "FILE_NOT_FOUND");
  }

  // 3. Verify file belongs to user's organization
  if (file.organization_id !== organization.id) {
    throw new FileError("File not found", "FILE_NOT_FOUND");
  }

  // 4. Check if file is deleted
  if (!file.deleted_at) {
    throw new FileError("File is not deleted", "NOT_DELETED");
  }

  // 5. Check restore permission using centralized permission system
  // Note: For deleted resources, get_effective_role returns null,
  // so we use canUserRestore which handles the special case of deleted resources
  const canRestore = await canUserRestore(
    user.id,
    "file",
    fileId,
    file.owner_team_id,
    organization.id
  );

  if (!canRestore) {
    throw new PermissionError(
      "Only file owners or super admins can restore files",
      "restore",
      "file",
      fileId
    );
  }

  // 6. Restore the file
  const { data: restoredFile, error: updateError } = await supabase
    .from("files")
    .update({
      deleted_at: null,
      deleted_by: null,
    })
    .eq("id", fileId)
    .select()
    .single();

  if (updateError || !restoredFile) {
    throw new FileError("Failed to restore file", "RESTORE_FAILED");
  }

  return {
    ...restoredFile,
    effectiveRole: "admin",
  };
}

/**
 * Moves a file to a different folder.
 *
 * @param input - Move file input
 * @returns The moved file record
 * @throws AuthenticationError, PermissionError, FileError
 */
export async function moveFile(
  input: MoveFileInput
): Promise<FileWithAccess> {
  const { fileId, targetFolderId } = input;

  // 1. Authenticate user
  const user = await getCurrentUser();
  const { organization } = await getCurrentOrganization();

  // 2. Get the file record
  const supabase = getServerSupabaseClient();
  const { data: file, error: fileError } = await supabase
    .from("files")
    .select("*")
    .eq("id", fileId)
    .single();

  if (fileError || !file) {
    throw new FileError("File not found", "FILE_NOT_FOUND");
  }

  // 3. Verify file belongs to user's organization
  if (file.organization_id !== organization.id) {
    throw new FileError("File not found", "FILE_NOT_FOUND");
  }

  // 4. Check if file is deleted
  if (file.deleted_at) {
    throw new FileError("Cannot move a deleted file", "FILE_DELETED");
  }

  // 5. Check move permission (admin only)
  await assertAccess(user.id, "file", fileId, "move");

  // 6. Validate target folder exists and belongs to org
  if (targetFolderId) {
    const { data: targetFolder, error: folderError } = await supabase
      .from("folders")
      .select("id, organization_id, deleted_at")
      .eq("id", targetFolderId)
      .single();

    if (folderError || !targetFolder) {
      throw new FileError("Target folder not found", "INVALID_TARGET_FOLDER");
    }

    if (targetFolder.organization_id !== organization.id) {
      throw new FileError("Target folder not found", "INVALID_TARGET_FOLDER");
    }

    if (targetFolder.deleted_at) {
      throw new FileError("Cannot move to a deleted folder", "INVALID_TARGET_FOLDER");
    }

    // 7. Check user has upload_file permission on target folder
    const targetPermission = await canUserAccess(
      user.id,
      "folder",
      targetFolderId,
      "upload_file"
    );

    if (!targetPermission.allowed) {
      throw new PermissionError(
        "No permission to upload files to the target folder",
        "upload_file",
        "folder",
        targetFolderId
      );
    }
  }

  // 8. Prevent moving to same folder (no-op)
  if (file.folder_id === targetFolderId) {
    // Return the file as-is
    const permissionResult = await canUserAccess(user.id, "file", fileId, "view");
    return {
      ...file,
      effectiveRole: (permissionResult.role || "viewer") as "admin" | "editor" | "viewer",
    };
  }

  // 9. Check for duplicate filename in target folder
  const duplicateQuery = supabase
    .from("files")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("name", file.name)
    .is("deleted_at", null)
    .neq("id", fileId);

  if (targetFolderId) {
    duplicateQuery.eq("folder_id", targetFolderId);
  } else {
    duplicateQuery.is("folder_id", null);
  }

  const { data: existingFile } = await duplicateQuery.single();

  if (existingFile) {
    throw new FileError(
      "A file with this name already exists in the target folder",
      "DUPLICATE_FILENAME"
    );
  }

  // 10. Generate new storage path
  const newStoragePath = generateStoragePath(organization.id, targetFolderId, fileId);

  // 11. Move file in storage (copy + delete)
  if (file.storage_path && file.storage_path !== newStoragePath) {
    try {
      await moveStorageFile(file.storage_path, newStoragePath);
    } catch (error) {
      if (error instanceof StorageError) {
        throw new FileError(
          `Failed to move file in storage: ${error.message}`,
          "STORAGE_MOVE_FAILED"
        );
      }
      throw error;
    }
  }

  // 12. Update DB: folder_id and storage_path
  const { data: movedFile, error: updateError } = await supabase
    .from("files")
    .update({
      folder_id: targetFolderId,
      storage_path: newStoragePath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fileId)
    .select()
    .single();

  if (updateError || !movedFile) {
    // If DB update fails but storage was moved, try to move it back
    if (file.storage_path && file.storage_path !== newStoragePath) {
      try {
        await moveStorageFile(newStoragePath, file.storage_path);
      } catch (rollbackError) {
        console.error("Failed to rollback storage move after DB update failure:", rollbackError);
      }
    }
    throw new FileError("Failed to update file location", "MOVE_FAILED");
  }

  // 13. Return updated file with access info
  const permissionResult = await canUserAccess(user.id, "file", fileId, "view");
  return {
    ...movedFile,
    effectiveRole: (permissionResult.role || "viewer") as "admin" | "editor" | "viewer",
  };
}

/**
 * Renames a file.
 *
 * @param fileId - The file ID to rename
 * @param newName - The new filename
 * @returns The renamed file record
 * @throws AuthenticationError, PermissionError, FileError
 */
export async function renameFile(
  fileId: string,
  newName: string
): Promise<FileWithAccess> {
  // 1. Authenticate user
  const user = await getCurrentUser();
  const { organization } = await getCurrentOrganization();

  // 2. Validate new filename
  const filenameValidation = validateFilename(newName);
  if (!filenameValidation.valid) {
    throw new FileError(filenameValidation.error!, "INVALID_FILENAME");
  }

  // 3. Get the file record
  const supabase = getServerSupabaseClient();
  const { data: file, error: fileError } = await supabase
    .from("files")
    .select("*")
    .eq("id", fileId)
    .single();

  if (fileError || !file) {
    throw new FileError("File not found", "FILE_NOT_FOUND");
  }

  // 4. Verify file belongs to user's organization
  if (file.organization_id !== organization.id) {
    throw new FileError("File not found", "FILE_NOT_FOUND");
  }

  // 5. Check if deleted
  if (file.deleted_at) {
    throw new FileError("Cannot rename a deleted file", "FILE_DELETED");
  }

  // 6. Check rename permission
  await assertAccess(user.id, "file", fileId, "rename");

  // 7. Check for duplicate filename
  const { data: existingFile } = await supabase
    .from("files")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("folder_id", file.folder_id)
    .eq("name", newName)
    .is("deleted_at", null)
    .neq("id", fileId)
    .single();

  if (existingFile) {
    throw new FileError(
      "A file with this name already exists in this folder",
      "DUPLICATE_FILENAME"
    );
  }

  // 8. Rename the file
  const { data: renamedFile, error: updateError } = await supabase
    .from("files")
    .update({
      name: newName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fileId)
    .select()
    .single();

  if (updateError || !renamedFile) {
    throw new FileError("Failed to rename file", "RENAME_FAILED");
  }

  return {
    ...renamedFile,
    effectiveRole: "admin",
  };
}

// ============================================================================
// ERROR CLASS
// ============================================================================

/**
 * Error thrown when a file operation fails.
 */
export class FileError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = "FileError";
  }
}
