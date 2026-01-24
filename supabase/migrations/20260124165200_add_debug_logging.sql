-- Add debug logging to see exactly what's happening in get_effective_role
-- This will help us understand why it returns NULL when test function works

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
    v_next_folder_id UUID;
    v_next_inherit BOOLEAN;
    v_debug_step TEXT;
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
        RAISE NOTICE 'get_effective_role: Resource not found';
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
    RAISE NOTICE 'get_effective_role: User teams: %', v_team_ids;

    -- STEP 3: Explicit DENY wins
    IF has_deny_permission(p_user_id, v_team_ids, p_resource_type, p_resource_id) THEN
        RAISE NOTICE 'get_effective_role: Denied by explicit deny';
        RETURN NULL;
    END IF;

    -- STEP 4: Team ownership -> admin
    IF v_owner_team_id = ANY(v_team_ids) THEN
        RAISE NOTICE 'get_effective_role: Admin by ownership';
        RETURN 'admin';
    END IF;

    -- STEP 5: Direct grant on the resource itself
    v_role := get_direct_grant_role(p_user_id, v_team_ids, p_resource_type, p_resource_id);
    IF v_role IS NOT NULL THEN
        RAISE NOTICE 'get_effective_role: Direct grant on resource: %', v_role;
        RETURN v_role;
    END IF;

    -- STEP 6: Inheritance walk
    RAISE NOTICE 'get_effective_role: Starting inheritance walk, inherit=%, folder_id=%', v_inherit, v_folder_id;
    IF v_inherit AND v_folder_id IS NOT NULL THEN
        v_current_folder_id := v_folder_id;
        RAISE NOTICE 'get_effective_role: Starting with folder: %', v_current_folder_id;
        
        WHILE v_current_folder_id IS NOT NULL LOOP
            RAISE NOTICE 'get_effective_role: Checking folder: %', v_current_folder_id;
            
            -- Check for deny on this folder
            IF has_deny_permission(p_user_id, v_team_ids, 'folder', v_current_folder_id) THEN
                RAISE NOTICE 'get_effective_role: Denied by folder deny';
                RETURN NULL;
            END IF;
            
            -- Check for direct grant on this folder (this is the key check)
            v_role := get_direct_grant_role(p_user_id, v_team_ids, 'folder', v_current_folder_id);
            RAISE NOTICE 'get_effective_role: Direct grant on folder %: %', v_current_folder_id, v_role;
            IF v_role IS NOT NULL THEN
                RAISE NOTICE 'get_effective_role: Returning inherited role: %', v_role;
                RETURN v_role;
            END IF;
            
            -- Get parent folder for next iteration
            SELECT parent_folder_id, inherit_permissions
            INTO v_current_folder_id, v_inherit
            FROM folders
            WHERE id = v_current_folder_id AND deleted_at IS NULL;
            
            RAISE NOTICE 'get_effective_role: After SELECT, FOUND=%, v_current_folder_id=%, v_inherit=%', FOUND, v_current_folder_id, v_inherit;
            
            -- Check if folder was found
            IF NOT FOUND THEN
                RAISE NOTICE 'get_effective_role: Folder not found, exiting';
                EXIT;
            END IF;
            
            -- Stop if inheritance is broken at this level
            IF NOT v_inherit THEN
                RAISE NOTICE 'get_effective_role: Inheritance broken, exiting';
                EXIT;
            END IF;
        END LOOP;
    ELSE
        RAISE NOTICE 'get_effective_role: Skipping inheritance walk, inherit=%, folder_id=%', v_inherit, v_folder_id;
    END IF;

    -- STEP 7 (MVP): Org members get viewer on all org resources
    IF EXISTS (
        SELECT 1 FROM organization_members
        WHERE user_id = p_user_id AND organization_id = v_org_id
    ) THEN
        RAISE NOTICE 'get_effective_role: Returning viewer (MVP fallback)';
        RETURN 'viewer';
    END IF;

    RAISE NOTICE 'get_effective_role: Returning NULL (no access)';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_effective_role IS 'Effective role on resource with debug logging to trace execution.';
