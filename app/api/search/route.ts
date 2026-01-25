/**
 * Search API Route
 *
 * Searches documents and folders that the user has access to.
 * Returns only results the user can view.
 *
 * SECURITY:
 * - User must be authenticated
 * - All results are filtered by permissions
 * - Only returns non-deleted resources
 */

import { NextResponse } from "next/server";
import { getCurrentUser, getCurrentOrganization, AuthenticationError } from "@/lib/auth";
import { canUserAccess } from "@/lib/permissions";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export const maxDuration = 10;

export interface SearchResult {
  id: string;
  name: string;
  type: "file" | "folder";
  folderId: string | null;
  mimeType?: string;
}

export async function GET(req: Request) {
  try {
    // 1. Authenticate user
    const user = await getCurrentUser();
    const { organization } = await getCurrentOrganization();

    // 2. Get search query
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.trim();

    if (!query || query.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // 3. Search files and folders in parallel
    const supabase = getServerSupabaseClient();

    // Search files
    const { data: files, error: filesError } = await supabase
      .from("files")
      .select("id, name, folder_id, mime_type")
      .eq("organization_id", organization.id)
      .is("deleted_at", null)
      .ilike("name", `%${query}%`)
      .limit(10);

    if (filesError) {
      console.error("Search files error:", filesError);
    }

    // Search folders
    const { data: folders, error: foldersError } = await supabase
      .from("folders")
      .select("id, name, parent_folder_id")
      .eq("organization_id", organization.id)
      .is("deleted_at", null)
      .ilike("name", `%${query}%`)
      .limit(10);

    if (foldersError) {
      console.error("Search folders error:", foldersError);
    }

    // 4. Filter by permissions
    const results: SearchResult[] = [];

    // Check file permissions
    if (files) {
      for (const file of files) {
        const permissionResult = await canUserAccess(
          user.id,
          "file",
          file.id,
          "view"
        );

        if (permissionResult.allowed) {
          results.push({
            id: file.id,
            name: file.name,
            type: "file",
            folderId: file.folder_id,
            mimeType: file.mime_type || undefined,
          });
        }
      }
    }

    // Check folder permissions
    if (folders) {
      for (const folder of folders) {
        const permissionResult = await canUserAccess(
          user.id,
          "folder",
          folder.id,
          "view"
        );

        if (permissionResult.allowed) {
          results.push({
            id: folder.id,
            name: folder.name,
            type: "folder",
            folderId: folder.parent_folder_id,
          });
        }
      }
    }

    // 5. Return results (limit to 10 total)
    return NextResponse.json({
      results: results.slice(0, 10),
    });
  } catch (error) {
    console.error("Search API error:", error);

    // Handle authentication errors
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Handle other errors
    return NextResponse.json(
      {
        error: "An error occurred while searching",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
