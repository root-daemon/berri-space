/**
 * Server-side Data Loaders for Drive Page
 *
 * These functions are optimized for SSR - they run only on the server
 * and avoid the overhead of server actions.
 *
 * IMPORTANT: Only import this file in Server Components.
 */

import { cache } from 'react';
import { getServerSupabaseClient } from '@/lib/supabase/server';
import { getCurrentUser, getCurrentOrganization } from '@/lib/auth';
import { listFolders, type FolderWithAccess } from '@/lib/folders';
import { listFiles, type FileWithAccess } from '@/lib/files';
import type { DbTeam } from '@/lib/supabase/types';

// ============================================================================
// TYPES
// ============================================================================

export interface DrivePageData {
  defaultTeam: DbTeam | null;
  folders: FolderWithAccess[];
  files: FileWithAccess[];
}

// ============================================================================
// CACHED LOADERS
// ============================================================================

/**
 * Gets the user's default team with a single optimized query.
 * Uses React.cache() to deduplicate calls within a request.
 */
export const getDefaultTeam = cache(async (): Promise<DbTeam | null> => {
  const user = await getCurrentUser();
  const { organization } = await getCurrentOrganization();
  const supabase = getServerSupabaseClient();

  // Single query using a join to get the first team the user belongs to
  const { data, error } = await supabase
    .from('team_members')
    .select(`
      teams!inner (
        id,
        organization_id,
        name,
        created_at,
        updated_at
      )
    `)
    .eq('user_id', user.id)
    .eq('teams.organization_id', organization.id)
    .order('teams(name)', { ascending: true })
    .limit(1)
    .single();

  if (error) {
    // PGRST116 means no rows - user has no teams
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('getDefaultTeam error:', error);
    return null;
  }

  // Extract the team from the joined result
  const team = data?.teams as unknown as DbTeam;
  return team || null;
});

/**
 * Loads all initial data for the Drive page in parallel.
 * Uses React.cache() for per-request deduplication.
 */
export const loadDrivePageData = cache(
  async (parentFolderId: string | null = null): Promise<DrivePageData> => {
    // Fetch all data in parallel
    const [defaultTeam, folders, files] = await Promise.all([
      getDefaultTeam(),
      listFolders(parentFolderId).catch((err) => {
        console.error('Failed to load folders:', err);
        return [] as FolderWithAccess[];
      }),
      listFiles(parentFolderId).catch((err) => {
        console.error('Failed to load files:', err);
        return [] as FileWithAccess[];
      }),
    ]);

    return {
      defaultTeam,
      folders,
      files,
    };
  }
);

// ============================================================================
// FOLDER PAGE DATA
// ============================================================================

export interface FolderPageData {
  folder: FolderWithAccess | null;
  breadcrumbs: FolderWithAccess[];
  folders: FolderWithAccess[];
  files: FileWithAccess[];
}

/**
 * Loads all data for a folder detail page in parallel.
 * Uses React.cache() for per-request deduplication.
 */
export const loadFolderPageData = cache(
  async (folderId: string): Promise<FolderPageData> => {
    // Import folder functions
    const { getFolder, getFolderPath } = await import('@/lib/folders');

    // Fetch all data in parallel
    const [folder, breadcrumbs, folders, files] = await Promise.all([
      getFolder(folderId).catch((err) => {
        console.error('Failed to load folder:', err);
        return null;
      }),
      getFolderPath(folderId).catch((err) => {
        console.error('Failed to load folder path:', err);
        return [] as FolderWithAccess[];
      }),
      listFolders(folderId).catch((err) => {
        console.error('Failed to load folders:', err);
        return [] as FolderWithAccess[];
      }),
      listFiles(folderId).catch((err) => {
        console.error('Failed to load files:', err);
        return [] as FileWithAccess[];
      }),
    ]);

    return {
      folder,
      breadcrumbs,
      folders,
      files,
    };
  }
);
