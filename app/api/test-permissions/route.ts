import { NextResponse } from 'next/server';
import { getServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get('folderId') || '6ac12ea2-d9aa-44f4-a60b-d648522f0bec';
  const userId = searchParams.get('userId') || '9679132f-e4c8-4880-8877-09c94181d8e4';
  const fileId = searchParams.get('fileId') || '4e368a2f-4056-4c09-b917-9f420fa2a448';

  const supabase = getServerSupabaseClient();

  try {
    // Use the debug function
    const { data: debugSteps, error: debugError } = await supabase.rpc('debug_get_effective_role', {
      p_user_id: userId,
      p_resource_type: 'file',
      p_resource_id: fileId,
    });

    // Also test the actual function
    const { data: fileRole } = await supabase.rpc('get_effective_role', {
      p_user_id: userId,
      p_resource_type: 'file',
      p_resource_id: fileId,
    });

    const { data: folderRole } = await supabase.rpc('get_effective_role', {
      p_user_id: userId,
      p_resource_type: 'folder',
      p_resource_id: folderId,
    });

    return NextResponse.json({
      debugSteps,
      fileRole,
      folderRole,
      debugError,
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ 
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
