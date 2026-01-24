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

/**
 * Creates a new team in the current organization.
 * Only super_admin can create teams.
 */
export async function createTeamAction(
  name: string
): Promise<ActionResult<DbTeam>> {
  try {
    const user = await getCurrentUser();
    const { organization, isSuperAdmin } = await getCurrentOrganization();

    if (!isSuperAdmin) {
      return {
        success: false,
        error: "Only super admins can create teams",
        code: "PERMISSION_DENIED",
      };
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return {
        success: false,
        error: "Team name cannot be empty",
        code: "VALIDATION_ERROR",
      };
    }

    const supabase = getServerSupabaseClient();

    // Check for duplicate team name in the organization
    const { data: existingTeam, error: checkError } = await supabase
      .from("teams")
      .select("id")
      .eq("organization_id", organization.id)
      .eq("name", trimmedName)
      .limit(1)
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      // PGRST116 is "no rows returned" which is expected for new teams
      return {
        success: false,
        error: checkError.message,
        code: "DB_ERROR",
      };
    }

    if (existingTeam) {
      return {
        success: false,
        error: "A team with this name already exists",
        code: "DUPLICATE_NAME",
      };
    }

    // Create the team
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .insert({
        organization_id: organization.id,
        name: trimmedName,
      })
      .select("id, organization_id, name, created_at, updated_at")
      .single();

    if (teamError || !team) {
      return {
        success: false,
        error: teamError?.message || "Failed to create team",
        code: "DB_ERROR",
      };
    }

    // Add creator as team member
    const { error: memberError } = await supabase
      .from("team_members")
      .insert({
        team_id: team.id,
        user_id: user.id,
      });

    if (memberError) {
      // Cleanup: delete the team we just created
      await supabase.from("teams").delete().eq("id", team.id);
      return {
        success: false,
        error: memberError.message,
        code: "DB_ERROR",
      };
    }

    return { success: true, data: team as DbTeam };
  } catch (error) {
    console.error("createTeamAction error:", error);
    return {
      success: false,
      error: "Failed to create team",
      code: "UNKNOWN_ERROR",
    };
  }
}

/**
 * Gets a team by ID.
 * Verifies the team exists and is in the user's organization.
 */
export async function getTeamByIdAction(
  teamId: string
): Promise<ActionResult<DbTeam & { memberCount: number }>> {
  try {
    const { organization } = await getCurrentOrganization();
    const supabase = getServerSupabaseClient();

    // Get team details
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id, organization_id, name, created_at, updated_at")
      .eq("id", teamId)
      .eq("organization_id", organization.id)
      .single();

    if (teamError) {
      if (teamError.code === "PGRST116") {
        return {
          success: false,
          error: "Team not found",
          code: "NOT_FOUND",
        };
      }
      return {
        success: false,
        error: teamError.message,
        code: "DB_ERROR",
      };
    }

    if (!team) {
      return {
        success: false,
        error: "Team not found",
        code: "NOT_FOUND",
      };
    }

    // Get member count
    const { count, error: countError } = await supabase
      .from("team_members")
      .select("*", { count: "exact", head: true })
      .eq("team_id", teamId);

    if (countError) {
      return {
        success: false,
        error: countError.message,
        code: "DB_ERROR",
      };
    }

    return {
      success: true,
      data: {
        ...(team as DbTeam),
        memberCount: count || 0,
      },
    };
  } catch (error) {
    console.error("getTeamByIdAction error:", error);
    return {
      success: false,
      error: "Failed to fetch team",
      code: "UNKNOWN_ERROR",
    };
  }
}

/**
 * Gets all members of a team.
 * Returns user details with membership info.
 */
export async function getTeamMembersAction(teamId: string): Promise<
  ActionResult<
    Array<{
      user_id: string;
      email: string;
      name: string | null;
      created_at: string;
    }>
  >
> {
  try {
    const { organization } = await getCurrentOrganization();
    const supabase = getServerSupabaseClient();

    // Verify team exists and is in user's org
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id")
      .eq("id", teamId)
      .eq("organization_id", organization.id)
      .single();

    if (teamError || !team) {
      return {
        success: false,
        error: "Team not found",
        code: "NOT_FOUND",
      };
    }

    // Get team members
    const { data: members, error: membersError } = await supabase
      .from("team_members")
      .select("user_id, created_at")
      .eq("team_id", teamId);

    if (membersError) {
      return {
        success: false,
        error: membersError.message,
        code: "DB_ERROR",
      };
    }

    if (!members || members.length === 0) {
      return { success: true, data: [] };
    }

    // Get user details for all members
    const userIds = members.map((m) => m.user_id);
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, email, name")
      .in("id", userIds);

    if (usersError) {
      return {
        success: false,
        error: usersError.message,
        code: "DB_ERROR",
      };
    }

    // Create a map of user_id to user data
    const userMap = new Map((users || []).map((u) => [u.id, u]));

    // Combine team_members with user data
    const formattedMembers = members.map((member) => {
      const user = userMap.get(member.user_id);
      return {
        user_id: member.user_id,
        email: user?.email || "",
        name: user?.name || null,
        created_at: member.created_at,
      };
    });

    return { success: true, data: formattedMembers };
  } catch (error) {
    console.error("getTeamMembersAction error:", error);
    return {
      success: false,
      error: "Failed to fetch team members",
      code: "UNKNOWN_ERROR",
    };
  }
}

/**
 * Adds a user to a team by email.
 * Only super_admin can add members.
 */
export async function addTeamMemberAction(
  teamId: string,
  userEmail: string
): Promise<ActionResult<void>> {
  try {
    const { organization, isSuperAdmin } = await getCurrentOrganization();

    if (!isSuperAdmin) {
      return {
        success: false,
        error: "Only super admins can add team members",
        code: "PERMISSION_DENIED",
      };
    }

    const trimmedEmail = userEmail.trim().toLowerCase();
    if (!trimmedEmail) {
      return {
        success: false,
        error: "Email cannot be empty",
        code: "VALIDATION_ERROR",
      };
    }

    const supabase = getServerSupabaseClient();

    // Verify team exists and is in user's org
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id")
      .eq("id", teamId)
      .eq("organization_id", organization.id)
      .single();

    if (teamError || !team) {
      return {
        success: false,
        error: "Team not found",
        code: "NOT_FOUND",
      };
    }

    // Find user by email in the same organization
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("email", trimmedEmail)
      .single();

    if (userError || !user) {
      return {
        success: false,
        error: "User not found",
        code: "USER_NOT_FOUND",
      };
    }

    // Verify user is in the same organization
    const { data: orgMember, error: orgMemberError } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("organization_id", organization.id)
      .single();

    if (orgMemberError || !orgMember) {
      return {
        success: false,
        error: "User is not a member of this organization",
        code: "USER_NOT_IN_ORG",
      };
    }

    // Check if user is already in the team
    const { data: existingMember, error: checkError } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      return {
        success: false,
        error: checkError.message,
        code: "DB_ERROR",
      };
    }

    if (existingMember) {
      return {
        success: false,
        error: "User is already a member of this team",
        code: "ALREADY_MEMBER",
      };
    }

    // Add user to team
    const { error: insertError } = await supabase
      .from("team_members")
      .insert({
        team_id: teamId,
        user_id: user.id,
      });

    if (insertError) {
      return {
        success: false,
        error: insertError.message,
        code: "DB_ERROR",
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    console.error("addTeamMemberAction error:", error);
    return {
      success: false,
      error: "Failed to add team member",
      code: "UNKNOWN_ERROR",
    };
  }
}

/**
 * Removes a user from a team.
 * Only super_admin can remove members.
 */
export async function removeTeamMemberAction(
  teamId: string,
  userId: string
): Promise<ActionResult<void>> {
  try {
    const { organization, isSuperAdmin } = await getCurrentOrganization();

    if (!isSuperAdmin) {
      return {
        success: false,
        error: "Only super admins can remove team members",
        code: "PERMISSION_DENIED",
      };
    }

    const supabase = getServerSupabaseClient();

    // Verify team exists and is in user's org
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id")
      .eq("id", teamId)
      .eq("organization_id", organization.id)
      .single();

    if (teamError || !team) {
      return {
        success: false,
        error: "Team not found",
        code: "NOT_FOUND",
      };
    }

    // Remove user from team
    const { error: deleteError } = await supabase
      .from("team_members")
      .delete()
      .eq("team_id", teamId)
      .eq("user_id", userId);

    if (deleteError) {
      return {
        success: false,
        error: deleteError.message,
        code: "DB_ERROR",
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    console.error("removeTeamMemberAction error:", error);
    return {
      success: false,
      error: "Failed to remove team member",
      code: "UNKNOWN_ERROR",
    };
  }
}

/**
 * Gets the member count for a team.
 */
export async function getTeamMemberCountAction(
  teamId: string
): Promise<ActionResult<number>> {
  try {
    const { organization } = await getCurrentOrganization();
    const supabase = getServerSupabaseClient();

    // Verify team exists and is in user's org
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id")
      .eq("id", teamId)
      .eq("organization_id", organization.id)
      .single();

    if (teamError || !team) {
      return {
        success: false,
        error: "Team not found",
        code: "NOT_FOUND",
      };
    }

    // Get member count
    const { count, error: countError } = await supabase
      .from("team_members")
      .select("*", { count: "exact", head: true })
      .eq("team_id", teamId);

    if (countError) {
      return {
        success: false,
        error: countError.message,
        code: "DB_ERROR",
      };
    }

    return { success: true, data: count || 0 };
  } catch (error) {
    console.error("getTeamMemberCountAction error:", error);
    return {
      success: false,
      error: "Failed to fetch member count",
      code: "UNKNOWN_ERROR",
    };
  }
}

/**
 * Checks if the current user is a super_admin in their organization.
 */
export async function checkIsSuperAdminAction(): Promise<ActionResult<boolean>> {
  try {
    const { isSuperAdmin } = await getCurrentOrganization();
    return { success: true, data: isSuperAdmin };
  } catch (error) {
    console.error("checkIsSuperAdminAction error:", error);
    return {
      success: false,
      error: "Failed to check permissions",
      code: "UNKNOWN_ERROR",
    };
  }
}
