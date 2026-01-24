-- Debug function to trace permission resolution
-- This helps diagnose why permissions aren't working

CREATE OR REPLACE FUNCTION debug_get_effective_role(
    p_user_id UUID,
    p_resource_type resource_type,
    p_resource_id UUID
)
RETURNS TABLE(
    step TEXT,
    folder_id UUID,
    folder_name TEXT,
    owner_team_id UUID,
    user_team_ids UUID[],
    has_deny BOOLEAN,
    is_owner BOOLEAN,
    direct_role resource_role,
    result_role resource_role
) AS $$
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
    v_current_owner_team_id UUID;
    v_folder_name TEXT;
    v_has_deny BOOLEAN;
    v_is_owner BOOLEAN;
BEGIN
    -- Get resource metadata
    IF p_resource_type = 'folder' THEN
        SELECT organization_id, owner_team_id, parent_folder_id, inherit_permissions, name
        INTO v_org_id, v_owner_team_id, v_parent_folder_id, v_inherit, v_folder_name
        FROM folders
        WHERE id = p_resource_id AND deleted_at IS NULL;
        v_folder_id := v_parent_folder_id;
    ELSE
        SELECT f.organization_id, f.owner_team_id, f.folder_id, f.inherit_permissions, f.name
        INTO v_org_id, v_owner_team_id, v_folder_id, v_inherit, v_folder_name
        FROM files f
        WHERE f.id = p_resource_id AND f.deleted_at IS NULL;
    END IF;

    IF v_org_id IS NULL THEN
        RETURN QUERY SELECT 'RESOURCE_NOT_FOUND'::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::UUID[], FALSE, FALSE, NULL::resource_role, NULL::resource_role;
        RETURN;
    END IF;

    v_team_ids := get_user_team_ids(p_user_id, v_org_id);

    -- Check inheritance walk
    IF v_inherit AND v_folder_id IS NOT NULL THEN
        v_current_folder_id := v_folder_id;
        
        WHILE v_current_folder_id IS NOT NULL LOOP
            -- Get folder metadata
            v_current_owner_team_id := NULL;
            v_next_folder_id := NULL;
            v_next_inherit := NULL;
            v_folder_name := NULL;
            
            SELECT owner_team_id, parent_folder_id, inherit_permissions, name
            INTO v_current_owner_team_id, v_next_folder_id, v_next_inherit, v_folder_name
            FROM folders
            WHERE id = v_current_folder_id AND deleted_at IS NULL;
            
            IF NOT FOUND THEN
                RETURN QUERY SELECT 'FOLDER_NOT_FOUND'::TEXT, v_current_folder_id, NULL::TEXT, NULL::UUID, v_team_ids, FALSE, FALSE, NULL::resource_role, NULL::resource_role;
                EXIT;
            END IF;
            
            -- Check deny
            v_has_deny := has_deny_permission(p_user_id, v_team_ids, 'folder', v_current_folder_id);
            
            -- Check ownership
            v_is_owner := (v_current_owner_team_id IS NOT NULL AND v_current_owner_team_id = ANY(v_team_ids));
            
            -- Check direct grant
            v_role := get_direct_grant_role(p_user_id, v_team_ids, 'folder', v_current_folder_id);
            
            -- Return debug info
            RETURN QUERY SELECT 
                'CHECKING_FOLDER'::TEXT,
                v_current_folder_id,
                v_folder_name,
                v_current_owner_team_id,
                v_team_ids,
                v_has_deny,
                v_is_owner,
                v_role,
                CASE 
                    WHEN v_has_deny THEN NULL::resource_role
                    WHEN v_is_owner THEN 'admin'::resource_role
                    WHEN v_role IS NOT NULL THEN v_role
                    ELSE NULL::resource_role
                END;
            
            -- If we found a role, we're done
            IF v_role IS NOT NULL OR v_is_owner THEN
                EXIT;
            END IF;
            
            -- Move to parent
            v_current_folder_id := v_next_folder_id;
            v_inherit := v_next_inherit;
            
            IF NOT v_inherit THEN
                EXIT;
            END IF;
        END LOOP;
    END IF;
    
    RETURN;
END;
$$ LANGUAGE plpgsql STABLE;
