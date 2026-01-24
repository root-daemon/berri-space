-- Diagnostic queries to check why file inheritance isn't working
-- Run these in Supabase SQL editor to debug

-- Check if file has inherit_permissions enabled
SELECT 
    id,
    name,
    folder_id,
    inherit_permissions,
    deleted_at,
    (SELECT name FROM folders WHERE id = files.folder_id) as parent_folder_name
FROM files
WHERE id = '4e368a2f-4056-4c09-b917-9f420fa2a448';

-- Check if there's a deny permission on the file
SELECT *
FROM resource_permissions
WHERE resource_type = 'file'
  AND resource_id = '4e368a2f-4056-4c09-b917-9f420fa2a448'
  AND permission_type = 'deny';

-- Check the file's folder details
SELECT 
    id,
    name,
    organization_id,
    owner_team_id,
    parent_folder_id,
    inherit_permissions,
    deleted_at
FROM folders
WHERE id = '6ac12ea2-d9aa-44f4-a60b-d648522f0bec';

-- Test the inheritance walk manually
-- This simulates what get_effective_role does for the file
DO $$
DECLARE
    v_file_folder_id UUID;
    v_inherit BOOLEAN;
    v_user_id UUID := '9679132f-e4c8-4880-8877-09c94181d8e4';
    v_team_ids UUID[];
    v_role resource_role;
BEGIN
    -- Get file's folder_id and inherit_permissions
    SELECT folder_id, inherit_permissions
    INTO v_file_folder_id, v_inherit
    FROM files
    WHERE id = '4e368a2f-4056-4c09-b917-9f420fa2a448' AND deleted_at IS NULL;
    
    RAISE NOTICE 'File folder_id: %, inherit_permissions: %', v_file_folder_id, v_inherit;
    
    -- Get user's teams
    SELECT get_user_team_ids(v_user_id, 
        (SELECT organization_id FROM files WHERE id = '4e368a2f-4056-4c09-b917-9f420fa2a448'))
    INTO v_team_ids;
    
    RAISE NOTICE 'User team_ids: %', v_team_ids;
    
    -- Check direct grant on the folder
    IF v_file_folder_id IS NOT NULL THEN
        SELECT get_direct_grant_role(
            v_user_id,
            v_team_ids,
            'folder',
            v_file_folder_id
        ) INTO v_role;
        
        RAISE NOTICE 'Direct grant role on folder: %', v_role;
    END IF;
END $$;
