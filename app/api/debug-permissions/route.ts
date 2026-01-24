import { NextResponse } from 'next/server';
import { getServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get('folderId') || '6ac12ea2-d9aa-44f4-a60b-d648522f0bec';
  const userId = searchParams.get('userId') || '9679132f-e4c8-4880-8877-09c94181d8e4';
  const fileId = searchParams.get('fileId') || '4e368a2f-4056-4c09-b917-9f420fa2a448';

  const supabase = getServerSupabaseClient();

  try {
    // 1. Check folder details
    const { data: folder, error: folderError } = await supabase
      .from('folders')
      .select('id, name, organization_id, owner_team_id, parent_folder_id, inherit_permissions, deleted_at')
      .eq('id', folderId)
      .single();

    // 2. Check file details
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('id, name, organization_id, owner_team_id, folder_id, inherit_permissions, deleted_at')
      .eq('id', fileId)
      .single();

    // 3. Check user's teams
    const { data: teams, error: teamsError } = await supabase
      .from('team_members')
      .select('team_id, teams(name, organization_id)')
      .eq('user_id', userId);

    // 4. Check permissions on folder
    const { data: folderPerms, error: folderPermsError } = await supabase
      .from('resource_permissions')
      .select('*, users(email), teams(name)')
      .eq('resource_type', 'folder')
      .eq('resource_id', folderId);

    // 5. Check permissions on file
    const { data: filePerms, error: filePermsError } = await supabase
      .from('resource_permissions')
      .select('*, users(email), teams(name)')
      .eq('resource_type', 'file')
      .eq('resource_id', fileId);

    // 6. Test get_effective_role functions
    const { data: folderRole, error: folderRoleError } = await supabase.rpc('get_effective_role', {
      p_user_id: userId,
      p_resource_type: 'folder',
      p_resource_id: folderId,
    });

    const { data: fileRole, error: fileRoleError } = await supabase.rpc('get_effective_role', {
      p_user_id: userId,
      p_resource_type: 'file',
      p_resource_id: fileId,
    });

    // 7. Get user team IDs
    const orgId = folder?.organization_id;
    let teamIds: string[] = [];
    if (orgId) {
      const { data: teamIdsData, error: teamIdsError } = await supabase.rpc('get_user_team_ids', {
        p_user_id: userId,
        p_org_id: orgId,
      });
      teamIds = teamIdsData || [];
    }

    // 8. Test get_direct_grant_role
    let directFolderRole = null;
    if (orgId && teamIds.length > 0) {
      const { data: directRole, error: directRoleError } = await supabase.rpc('get_direct_grant_role', {
        p_user_id: userId,
        p_team_ids: teamIds,
        p_resource_type: 'folder',
        p_resource_id: folderId,
      });
      directFolderRole = directRole;
    }

    return NextResponse.json({
      folder,
      file,
      teams,
      folderPerms,
      filePerms,
      folderRole,
      fileRole,
      teamIds,
      directFolderRole,
      errors: {
        folderError,
        fileError,
        teamsError,
        folderPermsError,
        filePermsError,
        folderRoleError,
        fileRoleError,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
