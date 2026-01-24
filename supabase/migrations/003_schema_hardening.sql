-- Migration: Schema Hardening
-- Description: Fixes ambiguities, adds explicit inheritance control, deny permissions,
--              and orphan resource handling per updated requirements
-- Dependencies: 002_permission_model.sql

-- ============================================================================
-- NEW ENUMS
-- ============================================================================

-- Permission type: grant (allow) or deny (block)
-- Use DO block to conditionally create since PostgreSQL doesn't support IF NOT EXISTS for types
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'permission_type') THEN
        CREATE TYPE permission_type AS ENUM ('grant', 'deny');
    END IF;
END $$;

-- ============================================================================
-- MODIFY FOLDERS TABLE
-- ============================================================================

-- Add inheritance control flag
ALTER TABLE folders
ADD COLUMN IF NOT EXISTS inherit_permissions BOOLEAN NOT NULL DEFAULT true;

-- Add creator tracking (separate from team ownership)
ALTER TABLE folders
ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Change owner_team_id to allow NULL (for orphaned resources)
-- Only if it's currently NOT NULL
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'folders'
          AND column_name = 'owner_team_id'
          AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE folders ALTER COLUMN owner_team_id DROP NOT NULL;
    END IF;
END $$;

-- Drop and recreate the foreign key with ON DELETE SET NULL
ALTER TABLE folders
DROP CONSTRAINT IF EXISTS folders_owner_team_id_fkey;

ALTER TABLE folders
ADD CONSTRAINT folders_owner_team_id_fkey
FOREIGN KEY (owner_team_id) REFERENCES teams(id) ON DELETE SET NULL;

-- Add comment explaining orphaned state
COMMENT ON COLUMN folders.owner_team_id IS 'Owning team. NULL means orphaned (only super_admin can access/reassign)';
COMMENT ON COLUMN folders.inherit_permissions IS 'When false, this folder does not inherit permissions from parent';
COMMENT ON COLUMN folders.created_by_user_id IS 'User who created this folder (for audit, not ownership)';

-- ============================================================================
-- MODIFY FILES TABLE
-- ============================================================================

-- Add inheritance control flag
ALTER TABLE files
ADD COLUMN IF NOT EXISTS inherit_permissions BOOLEAN NOT NULL DEFAULT true;

-- Add creator tracking
ALTER TABLE files
ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Change owner_team_id to allow NULL
-- Only if it's currently NOT NULL
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'files'
          AND column_name = 'owner_team_id'
          AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE files ALTER COLUMN owner_team_id DROP NOT NULL;
    END IF;
END $$;

-- Drop and recreate foreign key with ON DELETE SET NULL
ALTER TABLE files
DROP CONSTRAINT IF EXISTS files_owner_team_id_fkey;

ALTER TABLE files
ADD CONSTRAINT files_owner_team_id_fkey
FOREIGN KEY (owner_team_id) REFERENCES teams(id) ON DELETE SET NULL;

COMMENT ON COLUMN files.owner_team_id IS 'Owning team. NULL means orphaned (only super_admin can access/reassign)';
COMMENT ON COLUMN files.inherit_permissions IS 'When false, this file does not inherit permissions from parent folder';
COMMENT ON COLUMN files.created_by_user_id IS 'User who created this file (for audit, not ownership)';

-- ============================================================================
-- MODIFY RESOURCE_PERMISSIONS TABLE
-- ============================================================================

-- Add permission type (grant or deny)
ALTER TABLE resource_permissions
ADD COLUMN IF NOT EXISTS permission_type permission_type NOT NULL DEFAULT 'grant';

-- Add unique constraint if not exists (resource + grantee can only have one permission entry)
-- Drop existing if any, then create
DROP INDEX IF EXISTS idx_permissions_unique;
ALTER TABLE resource_permissions
DROP CONSTRAINT IF EXISTS resource_permissions_unique_grant;

ALTER TABLE resource_permissions
ADD CONSTRAINT resource_permissions_unique_grant
UNIQUE (resource_type, resource_id, grantee_type, grantee_id);

COMMENT ON COLUMN resource_permissions.permission_type IS 'grant = allow access, deny = explicitly block (overrides inherited grants)';

-- ============================================================================
-- ADD MISSING INDEXES
-- ============================================================================

-- Folders: optimize tree traversal and listing
CREATE INDEX IF NOT EXISTS idx_folders_parent_active
ON folders(parent_folder_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_folders_org_parent
ON folders(organization_id, parent_folder_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_folders_orphaned
ON folders(organization_id)
WHERE owner_team_id IS NULL AND deleted_at IS NULL;

-- Files: optimize folder listing
CREATE INDEX IF NOT EXISTS idx_files_folder_active
ON files(folder_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_files_org_folder
ON files(organization_id, folder_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_files_orphaned
ON files(organization_id)
WHERE owner_team_id IS NULL AND deleted_at IS NULL;

-- Permissions: optimize lookups
CREATE INDEX IF NOT EXISTS idx_permissions_resource_type
ON resource_permissions(resource_type, resource_id, permission_type);

CREATE INDEX IF NOT EXISTS idx_permissions_grantee_lookup
ON resource_permissions(grantee_type, grantee_id, resource_type);

-- Public links: ensure fast token lookup
CREATE INDEX IF NOT EXISTS idx_public_links_active_token
ON public_links(token)
WHERE disabled_at IS NULL;

-- Redactions: active redactions per file
CREATE INDEX IF NOT EXISTS idx_redactions_file_active
ON redactions(file_id)
WHERE removed_at IS NULL;

-- Audit logs: time-based queries
CREATE INDEX IF NOT EXISTS idx_audit_created_at
ON audit_logs(created_at DESC);

-- Team members: find all teams for a user
CREATE INDEX IF NOT EXISTS idx_team_members_user_teams
ON team_members(user_id, team_id);

-- ============================================================================
-- ADD MISSING CONSTRAINTS
-- ============================================================================

-- Ensure redaction offsets are valid
ALTER TABLE redactions
DROP CONSTRAINT IF EXISTS valid_offset_range;

ALTER TABLE redactions
ADD CONSTRAINT valid_offset_range
CHECK (start_offset >= 0 AND end_offset > start_offset);

-- Ensure file size is non-negative
ALTER TABLE files
DROP CONSTRAINT IF EXISTS valid_file_size;

ALTER TABLE files
ADD CONSTRAINT valid_file_size
CHECK (size_bytes IS NULL OR size_bytes >= 0);

-- Ensure public link token is not empty
ALTER TABLE public_links
DROP CONSTRAINT IF EXISTS valid_token;

ALTER TABLE public_links
ADD CONSTRAINT valid_token
CHECK (length(token) > 0);

-- ============================================================================
-- UPDATE HELPER FUNCTIONS
-- ============================================================================

-- Function: Check if user is super_admin (unchanged, but clarify purpose)
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

COMMENT ON FUNCTION is_super_admin IS 'Check if user has super_admin org role. NOTE: This does NOT grant resource access, only org-level management rights.';

-- Function: Check if resource is orphaned
CREATE OR REPLACE FUNCTION is_resource_orphaned(
    p_resource_type resource_type,
    p_resource_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    IF p_resource_type = 'folder' THEN
        RETURN EXISTS (
            SELECT 1 FROM folders
            WHERE id = p_resource_id
              AND owner_team_id IS NULL
              AND deleted_at IS NULL
        );
    ELSE
        RETURN EXISTS (
            SELECT 1 FROM files
            WHERE id = p_resource_id
              AND owner_team_id IS NULL
              AND deleted_at IS NULL
        );
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION is_resource_orphaned IS 'Check if a resource has no owning team (orphaned state)';

-- Function: Check if user has explicit deny permission
CREATE OR REPLACE FUNCTION has_deny_permission(
    p_user_id UUID,
    p_team_ids UUID[],
    p_resource_type resource_type,
    p_resource_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM resource_permissions
        WHERE resource_type = p_resource_type
          AND resource_id = p_resource_id
          AND permission_type = 'deny'
          AND (
              (grantee_type = 'user' AND grantee_id = p_user_id)
              OR
              (grantee_type = 'team' AND grantee_id = ANY(p_team_ids))
          )
    );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION has_deny_permission IS 'Check if user or their teams have an explicit deny on a resource';

-- Function: Get best grant permission for user on a specific resource (not inherited)
CREATE OR REPLACE FUNCTION get_direct_grant_role(
    p_user_id UUID,
    p_team_ids UUID[],
    p_resource_type resource_type,
    p_resource_id UUID
)
RETURNS resource_role AS $$
DECLARE
    v_role resource_role := NULL;
    v_user_role resource_role;
    v_team_role resource_role;
BEGIN
    -- Check user-level grant
    SELECT role INTO v_user_role
    FROM resource_permissions
    WHERE resource_type = p_resource_type
      AND resource_id = p_resource_id
      AND grantee_type = 'user'
      AND grantee_id = p_user_id
      AND permission_type = 'grant';

    -- Check team-level grant (highest)
    SELECT role INTO v_team_role
    FROM resource_permissions
    WHERE resource_type = p_resource_type
      AND resource_id = p_resource_id
      AND grantee_type = 'team'
      AND grantee_id = ANY(p_team_ids)
      AND permission_type = 'grant'
    ORDER BY
        CASE role
            WHEN 'admin' THEN 1
            WHEN 'editor' THEN 2
            WHEN 'viewer' THEN 3
        END
    LIMIT 1;

    -- Return highest of user or team role
    IF v_user_role IS NOT NULL AND v_team_role IS NOT NULL THEN
        IF v_user_role = 'admin' OR v_team_role = 'admin' THEN
            RETURN 'admin';
        ELSIF v_user_role = 'editor' OR v_team_role = 'editor' THEN
            RETURN 'editor';
        ELSE
            RETURN 'viewer';
        END IF;
    ELSIF v_user_role IS NOT NULL THEN
        RETURN v_user_role;
    ELSE
        RETURN v_team_role;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Check if resource inherits permissions
CREATE OR REPLACE FUNCTION resource_inherits_permissions(
    p_resource_type resource_type,
    p_resource_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    IF p_resource_type = 'folder' THEN
        RETURN (SELECT inherit_permissions FROM folders WHERE id = p_resource_id);
    ELSE
        RETURN (SELECT inherit_permissions FROM files WHERE id = p_resource_id);
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- UPDATED PERMISSION RESOLUTION FUNCTION
-- ============================================================================

-- Drop old function and recreate with new logic
DROP FUNCTION IF EXISTS get_effective_role(UUID, resource_type, UUID);

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
    v_parent_folder_id UUID;
    v_team_ids UUID[];
    v_role resource_role := NULL;
    v_inherit BOOLEAN;
    v_current_folder_id UUID;
BEGIN
    -- =========================================
    -- STEP 1: Get resource metadata
    -- =========================================
    IF p_resource_type = 'folder' THEN
        SELECT organization_id, owner_team_id, parent_folder_id, inherit_permissions
        INTO v_org_id, v_owner_team_id, v_parent_folder_id, v_inherit
        FROM folders
        WHERE id = p_resource_id AND deleted_at IS NULL;

        v_folder_id := v_parent_folder_id; -- For inheritance, start from parent
    ELSE
        SELECT f.organization_id, f.owner_team_id, f.folder_id, f.inherit_permissions
        INTO v_org_id, v_owner_team_id, v_folder_id, v_inherit
        FROM files f
        WHERE f.id = p_resource_id AND f.deleted_at IS NULL;
    END IF;

    -- Resource not found or deleted
    IF v_org_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- =========================================
    -- STEP 2: Handle orphaned resources
    -- Only super_admin can access orphaned resources
    -- =========================================
    IF v_owner_team_id IS NULL THEN
        IF is_super_admin(p_user_id, v_org_id) THEN
            RETURN 'admin';
        ELSE
            RETURN NULL; -- No access to orphaned resources
        END IF;
    END IF;

    -- =========================================
    -- STEP 3: Get user's teams in this org
    -- =========================================
    v_team_ids := get_user_team_ids(p_user_id, v_org_id);

    -- =========================================
    -- STEP 4: Check for explicit DENY on resource
    -- Deny always wins, blocks all access
    -- =========================================
    IF has_deny_permission(p_user_id, v_team_ids, p_resource_type, p_resource_id) THEN
        RETURN NULL;
    END IF;

    -- =========================================
    -- STEP 5: Check ownership (team ownership grants admin)
    -- =========================================
    IF v_owner_team_id = ANY(v_team_ids) THEN
        RETURN 'admin';
    END IF;

    -- =========================================
    -- STEP 6: Check direct grant on resource
    -- =========================================
    v_role := get_direct_grant_role(p_user_id, v_team_ids, p_resource_type, p_resource_id);

    IF v_role IS NOT NULL THEN
        RETURN v_role;
    END IF;

    -- =========================================
    -- STEP 7: Check inherited permissions (if enabled)
    -- Walk up the folder tree
    -- =========================================
    IF NOT v_inherit THEN
        -- Inheritance disabled, no further access
        RETURN NULL;
    END IF;

    v_current_folder_id := v_folder_id;

    WHILE v_current_folder_id IS NOT NULL LOOP
        -- Check for deny on ancestor
        IF has_deny_permission(p_user_id, v_team_ids, 'folder', v_current_folder_id) THEN
            RETURN NULL;
        END IF;

        -- Check for ownership of ancestor folder
        SELECT owner_team_id INTO v_owner_team_id
        FROM folders
        WHERE id = v_current_folder_id AND deleted_at IS NULL;

        IF v_owner_team_id = ANY(v_team_ids) THEN
            RETURN 'admin';
        END IF;

        -- Check for grant on ancestor
        v_role := get_direct_grant_role(p_user_id, v_team_ids, 'folder', v_current_folder_id);

        IF v_role IS NOT NULL THEN
            RETURN v_role;
        END IF;

        -- Check if this folder allows inheritance to continue
        SELECT parent_folder_id, inherit_permissions
        INTO v_current_folder_id, v_inherit
        FROM folders
        WHERE id = v_current_folder_id;

        -- Stop if inheritance is broken at this level
        IF NOT v_inherit THEN
            EXIT;
        END IF;
    END LOOP;

    -- =========================================
    -- STEP 8: No permission found
    -- =========================================
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_effective_role IS 'Calculate effective role for user on resource. Respects deny permissions, inheritance flags, and team ownership. Super-admin does NOT get implicit access (only for orphaned resources).';

-- ============================================================================
-- CONVENIENCE PERMISSION CHECK FUNCTIONS (updated)
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
-- SUPER-ADMIN MANAGEMENT FUNCTIONS
-- ============================================================================

-- Function: Get all orphaned resources in an organization (for super-admin UI)
CREATE OR REPLACE FUNCTION get_orphaned_folders(p_org_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    parent_folder_id UUID,
    created_at TIMESTAMPTZ,
    created_by_user_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT f.id, f.name, f.parent_folder_id, f.created_at, f.created_by_user_id
    FROM folders f
    WHERE f.organization_id = p_org_id
      AND f.owner_team_id IS NULL
      AND f.deleted_at IS NULL
    ORDER BY f.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION get_orphaned_files(p_org_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    folder_id UUID,
    created_at TIMESTAMPTZ,
    created_by_user_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT f.id, f.name, f.folder_id, f.created_at, f.created_by_user_id
    FROM files f
    WHERE f.organization_id = p_org_id
      AND f.owner_team_id IS NULL
      AND f.deleted_at IS NULL
    ORDER BY f.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Reassign orphaned resource to a new team (super-admin only)
CREATE OR REPLACE FUNCTION reassign_resource_owner(
    p_user_id UUID,
    p_resource_type resource_type,
    p_resource_id UUID,
    p_new_team_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_org_id UUID;
    v_team_org_id UUID;
BEGIN
    -- Get resource's org
    IF p_resource_type = 'folder' THEN
        SELECT organization_id INTO v_org_id
        FROM folders WHERE id = p_resource_id AND deleted_at IS NULL;
    ELSE
        SELECT organization_id INTO v_org_id
        FROM files WHERE id = p_resource_id AND deleted_at IS NULL;
    END IF;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Resource not found';
    END IF;

    -- Verify user is super_admin
    IF NOT is_super_admin(p_user_id, v_org_id) THEN
        RAISE EXCEPTION 'Only super_admin can reassign resource ownership';
    END IF;

    -- Verify new team belongs to same org
    SELECT organization_id INTO v_team_org_id
    FROM teams WHERE id = p_new_team_id;

    IF v_team_org_id IS NULL OR v_team_org_id != v_org_id THEN
        RAISE EXCEPTION 'Team must belong to the same organization';
    END IF;

    -- Perform reassignment
    IF p_resource_type = 'folder' THEN
        UPDATE folders SET owner_team_id = p_new_team_id, updated_at = NOW()
        WHERE id = p_resource_id;
    ELSE
        UPDATE files SET owner_team_id = p_new_team_id, updated_at = NOW()
        WHERE id = p_resource_id;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reassign_resource_owner IS 'Super-admin only: Reassign an orphaned or any resource to a different team';

-- ============================================================================
-- PUBLIC LINK ACCESS FUNCTION
-- ============================================================================

-- Function: Check if a public link grants access (view-only, no AI)
-- This enforces that public links are ALWAYS view-only
CREATE OR REPLACE FUNCTION get_public_link_access(
    p_token TEXT,
    p_resource_type resource_type,
    p_resource_id UUID
)
RETURNS TABLE (
    has_access BOOLEAN,
    access_role resource_role,
    allows_ai BOOLEAN
) AS $$
DECLARE
    v_link_resource_type resource_type;
    v_link_resource_id UUID;
    v_is_folder_link BOOLEAN;
BEGIN
    -- Find active link by token
    SELECT pl.resource_type, pl.resource_id
    INTO v_link_resource_type, v_link_resource_id
    FROM public_links pl
    WHERE pl.token = p_token
      AND pl.disabled_at IS NULL;

    IF v_link_resource_id IS NULL THEN
        -- Link not found or disabled
        RETURN QUERY SELECT FALSE, NULL::resource_role, FALSE;
        RETURN;
    END IF;

    -- Check if link directly matches the requested resource
    IF v_link_resource_type = p_resource_type AND v_link_resource_id = p_resource_id THEN
        RETURN QUERY SELECT TRUE, 'viewer'::resource_role, FALSE;
        RETURN;
    END IF;

    -- If link is for a folder, check if requested resource is inside that folder
    IF v_link_resource_type = 'folder' THEN
        IF p_resource_type = 'file' THEN
            -- Check if file is in the linked folder or a subfolder
            IF EXISTS (
                WITH RECURSIVE folder_tree AS (
                    SELECT id FROM folders WHERE id = v_link_resource_id AND deleted_at IS NULL
                    UNION ALL
                    SELECT f.id FROM folders f
                    JOIN folder_tree ft ON f.parent_folder_id = ft.id
                    WHERE f.deleted_at IS NULL
                )
                SELECT 1 FROM files
                WHERE id = p_resource_id
                  AND folder_id IN (SELECT id FROM folder_tree)
                  AND deleted_at IS NULL
            ) THEN
                RETURN QUERY SELECT TRUE, 'viewer'::resource_role, FALSE;
                RETURN;
            END IF;
        ELSIF p_resource_type = 'folder' THEN
            -- Check if folder is a subfolder of the linked folder
            IF EXISTS (
                WITH RECURSIVE folder_tree AS (
                    SELECT id FROM folders WHERE id = v_link_resource_id AND deleted_at IS NULL
                    UNION ALL
                    SELECT f.id FROM folders f
                    JOIN folder_tree ft ON f.parent_folder_id = ft.id
                    WHERE f.deleted_at IS NULL
                )
                SELECT 1 FROM folder_tree WHERE id = p_resource_id
            ) THEN
                RETURN QUERY SELECT TRUE, 'viewer'::resource_role, FALSE;
                RETURN;
            END IF;
        END IF;
    END IF;

    -- No access
    RETURN QUERY SELECT FALSE, NULL::resource_role, FALSE;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_public_link_access IS 'Check public link access. ALWAYS returns viewer role and allows_ai=FALSE. Links to folders grant access to all contents.';

-- ============================================================================
-- DOCUMENTATION COMMENTS
-- ============================================================================

COMMENT ON TABLE resource_permissions IS 'Explicit permissions (grant or deny) on folders and files. Deny permissions override inherited grants.';
COMMENT ON TABLE public_links IS 'Shareable links. Access is ALWAYS view-only with no AI features (enforced by get_public_link_access function).';
COMMENT ON TABLE folders IS 'Hierarchical folders. owner_team_id=NULL means orphaned (super_admin access only). inherit_permissions=false breaks inheritance chain.';
COMMENT ON TABLE files IS 'File metadata. owner_team_id=NULL means orphaned. inherit_permissions=false ignores parent folder permissions.';
