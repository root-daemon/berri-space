import { Suspense } from 'react';
import { DriveClient } from '@/components/drive-client';
import { loadDrivePageData } from '@/lib/drive/loaders';

// Force dynamic rendering - this page requires authentication
export const dynamic = 'force-dynamic';

/**
 * Drive Page - Server Component
 *
 * This page is fully SSR-rendered. All data is fetched on the server
 * and passed to the client component as props.
 *
 * Benefits:
 * - No loading spinners on initial page load
 * - Faster Time to First Contentful Paint (FCP)
 * - Data is cached via React.cache() for request deduplication
 * - TanStack Query handles mutations and cache invalidation
 */
export default async function DrivePage() {
  // Fetch all data in parallel on the server
  const { defaultTeam, folders, files } = await loadDrivePageData(null);

  return (
    <Suspense fallback={null}>
      <DriveClient
        defaultTeam={defaultTeam}
        initialFolders={folders}
        initialFiles={files}
        parentFolderId={null}
        breadcrumbs={[{ label: 'My Drive' }]}
      />
    </Suspense>
  );
}
