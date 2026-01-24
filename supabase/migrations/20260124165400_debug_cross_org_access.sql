-- Diagnostic queries to debug cross-organization access issue
-- User: 9679132f-e4c8-4880-8877-09c94181d8e4
-- File: 4e368a2f-4056-4c09-b917-9f420fa2a448
-- Folder: 6ac12ea2-d9aa-44f4-a60b-d648522f0bec

-- 1. Check the file's organization
SELECT 
    f.id as file_id,
    f.name as file_name,
    f.organization_id as file_org_id,
    f.folder_id,
    f.inherit_permissions,
    f.owner_team_id,
    (SELECT name FROM folders WHERE id = f.folder_id) as parent_folder_name
FROM files f
WHERE f.id = '4e368a2f-4056-4c09-b917-9f420fa2a448';

-- 2. Check the folder's organization
SELECT 
    id as folder_id,
    name as folder_name,
    organization_id as folder_org_id,
    owner_team_id,
    parent_folder_id
FROM folders
WHERE id = '6ac12ea2-d9aa-44f4-a60b-d648522f0bec';

-- 3. Check what teams the user belongs to in this organization
WITH file_org AS (
    SELECT organization_id FROM files WHERE id = '4e368a2f-4056-4c09-b917-9f420fa2a448'
)
SELECT 
    t.id as team_id,
    t.name as team_name,
    t.organization_id,
    tm.user_id,
    EXISTS(SELECT 1 FROM file_org WHERE organization_id = t.organization_id) as is_file_org
FROM teams t
JOIN team_members tm ON tm.team_id = t.id
WHERE tm.user_id = '9679132f-e4c8-4880-8877-09c94181d8e4';

-- 4. Check if user is in organization_members for the file's org
WITH file_org AS (
    SELECT organization_id FROM files WHERE id = '4e368a2f-4056-4c09-b917-9f420fa2a448'
)
SELECT 
    om.user_id,
    om.organization_id,
    om.role as org_role,
    o.name as org_name,
    EXISTS(SELECT 1 FROM file_org WHERE organization_id = om.organization_id) as is_file_org
FROM organization_members om
JOIN organizations o ON o.id = om.organization_id
WHERE om.user_id = '9679132f-e4c8-4880-8877-09c94181d8e4';

-- 5. Check permissions on the folder
SELECT 
    rp.id,
    rp.resource_type,
    rp.resource_id,
    rp.grantee_type,
    rp.grantee_id,
    rp.permission_type,
    rp.role,
    CASE 
        WHEN rp.grantee_type = 'team' THEN (SELECT name FROM teams WHERE id = rp.grantee_id)
        WHEN rp.grantee_type = 'user' THEN (SELECT email FROM users WHERE id = rp.grantee_id)
    END as grantee_name
FROM resource_permissions rp
WHERE rp.resource_type = 'folder' 
  AND rp.resource_id = '6ac12ea2-d9aa-44f4-a60b-d648522f0bec';

-- 6. Test get_user_team_ids function with the file's organization
WITH file_org AS (
    SELECT organization_id FROM files WHERE id = '4e368a2f-4056-4c09-b917-9f420fa2a448'
)
SELECT 
    fo.organization_id,
    get_user_team_ids('9679132f-e4c8-4880-8877-09c94181d8e4', fo.organization_id) as user_teams
FROM file_org fo;

-- 7. Test get_direct_grant_role on the folder
WITH file_org AS (
    SELECT organization_id FROM files WHERE id = '4e368a2f-4056-4c09-b917-9f420fa2a448'
)
SELECT 
    get_direct_grant_role(
        '9679132f-e4c8-4880-8877-09c94181d8e4',
        get_user_team_ids('9679132f-e4c8-4880-8877-09c94181d8e4', fo.organization_id),
        'folder',
        '6ac12ea2-d9aa-44f4-a60b-d648522f0bec'
    ) as folder_direct_grant
FROM file_org fo;
