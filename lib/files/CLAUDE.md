# CLAUDE.md — lib/files/

This directory contains the file storage module for Supabase Storage integration.

---

## Purpose

Provides secure file upload and download operations backed by Supabase Storage.
All operations enforce permissions via the centralized permission engine.

---

## Architecture

```
lib/files/
├── index.ts      # Core file operations (prepareUpload, getDownloadUrl, etc.)
├── actions.ts    # Server actions for client components
├── storage.ts    # Storage utilities (signed URLs, validation)
└── CLAUDE.md     # This file
```

---

## Storage Configuration

**Bucket:** `drive-storage` (PRIVATE)

**Path Convention:**
```
/{organizationId}/{folderId}/{fileId}
```

- Uses UUIDs only - NEVER includes user-provided filenames
- Original filename is stored as metadata in the `files` table
- `folderId` is "root" for files in the root directory

---

## Security Model

### Non-Negotiable Rules

1. **All buckets are PRIVATE** - No public URLs
2. **Signed URLs only** - All access requires server-generated signed URLs
3. **Server-side validation** - NEVER trust client-provided file metadata
4. **Permission checks first** - Every operation calls `canUserAccess()`
5. **Short-lived URLs** - Upload: 15 min, Download: 1 hour

### File Validation

- **Max size:** 100 MB
- **Allowed types:** Restrictive allowlist (documents + images only)
- **Filename:** Validated for safety, stored as metadata only

---

## Core Functions

### Upload Flow

```typescript
// 1. Prepare upload (validates & generates signed URL)
const result = await prepareUpload({
  folderId: "folder-uuid" | null,
  filename: "document.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1024000,
});
// Returns: { signedUrl, token, fileId, storagePath, expiresIn }

// 2. Client uploads to signedUrl

// 3. Confirm upload (creates DB record)
const file = await confirmUpload({
  fileId: result.fileId,
  storagePath: result.storagePath,
  folderId: "folder-uuid" | null,
  filename: "document.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1024000,
});
```

### Download Flow

```typescript
const result = await getDownloadUrl({
  fileId: "file-uuid",
  forceDownload: false, // Optional: force download vs stream
});
// Returns: { signedUrl, expiresIn }
```

---

## Permission Mapping

| Operation | Permission Check |
|-----------|-----------------|
| Upload to folder | `canUserAccess(userId, 'folder', folderId, 'upload_file')` |
| Download file | `canUserAccess(userId, 'file', fileId, 'download')` |
| View file | `canUserAccess(userId, 'file', fileId, 'view')` |
| Delete file | `canUserAccess(userId, 'file', fileId, 'delete')` |
| Rename file | `canUserAccess(userId, 'file', fileId, 'rename')` |

---

## Server Actions

```typescript
import {
  prepareUploadAction,
  confirmUploadAction,
  getDownloadUrlAction,
  getFileAction,
  listFilesAction,
  deleteFileAction,
  restoreFileAction,
  renameFileAction,
} from "@/lib/files/actions";
```

All actions return `ActionResult<T>`:
```typescript
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string };
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `INVALID_FILENAME` | Filename failed validation |
| `INVALID_FILE_METADATA` | MIME type or size invalid |
| `FOLDER_NOT_FOUND` | Target folder doesn't exist |
| `FOLDER_DELETED` | Target folder is soft-deleted |
| `FILE_NOT_FOUND` | File doesn't exist |
| `FILE_DELETED` | File is soft-deleted |
| `DUPLICATE_FILENAME` | File with same name exists in folder |
| `PERMISSION_DENIED` | User lacks required permission |
| `UPLOAD_URL_FAILED` | Failed to generate signed upload URL |
| `DOWNLOAD_URL_FAILED` | Failed to generate signed download URL |

---

## DO NOT

- Generate public URLs
- Trust client-provided file metadata
- Skip permission checks
- Use user-provided filenames in storage paths
- Expose bucket names or storage paths to clients
- Use service role key in client code
