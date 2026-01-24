"use server";

/**
 * Server Actions for Team Operations
 *
 * These actions provide team-related data to client components.
 */

import { getServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentOrganization } from "@/lib/auth";
import type { DbTeam } from "@/lib/supabase/types";

// ============================================================================
// TYPES
// ============================================================================

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string };

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * Gets all teams the current user belongs to.
 */
export async function getUserTeamsAction(): Promise<ActionResult<DbTeam[]>> {
  try {
    const user = await getCurrentUser();
    const { organization } = await getCurrentOrganization();
    const supabase = getServerSupabaseClient();

    // Get user's team memberships
    const { data: memberships, error: membershipsError } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id);

    if (membershipsError) {
      return {
        success: false,
        error: membershipsError.message,
        code: "DB_ERROR",
      };
    }

    if (!memberships || memberships.length === 0) {
      return { success: true, data: [] };
    }

    const teamIds = memberships.map((m) => m.team_id);

    // Get team details
    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id, organization_id, name, created_at, updated_at")
      .eq("organization_id", organization.id)
      .in("id", teamIds)
      .order("name", { ascending: true });

    if (teamsError) {
      return {
        success: false,
        error: teamsError.message,
        code: "DB_ERROR",
      };
    }

    return { success: true, data: (teams as DbTeam[]) || [] };
  } catch (error) {
    console.error("getUserTeamsAction error:", error);
    return {
      success: false,
      error: "Failed to fetch teams",
      code: "UNKNOWN_ERROR",
    };
  }
}

/**
 * Gets the user's default team (first team they belong to).
 * Used for default ownership when creating resources.
 */
export async function getDefaultTeamAction(): Promise<ActionResult<DbTeam | null>> {
  const result = await getUserTeamsAction();
  if (!result.success) {
    return result;
  }

  return {
    success: true,
    data: result.data.length > 0 ? result.data[0] : null,
  };
}
