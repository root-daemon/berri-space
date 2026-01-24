'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Folder, ChevronRight, Home } from 'lucide-react';
import { listFoldersAction, getFolderPathAction, moveFolderAction } from '@/lib/folders/actions';
import { moveFileAction } from '@/lib/files/actions';
import type { FolderWithAccess } from '@/lib/folders';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MoveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  item: { id: string; name: string; type: 'folder' | 'file' };
  currentFolderId: string | null;
  onMoveComplete: () => void;
}

export function MoveDialog({
  isOpen,
  onClose,
  item,
  currentFolderId,
  onMoveComplete,
}: MoveDialogProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [currentViewFolderId, setCurrentViewFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<FolderWithAccess[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<FolderWithAccess[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const { toast } = useToast();

  // Load folders for current view
  const loadFolders = useCallback(async (parentFolderId: string | null) => {
    setIsLoading(true);
    try {
      const result = await listFoldersAction(parentFolderId);
      if (result.success) {
        setFolders(result.data);
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to load folders',
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error('Failed to load folders:', err);
      toast({
        title: 'Error',
        description: 'Failed to load folders',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Load breadcrumbs for current view
  const loadBreadcrumbs = useCallback(async (folderId: string | null) => {
    if (!folderId) {
      setBreadcrumbs([]);
      return;
    }

    try {
      const result = await getFolderPathAction(folderId);
      if (result.success) {
        setBreadcrumbs(result.data);
      }
    } catch (err) {
      console.error('Failed to load breadcrumbs:', err);
    }
  }, []);

  // Initialize when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedFolderId(null);
      setCurrentViewFolderId(null);
      loadFolders(null);
      setBreadcrumbs([]);
    }
  }, [isOpen, loadFolders]);

  // Load breadcrumbs when view folder changes
  useEffect(() => {
    if (currentViewFolderId) {
      loadBreadcrumbs(currentViewFolderId);
    } else {
      setBreadcrumbs([]);
    }
  }, [currentViewFolderId, loadBreadcrumbs]);

  const handleFolderClick = (folderId: string) => {
    setSelectedFolderId(folderId);
  };

  const handleNavigateToFolder = (folderId: string) => {
    setCurrentViewFolderId(folderId);
    setSelectedFolderId(null);
    loadFolders(folderId);
  };

  const handleNavigateToRoot = () => {
    setCurrentViewFolderId(null);
    setSelectedFolderId(null);
    loadFolders(null);
  };

  const handleBreadcrumbClick = (folderId: string | null) => {
    if (folderId === null) {
      handleNavigateToRoot();
    } else {
      handleNavigateToFolder(folderId);
    }
  };

  const handleMove = async () => {
    setIsMoving(true);
    try {
      const result = item.type === 'folder'
        ? await moveFolderAction({
            folderId: item.id,
            targetParentFolderId: selectedFolderId,
          })
        : await moveFileAction({
            fileId: item.id,
            targetFolderId: selectedFolderId,
          });

      if (!result.success) {
        toast({
          title: 'Move failed',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: `${item.type === 'folder' ? 'Folder' : 'File'} moved`,
        description: `"${item.name}" has been moved`,
      });

      onClose();
      onMoveComplete();
    } catch (err) {
      console.error('Move error:', err);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsMoving(false);
    }
  };

  const canMove = selectedFolderId !== currentFolderId;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Move {item.type}</DialogTitle>
          <DialogDescription>
            Select a destination folder for "{item.name}".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
            <button
              type="button"
              onClick={handleNavigateToRoot}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <Home className="w-4 h-4" />
              <span>My Drive</span>
            </button>
            {breadcrumbs.map((folder, index) => (
              <div key={folder.id} className="flex items-center gap-1">
                <ChevronRight className="w-4 h-4" />
                <button
                  type="button"
                  onClick={() => handleBreadcrumbClick(folder.id)}
                  className="hover:text-foreground transition-colors"
                >
                  {folder.name}
                </button>
              </div>
            ))}
            {currentViewFolderId && (
              <>
                <ChevronRight className="w-4 h-4" />
                <span className="text-foreground font-medium">
                  {folders.find(f => f.id === currentViewFolderId)?.name || 'Current'}
                </span>
              </>
            )}
          </div>

          {/* Folder List */}
          <ScrollArea className="h-[300px] border rounded-md p-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-1">
                {/* Root option */}
                {!currentViewFolderId && (
                  <button
                    type="button"
                    onClick={() => handleFolderClick(null)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                      selectedFolderId === null
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <Home className="w-5 h-5" />
                    <span className="font-medium">My Drive (Root)</span>
                  </button>
                )}

                {/* Folder options */}
                {folders.map((folder) => (
                  <div key={folder.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleFolderClick(folder.id)}
                      className={`flex-1 flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                        selectedFolderId === folder.id
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <Folder className="w-5 h-5" />
                      <span className="font-medium">{folder.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNavigateToFolder(folder.id)}
                      className="px-2 py-2 hover:bg-muted rounded-md transition-colors"
                      title="Open folder"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {folders.length === 0 && !currentViewFolderId && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No folders available
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Selected destination info */}
          {selectedFolderId !== null && (
            <div className="text-sm text-muted-foreground">
              Selected: {folders.find(f => f.id === selectedFolderId)?.name || 'My Drive'}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isMoving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleMove}
            disabled={!canMove || isMoving || isLoading}
          >
            {isMoving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
