-- Migration: Row Level Security (RLS)
-- Description: Enables RLS on all tables and creates policies based on the permission model
-- Dependencies: 003_schema_hardening.sql
--
-- IMPORTANT: All policies use the authenticated user's ID from auth.uid()
-- The application must pass the user's internal UUID, not the Clerk ID
-- Backend services should use the service_role key to bypass RLS when needed

-- ============================================================================
-- HELPER FUNCTION: Get current user's internal ID from Clerk ID
-- ============================================================================

-- This function maps Clerk's auth.uid() to our internal user ID
-- Used by RLS policies to identify the current user
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID AS $$
DECLARE
    v_clerk_id TEXT;
    v_user_id UUID;
BEGIN
    -- Get the Clerk user ID from the JWT claims
    v_clerk_id := auth.uid()::text;

    IF v_clerk_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Look up our internal user ID
    SELECT id INTO v_user_id
    FROM users
    WHERE clerk_user_id = v_clerk_id;

    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_current_user_id IS 'Maps Clerk auth.uid() to internal user UUID for RLS policies';

-- ============================================================================
-- HELPER FUNCTION: Check organization membership
-- ============================================================================

CREATE OR REPLACE FUNCTION is_org_member(p_org_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := get_current_user_id();
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM organization_members
        WHERE organization_id = p_org_id
          AND user_id = v_user_id
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- HELPER FUNCTION: Check super_admin for current user
-- ============================================================================

CREATE OR REPLACE FUNCTION current_user_is_super_admin(p_org_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := get_current_user_id();
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN is_super_admin(v_user_id, p_org_id);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE redactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- USERS TABLE POLICIES
-- ============================================================================

-- Users can read their own record
CREATE POLICY users_select_own ON users
    FOR SELECT
    USING (clerk_user_id = auth.uid()::text);

-- Users can read other users in their organizations (for display purposes)
CREATE POLICY users_select_org_members ON users
    FOR SELECT
    USING (
        id IN (
            SELECT om2.user_id
            FROM organization_members om1
            JOIN organization_members om2 ON om1.organization_id = om2.organization_id
            WHERE om1.user_id = get_current_user_id()
        )
    );

-- Users can update their own record
CREATE POLICY users_update_own ON users
    FOR UPDATE
    USING (clerk_user_id = auth.uid()::text)
    WITH CHECK (clerk_user_id = auth.uid()::text);

-- Insert handled by service role (user sync from Clerk)

-- ============================================================================
-- ORGANIZATIONS TABLE POLICIES
-- ============================================================================

-- Users can see organizations they belong to
CREATE POLICY organizations_select_member ON organizations
    FOR SELECT
    USING (is_org_member(id));

-- Only super_admin can update organization
CREATE POLICY organizations_update_admin ON organizations
    FOR UPDATE
    USING (current_user_is_super_admin(id))
    WITH CHECK (current_user_is_super_admin(id));

-- Insert/delete handled by service role (org creation/deletion)

-- ============================================================================
-- ORGANIZATION_MEMBERS TABLE POLICIES
-- ============================================================================

-- Members can see other members in their orgs
CREATE POLICY org_members_select ON organization_members
    FOR SELECT
    USING (is_org_member(organization_id));

-- Super_admin can manage org membership
CREATE POLICY org_members_insert ON organization_members
    FOR INSERT
    WITH CHECK (current_user_is_super_admin(organization_id));

CREATE POLICY org_members_update ON organization_members
    FOR UPDATE
    USING (current_user_is_super_admin(organization_id))
    WITH CHECK (current_user_is_super_admin(organization_id));

CREATE POLICY org_members_delete ON organization_members
    FOR DELETE
    USING (current_user_is_super_admin(organization_id));

-- ============================================================================
-- TEAMS TABLE POLICIES
-- ============================================================================

-- Org members can see teams in their orgs
CREATE POLICY teams_select ON teams
    FOR SELECT
    USING (is_org_member(organization_id));

-- Super_admin can manage teams
CREATE POLICY teams_insert ON teams
    FOR INSERT
    WITH CHECK (current_user_is_super_admin(organization_id));

CREATE POLICY teams_update ON teams
    FOR UPDATE
    USING (current_user_is_super_admin(organization_id))
    WITH CHECK (current_user_is_super_admin(organization_id));

CREATE POLICY teams_delete ON teams
    FOR DELETE
    USING (current_user_is_super_admin(organization_id));

-- ============================================================================
-- TEAM_MEMBERS TABLE POLICIES
-- ============================================================================

-- Org members can see team membership
CREATE POLICY team_members_select ON team_members
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM teams t
            WHERE t.id = team_id
              AND is_org_member(t.organization_id)
        )
    );

-- Super_admin can manage team membership
CREATE POLICY team_members_insert ON team_members
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM teams t
            WHERE t.id = team_id
              AND current_user_is_super_admin(t.organization_id)
        )
    );

CREATE POLICY team_members_delete ON team_members
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM teams t
            WHERE t.id = team_id
              AND current_user_is_super_admin(t.organization_id)
        )
    );

-- ============================================================================
-- FOLDERS TABLE POLICIES
-- ============================================================================

-- Users can see folders they have access to
CREATE POLICY folders_select ON folders
    FOR SELECT
    USING (
        can_view(get_current_user_id(), 'folder'::resource_type, id)
    );

-- Users with edit permission can create subfolders
-- New folders must have an owner_team_id (cannot create orphaned)
CREATE POLICY folders_insert ON folders
    FOR INSERT
    WITH CHECK (
        -- Must have owner team
        owner_team_id IS NOT NULL
        AND (
            -- Creating in root: must be member of org
            (parent_folder_id IS NULL AND is_org_member(organization_id))
            OR
            -- Creating in folder: must have edit access to parent
            (parent_folder_id IS NOT NULL AND can_edit(get_current_user_id(), 'folder'::resource_type, parent_folder_id))
        )
    );

-- Users with edit permission can rename, users with admin can modify other fields
CREATE POLICY folders_update ON folders
    FOR UPDATE
    USING (can_edit(get_current_user_id(), 'folder'::resource_type, id))
    WITH CHECK (can_edit(get_current_user_id(), 'folder'::resource_type, id));

-- Only admins can delete (soft delete)
CREATE POLICY folders_delete ON folders
    FOR DELETE
    USING (can_admin(get_current_user_id(), 'folder'::resource_type, id));

-- ============================================================================
-- FILES TABLE POLICIES
-- ============================================================================

-- Users can see files they have access to
CREATE POLICY files_select ON files
    FOR SELECT
    USING (
        can_view(get_current_user_id(), 'file'::resource_type, id)
    );

-- Users with edit permission on containing folder can create files
CREATE POLICY files_insert ON files
    FOR INSERT
    WITH CHECK (
        -- Must have owner team
        owner_team_id IS NOT NULL
        AND (
            -- Creating in root: must be member of org
            (folder_id IS NULL AND is_org_member(organization_id))
            OR
            -- Creating in folder: must have edit access to folder
            (folder_id IS NOT NULL AND can_edit(get_current_user_id(), 'folder'::resource_type, folder_id))
        )
    );

-- Users with edit permission can update files
CREATE POLICY files_update ON files
    FOR UPDATE
    USING (can_edit(get_current_user_id(), 'file'::resource_type, id))
    WITH CHECK (can_edit(get_current_user_id(), 'file'::resource_type, id));

-- Only admins can delete (soft delete)
CREATE POLICY files_delete ON files
    FOR DELETE
    USING (can_admin(get_current_user_id(), 'file'::resource_type, id));

-- ============================================================================
-- RESOURCE_PERMISSIONS TABLE POLICIES
-- ============================================================================

-- Users can see permissions on resources they have access to
CREATE POLICY resource_permissions_select ON resource_permissions
    FOR SELECT
    USING (
        CASE resource_type
            WHEN 'folder' THEN can_view(get_current_user_id(), 'folder'::resource_type, resource_id)
            WHEN 'file' THEN can_view(get_current_user_id(), 'file'::resource_type, resource_id)
        END
    );

-- Admins and editors can grant permissions (editors limited by application logic)
CREATE POLICY resource_permissions_insert ON resource_permissions
    FOR INSERT
    WITH CHECK (
        CASE resource_type
            WHEN 'folder' THEN can_edit(get_current_user_id(), 'folder'::resource_type, resource_id)
            WHEN 'file' THEN can_edit(get_current_user_id(), 'file'::resource_type, resource_id)
        END
    );

-- Only admins can modify permissions
CREATE POLICY resource_permissions_update ON resource_permissions
    FOR UPDATE
    USING (
        CASE resource_type
            WHEN 'folder' THEN can_admin(get_current_user_id(), 'folder'::resource_type, resource_id)
            WHEN 'file' THEN can_admin(get_current_user_id(), 'file'::resource_type, resource_id)
        END
    )
    WITH CHECK (
        CASE resource_type
            WHEN 'folder' THEN can_admin(get_current_user_id(), 'folder'::resource_type, resource_id)
            WHEN 'file' THEN can_admin(get_current_user_id(), 'file'::resource_type, resource_id)
        END
    );

-- Only admins can revoke permissions
CREATE POLICY resource_permissions_delete ON resource_permissions
    FOR DELETE
    USING (
        CASE resource_type
            WHEN 'folder' THEN can_admin(get_current_user_id(), 'folder'::resource_type, resource_id)
            WHEN 'file' THEN can_admin(get_current_user_id(), 'file'::resource_type, resource_id)
        END
    );

-- ============================================================================
-- PUBLIC_LINKS TABLE POLICIES
-- ============================================================================

-- Users can see public links on resources they have access to
CREATE POLICY public_links_select ON public_links
    FOR SELECT
    USING (
        CASE resource_type
            WHEN 'folder' THEN can_view(get_current_user_id(), 'folder'::resource_type, resource_id)
            WHEN 'file' THEN can_view(get_current_user_id(), 'file'::resource_type, resource_id)
        END
    );

-- Admins and editors can create public links
CREATE POLICY public_links_insert ON public_links
    FOR INSERT
    WITH CHECK (
        CASE resource_type
            WHEN 'folder' THEN can_edit(get_current_user_id(), 'folder'::resource_type, resource_id)
            WHEN 'file' THEN can_edit(get_current_user_id(), 'file'::resource_type, resource_id)
        END
    );

-- Only admins can disable public links
CREATE POLICY public_links_update ON public_links
    FOR UPDATE
    USING (
        CASE resource_type
            WHEN 'folder' THEN can_admin(get_current_user_id(), 'folder'::resource_type, resource_id)
            WHEN 'file' THEN can_admin(get_current_user_id(), 'file'::resource_type, resource_id)
        END
    )
    WITH CHECK (
        CASE resource_type
            WHEN 'folder' THEN can_admin(get_current_user_id(), 'folder'::resource_type, resource_id)
            WHEN 'file' THEN can_admin(get_current_user_id(), 'file'::resource_type, resource_id)
        END
    );

-- Deletion not allowed (use soft delete via disabled_at)

-- ============================================================================
-- REDACTIONS TABLE POLICIES
-- ============================================================================

-- All users with file access can see that redactions exist (for indicators)
-- But only admins can see the details (handled in application)
CREATE POLICY redactions_select ON redactions
    FOR SELECT
    USING (
        can_view(get_current_user_id(), 'file'::resource_type, file_id)
    );

-- Only admins can create redactions
CREATE POLICY redactions_insert ON redactions
    FOR INSERT
    WITH CHECK (
        can_admin(get_current_user_id(), 'file'::resource_type, file_id)
    );

-- Only admins can update redactions (e.g., remove via removed_at)
CREATE POLICY redactions_update ON redactions
    FOR UPDATE
    USING (can_admin(get_current_user_id(), 'file'::resource_type, file_id))
    WITH CHECK (can_admin(get_current_user_id(), 'file'::resource_type, file_id));

-- Deletion not allowed (use soft delete via removed_at)

-- ============================================================================
-- AUDIT_LOGS TABLE POLICIES
-- ============================================================================

-- Super_admin can see audit logs for their organization
CREATE POLICY audit_logs_select ON audit_logs
    FOR SELECT
    USING (current_user_is_super_admin(organization_id));

-- Insert handled by service role only (application creates audit entries)

-- ============================================================================
-- SERVICE ROLE BYPASS NOTES
-- ============================================================================

-- The service_role key bypasses RLS automatically
-- Use service_role for:
--   - User sync from Clerk webhooks
--   - Organization creation
--   - Audit log writes
--   - Background jobs
--   - Admin operations that need elevated access
--
-- Use anon/authenticated key with RLS for:
--   - All user-facing API routes
--   - Real-time subscriptions
--   - Client-side Supabase SDK calls

-- ============================================================================
-- GRANT EXECUTE ON HELPER FUNCTIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION get_current_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION is_org_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION current_user_is_super_admin(UUID) TO authenticated;

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

COMMENT ON POLICY users_select_own ON users IS 'Users can read their own profile';
COMMENT ON POLICY users_select_org_members ON users IS 'Users can see other members in their orgs';
COMMENT ON POLICY users_update_own ON users IS 'Users can update their own profile';

COMMENT ON POLICY organizations_select_member ON organizations IS 'Members can see their organizations';
COMMENT ON POLICY organizations_update_admin ON organizations IS 'Only super_admin can update organization';

COMMENT ON POLICY folders_select ON folders IS 'Users see folders they have permission to access';
COMMENT ON POLICY folders_insert ON folders IS 'Users with edit access to parent can create subfolders';
COMMENT ON POLICY folders_update ON folders IS 'Users with edit access can modify folder';
COMMENT ON POLICY folders_delete ON folders IS 'Only admins can delete folders';

COMMENT ON POLICY files_select ON files IS 'Users see files they have permission to access';
COMMENT ON POLICY files_insert ON files IS 'Users with edit access to folder can create files';
COMMENT ON POLICY files_update ON files IS 'Users with edit access can modify file';
COMMENT ON POLICY files_delete ON files IS 'Only admins can delete files';

COMMENT ON POLICY resource_permissions_select ON resource_permissions IS 'Users can see permissions on accessible resources';
COMMENT ON POLICY resource_permissions_insert ON resource_permissions IS 'Editors+ can grant permissions (editor limits enforced in app)';
COMMENT ON POLICY resource_permissions_update ON resource_permissions IS 'Only admins can modify permissions';
COMMENT ON POLICY resource_permissions_delete ON resource_permissions IS 'Only admins can revoke permissions';

COMMENT ON POLICY public_links_select ON public_links IS 'Users can see public links on accessible resources';
COMMENT ON POLICY public_links_insert ON public_links IS 'Editors+ can create public links';
COMMENT ON POLICY public_links_update ON public_links IS 'Only admins can disable public links';

COMMENT ON POLICY redactions_select ON redactions IS 'Users with file access can see redaction records exist';
COMMENT ON POLICY redactions_insert ON redactions IS 'Only admins can create redactions';
COMMENT ON POLICY redactions_update ON redactions IS 'Only admins can modify/remove redactions';

COMMENT ON POLICY audit_logs_select ON audit_logs IS 'Only super_admin can view audit logs';
