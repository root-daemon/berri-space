-- Fix: Files with owner_team_id=null should still inherit from parent folder
-- The orphaned resource check should only apply if there's no inheritance possible

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
        -- For files, get the folder_id (parent folder) to start inheritance walk
        SELECT f.organization_id, f.owner_team_id, f.folder_id, f.inherit_permissions
        INTO v_org_id, v_owner_team_id, v_folder_id, v_inherit
        FROM files f
        WHERE f.id = p_resource_id AND f.deleted_at IS NULL;
    END IF;

    IF v_org_id IS NULL THEN
        RETURN NULL;
    END IF;

    v_team_ids := get_user_team_ids(p_user_id, v_org_id);

    -- STEP 2: Explicit DENY wins (moved up before ownership check)
    IF has_deny_permission(p_user_id, v_team_ids, p_resource_type, p_resource_id) THEN
        RETURN NULL;
    END IF;

    -- STEP 3: Team ownership -> admin (if owner_team_id exists)
    IF v_owner_team_id IS NOT NULL AND v_owner_team_id = ANY(v_team_ids) THEN
        RETURN 'admin';
    END IF;

    -- STEP 4: Direct grant on the resource itself
    v_role := get_direct_grant_role(p_user_id, v_team_ids, p_resource_type, p_resource_id);
    IF v_role IS NOT NULL THEN
        RETURN v_role;
    END IF;

    -- STEP 5: Inheritance walk
    -- Only walk if the RESOURCE (file/folder) has inherit_permissions = true
    -- Once we start walking, we walk all the way up - we DON'T check each folder's inherit_permissions
    IF v_inherit AND v_folder_id IS NOT NULL THEN
        v_current_folder_id := v_folder_id;
        
        WHILE v_current_folder_id IS NOT NULL LOOP
            -- Check for deny on this folder
            IF has_deny_permission(p_user_id, v_team_ids, 'folder', v_current_folder_id) THEN
                RETURN NULL;
            END IF;
            
            -- Check for direct grant on this folder
            v_role := get_direct_grant_role(p_user_id, v_team_ids, 'folder', v_current_folder_id);
            IF v_role IS NOT NULL THEN
                RETURN v_role;
            END IF;
            
            -- Get parent folder for next iteration
            -- NOTE: We only get parent_folder_id, NOT inherit_permissions
            -- The inherit_permissions flag on intermediate folders does NOT break the chain
            SELECT parent_folder_id
            INTO v_current_folder_id
            FROM folders
            WHERE id = v_current_folder_id AND deleted_at IS NULL;
            
            -- Check if folder was found
            IF NOT FOUND THEN
                EXIT;
            END IF;
        END LOOP;
    END IF;

    -- STEP 6: Orphaned resources (owner_team_id is null AND no inheritance possible)
    -- This check is moved AFTER inheritance so files can inherit even without an owner
    IF v_owner_team_id IS NULL THEN
        -- For orphaned resources, only super_admin can access
        IF is_super_admin(p_user_id, v_org_id) THEN
            RETURN 'admin';
        ELSE
            -- If we got here, inheritance didn't help, so deny access
            RETURN NULL;
        END IF;
    END IF;

    -- STEP 7 (MVP): Org members get viewer on all org resources
    IF EXISTS (
        SELECT 1 FROM organization_members
        WHERE user_id = p_user_id AND organization_id = v_org_id
    ) THEN
        RETURN 'viewer';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_effective_role IS 'Effective role on resource. Files with null owner_team_id can still inherit from parent folders.';
