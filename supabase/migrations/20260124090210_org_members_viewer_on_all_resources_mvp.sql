-- MVP: Org members get viewer on all non-orphaned org resources.
-- Fixes invited users seeing only their own folders; they can now see all org content.

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
    -- STEP 1: Get resource metadata
    IF p_resource_type = 'folder' THEN
        SELECT organization_id, owner_team_id, parent_folder_id, inherit_permissions
        INTO v_org_id, v_owner_team_id, v_parent_folder_id, v_inherit
        FROM folders
        WHERE id = p_resource_id AND deleted_at IS NULL;
        v_folder_id := v_parent_folder_id;
    ELSE
        SELECT f.organization_id, f.owner_team_id, f.folder_id, f.inherit_permissions
        INTO v_org_id, v_owner_team_id, v_folder_id, v_inherit
        FROM files f
        WHERE f.id = p_resource_id AND f.deleted_at IS NULL;
    END IF;

    IF v_org_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- STEP 2: Orphaned resources — super_admin only
    IF v_owner_team_id IS NULL THEN
        IF is_super_admin(p_user_id, v_org_id) THEN
            RETURN 'admin';
        ELSE
            RETURN NULL;
        END IF;
    END IF;

    v_team_ids := get_user_team_ids(p_user_id, v_org_id);

    -- STEP 3: Explicit DENY wins
    IF has_deny_permission(p_user_id, v_team_ids, p_resource_type, p_resource_id) THEN
        RETURN NULL;
    END IF;

    -- STEP 4: Team ownership -> admin
    IF v_owner_team_id = ANY(v_team_ids) THEN
        RETURN 'admin';
    END IF;

    -- STEP 5: Direct grant
    v_role := get_direct_grant_role(p_user_id, v_team_ids, p_resource_type, p_resource_id);
    IF v_role IS NOT NULL THEN
        RETURN v_role;
    END IF;

    -- STEP 6: Inheritance walk
    IF NOT v_inherit THEN
        -- MVP fallback: org members get viewer (below)
        NULL;
    ELSE
        v_current_folder_id := v_folder_id;
        WHILE v_current_folder_id IS NOT NULL LOOP
            IF has_deny_permission(p_user_id, v_team_ids, 'folder', v_current_folder_id) THEN
                RETURN NULL;
            END IF;
            SELECT owner_team_id INTO v_owner_team_id
            FROM folders
            WHERE id = v_current_folder_id AND deleted_at IS NULL;
            IF v_owner_team_id = ANY(v_team_ids) THEN
                RETURN 'admin';
            END IF;
            v_role := get_direct_grant_role(p_user_id, v_team_ids, 'folder', v_current_folder_id);
            IF v_role IS NOT NULL THEN
                RETURN v_role;
            END IF;
            SELECT parent_folder_id, inherit_permissions
            INTO v_current_folder_id, v_inherit
            FROM folders
            WHERE id = v_current_folder_id;
            IF NOT v_inherit THEN
                EXIT;
            END IF;
        END LOOP;
    END IF;

    -- STEP 7 (MVP): Org members get viewer on all org resources
    -- Invited users see org folders/files even without team membership
    IF EXISTS (
        SELECT 1 FROM organization_members
        WHERE user_id = p_user_id AND organization_id = v_org_id
    ) THEN
        RETURN 'viewer';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_effective_role IS 'Effective role on resource. Respects deny, ownership, grants, inheritance. MVP: org members get viewer on all org resources.';
