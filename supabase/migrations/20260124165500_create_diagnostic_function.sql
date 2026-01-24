-- Create a function that returns all diagnostic information
CREATE OR REPLACE FUNCTION diagnose_file_access(
    p_user_id UUID,
    p_file_id UUID
)
RETURNS TABLE(
    check_name TEXT,
    result_text TEXT,
    result_json JSONB
) AS $$
DECLARE
    v_file_org_id UUID;
    v_folder_id UUID;
    v_team_ids UUID[];
    v_role resource_role;
BEGIN
    -- Get file organization
    SELECT organization_id, folder_id INTO v_file_org_id, v_folder_id
    FROM files WHERE id = p_file_id;
    
    -- 1. File metadata
    RETURN QUERY
    SELECT 
        '1_FILE_METADATA'::TEXT,
        'File organization and folder'::TEXT,
        jsonb_build_object(
            'file_id', f.id,
            'file_name', f.name,
            'organization_id', f.organization_id,
            'folder_id', f.folder_id,
            'inherit_permissions', f.inherit_permissions,
            'owner_team_id', f.owner_team_id,
            'deleted_at', f.deleted_at
        )
    FROM files f WHERE f.id = p_file_id;
    
    -- 2. Folder metadata
    RETURN QUERY
    SELECT 
        '2_FOLDER_METADATA'::TEXT,
        'Parent folder info'::TEXT,
        jsonb_build_object(
            'folder_id', fo.id,
            'folder_name', fo.name,
            'organization_id', fo.organization_id,
            'owner_team_id', fo.owner_team_id,
            'parent_folder_id', fo.parent_folder_id,
            'inherit_permissions', fo.inherit_permissions
        )
    FROM folders fo WHERE fo.id = v_folder_id;
    
    -- 3. User's teams in file's organization
    v_team_ids := get_user_team_ids(p_user_id, v_file_org_id);
    RETURN QUERY
    SELECT 
        '3_USER_TEAMS'::TEXT,
        format('User teams in org %s', v_file_org_id)::TEXT,
        jsonb_build_object(
            'user_id', p_user_id,
            'organization_id', v_file_org_id,
            'team_ids', v_team_ids,
            'team_count', array_length(v_team_ids, 1)
        );
    
    -- 4. All user's teams (across all orgs)
    RETURN QUERY
    SELECT 
        '4_ALL_USER_TEAMS'::TEXT,
        'All teams user belongs to'::TEXT,
        jsonb_agg(jsonb_build_object(
            'team_id', t.id,
            'team_name', t.name,
            'organization_id', t.organization_id,
            'is_file_org', t.organization_id = v_file_org_id
        ))
    FROM teams t
    JOIN team_members tm ON tm.team_id = t.id
    WHERE tm.user_id = p_user_id;
    
    -- 5. User's organization memberships
    RETURN QUERY
    SELECT 
        '5_ORG_MEMBERSHIPS'::TEXT,
        'Organization memberships'::TEXT,
        jsonb_agg(jsonb_build_object(
            'organization_id', om.organization_id,
            'org_name', o.name,
            'role', om.role,
            'is_file_org', om.organization_id = v_file_org_id
        ))
    FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.user_id = p_user_id;
    
    -- 6. Folder permissions
    RETURN QUERY
    SELECT 
        '6_FOLDER_PERMISSIONS'::TEXT,
        'Permissions on the folder'::TEXT,
        jsonb_agg(jsonb_build_object(
            'permission_id', rp.id,
            'grantee_type', rp.grantee_type,
            'grantee_id', rp.grantee_id,
            'permission_type', rp.permission_type,
            'role', rp.role,
            'user_has_this_team', rp.grantee_id = ANY(v_team_ids)
        ))
    FROM resource_permissions rp
    WHERE rp.resource_type = 'folder' 
      AND rp.resource_id = v_folder_id;
    
    -- 7. Test get_direct_grant_role on folder
    v_role := get_direct_grant_role(p_user_id, v_team_ids, 'folder', v_folder_id);
    RETURN QUERY
    SELECT 
        '7_FOLDER_DIRECT_GRANT'::TEXT,
        format('Result: %s', COALESCE(v_role::TEXT, 'NULL'))::TEXT,
        jsonb_build_object(
            'folder_id', v_folder_id,
            'user_id', p_user_id,
            'team_ids', v_team_ids,
            'result_role', v_role
        );
    
    -- 8. Test get_effective_role on file
    v_role := get_effective_role(p_user_id, 'file', p_file_id);
    RETURN QUERY
    SELECT 
        '8_FILE_EFFECTIVE_ROLE'::TEXT,
        format('Result: %s', COALESCE(v_role::TEXT, 'NULL'))::TEXT,
        jsonb_build_object(
            'file_id', p_file_id,
            'user_id', p_user_id,
            'result_role', v_role
        );
    
    RETURN;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION diagnose_file_access IS 'Comprehensive diagnostic for file access issues';
