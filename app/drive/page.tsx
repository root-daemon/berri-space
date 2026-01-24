'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { FileExplorer } from '@/components/file-explorer';
import { AIAssistantPanel } from '@/components/ai-assistant-panel';
import { CreateFolderDialog } from '@/components/create-folder-dialog';
import { FileUploadDialog } from '@/components/file-upload-dialog';
import { Button } from '@/components/ui/button';
import { MessageCircle, FolderPlus, Upload, Loader2 } from 'lucide-react';
import { getDefaultTeamAction } from '@/lib/teams/actions';

export default function DrivePage() {
  const searchParams = useSearchParams();
  const [showAI, setShowAI] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showUploadFile, setShowUploadFile] = useState(false);
  const [defaultTeamId, setDefaultTeamId] = useState<string | null>(null);
  const [isLoadingTeam, setIsLoadingTeam] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch user's default team for creating folders
  useEffect(() => {
    async function fetchDefaultTeam() {
      setIsLoadingTeam(true);
      try {
        const result = await getDefaultTeamAction();
        if (result.success && result.data) {
          setDefaultTeamId(result.data.id);
        }
      } catch (err) {
        console.error('Failed to fetch default team:', err);
      } finally {
        setIsLoadingTeam(false);
      }
    }
    fetchDefaultTeam();
  }, []);

  // Handle URL params for triggering dialogs from sidebar
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'create-folder' && defaultTeamId) {
      setShowCreateFolder(true);
      // Clean up URL
      window.history.replaceState({}, '', '/drive');
    } else if (action === 'upload' && defaultTeamId) {
      setShowUploadFile(true);
      // Clean up URL
      window.history.replaceState({}, '', '/drive');
    }
  }, [searchParams, defaultTeamId]);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <>
      <AppHeader breadcrumbs={[{ label: 'My Drive' }]} />

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
              {defaultTeamId && (
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

          {isLoadingTeam ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <FileExplorer
              key={refreshKey}
              parentFolderId={null}
              onRefresh={handleRefresh}
              onCreateFolder={defaultTeamId ? () => setShowCreateFolder(true) : undefined}
              onUpload={defaultTeamId ? () => setShowUploadFile(true) : undefined}
            />
          )}
        </div>
      </div>

      <AIAssistantPanel isOpen={showAI} onClose={() => setShowAI(false)} />

      {defaultTeamId && (
        <>
          <CreateFolderDialog
            isOpen={showCreateFolder}
            onClose={() => setShowCreateFolder(false)}
            parentFolderId={null}
            ownerTeamId={defaultTeamId}
            onCreated={handleRefresh}
          />
          <FileUploadDialog
            isOpen={showUploadFile}
            onClose={() => setShowUploadFile(false)}
            folderId={null}
            onUploadComplete={handleRefresh}
          />
        </>
      )}
    </>
  );
}
