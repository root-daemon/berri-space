"use server";

/**
 * Server Actions for Organization Member Management
 *
 * These actions provide organization member management to client components.
 */

import { getServerSupabaseClient } from "@/lib/supabase/server";
import type { OrgRole } from "@/lib/supabase/types";
import { requireDbUser, AuthenticationError } from "./user";
import { getCurrentOrganization } from "./organization";

// ============================================================================
// TYPES
// ============================================================================

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string };

// ============================================================================
// SERVER ACTIONS
// ============================================================================

/**
 * Gets the current user's database ID.
 */
export async function getCurrentUserIdAction(): Promise<ActionResult<string>> {
  try {
    const user = await requireDbUser();
    return { success: true, data: user.id };
  } catch (error) {
    console.error("getCurrentUserIdAction error:", error);
    if (error instanceof AuthenticationError) {
      return {
        success: false,
        error: error.message,
        code: "AUTH_ERROR",
      };
    }
    return {
      success: false,
      error: "Failed to get current user ID",
      code: "UNKNOWN_ERROR",
    };
  }
}

/**
 * Gets all members of the current organization.
 * Returns list with user details (email, name) and role.
 * Only accessible to org members (RLS handles this).
 */
export async function getOrganizationMembersAction(): Promise<
  ActionResult<
    Array<{
      user_id: string;
      email: string;
      name: string | null;
      role: OrgRole;
      created_at: string;
    }>
  >
> {
  try {
    const user = await requireDbUser();
    const { organization } = await getCurrentOrganization();
    const supabase = getServerSupabaseClient();

    // Get all organization members
    const { data: members, error: membersError } = await supabase
      .from("organization_members")
      .select("user_id, role, created_at")
      .eq("organization_id", organization.id);

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

    // Combine organization_members with user data
    const formattedMembers = members.map((member) => {
      const userData = userMap.get(member.user_id);
      return {
        user_id: member.user_id,
        email: userData?.email || "",
        name: userData?.name || null,
        role: member.role as OrgRole,
        created_at: member.created_at,
      };
    });

    return { success: true, data: formattedMembers };
  } catch (error) {
    console.error("getOrganizationMembersAction error:", error);
    if (error instanceof AuthenticationError) {
      return {
        success: false,
        error: error.message,
        code: "AUTH_ERROR",
      };
    }
    return {
      success: false,
      error: "Failed to fetch organization members",
      code: "UNKNOWN_ERROR",
    };
  }
}

/**
 * Adds a user to the organization by email.
 * Only super_admin can add members.
 */
export async function addOrganizationMemberAction(
  email: string,
  role: "member" | "admin"
): Promise<ActionResult<void>> {
  try {
    const user = await requireDbUser();
    const { organization, isSuperAdmin } = await getCurrentOrganization();

    if (!isSuperAdmin) {
      return {
        success: false,
        error: "Only super admins can add organization members",
        code: "PERMISSION_DENIED",
      };
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      return {
        success: false,
        error: "Email cannot be empty",
        code: "VALIDATION_ERROR",
      };
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return {
        success: false,
        error: "Invalid email format",
        code: "VALIDATION_ERROR",
      };
    }

    const supabase = getServerSupabaseClient();

    // Find user by email
    const { data: targetUser, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("email", trimmedEmail)
      .single();

    if (userError || !targetUser) {
      if (userError?.code === "PGRST116") {
        return {
          success: false,
          error: "User not found",
          code: "USER_NOT_FOUND",
        };
      }
      return {
        success: false,
        error: userError?.message || "User not found",
        code: "USER_NOT_FOUND",
      };
    }

    // Check if user is already in the organization
    const { data: existingMember, error: checkError } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("user_id", targetUser.id)
      .eq("organization_id", organization.id)
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
        error: "User is already a member of this organization",
        code: "ALREADY_MEMBER",
      };
    }

    // Add user to organization (invited_at set so this org is prioritized over their own)
    const { error: insertError } = await supabase
      .from("organization_members")
      .insert({
        organization_id: organization.id,
        user_id: targetUser.id,
        role,
        invited_at: new Date().toISOString(),
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
    console.error("addOrganizationMemberAction error:", error);
    if (error instanceof AuthenticationError) {
      return {
        success: false,
        error: error.message,
        code: "AUTH_ERROR",
      };
    }
    return {
      success: false,
      error: "Failed to add organization member",
      code: "UNKNOWN_ERROR",
    };
  }
}

/**
 * Removes a user from the organization.
 * Only super_admin can remove members.
 * Prevents removing yourself and prevents removing the last super_admin.
 */
export async function removeOrganizationMemberAction(
  userId: string
): Promise<ActionResult<void>> {
  try {
    const user = await requireDbUser();
    const { organization, isSuperAdmin } = await getCurrentOrganization();

    if (!isSuperAdmin) {
      return {
        success: false,
        error: "Only super admins can remove organization members",
        code: "PERMISSION_DENIED",
      };
    }

    // Prevent removing yourself
    if (user.id === userId) {
      return {
        success: false,
        error: "Cannot remove yourself",
        code: "VALIDATION_ERROR",
      };
    }

    const supabase = getServerSupabaseClient();

    // Check if the user being removed is a super_admin (cannot remove super_admin)
    const { data: memberToRemove, error: memberError } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organization.id)
      .eq("user_id", userId)
      .single();

    if (memberError) {
      return {
        success: false,
        error: memberError.message,
        code: "DB_ERROR",
      };
    }

    if (memberToRemove?.role === "super_admin") {
      return {
        success: false,
        error: "Cannot remove super admin",
        code: "VALIDATION_ERROR",
      };
    }

    // Remove user from organization
    const { error: deleteError } = await supabase
      .from("organization_members")
      .delete()
      .eq("organization_id", organization.id)
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
    console.error("removeOrganizationMemberAction error:", error);
    if (error instanceof AuthenticationError) {
      return {
        success: false,
        error: error.message,
        code: "AUTH_ERROR",
      };
    }
    return {
      success: false,
      error: "Failed to remove organization member",
      code: "UNKNOWN_ERROR",
    };
  }
}

/**
 * Updates a user's role in the organization.
 * Only super_admin can update roles.
 * Prevents demoting yourself if you're the last super_admin.
 */
export async function updateOrganizationMemberRoleAction(
  userId: string,
  role: "member" | "admin"
): Promise<ActionResult<void>> {
  try {
    const user = await requireDbUser();
    const { organization, isSuperAdmin } = await getCurrentOrganization();

    if (!isSuperAdmin) {
      return {
        success: false,
        error: "Only super admins can update organization member roles",
        code: "PERMISSION_DENIED",
      };
    }

    const supabase = getServerSupabaseClient();

    // Prevent changing super_admin role (only the creator can be super_admin)
    const { data: currentMember, error: memberError } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organization.id)
      .eq("user_id", userId)
      .single();

    if (memberError) {
      return {
        success: false,
        error: memberError.message,
        code: "DB_ERROR",
      };
    }

    if (currentMember?.role === "super_admin") {
      return {
        success: false,
        error: "Cannot change super admin role",
        code: "VALIDATION_ERROR",
      };
    }

    // Update role
    const { error: updateError } = await supabase
      .from("organization_members")
      .update({ role })
      .eq("organization_id", organization.id)
      .eq("user_id", userId);

    if (updateError) {
      return {
        success: false,
        error: updateError.message,
        code: "DB_ERROR",
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    console.error("updateOrganizationMemberRoleAction error:", error);
    if (error instanceof AuthenticationError) {
      return {
        success: false,
        error: error.message,
        code: "AUTH_ERROR",
      };
    }
    return {
      success: false,
      error: "Failed to update organization member role",
      code: "UNKNOWN_ERROR",
    };
  }
}
