/**
 * Chat Actions
 *
 * Server actions for AI chat functionality.
 */

"use server";

import { getCurrentUser, getCurrentOrganization, AuthenticationError } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { canUserAccess } from "@/lib/permissions";
import type { AiReadyFile } from "./chat-types";

// ============================================================================
// TYPES
// ============================================================================

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

// ============================================================================
// LIST AI-READY FILES
// ============================================================================

/**
 * Lists all indexed files that the user has access to.
 *
 * These files are available for @-mentions in chat.
 *
 * @returns List of files with fileId and fileName
 */
export async function listAiReadyFilesAction(): Promise<ActionResult<AiReadyFile[]>> {
  try {
    // 1. Authenticate
    const user = await getCurrentUser();
    const { organization } = await getCurrentOrganization();

    // 2. Get indexed files from document_processing
    const supabase = getServerSupabaseClient();

    const { data: indexed, error: queryError } = await supabase
      .from("document_processing")
      .select(`
        file_id,
        files!inner (
          id,
          name,
          deleted_at
        )
      `)
      .eq("organization_id", organization.id)
      .eq("status", "indexed")
      .is("files.deleted_at", null);

    if (queryError) {
      console.error("Error fetching indexed files:", queryError);
      return {
        success: false,
        error: "Failed to fetch indexed files",
        code: "QUERY_ERROR",
      };
    }

    if (!indexed || indexed.length === 0) {
      return { success: true, data: [] };
    }

    // 3. Filter by permission - user must have view access
    const accessible: AiReadyFile[] = [];

    for (const item of indexed) {
      const file = item.files as { id: string; name: string; deleted_at: string | null };
      
      if (!file) continue;

      const permissionResult = await canUserAccess(
        user.id,
        "file",
        file.id,
        "view"
      );

      if (permissionResult.allowed) {
        accessible.push({
          fileId: file.id,
          fileName: file.name,
        });
      }
    }

    // 4. Sort by filename
    accessible.sort((a, b) => a.fileName.localeCompare(b.fileName));

    return { success: true, data: accessible };
  } catch (error) {
    console.error("listAiReadyFilesAction error:", error);

    if (error instanceof AuthenticationError) {
      return {
        success: false,
        error: "Authentication required",
        code: "AUTH_ERROR",
      };
    }

    return {
      success: false,
      error: "An unexpected error occurred",
      code: "UNKNOWN_ERROR",
    };
  }
}
