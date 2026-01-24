import { getServerSupabaseClient } from "@/lib/supabase/server";
import type {
  DbOrganization,
  DbOrganizationMember,
  OrgRole,
} from "@/lib/supabase/types";
import { requireDbUser, AuthenticationError } from "./user";
import { repairUserSetup } from "./repair-user-setup";

/**
 * Combined organization context including membership info.
 */
export interface OrganizationContext {
  /** The organization record */
  organization: DbOrganization;
  /** The user's membership record */
  membership: DbOrganizationMember;
  /** The user's role in this organization */
  role: OrgRole;
  /** Whether the user is a super_admin */
  isSuperAdmin: boolean;
}

type MembershipWithInvited = {
  organization_id: string;
  user_id: string;
  role: string;
  created_at: string;
  invited_at: string | null;
};

/**
 * Sort memberships: invited orgs (invited_at set) first, then own org (invited_at NULL).
 * Among same priority, most recently joined first. MVP: one org, prioritize invited.
 */
function sortByInvitedFirst(
  a: MembershipWithInvited,
  b: MembershipWithInvited
): number {
  const aInvited = a.invited_at != null;
  const bInvited = b.invited_at != null;
  if (aInvited && !bInvited) return -1;
  if (!aInvited && bInvited) return 1;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

/**
 * Gets the current user's active organization.
 *
 * This function:
 * 1. Gets the authenticated user from the database
 * 2. Fetches all their organization memberships
 * 3. Prioritizes invited organizations (invited_at set) over own (invited_at NULL) per MVP
 * 4. Returns the prioritized organization
 *
 * Priority logic:
 * - If user has both an invited org and own org, returns invited org
 * - If user only has one org, returns that org
 * - Among same priority, returns most recently joined
 *
 * For multi-org support in the future, this could accept an optional orgId
 * parameter or read from a session/cookie.
 *
 * @throws {AuthenticationError} If the user is not authenticated
 * @throws {AuthenticationError} If the user has no organization membership
 * @returns The organization context including role information
 *
 * @example
 * ```ts
 * const { organization, role, isSuperAdmin } = await getCurrentOrganization();
 * console.log(`User is ${role} in ${organization.name}`);
 * ```
 */
export async function getCurrentOrganization(): Promise<OrganizationContext> {
  // Get the authenticated user (throws if not authenticated)
  const user = await requireDbUser();
  const supabase = getServerSupabaseClient();

  // Fetch all user's organization memberships
  // Prioritize invited orgs (invited_at set) over own org (invited_at NULL) per MVP
  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, user_id, role, created_at, invited_at")
    .eq("user_id", user.id);

  if (membershipError) {
    // Handle "no rows" case - try to repair user setup
    if (membershipError.code === "PGRST116" || (memberships && memberships.length === 0)) {
      console.log("[getCurrentOrganization] User has no organization, attempting repair:", {
        userId: user.id,
      });
      try {
        const repaired = await repairUserSetup(user);
        if (repaired) {
        // Retry fetching memberships after repair
        const { data: newMemberships, error: retryError } = await supabase
          .from("organization_members")
          .select("organization_id, user_id, role, created_at, invited_at")
          .eq("user_id", user.id);

        if (retryError || !newMemberships || newMemberships.length === 0) {
          throw new AuthenticationError(
            `Failed to fetch organization membership after repair: ${retryError?.message || "Not found"}`,
            "DB_QUERY_FAILED"
          );
        }

        const sortedMemberships = newMemberships.sort(sortByInvitedFirst);
        const selectedMembership = sortedMemberships[0];

        const { data: organization, error: orgError } = await supabase
          .from("organizations")
          .select("id, name, created_at, updated_at")
          .eq("id", selectedMembership.organization_id)
          .single();

        if (orgError || !organization) {
          throw new AuthenticationError(
            `Failed to fetch organization after repair: ${orgError?.message || "Not found"}`,
            "DB_QUERY_FAILED"
          );
        }

        const role = selectedMembership.role as OrgRole;
        return {
          organization: organization as DbOrganization,
          membership: selectedMembership as DbOrganizationMember,
          role,
          isSuperAdmin: role === "super_admin",
        };
        }
      } catch (repairError) {
        console.error("[getCurrentOrganization] Repair failed:", {
          userId: user.id,
          error: repairError instanceof Error ? repairError.message : String(repairError),
        });
        throw new AuthenticationError(
          `User does not belong to any organization and repair failed: ${repairError instanceof Error ? repairError.message : "Unknown error"}`,
          "DB_QUERY_FAILED"
        );
      }

      // If repair returned false (user already had setup), something else is wrong
      throw new AuthenticationError(
        "User does not belong to any organization",
        "DB_QUERY_FAILED"
      );
    }
    throw new AuthenticationError(
      `Failed to fetch organization membership: ${membershipError.message}`,
      "DB_QUERY_FAILED"
    );
  }

  // If no memberships found, try repair
  if (!memberships || memberships.length === 0) {
    // Try repair as fallback
    console.log("[getCurrentOrganization] No membership found, attempting repair:", {
      userId: user.id,
    });
    try {
      const repaired = await repairUserSetup(user);
      if (repaired) {
        // Retry fetching memberships after repair
        const { data: newMemberships, error: retryError } = await supabase
          .from("organization_members")
          .select("organization_id, user_id, role, created_at, invited_at")
          .eq("user_id", user.id);

        if (retryError || !newMemberships || newMemberships.length === 0) {
          throw new AuthenticationError(
            `Failed to fetch organization membership after repair: ${retryError?.message || "Not found"}`,
            "DB_QUERY_FAILED"
          );
        }

        const sortedMemberships = newMemberships.sort(sortByInvitedFirst);
        const selectedMembership = sortedMemberships[0];

        const { data: organization, error: orgError } = await supabase
          .from("organizations")
          .select("id, name, created_at, updated_at")
          .eq("id", selectedMembership.organization_id)
          .single();

        if (orgError || !organization) {
          throw new AuthenticationError(
            `Failed to fetch organization after repair: ${orgError?.message || "Not found"}`,
            "DB_QUERY_FAILED"
          );
        }

        const role = selectedMembership.role as OrgRole;
        return {
          organization: organization as DbOrganization,
          membership: selectedMembership as DbOrganizationMember,
          role,
          isSuperAdmin: role === "super_admin",
        };
      }
    } catch (repairError) {
      console.error("[getCurrentOrganization] Repair failed:", {
        userId: user.id,
        error: repairError instanceof Error ? repairError.message : String(repairError),
      });
      throw new AuthenticationError(
        `User does not belong to any organization and repair failed: ${repairError instanceof Error ? repairError.message : "Unknown error"}`,
        "DB_QUERY_FAILED"
      );
    }

    throw new AuthenticationError(
      "User does not belong to any organization",
      "DB_QUERY_FAILED"
    );
  }

  // Prioritize invited orgs (invited_at set) over own org (invited_at NULL). MVP: one org.
  const sortedMemberships = memberships.sort(sortByInvitedFirst);

  const selectedMembership = sortedMemberships[0];

  // Fetch the organization details
  const { data: organization, error: orgError } = await supabase
    .from("organizations")
    .select("id, name, created_at, updated_at")
    .eq("id", selectedMembership.organization_id)
    .single();

  if (orgError || !organization) {
    throw new AuthenticationError(
      `Failed to fetch organization: ${orgError?.message || "Not found"}`,
      "DB_QUERY_FAILED"
    );
  }

  const role = selectedMembership.role as OrgRole;

  return {
    organization: organization as DbOrganization,
    membership: selectedMembership as DbOrganizationMember,
    role,
    isSuperAdmin: role === "super_admin",
  };
}

/**
 * Gets the current user's organization without throwing.
 * Returns null if the user is not authenticated or has no organization.
 *
 * @returns The organization context or null
 */
export async function getOrganization(): Promise<OrganizationContext | null> {
  try {
    return await getCurrentOrganization();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return null;
    }
    throw error;
  }
}

/**
 * Gets an organization by ID.
 * Does not check if the current user has access - use for internal lookups.
 *
 * @param orgId - The organization UUID
 * @returns The organization or null if not found
 */
export async function getOrganizationById(
  orgId: string
): Promise<DbOrganization | null> {
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, created_at, updated_at")
    .eq("id", orgId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw new AuthenticationError(
      `Failed to fetch organization: ${error.message}`,
      "DB_QUERY_FAILED"
    );
  }

  return data as DbOrganization;
}

/**
 * Checks if a user is a super_admin in an organization.
 * Queries the organization_members table directly.
 *
 * @param userId - The user's database UUID
 * @param orgId - The organization UUID
 * @returns Whether the user is a super_admin
 */
export async function isUserSuperAdmin(
  userId: string,
  orgId: string
): Promise<boolean> {
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .single();

  if (error || !data) {
    // If the query fails or no membership found, default to deny
    return false;
  }

  return data.role === "super_admin";
}
