-- Simple diagnostic queries that will definitely return results

-- 1. Check file exists and get its folder_id
SELECT 
    'FILE_CHECK' as check_type,
    id,
    name,
    folder_id,
    inherit_permissions,
    organization_id,
    owner_team_id
FROM files
WHERE id = '4e368a2f-4056-4c09-b917-9f420fa2a448';

-- 2. Check if that folder exists
SELECT 
    'FOLDER_CHECK' as check_type,
    id,
    name,
    parent_folder_id,
    inherit_permissions,
    organization_id,
    owner_team_id
FROM folders
WHERE id = '6ac12ea2-d9aa-44f4-a60b-d648522f0bec';

-- 3. Check user's teams
SELECT 
    'USER_TEAMS' as check_type,
    tm.user_id,
    tm.team_id,
    t.name as team_name
FROM team_members tm
JOIN teams t ON t.id = tm.team_id
WHERE tm.user_id = '9679132f-e4c8-4880-8877-09c94181d8e4';

-- 4. Check permissions on the folder
SELECT 
    'FOLDER_PERMISSIONS' as check_type,
    rp.*,
    CASE rp.grantee_type 
        WHEN 'user' THEN 'user'
        WHEN 'team' THEN (SELECT name FROM teams WHERE id = rp.grantee_id)
    END as grantee_name
FROM resource_permissions rp
WHERE rp.resource_type = 'folder'
  AND rp.resource_id = '6ac12ea2-d9aa-44f4-a60b-d648522f0bec';

-- 5. Check permissions on the file
SELECT 
    'FILE_PERMISSIONS' as check_type,
    rp.*,
    CASE rp.grantee_type 
        WHEN 'user' THEN 'user'
        WHEN 'team' THEN (SELECT name FROM teams WHERE id = rp.grantee_id)
    END as grantee_name
FROM resource_permissions rp
WHERE rp.resource_type = 'file'
  AND rp.resource_id = '4e368a2f-4056-4c09-b917-9f420fa2a448';

-- 6. Test get_effective_role step by step
SELECT 
    'FOLDER_ROLE' as test_type,
    get_effective_role('9679132f-e4c8-4880-8877-09c94181d8e4', 'folder', '6ac12ea2-d9aa-44f4-a60b-d648522f0bec') as role;

SELECT 
    'FILE_ROLE' as test_type,
    get_effective_role('9679132f-e4c8-4880-8877-09c94181d8e4', 'file', '4e368a2f-4056-4c09-b917-9f420fa2a448') as role;

-- 7. Test get_direct_grant_role on folder
SELECT 
    'DIRECT_FOLDER_ROLE' as test_type,
    get_direct_grant_role(
        '9679132f-e4c8-4880-8877-09c94181d8e4',
        get_user_team_ids('9679132f-e4c8-4880-8877-09c94181d8e4', 
            (SELECT organization_id FROM folders WHERE id = '6ac12ea2-d9aa-44f4-a60b-d648522f0bec')),
        'folder',
        '6ac12ea2-d9aa-44f4-a60b-d648522f0bec'
    ) as role;
