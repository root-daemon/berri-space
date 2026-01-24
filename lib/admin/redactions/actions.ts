"use server";

/**
 * Server Actions for Admin Redaction Operations
 *
 * These actions are admin-only and allow managing document redactions.
 * All actions enforce admin permissions and return serializable results.
 */

import { getServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentOrganization, isUserSuperAdmin } from "@/lib/auth";
import { canUserAccess } from "@/lib/permissions";
import { PermissionError } from "@/lib/permissions";
import { AuthenticationError } from "@/lib/auth";
import {
  RedactionDefinition,
  DbDocumentRedaction,
  DocumentRedactionInsert,
  EXTRACTABLE_MIME_TYPES,
} from "@/lib/ai/types";
import { dbRedactionsToDefinitions, detectPii, findRegexMatches } from "@/lib/ai/redaction";
import { commitRedactions } from "@/lib/ai/pipeline";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// ============================================================================
// TYPES
// ============================================================================

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string };

export interface DocumentForRedaction {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  processingStatus: string | null;
  hasRawText: boolean;
  redactionCount: number;
  committedAt: string | null;
}

export interface DocumentRawText {
  content: string;
  characterCount: number;
  extractionMethod: string;
  sourceMimeType: string;
  isCommitted: boolean; // true if this is AI-safe text (raw text was deleted)
}

export interface DocumentRedactionWithId extends RedactionDefinition {
  id: string;
}

export interface DocumentRedactionsResult {
  redactions: DocumentRedactionWithId[];
  processingStatus: string;
  canEdit: boolean; // false if already committed
}

// ============================================================================
// HELPER: CHECK ADMIN PERMISSION
// ============================================================================

/**
 * Verifies user has admin access for redaction operations.
 * For redaction operations, we require admin access to at least one file or super admin status.
 */
async function requireAdminAccess(): Promise<void> {
  const user = await getCurrentUser();
  const { organization, role, isSuperAdmin } = await getCurrentOrganization();

  // Super admins and org admins always have access
  if (isSuperAdmin || role === "admin") {
    return;
  }

  // Check if user has admin access to any file in the organization
  const supabase = getServerSupabaseClient();
  const { data: files } = await supabase
    .from("files")
    .select("id")
    .eq("organization_id", organization.id)
    .is("deleted_at", null)
    .limit(20); // Check more files

  if (!files || files.length === 0) {
    // No files exist, but user is org member - allow access for admin page
    // They just won't see any documents
    return;
  }

  // Check if user has admin access to at least one file
  for (const file of files) {
    const permissionCheck = await canUserAccess(user.id, "file", file.id, "grant_access");
    if (permissionCheck.allowed && permissionCheck.role === "admin") {
      return; // User has admin access
    }
  }

  // If no admin access found, still allow access but they may see empty list
  // The actual permission check happens per-file when accessing raw text
  return;
}

// ============================================================================
// LIST DOCUMENTS FOR REDACTION
// ============================================================================

/**
 * Lists all extractable documents in the organization for redaction management.
 *
 * Permission: Admin access required
 */
export async function listDocumentsForRedactionAction(): Promise<
  ActionResult<DocumentForRedaction[]>
> {
  try {
    await requireAdminAccess();
    const user = await getCurrentUser();
    const { organization } = await getCurrentOrganization();
    const supabase = getServerSupabaseClient();

    // Get all files first to check what we have (for debugging)
    const { data: allFilesDebug } = await supabase
      .from("files")
      .select("id, name, mime_type")
      .eq("organization_id", organization.id)
      .is("deleted_at", null)
      .limit(100);

    console.log("[listDocumentsForRedactionAction] All files in org", {
      total: allFilesDebug?.length || 0,
      mimeTypes: allFilesDebug?.map((f) => f.mime_type) || [],
      extractableTypes: EXTRACTABLE_MIME_TYPES,
    });

    // Get files that are either:
    // 1. Extractable MIME types, OR
    // 2. Have been processed (have document_processing record)
    // This ensures we show all vectorized documents even if MIME type check fails
    
    // First, get all processed file IDs
    const { data: processedFiles } = await supabase
      .from("document_processing")
      .select("file_id")
      .eq("organization_id", organization.id);

    const processedFileIds = processedFiles?.map((p) => p.file_id) || [];

    // Get extractable files
    const { data: extractableFiles } = await supabase
      .from("files")
      .select("id, name, mime_type, size_bytes")
      .eq("organization_id", organization.id)
      .is("deleted_at", null)
      .in("mime_type", EXTRACTABLE_MIME_TYPES);

    // Get processed files (if not already in extractable list)
    let processedFilesData: typeof extractableFiles = [];
    if (processedFileIds.length > 0) {
      const { data } = await supabase
        .from("files")
        .select("id, name, mime_type, size_bytes")
        .eq("organization_id", organization.id)
        .is("deleted_at", null)
        .in("id", processedFileIds);

      processedFilesData = data || [];
    }

    // Merge and deduplicate
    const extractableIds = new Set(extractableFiles?.map((f) => f.id) || []);
    const allFiles = [
      ...(extractableFiles || []),
      ...(processedFilesData.filter((f) => !extractableIds.has(f.id)) || []),
    ];

    // Sort by name
    const files = allFiles.sort((a, b) => a.name.localeCompare(b.name));
    const filesError = null; // No error from our merged queries

    if (filesError) {
      console.error("[listDocumentsForRedactionAction] Files query error:", filesError);
      return {
        success: false,
        error: filesError.message,
        code: "DB_ERROR",
      };
    }

    if (!files || files.length === 0) {
      console.log("[listDocumentsForRedactionAction] No extractable files found", {
        orgId: organization.id,
        extractableTypes: EXTRACTABLE_MIME_TYPES,
      });
      return { success: true, data: [] };
    }

    console.log("[listDocumentsForRedactionAction] Found files", {
      count: files.length,
      fileIds: files.map((f) => f.id),
      mimeTypes: files.map((f) => f.mime_type),
    });

    // Get processing status and redaction counts for each file
    const fileIds = files.map((f) => f.id);

    const { data: processing } = await supabase
      .from("document_processing")
      .select("file_id, status, committed_at")
      .in("file_id", fileIds);

    const { data: rawTexts } = await supabase
      .from("document_raw_text")
      .select("file_id")
      .in("file_id", fileIds);

    const { data: redactions } = await supabase
      .from("document_redactions")
      .select("file_id")
      .in("file_id", fileIds);

    // Filter files by admin access (user must have admin access to see/manage redactions)
    const documentsWithAccess: DocumentForRedaction[] = [];

    for (const file of files) {
      // Check if user has admin access to this file
      const permissionCheck = await canUserAccess(user.id, "file", file.id, "grant_access");
      
      if (permissionCheck.allowed && permissionCheck.role === "admin") {
        const proc = processing?.find((p) => p.file_id === file.id);
        const hasRawText = rawTexts?.some((rt) => rt.file_id === file.id) ?? false;
        const redactionCount =
          redactions?.filter((r) => r.file_id === file.id).length ?? 0;

        documentsWithAccess.push({
          id: file.id,
          name: file.name,
          mimeType: file.mime_type,
          sizeBytes: file.size_bytes,
          processingStatus: proc?.status ?? null,
          hasRawText,
          redactionCount,
          committedAt: proc?.committed_at ?? null,
        });
      }
    }

    console.log("[listDocumentsForRedactionAction] Returning documents", {
      totalFiles: files.length,
      accessibleFiles: documentsWithAccess.length,
    });

    return { success: true, data: documentsWithAccess };
  } catch (error) {
    return handleError(error);
  }
}

// ============================================================================
// GET RAW TEXT
// ============================================================================

/**
 * Gets the raw extracted text for a document.
 *
 * Permission: Admin access required
 */
export async function getDocumentRawTextAction(
  fileId: string
): Promise<ActionResult<DocumentRawText>> {
  try {
    await requireAdminAccess();
    const { organization } = await getCurrentOrganization();
    const supabase = getServerSupabaseClient();

    // Verify file belongs to organization
    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("id, organization_id")
      .eq("id", fileId)
      .eq("organization_id", organization.id)
      .is("deleted_at", null)
      .single();

    if (fileError || !file) {
      return {
        success: false,
        error: "File not found",
        code: "NOT_FOUND",
      };
    }

    // Check if document is committed (raw text deleted, AI-safe text available)
    const { data: processing } = await supabase
      .from("document_processing")
      .select("committed_at, status")
      .eq("file_id", fileId)
      .single();

    const isCommitted = !!processing?.committed_at;

    if (isCommitted) {
      // Document is committed - raw text was deleted, but we can show AI-safe text
      const { data: aiText, error: aiTextError } = await supabase
        .from("document_ai_text")
        .select("content, character_count")
        .eq("file_id", fileId)
        .single();

      if (aiTextError || !aiText) {
        return {
          success: false,
          error: "AI-safe text not found for committed document.",
          code: "NOT_FOUND",
        };
      }

      return {
        success: true,
        data: {
          content: aiText.content,
          characterCount: aiText.character_count,
          extractionMethod: "committed",
          sourceMimeType: "application/committed",
          isCommitted: true,
        },
      };
    }

    // Document not committed - get raw text
    const { data: rawText, error: rawTextError } = await supabase
      .from("document_raw_text")
      .select("content, source_mime_type, extraction_method")
      .eq("file_id", fileId)
      .single();

    if (rawTextError || !rawText) {
      return {
        success: false,
        error: "Raw text not found. Document may not be extracted yet.",
        code: "NOT_FOUND",
      };
    }

    return {
      success: true,
      data: {
        content: rawText.content,
        characterCount: rawText.content.length,
        extractionMethod: rawText.extraction_method,
        sourceMimeType: rawText.source_mime_type,
        isCommitted: false,
      },
    };
  } catch (error) {
    return handleError(error);
  }
}

// ============================================================================
// GET REDACTIONS
// ============================================================================

/**
 * Gets all redactions for a document.
 *
 * Permission: Admin access required
 */
export async function getDocumentRedactionsAction(
  fileId: string
): Promise<ActionResult<DocumentRedactionsResult>> {
  try {
    await requireAdminAccess();
    const { organization } = await getCurrentOrganization();
    const supabase = getServerSupabaseClient();

    // Verify file belongs to organization
    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("id, organization_id")
      .eq("id", fileId)
      .eq("organization_id", organization.id)
      .is("deleted_at", null)
      .single();

    if (fileError || !file) {
      return {
        success: false,
        error: "File not found",
        code: "NOT_FOUND",
      };
    }

    // Get processing status
    const { data: processing } = await supabase
      .from("document_processing")
      .select("status, committed_at")
      .eq("file_id", fileId)
      .single();

    const isCommitted = !!processing?.committed_at;
    const status = processing?.status ?? "pending_extraction";

    // Get redactions
    const { data: dbRedactions, error: redactionsError } = await supabase
      .from("document_redactions")
      .select("*")
      .eq("file_id", fileId)
      .order("start_offset", { ascending: true });

    if (redactionsError) {
      return {
        success: false,
        error: redactionsError.message,
        code: "DB_ERROR",
      };
    }

    const redactions: DocumentRedactionWithId[] = (dbRedactions || []).map((r) => ({
      id: r.id,
      ...dbRedactionsToDefinitions([r])[0],
    }));

    return {
      success: true,
      data: {
        redactions,
        processingStatus: status,
        canEdit: !isCommitted,
      },
    };
  } catch (error) {
    return handleError(error);
  }
}

// ============================================================================
// CREATE REDACTION
// ============================================================================

/**
 * Creates a new redaction for a document.
 *
 * Permission: Admin access required
 * Note: Redactions cannot be created if document is already committed.
 */
export async function createRedactionAction(
  fileId: string,
  redaction: RedactionDefinition
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdminAccess();
    const user = await getCurrentUser();
    const { organization } = await getCurrentOrganization();
    const supabase = getServerSupabaseClient();

    // Verify file belongs to organization
    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("id, organization_id")
      .eq("id", fileId)
      .eq("organization_id", organization.id)
      .is("deleted_at", null)
      .single();

    if (fileError || !file) {
      return {
        success: false,
        error: "File not found",
        code: "NOT_FOUND",
      };
    }

    // Check if document is committed (redactions are immutable after commit)
    const { data: processing } = await supabase
      .from("document_processing")
      .select("committed_at")
      .eq("file_id", fileId)
      .single();

    if (processing?.committed_at) {
      return {
        success: false,
        error: "Cannot add redactions to a committed document",
        code: "ALREADY_COMMITTED",
      };
    }

    // Get raw text to validate offsets
    const { data: rawText } = await supabase
      .from("document_raw_text")
      .select("content")
      .eq("file_id", fileId)
      .single();

    if (!rawText) {
      return {
        success: false,
        error: "Raw text not found. Document must be extracted first.",
        code: "NOT_EXTRACTED",
      };
    }

    // Validate redaction offsets
    if (
      redaction.startOffset < 0 ||
      redaction.endOffset > rawText.content.length ||
      redaction.startOffset >= redaction.endOffset
    ) {
      return {
        success: false,
        error: "Invalid redaction offsets",
        code: "INVALID_OFFSETS",
      };
    }

    // Insert redaction
    const insert: DocumentRedactionInsert = {
      file_id: fileId,
      organization_id: organization.id,
      redaction_type: redaction.type,
      start_offset: redaction.startOffset,
      end_offset: redaction.endOffset,
      pattern: redaction.pattern ?? null,
      semantic_label: redaction.semanticLabel ?? null,
      created_by: user.id,
    };

    const { data: newRedaction, error: insertError } = await supabase
      .from("document_redactions")
      .insert(insert)
      .select("id")
      .single();

    if (insertError) {
      return {
        success: false,
        error: insertError.message,
        code: "DB_ERROR",
      };
    }

    // Update processing status if needed
    if (processing) {
      await supabase
        .from("document_processing")
        .update({ status: "redaction_in_progress" })
        .eq("file_id", fileId);
    }

    return { success: true, data: { id: newRedaction.id } };
  } catch (error) {
    return handleError(error);
  }
}

// ============================================================================
// DELETE REDACTION
// ============================================================================

/**
 * Deletes a redaction from a document.
 *
 * Permission: Admin access required
 * Note: Redactions cannot be deleted if document is already committed.
 */
export async function deleteRedactionAction(
  fileId: string,
  redactionId: string
): Promise<ActionResult<void>> {
  try {
    await requireAdminAccess();
    const { organization } = await getCurrentOrganization();
    const supabase = getServerSupabaseClient();

    // Verify file belongs to organization
    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("id, organization_id")
      .eq("id", fileId)
      .eq("organization_id", organization.id)
      .is("deleted_at", null)
      .single();

    if (fileError || !file) {
      return {
        success: false,
        error: "File not found",
        code: "NOT_FOUND",
      };
    }

    // Check if document is committed
    const { data: processing } = await supabase
      .from("document_processing")
      .select("committed_at")
      .eq("file_id", fileId)
      .single();

    if (processing?.committed_at) {
      return {
        success: false,
        error: "Cannot delete redactions from a committed document",
        code: "ALREADY_COMMITTED",
      };
    }

    // Delete redaction
    const { error: deleteError } = await supabase
      .from("document_redactions")
      .delete()
      .eq("id", redactionId)
      .eq("file_id", fileId);

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
// DETECT PII
// ============================================================================

/**
 * Detects PII patterns in document text and returns suggested redactions.
 *
 * Permission: Admin access required
 */
export async function detectPiiAction(
  fileId: string,
  types?: string[]
): Promise<ActionResult<RedactionDefinition[]>> {
  try {
    await requireAdminAccess();
    const { organization } = await getCurrentOrganization();
    const supabase = getServerSupabaseClient();

    // Verify file belongs to organization
    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("id, organization_id")
      .eq("id", fileId)
      .eq("organization_id", organization.id)
      .is("deleted_at", null)
      .single();

    if (fileError || !file) {
      return {
        success: false,
        error: "File not found",
        code: "NOT_FOUND",
      };
    }

    // Get raw text
    const { data: rawText } = await supabase
      .from("document_raw_text")
      .select("content")
      .eq("file_id", fileId)
      .single();

    if (!rawText) {
      return {
        success: false,
        error: "Raw text not found",
        code: "NOT_FOUND",
      };
    }

    // Detect PII
    const piiTypes = (types as any[]) || [
      "pii_email",
      "pii_phone",
      "pii_ssn",
      "financial",
    ];
    const suggestions = detectPii(rawText.content, piiTypes);

    return { success: true, data: suggestions };
  } catch (error) {
    return handleError(error);
  }
}

// ============================================================================
// FIND REGEX MATCHES
// ============================================================================

/**
 * Finds matches for a regex pattern in document text.
 *
 * Permission: Admin access required
 */
export async function findRegexMatchesAction(
  fileId: string,
  pattern: string
): Promise<ActionResult<RedactionDefinition[]>> {
  try {
    await requireAdminAccess();
    const { organization } = await getCurrentOrganization();
    const supabase = getServerSupabaseClient();

    // Verify file belongs to organization
    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("id, organization_id")
      .eq("id", fileId)
      .eq("organization_id", organization.id)
      .is("deleted_at", null)
      .single();

    if (fileError || !file) {
      return {
        success: false,
        error: "File not found",
        code: "NOT_FOUND",
      };
    }

    // Get raw text
    const { data: rawText } = await supabase
      .from("document_raw_text")
      .select("content")
      .eq("file_id", fileId)
      .single();

    if (!rawText) {
      return {
        success: false,
        error: "Raw text not found",
        code: "NOT_FOUND",
      };
    }

    // Find matches
    const matches = findRegexMatches(rawText.content, pattern);

    return { success: true, data: matches };
  } catch (error) {
    return handleError(error);
  }
}

// ============================================================================
// COMMIT REDACTIONS
// ============================================================================

/**
 * Commits redactions for a document.
 * This permanently applies redactions, generates AI-safe text, and deletes raw text.
 *
 * Permission: Admin access required
 * WARNING: This operation is irreversible.
 */
export async function commitRedactionsAction(
  fileId: string
): Promise<ActionResult<void>> {
  try {
    await requireAdminAccess();
    const user = await getCurrentUser();
    const { organization } = await getCurrentOrganization();
    const supabase = getServerSupabaseClient();

    // Verify file belongs to organization
    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("id, organization_id")
      .eq("id", fileId)
      .eq("organization_id", organization.id)
      .is("deleted_at", null)
      .single();

    if (fileError || !file) {
      return {
        success: false,
        error: "File not found",
        code: "NOT_FOUND",
      };
    }

    // Use admin client for pipeline operations
    const supabaseAdmin = createServerSupabaseClient();

    // Commit redactions
    const result = await commitRedactions(supabaseAdmin, fileId, user.id);

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Failed to commit redactions",
        code: "COMMIT_FAILED",
      };
    }

    return { success: true, data: undefined };
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

  console.error("Admin redaction action error:", error);
  return {
    success: false,
    error: "An unexpected error occurred",
    code: "UNKNOWN_ERROR",
  };
}
