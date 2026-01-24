-- Test the exact inheritance logic to see where it fails
-- This will help us understand why get_effective_role returns null for files

CREATE OR REPLACE FUNCTION test_file_inheritance(
    p_file_id UUID,
    p_user_id UUID
)
RETURNS TABLE(
    step_name TEXT,
    value_text TEXT,
    value_uuid UUID,
    value_bool BOOLEAN,
    value_role resource_role
) AS $$
DECLARE
    v_org_id UUID;
    v_owner_team_id UUID;
    v_folder_id UUID;
    v_inherit BOOLEAN;
    v_team_ids UUID[];
    v_role resource_role;
    v_current_folder_id UUID;
    v_has_deny BOOLEAN;
    v_is_owner BOOLEAN;
BEGIN
    -- Step 1: Get file metadata
    SELECT f.organization_id, f.owner_team_id, f.folder_id, f.inherit_permissions
    INTO v_org_id, v_owner_team_id, v_folder_id, v_inherit
    FROM files f
    WHERE f.id = p_file_id AND f.deleted_at IS NULL;
    
    RETURN QUERY SELECT '1_FILE_METADATA'::TEXT, 'org_id'::TEXT, NULL::UUID, NULL::BOOLEAN, NULL::resource_role;
    RETURN QUERY SELECT '1_FILE_METADATA'::TEXT, v_org_id::TEXT, NULL::UUID, NULL::BOOLEAN, NULL::resource_role;
    RETURN QUERY SELECT '1_FILE_METADATA'::TEXT, 'folder_id'::TEXT, v_folder_id, NULL::BOOLEAN, NULL::resource_role;
    RETURN QUERY SELECT '1_FILE_METADATA'::TEXT, 'inherit_permissions'::TEXT, NULL::UUID, v_inherit, NULL::resource_role;
    
    IF v_org_id IS NULL THEN
        RETURN QUERY SELECT 'ERROR'::TEXT, 'File not found'::TEXT, NULL::UUID, NULL::BOOLEAN, NULL::resource_role;
        RETURN;
    END IF;
    
    -- Step 2: Get user teams
    v_team_ids := get_user_team_ids(p_user_id, v_org_id);
    RETURN QUERY SELECT '2_USER_TEAMS'::TEXT, array_to_string(v_team_ids::TEXT[], ',')::TEXT, NULL::UUID, NULL::BOOLEAN, NULL::resource_role;
    
    -- Step 3: Check deny on file
    v_has_deny := has_deny_permission(p_user_id, v_team_ids, 'file', p_file_id);
    RETURN QUERY SELECT '3_FILE_DENY'::TEXT, 'has_deny'::TEXT, NULL::UUID, v_has_deny, NULL::resource_role;
    
    IF v_has_deny THEN
        RETURN QUERY SELECT 'RESULT'::TEXT, 'DENIED'::TEXT, NULL::UUID, NULL::BOOLEAN, NULL::resource_role;
        RETURN;
    END IF;
    
    -- Step 4: Check ownership
    v_is_owner := (v_owner_team_id IS NOT NULL AND v_owner_team_id = ANY(v_team_ids));
    RETURN QUERY SELECT '4_FILE_OWNERSHIP'::TEXT, 'is_owner'::TEXT, NULL::UUID, v_is_owner, NULL::resource_role;
    
    IF v_is_owner THEN
        RETURN QUERY SELECT 'RESULT'::TEXT, 'ADMIN (owner)'::TEXT, NULL::UUID, NULL::BOOLEAN, 'admin'::resource_role;
        RETURN;
    END IF;
    
    -- Step 5: Check direct grant on file
    v_role := get_direct_grant_role(p_user_id, v_team_ids, 'file', p_file_id);
    RETURN QUERY SELECT '5_FILE_DIRECT_GRANT'::TEXT, COALESCE(v_role::TEXT, 'NULL')::TEXT, NULL::UUID, NULL::BOOLEAN, v_role;
    
    IF v_role IS NOT NULL THEN
        RETURN QUERY SELECT 'RESULT'::TEXT, 'DIRECT_GRANT'::TEXT, NULL::UUID, NULL::BOOLEAN, v_role;
        RETURN;
    END IF;
    
    -- Step 6: Inheritance walk
    IF NOT v_inherit THEN
        RETURN QUERY SELECT '6_INHERITANCE'::TEXT, 'inherit_permissions is FALSE'::TEXT, NULL::UUID, NULL::BOOLEAN, NULL::resource_role;
    ELSIF v_folder_id IS NULL THEN
        RETURN QUERY SELECT '6_INHERITANCE'::TEXT, 'folder_id is NULL'::TEXT, NULL::UUID, NULL::BOOLEAN, NULL::resource_role;
    ELSE
        RETURN QUERY SELECT '6_INHERITANCE'::TEXT, 'Starting walk from folder'::TEXT, v_folder_id, NULL::BOOLEAN, NULL::resource_role;
        
        v_current_folder_id := v_folder_id;
        
        WHILE v_current_folder_id IS NOT NULL LOOP
            RETURN QUERY SELECT '6_INHERITANCE'::TEXT, 'Checking folder'::TEXT, v_current_folder_id, NULL::BOOLEAN, NULL::resource_role;
            
            -- Check deny on folder
            v_has_deny := has_deny_permission(p_user_id, v_team_ids, 'folder', v_current_folder_id);
            RETURN QUERY SELECT '6_INHERITANCE'::TEXT, 'Folder deny'::TEXT, NULL::UUID, v_has_deny, NULL::resource_role;
            
            IF v_has_deny THEN
                RETURN QUERY SELECT 'RESULT'::TEXT, 'DENIED (folder deny)'::TEXT, NULL::UUID, NULL::BOOLEAN, NULL::resource_role;
                RETURN;
            END IF;
            
            -- Check direct grant on folder
            v_role := get_direct_grant_role(p_user_id, v_team_ids, 'folder', v_current_folder_id);
            RETURN QUERY SELECT '6_INHERITANCE'::TEXT, 'Folder direct grant'::TEXT, NULL::UUID, NULL::BOOLEAN, v_role;
            
            IF v_role IS NOT NULL THEN
                RETURN QUERY SELECT 'RESULT'::TEXT, 'INHERITED'::TEXT, NULL::UUID, NULL::BOOLEAN, v_role;
                RETURN;
            END IF;
            
            -- Get parent folder
            SELECT parent_folder_id INTO v_current_folder_id
            FROM folders
            WHERE id = v_current_folder_id AND deleted_at IS NULL;
            
            IF NOT FOUND THEN
                RETURN QUERY SELECT '6_INHERITANCE'::TEXT, 'Folder not found, exiting'::TEXT, NULL::UUID, NULL::BOOLEAN, NULL::resource_role;
                EXIT;
            END IF;
            
            IF v_current_folder_id IS NULL THEN
                RETURN QUERY SELECT '6_INHERITANCE'::TEXT, 'Reached root, exiting'::TEXT, NULL::UUID, NULL::BOOLEAN, NULL::resource_role;
                EXIT;
            END IF;
        END LOOP;
    END IF;
    
    -- Step 7: MVP fallback
    IF EXISTS (SELECT 1 FROM organization_members WHERE user_id = p_user_id AND organization_id = v_org_id) THEN
        RETURN QUERY SELECT 'RESULT'::TEXT, 'VIEWER (MVP fallback)'::TEXT, NULL::UUID, NULL::BOOLEAN, 'viewer'::resource_role;
        RETURN;
    END IF;
    
    RETURN QUERY SELECT 'RESULT'::TEXT, 'NO_ACCESS'::TEXT, NULL::UUID, NULL::BOOLEAN, NULL::resource_role;
    RETURN;
END;
$$ LANGUAGE plpgsql STABLE;
