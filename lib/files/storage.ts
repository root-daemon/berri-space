/**
 * Storage Utilities for Supabase Storage
 *
 * This module provides utilities for generating signed URLs and validating
 * file uploads. All storage operations MUST go through this module to ensure
 * consistent security enforcement.
 *
 * Key Security Principles:
 * - All buckets are PRIVATE (no public access)
 * - All access requires signed URLs generated server-side
 * - File metadata is validated server-side (never trust client)
 * - Storage paths use UUIDs only (no user-provided filenames)
 */

import { getServerSupabaseClient } from "@/lib/supabase/server";
import {
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
  UPLOAD_URL_EXPIRY_SECONDS,
  DOWNLOAD_URL_EXPIRY_SECONDS,
  type AllowedMimeType,
} from "./constants";

// Re-export constants for convenience
export {
  MAX_FILE_SIZE_BYTES,
  UPLOAD_URL_EXPIRY_SECONDS,
  DOWNLOAD_URL_EXPIRY_SECONDS,
  ALLOWED_MIME_TYPES,
  type AllowedMimeType,
} from "./constants";

/**
 * Private storage bucket name.
 * This bucket is configured with:
 * - public: false
 * - file_size_limit: 100MB
 * - allowed_mime_types: restrictive allowlist
 */
export const STORAGE_BUCKET = "drive-storage";

// ============================================================================
// TYPES
// ============================================================================

export interface SignedUploadUrlResult {
  /** The signed URL for uploading the file */
  signedUrl: string;
  /** The storage path where the file will be stored */
  storagePath: string;
  /** The token for the upload (used with TUS protocol) */
  token: string;
}

export interface SignedDownloadUrlResult {
  /** The signed URL for downloading the file */
  signedUrl: string;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validates file metadata before upload.
 * NEVER trust client-provided metadata - validate everything server-side.
 *
 * @param mimeType - The MIME type of the file
 * @param sizeBytes - The size of the file in bytes
 * @returns Validation result with error message if invalid
 */
export function validateFileMetadata(
  mimeType: string,
  sizeBytes: number
): FileValidationResult {
  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(mimeType as AllowedMimeType)) {
    return {
      valid: false,
      error: `File type '${mimeType}' is not allowed. Allowed types: documents (PDF, Word, Excel, PowerPoint, text) and images (JPEG, PNG, GIF, WebP, SVG).`,
    };
  }

  // Validate file size
  if (sizeBytes <= 0) {
    return {
      valid: false,
      error: "File size must be greater than 0 bytes.",
    };
  }

  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    const maxSizeMB = MAX_FILE_SIZE_BYTES / (1024 * 1024);
    const fileSizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size (${fileSizeMB} MB) exceeds maximum allowed size (${maxSizeMB} MB).`,
    };
  }

  return { valid: true };
}

/**
 * Validates a filename for basic safety.
 * The filename is only stored as metadata - never used in storage paths.
 *
 * @param filename - The original filename
 * @returns Validation result with error message if invalid
 */
export function validateFilename(filename: string): FileValidationResult {
  if (!filename || filename.trim().length === 0) {
    return {
      valid: false,
      error: "Filename cannot be empty.",
    };
  }

  if (filename.length > 255) {
    return {
      valid: false,
      error: "Filename cannot exceed 255 characters.",
    };
  }

  // Check for path traversal attempts
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return {
      valid: false,
      error: "Filename contains invalid characters.",
    };
  }

  return { valid: true };
}

// ============================================================================
// STORAGE PATH FUNCTIONS
// ============================================================================

/**
 * Generates a storage path for a file.
 *
 * Path format: /{organizationId}/{folderId}/{fileId}
 *
 * Security: Uses UUIDs only - NEVER includes user-provided filenames.
 * The original filename is stored as metadata in the database.
 *
 * @param organizationId - The organization UUID
 * @param folderId - The folder UUID (or "root" for root folder)
 * @param fileId - The file UUID
 * @returns The storage path
 */
export function generateStoragePath(
  organizationId: string,
  folderId: string | null,
  fileId: string
): string {
  const folderPath = folderId || "root";
  return `${organizationId}/${folderPath}/${fileId}`;
}

// ============================================================================
// SIGNED URL FUNCTIONS
// ============================================================================

/**
 * Creates a signed upload URL for a file.
 *
 * The URL is short-lived (15 minutes) and can only be used once.
 * Permission checks MUST be performed before calling this function.
 *
 * @param storagePath - The storage path for the file
 * @returns The signed upload URL and token
 */
export async function createSignedUploadUrl(
  storagePath: string
): Promise<SignedUploadUrlResult> {
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath, {
      upsert: false, // Never overwrite existing files
    });

  if (error) {
    console.error("Failed to create signed upload URL:", error.message);
    throw new StorageError(
      "Failed to generate upload URL",
      "UPLOAD_URL_FAILED"
    );
  }

  return {
    signedUrl: data.signedUrl,
    storagePath: storagePath,
    token: data.token,
  };
}

/**
 * Creates a signed download URL for a file.
 *
 * The URL is time-limited (1 hour) and allows read-only access.
 * Permission checks MUST be performed before calling this function.
 *
 * @param storagePath - The storage path of the file
 * @returns The signed download URL
 */
export async function createSignedDownloadUrl(
  storagePath: string
): Promise<SignedDownloadUrlResult> {
  const supabase = getServerSupabaseClient();

  // First, verify the file exists in storage
  const { data: fileData, error: fileError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(storagePath.split('/').slice(0, -1).join('/') || '', {
      limit: 1,
      search: storagePath.split('/').pop() || '',
    });

  // Note: The list API might not work perfectly for this check
  // But we'll try to create the URL anyway and let Supabase handle the error

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, DOWNLOAD_URL_EXPIRY_SECONDS, {
      download: false, // Stream in browser, not force download
    });

  if (error) {
    console.error("Failed to create signed download URL:", error.message);
    // Provide more specific error messages
    if (error.message.includes('not found') || error.message.includes('does not exist')) {
      throw new StorageError(
        "File not found in storage. The file may have been deleted or never uploaded.",
        "FILE_NOT_IN_STORAGE"
      );
    }
    throw new StorageError(
      `Failed to generate download URL: ${error.message}`,
      "DOWNLOAD_URL_FAILED"
    );
  }

  if (!data?.signedUrl) {
    throw new StorageError(
      "Signed URL was not generated",
      "DOWNLOAD_URL_GENERATION_FAILED"
    );
  }

  return {
    signedUrl: data.signedUrl,
  };
}

/**
 * Creates a signed download URL that forces file download.
 *
 * @param storagePath - The storage path of the file
 * @param filename - The filename to use for the download
 * @returns The signed download URL
 */
export async function createSignedDownloadUrlWithFilename(
  storagePath: string,
  filename: string
): Promise<SignedDownloadUrlResult> {
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, DOWNLOAD_URL_EXPIRY_SECONDS, {
      download: filename, // Force download with specified filename
    });

  if (error) {
    console.error("Failed to create signed download URL:", error.message);
    // Provide more specific error messages
    if (error.message.includes('not found') || error.message.includes('does not exist')) {
      throw new StorageError(
        "File not found in storage. The file may have been deleted or never uploaded.",
        "FILE_NOT_IN_STORAGE"
      );
    }
    throw new StorageError(
      `Failed to generate download URL: ${error.message}`,
      "DOWNLOAD_URL_FAILED"
    );
  }

  if (!data?.signedUrl) {
    throw new StorageError(
      "Signed URL was not generated",
      "DOWNLOAD_URL_GENERATION_FAILED"
    );
  }

  return {
    signedUrl: data.signedUrl,
  };
}

/**
 * Deletes a file from storage.
 *
 * Permission checks MUST be performed before calling this function.
 *
 * @param storagePath - The storage path of the file to delete
 */
export async function deleteStorageFile(storagePath: string): Promise<void> {
  const supabase = getServerSupabaseClient();

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([storagePath]);

  if (error) {
    console.error("Failed to delete storage file:", error.message);
    throw new StorageError("Failed to delete file from storage", "DELETE_FAILED");
  }
}

/**
 * Moves a file in storage from old path to new path.
 * Uses copy + delete pattern since Supabase Storage has no native move.
 *
 * Permission checks MUST be performed before calling this function.
 *
 * @param oldPath - The current storage path
 * @param newPath - The target storage path
 * @throws StorageError if the move fails
 */
export async function moveStorageFile(
  oldPath: string,
  newPath: string
): Promise<void> {
  const supabase = getServerSupabaseClient();

  // Step 1: Get signed download URL for the old file
  const { data: downloadData, error: downloadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(oldPath, DOWNLOAD_URL_EXPIRY_SECONDS);

  if (downloadError || !downloadData?.signedUrl) {
    console.error("Failed to create download URL for move:", downloadError?.message);
    throw new StorageError(
      "Failed to access file for move",
      "STORAGE_MOVE_FAILED"
    );
  }

  // Step 2: Download the file
  let fileBlob: Blob;
  try {
    const response = await fetch(downloadData.signedUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }
    fileBlob = await response.blob();
  } catch (error) {
    console.error("Failed to download file during move:", error);
    throw new StorageError(
      "Failed to download file during move",
      "STORAGE_MOVE_FAILED"
    );
  }

  // Step 3: Upload to new path
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(newPath, fileBlob, {
      upsert: false, // Don't overwrite existing files
    });

  if (uploadError) {
    console.error("Failed to upload file to new location:", uploadError.message);
    throw new StorageError(
      "Failed to upload file to new location",
      "STORAGE_MOVE_FAILED"
    );
  }

  // Step 4: Delete old file (only if upload succeeded)
  try {
    await deleteStorageFile(oldPath);
  } catch (deleteError) {
    // If delete fails, try to clean up the new file
    console.error("Failed to delete old file after move, attempting cleanup:", deleteError);
    try {
      await supabase.storage.from(STORAGE_BUCKET).remove([newPath]);
    } catch (cleanupError) {
      console.error("Failed to clean up new file after failed delete:", cleanupError);
    }
    throw new StorageError(
      "File was moved but old file could not be deleted. Please contact support.",
      "STORAGE_MOVE_FAILED"
    );
  }
}

// ============================================================================
// ERROR CLASS
// ============================================================================

/**
 * Error thrown when a storage operation fails.
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = "StorageError";
  }
}
