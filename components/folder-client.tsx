'use client';

import { useState } from 'react';
import { Folder, FolderPlus, Upload, MessageCircle, AlertCircle } from 'lucide-react';
import { AppHeader } from '@/components/app-header';
import { FileExplorer } from '@/components/file-explorer';
import { AIAssistantPanel } from '@/components/ai-assistant-panel';
import { CreateFolderDialog } from '@/components/create-folder-dialog';
import { FileUploadDialog } from '@/components/file-upload-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { FolderWithAccess } from '@/lib/folders';
import type { FileWithAccess } from '@/lib/files';

// ============================================================================
// TYPES
// ============================================================================

interface FolderClientProps {
  /** The folder being viewed */
  folder: FolderWithAccess | null;
  /** Breadcrumb path to this folder */
  breadcrumbs: FolderWithAccess[];
  /** Initial folders from SSR */
  initialFolders: FolderWithAccess[];
  /** Initial files from SSR */
  initialFiles: FileWithAccess[];
  /** Error message if folder not found */
  error?: string | null;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function FolderClient({
  folder,
  breadcrumbs,
  initialFolders,
  initialFiles,
  error,
}: FolderClientProps) {
  const [showAI, setShowAI] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showUploadFile, setShowUploadFile] = useState(false);

  // Build breadcrumb items for header
  const headerBreadcrumbs = [
    { label: 'My Drive', href: '/drive' },
    ...breadcrumbs.map((bc) => ({
      label: bc.name,
      href: `/drive/folder/${bc.id}`,
    })),
  ];

  // Error state
  if (error || !folder) {
    return (
      <>
        <AppHeader breadcrumbs={[{ label: 'My Drive', href: '/drive' }]} />
        <div className="flex-1 overflow-auto">
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mb-4" />
            <h2 className="text-lg font-medium text-foreground mb-2">
              {error || 'Folder not found'}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              The folder you&apos;re looking for doesn&apos;t exist or you don&apos;t have access.
            </p>
            <Button variant="outline" onClick={() => window.history.back()}>
              Go Back
            </Button>
          </div>
        </div>
      </>
    );
  }

  const canCreateFolder = folder.access === 'admin' || folder.access === 'editor';

  return (
    <>
      <AppHeader breadcrumbs={headerBreadcrumbs} />

      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <Folder className="w-10 h-10 text-primary" />
              <div>
                <h1 className="text-4xl font-500 text-foreground tracking-tight">
                  {folder.name}
                </h1>
                <Badge className="mt-2 bg-primary/10 text-primary border-0 capitalize">
                  {folder.access}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canCreateFolder && (
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
                <MessageCircle className="w-4 h-4" />
                Ask AI
              </Button>
            </div>
          </div>

          <FileExplorer
            parentFolderId={folder.id}
            initialFolders={initialFolders}
            initialFiles={initialFiles}
            onCreateFolder={canCreateFolder ? () => setShowCreateFolder(true) : undefined}
            onUpload={canCreateFolder ? () => setShowUploadFile(true) : undefined}
          />
        </div>
      </div>

      <AIAssistantPanel isOpen={showAI} onClose={() => setShowAI(false)} />

      {canCreateFolder && (
        <>
          <CreateFolderDialog
            isOpen={showCreateFolder}
            onClose={() => setShowCreateFolder(false)}
            parentFolderId={folder.id}
            ownerTeamId={folder.owner_team_id}
          />
          <FileUploadDialog
            isOpen={showUploadFile}
            onClose={() => setShowUploadFile(false)}
            folderId={folder.id}
          />
        </>
      )}
    </>
  );
}
