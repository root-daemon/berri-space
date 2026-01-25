import { Suspense } from 'react';
import { FolderClient } from '@/components/folder-client';
import { loadFolderPageData } from '@/lib/drive/loaders';

// Force dynamic rendering - this page requires authentication
export const dynamic = 'force-dynamic';

interface FolderPageProps {
  params: Promise<{ folderId: string }>;
}

/**
 * Folder Detail Page - Server Component
 *
 * This page is fully SSR-rendered. All data is fetched on the server
 * and passed to the client component as props.
 */
export default async function FolderPage({ params }: FolderPageProps) {
  const { folderId } = await params;

  // Fetch all data in parallel on the server
  const { folder, breadcrumbs, folders, files } = await loadFolderPageData(folderId);

  return (
    <Suspense fallback={null}>
      <FolderClient
        folder={folder}
        breadcrumbs={breadcrumbs}
        initialFolders={folders}
        initialFiles={files}
        error={!folder ? 'Folder not found' : null}
      />
    </Suspense>
  );
}
