/**
 * File Storage Constants
 *
 * These constants can be safely imported by both client and server components.
 * They do NOT import any server-side modules.
 */

/**
 * Maximum file size in bytes (100 MB).
 */
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

/**
 * Signed upload URL expiration time in seconds (15 minutes).
 */
export const UPLOAD_URL_EXPIRY_SECONDS = 15 * 60;

/**
 * Signed download URL expiration time in seconds (1 hour).
 */
export const DOWNLOAD_URL_EXPIRY_SECONDS = 60 * 60;

/**
 * Allowed MIME types for file uploads.
 * This is a restrictive allowlist - documents and images only.
 */
export const ALLOWED_MIME_TYPES = [
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];
