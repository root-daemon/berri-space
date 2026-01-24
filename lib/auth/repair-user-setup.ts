import { getServerSupabaseClient } from "@/lib/supabase/server";
import type { DbUser } from "@/lib/supabase/types";
import { AuthenticationError } from "./user";

/**
 * Repairs a user's organization and team setup if they are missing.
 * This handles edge cases where users were created before the automatic
 * org/team creation logic existed, or if the initial setup failed.
 *
 * This function is idempotent - safe to call multiple times.
 *
 * @param user - The database user record
 * @returns True if repair was needed and completed, false if user already has setup
 * @throws {AuthenticationError} If repair fails
 */
export async function repairUserSetup(user: DbUser): Promise<boolean> {
  const supabase = getServerSupabaseClient();

  // Check if user already has an organization membership
  const { data: existingMembership, error: checkError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (checkError && checkError.code !== "PGRST116") {
    // PGRST116 is "no rows returned" which is expected if user has no org
    console.error("[repairUserSetup] Error checking for existing membership:", {
      userId: user.id,
      error: checkError.message,
      code: checkError.code,
    });
    throw new AuthenticationError(
      `Failed to check organization membership: ${checkError.message}`,
      "DB_QUERY_FAILED"
    );
  }

  // User already has an organization - no repair needed
  if (existingMembership) {
    console.log("[repairUserSetup] User already has organization setup:", {
      userId: user.id,
      orgId: existingMembership.organization_id,
    });
    return false;
  }

  // User needs repair - create organization and team
  console.log("[repairUserSetup] Repairing user setup:", {
    userId: user.id,
    email: user.email,
    name: user.name,
  });

  // Step 1: Create a personal organization for the user
  const orgName = user.name ? `${user.name}'s Workspace` : "My Workspace";
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: orgName })
    .select("id")
    .single();

  if (orgError || !org) {
    console.error("[repairUserSetup] Failed to create organization:", {
      userId: user.id,
      error: orgError?.message,
      code: orgError?.code,
    });
    throw new AuthenticationError(
      `Failed to create organization: ${orgError?.message || "Unknown error"}`,
      "DB_SYNC_FAILED"
    );
  }

  console.log("[repairUserSetup] Organization created:", { orgId: org.id });

  // Step 2: Add user as super_admin of the organization
  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({
      organization_id: org.id,
      user_id: user.id,
      role: "super_admin",
    });

  if (memberError) {
    console.error("[repairUserSetup] Failed to create organization membership:", {
      userId: user.id,
      orgId: org.id,
      error: memberError.message,
      code: memberError.code,
    });
    // Cleanup
    await supabase.from("organizations").delete().eq("id", org.id);
    throw new AuthenticationError(
      `Failed to create organization membership: ${memberError.message}`,
      "DB_SYNC_FAILED"
    );
  }

  console.log("[repairUserSetup] Organization membership created");

  // Step 3: Create a default team in the organization
  const { data: team, error: teamError } = await supabase
    .from("teams")
    .insert({
      organization_id: org.id,
      name: "Personal",
    })
    .select("id")
    .single();

  if (teamError || !team) {
    console.error("[repairUserSetup] Failed to create team:", {
      userId: user.id,
      orgId: org.id,
      error: teamError?.message,
      code: teamError?.code,
    });
    // Cleanup
    await supabase.from("organization_members").delete().eq("user_id", user.id);
    await supabase.from("organizations").delete().eq("id", org.id);
    throw new AuthenticationError(
      `Failed to create team: ${teamError?.message || "Unknown error"}`,
      "DB_SYNC_FAILED"
    );
  }

  console.log("[repairUserSetup] Team created:", { teamId: team.id });

  // Step 4: Add user to the team
  const { error: teamMemberError } = await supabase
    .from("team_members")
    .insert({
      team_id: team.id,
      user_id: user.id,
    });

  if (teamMemberError) {
    console.error("[repairUserSetup] Failed to create team membership:", {
      userId: user.id,
      teamId: team.id,
      error: teamMemberError.message,
      code: teamMemberError.code,
    });
    // Cleanup
    await supabase.from("teams").delete().eq("id", team.id);
    await supabase.from("organization_members").delete().eq("user_id", user.id);
    await supabase.from("organizations").delete().eq("id", org.id);
    throw new AuthenticationError(
      `Failed to create team membership: ${teamMemberError.message}`,
      "DB_SYNC_FAILED"
    );
  }

  console.log("[repairUserSetup] Team membership created - repair complete:", {
    userId: user.id,
    orgId: org.id,
    teamId: team.id,
  });

  return true;
}
