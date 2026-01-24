-- Migration: Permission Model Schema
-- Description: Implements the permission model defined in permissions.md
-- Dependencies: 001_create_users_table.sql

-- Enable pgcrypto extension for gen_random_bytes()
-- Explicitly create in public schema to ensure functions are accessible
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Organization-level roles
CREATE TYPE org_role AS ENUM ('super_admin', 'member');

-- Resource-level roles (admin > editor > viewer)
CREATE TYPE resource_role AS ENUM ('admin', 'editor', 'viewer');

-- Resource types for polymorphic permissions
CREATE TYPE resource_type AS ENUM ('folder', 'file');

-- Grantee types for permissions
CREATE TYPE grantee_type AS ENUM ('user', 'team');

-- ============================================================================
-- ORGANIZATIONS
-- ============================================================================

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER organizations_updated_at_trigger
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE organizations IS 'Top-level workspaces that contain all resources';

-- ============================================================================
-- ORGANIZATION MEMBERS
-- ============================================================================

CREATE TABLE organization_members (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role org_role NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_org_members_role ON organization_members(organization_id, role);

COMMENT ON TABLE organization_members IS 'Maps users to organizations with their org-level role';
COMMENT ON COLUMN organization_members.role IS 'super_admin has implicit admin on all resources';

-- ============================================================================
-- TEAMS
-- ============================================================================

CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, name)
);

CREATE INDEX idx_teams_org ON teams(organization_id);

CREATE TRIGGER teams_updated_at_trigger
    BEFORE UPDATE ON teams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE teams IS 'Flat groups of users within an organization';

-- ============================================================================
-- TEAM MEMBERS
-- ============================================================================

CREATE TABLE team_members (
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_id, user_id)
);

CREATE INDEX idx_team_members_user ON team_members(user_id);

COMMENT ON TABLE team_members IS 'Maps users to teams (many-to-many)';

-- ============================================================================
-- FOLDERS
-- ============================================================================

CREATE TABLE folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    owner_team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    parent_folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Prevent duplicate names in same parent (including root level)
    UNIQUE NULLS NOT DISTINCT (organization_id, parent_folder_id, name, deleted_at)
);

CREATE INDEX idx_folders_org ON folders(organization_id);
CREATE INDEX idx_folders_parent ON folders(parent_folder_id);
CREATE INDEX idx_folders_owner_team ON folders(owner_team_id);
CREATE INDEX idx_folders_deleted ON folders(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TRIGGER folders_updated_at_trigger
    BEFORE UPDATE ON folders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE folders IS 'Hierarchical folder structure, owned by teams';
COMMENT ON COLUMN folders.parent_folder_id IS 'NULL indicates root-level folder';
COMMENT ON COLUMN folders.deleted_at IS 'Soft delete timestamp, NULL if not deleted';

-- ============================================================================
-- FILES
-- ============================================================================

CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    owner_team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type TEXT,
    size_bytes BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Prevent duplicate names in same folder (including root level)
    UNIQUE NULLS NOT DISTINCT (organization_id, folder_id, name, deleted_at)
);

CREATE INDEX idx_files_org ON files(organization_id);
CREATE INDEX idx_files_folder ON files(folder_id);
CREATE INDEX idx_files_owner_team ON files(owner_team_id);
CREATE INDEX idx_files_deleted ON files(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TRIGGER files_updated_at_trigger
    BEFORE UPDATE ON files
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE files IS 'File metadata, owned by teams. Actual content in Supabase Storage';
COMMENT ON COLUMN files.folder_id IS 'NULL indicates root-level file';
COMMENT ON COLUMN files.storage_path IS 'Path to file in Supabase Storage bucket';
COMMENT ON COLUMN files.deleted_at IS 'Soft delete timestamp, NULL if not deleted';

-- ============================================================================
-- RESOURCE PERMISSIONS
-- ============================================================================

CREATE TABLE resource_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type resource_type NOT NULL,
    resource_id UUID NOT NULL,
    grantee_type grantee_type NOT NULL,
    grantee_id UUID NOT NULL,
    role resource_role NOT NULL,
    granted_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Each grantee can only have one permission per resource
    UNIQUE (resource_type, resource_id, grantee_type, grantee_id)
);

CREATE INDEX idx_permissions_resource ON resource_permissions(resource_type, resource_id);
CREATE INDEX idx_permissions_grantee ON resource_permissions(grantee_type, grantee_id);
CREATE INDEX idx_permissions_folder ON resource_permissions(resource_id)
    WHERE resource_type = 'folder';
CREATE INDEX idx_permissions_file ON resource_permissions(resource_id)
    WHERE resource_type = 'file';

COMMENT ON TABLE resource_permissions IS 'Explicit permissions on folders and files';
COMMENT ON COLUMN resource_permissions.resource_type IS 'Type of resource (folder or file)';
COMMENT ON COLUMN resource_permissions.grantee_type IS 'Whether permission is for a user or team';

-- ============================================================================
-- PUBLIC LINKS
-- ============================================================================

-- Helper function to generate secure random token
-- Uses multiple UUIDs to create a 64-character hex token (equivalent to 32 bytes)
-- This avoids dependency on pgcrypto extension location
CREATE OR REPLACE FUNCTION generate_public_link_token()
RETURNS TEXT AS $$
BEGIN
    -- Generate 64-character hex string from 2 UUIDs (removing hyphens)
    RETURN replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
END;
$$ LANGUAGE plpgsql;

CREATE TABLE public_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT NOT NULL UNIQUE DEFAULT generate_public_link_token(),
    resource_type resource_type NOT NULL,
    resource_id UUID NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disabled_at TIMESTAMPTZ,
    disabled_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Only one active link per resource
    UNIQUE NULLS NOT DISTINCT (resource_type, resource_id, disabled_at)
);

CREATE INDEX idx_public_links_token ON public_links(token) WHERE disabled_at IS NULL;
CREATE INDEX idx_public_links_resource ON public_links(resource_type, resource_id);

COMMENT ON TABLE public_links IS 'Shareable view-only links for resources';
COMMENT ON COLUMN public_links.token IS 'URL-safe token for public access';
COMMENT ON COLUMN public_links.disabled_at IS 'When set, link is no longer valid';

-- ============================================================================
-- REDACTIONS
-- ============================================================================

CREATE TABLE redactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    start_offset INTEGER NOT NULL,
    end_offset INTEGER NOT NULL,
    reason TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    removed_at TIMESTAMPTZ,
    removed_by UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT valid_offset_range CHECK (start_offset >= 0 AND end_offset > start_offset)
);

CREATE INDEX idx_redactions_file ON redactions(file_id) WHERE removed_at IS NULL;

COMMENT ON TABLE redactions IS 'Section-level redactions within files, hidden from AI';
COMMENT ON COLUMN redactions.start_offset IS 'Character offset where redaction starts';
COMMENT ON COLUMN redactions.end_offset IS 'Character offset where redaction ends (exclusive)';
COMMENT ON COLUMN redactions.reason IS 'Admin-only note explaining why content was redacted';
COMMENT ON COLUMN redactions.removed_at IS 'When set, redaction is no longer active';

-- ============================================================================
-- AUDIT LOGS
-- ============================================================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type resource_type,
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_org_time ON audit_logs(organization_id, created_at DESC);
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_logs(action);

COMMENT ON TABLE audit_logs IS 'Immutable log of sensitive actions for compliance';
COMMENT ON COLUMN audit_logs.action IS 'Action identifier (e.g., permission.grant, file.delete)';
COMMENT ON COLUMN audit_logs.details IS 'Additional context about the action';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to check if a user is a super_admin in an organization
CREATE OR REPLACE FUNCTION is_super_admin(p_user_id UUID, p_org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM organization_members
        WHERE user_id = p_user_id
          AND organization_id = p_org_id
          AND role = 'super_admin'
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get all team IDs a user belongs to (within an organization)
CREATE OR REPLACE FUNCTION get_user_team_ids(p_user_id UUID, p_org_id UUID)
RETURNS UUID[] AS $$
BEGIN
    RETURN ARRAY(
        SELECT t.id FROM teams t
        JOIN team_members tm ON tm.team_id = t.id
        WHERE tm.user_id = p_user_id
          AND t.organization_id = p_org_id
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get all ancestor folder IDs for inheritance
CREATE OR REPLACE FUNCTION get_folder_ancestors(p_folder_id UUID)
RETURNS UUID[] AS $$
DECLARE
    ancestors UUID[] := ARRAY[]::UUID[];
    current_id UUID := p_folder_id;
    parent_id UUID;
BEGIN
    LOOP
        SELECT f.parent_folder_id INTO parent_id
        FROM folders f
        WHERE f.id = current_id;

        EXIT WHEN parent_id IS NULL;

        ancestors := ancestors || parent_id;
        current_id := parent_id;
    END LOOP;

    RETURN ancestors;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- PERMISSION CHECK FUNCTION
-- ============================================================================

-- Returns the effective role for a user on a resource (NULL if no access)
-- Implements the precedence rules from permissions.md
CREATE OR REPLACE FUNCTION get_effective_role(
    p_user_id UUID,
    p_resource_type resource_type,
    p_resource_id UUID
)
RETURNS resource_role AS $$
DECLARE
    v_org_id UUID;
    v_owner_team_id UUID;
    v_folder_id UUID;
    v_team_ids UUID[];
    v_ancestors UUID[];
    v_role resource_role;
    v_best_role resource_role := NULL;
BEGIN
    -- Get organization ID and owner team based on resource type
    IF p_resource_type = 'folder' THEN
        SELECT organization_id, owner_team_id, parent_folder_id
        INTO v_org_id, v_owner_team_id, v_folder_id
        FROM folders
        WHERE id = p_resource_id AND deleted_at IS NULL;
    ELSE
        SELECT organization_id, owner_team_id, folder_id
        INTO v_org_id, v_owner_team_id, v_folder_id
        FROM files
        WHERE id = p_resource_id AND deleted_at IS NULL;
    END IF;

    -- Resource not found
    IF v_org_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Rule 4: Super-admin override
    IF is_super_admin(p_user_id, v_org_id) THEN
        RETURN 'admin';
    END IF;

    -- Get user's teams
    v_team_ids := get_user_team_ids(p_user_id, v_org_id);

    -- Ownership check: owner team has implicit admin
    IF v_owner_team_id = ANY(v_team_ids) THEN
        RETURN 'admin';
    END IF;

    -- Rule 2: Check explicit permission on resource (user-level first)
    SELECT role INTO v_role
    FROM resource_permissions
    WHERE resource_type = p_resource_type
      AND resource_id = p_resource_id
      AND grantee_type = 'user'
      AND grantee_id = p_user_id;

    IF v_role IS NOT NULL THEN
        v_best_role := v_role;
    END IF;

    -- Rule 3: Check team-level explicit permission
    SELECT role INTO v_role
    FROM resource_permissions
    WHERE resource_type = p_resource_type
      AND resource_id = p_resource_id
      AND grantee_type = 'team'
      AND grantee_id = ANY(v_team_ids)
    ORDER BY
        CASE role
            WHEN 'admin' THEN 1
            WHEN 'editor' THEN 2
            WHEN 'viewer' THEN 3
        END
    LIMIT 1;

    -- Rule 1: Highest permission wins
    IF v_role IS NOT NULL THEN
        IF v_best_role IS NULL OR
           (v_role = 'admin') OR
           (v_role = 'editor' AND v_best_role = 'viewer') THEN
            v_best_role := v_role;
        END IF;
    END IF;

    -- If we have explicit permission on the resource, return it
    IF v_best_role IS NOT NULL THEN
        RETURN v_best_role;
    END IF;

    -- Check inherited permissions from folder hierarchy
    IF p_resource_type = 'file' AND v_folder_id IS NOT NULL THEN
        -- For files, start with the containing folder
        v_ancestors := ARRAY[v_folder_id] || get_folder_ancestors(v_folder_id);
    ELSIF p_resource_type = 'folder' THEN
        -- For folders, get ancestors
        v_ancestors := get_folder_ancestors(p_resource_id);
    ELSE
        v_ancestors := ARRAY[]::UUID[];
    END IF;

    -- Check permissions on each ancestor (closest first)
    FOR i IN 1..array_length(v_ancestors, 1) LOOP
        -- Check user-level permission on ancestor
        SELECT role INTO v_role
        FROM resource_permissions
        WHERE resource_type = 'folder'
          AND resource_id = v_ancestors[i]
          AND grantee_type = 'user'
          AND grantee_id = p_user_id;

        IF v_role IS NOT NULL THEN
            IF v_best_role IS NULL OR
               (v_role = 'admin') OR
               (v_role = 'editor' AND v_best_role = 'viewer') THEN
                v_best_role := v_role;
            END IF;
        END IF;

        -- Check team-level permission on ancestor
        SELECT role INTO v_role
        FROM resource_permissions
        WHERE resource_type = 'folder'
          AND resource_id = v_ancestors[i]
          AND grantee_type = 'team'
          AND grantee_id = ANY(v_team_ids)
        ORDER BY
            CASE role
                WHEN 'admin' THEN 1
                WHEN 'editor' THEN 2
                WHEN 'viewer' THEN 3
            END
        LIMIT 1;

        IF v_role IS NOT NULL THEN
            IF v_best_role IS NULL OR
               (v_role = 'admin') OR
               (v_role = 'editor' AND v_best_role = 'viewer') THEN
                v_best_role := v_role;
            END IF;
        END IF;
    END LOOP;

    -- Check if owner team of any ancestor folder
    FOR i IN 1..COALESCE(array_length(v_ancestors, 1), 0) LOOP
        SELECT owner_team_id INTO v_owner_team_id
        FROM folders
        WHERE id = v_ancestors[i];

        IF v_owner_team_id = ANY(v_team_ids) THEN
            RETURN 'admin';
        END IF;
    END LOOP;

    RETURN v_best_role;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- CONVENIENCE PERMISSION CHECK FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION can_view(p_user_id UUID, p_resource_type resource_type, p_resource_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN get_effective_role(p_user_id, p_resource_type, p_resource_id) IS NOT NULL;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION can_edit(p_user_id UUID, p_resource_type resource_type, p_resource_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_role resource_role;
BEGIN
    v_role := get_effective_role(p_user_id, p_resource_type, p_resource_id);
    RETURN v_role IN ('admin', 'editor');
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION can_admin(p_user_id UUID, p_resource_type resource_type, p_resource_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN get_effective_role(p_user_id, p_resource_type, p_resource_id) = 'admin';
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- COMMENTS SUMMARY
-- ============================================================================

COMMENT ON FUNCTION is_super_admin IS 'Check if user has super_admin role in organization';
COMMENT ON FUNCTION get_user_team_ids IS 'Get all team IDs user belongs to in an organization';
COMMENT ON FUNCTION get_folder_ancestors IS 'Get all ancestor folder IDs for permission inheritance';
COMMENT ON FUNCTION get_effective_role IS 'Calculate effective role using precedence rules from permissions.md';
COMMENT ON FUNCTION can_view IS 'Check if user has at least viewer access';
COMMENT ON FUNCTION can_edit IS 'Check if user has at least editor access';
COMMENT ON FUNCTION can_admin IS 'Check if user has admin access';
