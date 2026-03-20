'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { FileExplorer } from '@/components/file-explorer';
import { AIAssistantPanel } from '@/components/ai-assistant-panel';
import { CreateFolderDialog } from '@/components/create-folder-dialog';
import { FileUploadDialog } from '@/components/file-upload-dialog';
import { Button } from '@/components/ui/button';
import { ClockIcon, FolderPlus, Upload } from 'lucide-react';
import type { FolderWithAccess } from '@/lib/folders';
import type { FileWithAccess } from '@/lib/files';
import type { DbTeam } from '@/lib/supabase/types';

// ============================================================================
// TYPES
// ============================================================================

interface DriveClientProps {
  /** User's default team for creating resources */
  defaultTeam: DbTeam | null;
  /** Initial folders from SSR */
  initialFolders: FolderWithAccess[];
  /** Initial files from SSR */
  initialFiles: FileWithAccess[];
  /** Parent folder ID (null for root) */
  parentFolderId?: string | null;
  /** Breadcrumbs for header */
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function DriveClient({
  defaultTeam,
  initialFolders,
  initialFiles,
  parentFolderId = null,
  breadcrumbs = [{ label: 'My Drive' }],
}: DriveClientProps) {
  const searchParams = useSearchParams();
  const [showAI, setShowAI] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showUploadFile, setShowUploadFile] = useState(false);

  // Handle URL params for triggering dialogs from sidebar
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'create-folder' && defaultTeam) {
      setShowCreateFolder(true);
      // Clean up URL
      window.history.replaceState({}, '', '/drive');
    } else if (action === 'upload' && defaultTeam) {
      setShowUploadFile(true);
      // Clean up URL
      window.history.replaceState({}, '', '/drive');
    }
  }, [searchParams, defaultTeam]);

  return (
    <>
      <AppHeader breadcrumbs={breadcrumbs} />

      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-500 text-foreground tracking-tight">My Drive</h1>
              <p className="text-sm text-muted-foreground mt-2 font-400">
                Manage and organize your documents
              </p>
            </div>
            <div className="flex items-center gap-2">
              {defaultTeam && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setShowUploadFile(true)}
                    className="gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Upload
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateFolder(true)}
                    className="gap-2"
                  >
                    <FolderPlus className="w-4 h-4" />
                    New Folder
                  </Button>
                </>
              )}
              <Button
                onClick={() => setShowAI(true)}
                className="bg-primary hover:bg-primary/90 gap-2 transition-all duration-200 shadow-md hover:shadow-lg font-400"
              >
                <ClockIcon className="w-4 h-4" />
                Ask AI
              </Button>
            </div>
          </div>

          <FileExplorer
            parentFolderId={parentFolderId}
            initialFolders={initialFolders}
            initialFiles={initialFiles}
            onCreateFolder={defaultTeam ? () => setShowCreateFolder(true) : undefined}
            onUpload={defaultTeam ? () => setShowUploadFile(true) : undefined}
          />
        </div>
      </div>

      <AIAssistantPanel isOpen={showAI} onClose={() => setShowAI(false)} />

      {defaultTeam && (
        <>
          <CreateFolderDialog
            isOpen={showCreateFolder}
            onClose={() => setShowCreateFolder(false)}
            parentFolderId={parentFolderId}
            ownerTeamId={defaultTeam.id}
          />
          <FileUploadDialog
            isOpen={showUploadFile}
            onClose={() => setShowUploadFile(false)}
            folderId={parentFolderId}
          />
        </>
      )}
    </>
  );
}
