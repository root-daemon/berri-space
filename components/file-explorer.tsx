'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Folder,
  FileText,
  FileSpreadsheet,
  ImageIcon,
  MoreVertical,
  Grid,
  List as ListIcon,
  Lock,
  Users,
  LockOpen,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ManageAccessModal } from './manage-access-modal';
import { EmptyState } from './empty-state';
import { listFoldersAction, deleteFolderAction, renameFolderAction } from '@/lib/folders/actions';
import type { FolderWithAccess } from '@/lib/folders';
import { RenameDialog } from './rename-dialog';
import { DeleteConfirmDialog } from './delete-confirm-dialog';
import { useToast } from '@/hooks/use-toast';

// ============================================================================
// TYPES
// ============================================================================

interface FileItem {
  id: string;
  name: string;
  type: 'folder' | 'file';
  owner?: string;
  lastModified?: string;
  access: 'admin' | 'editor' | 'viewer';
  fileType?: 'pdf' | 'doc' | 'xls' | 'image' | 'other';
}

interface FileExplorerProps {
  /** Parent folder ID. Null/undefined for root level. */
  parentFolderId?: string | null;
  /** Callback when folder contents change */
  onRefresh?: () => void;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Converts a FolderWithAccess to a FileItem for display.
 */
function folderToFileItem(folder: FolderWithAccess): FileItem {
  return {
    id: folder.id,
    name: folder.name,
    type: 'folder',
    access: folder.access,
    lastModified: formatDate(folder.updated_at),
  };
}

/**
 * Formats a date string for display.
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${diffDays >= 14 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

// ============================================================================
// COMPONENT
// ============================================================================

export function FileExplorer({ parentFolderId, onRefresh }: FileExplorerProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);
  const [showAccessModal, setShowAccessModal] = useState(false);

  // Data state
  const [items, setItems] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [renameItem, setRenameItem] = useState<FileItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<FileItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);

  const { toast } = useToast();

  // Fetch folders
  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await listFoldersAction(parentFolderId);

      if (!result.success) {
        setError(result.error);
        setItems([]);
        return;
      }

      // Convert folders to FileItems
      // TODO: Also fetch files when file service is implemented
      const folderItems = result.data.map(folderToFileItem);
      setItems(folderItems);
    } catch (err) {
      console.error('Failed to fetch items:', err);
      setError('Failed to load items');
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [parentFolderId]);

  // Initial fetch
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Handle rename
  const handleRename = async (newName: string) => {
    if (!renameItem) return;

    setIsRenaming(true);
    try {
      const result = await renameFolderAction({
        folderId: renameItem.id,
        newName,
      });

      if (!result.success) {
        toast({
          title: 'Rename failed',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Folder renamed',
        description: `Renamed to "${newName}"`,
      });

      setRenameItem(null);
      fetchItems();
      onRefresh?.();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsRenaming(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!deleteItem) return;

    setIsDeleting(true);
    try {
      const result = await deleteFolderAction(deleteItem.id);

      if (!result.success) {
        toast({
          title: 'Delete failed',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Folder deleted',
        description: `"${deleteItem.name}" moved to trash`,
      });

      setDeleteItem(null);
      fetchItems();
      onRefresh?.();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const getFileIcon = (item: FileItem) => {
    if (item.type === 'folder') {
      return <Folder className="w-7 h-7 text-primary" />;
    }

    switch (item.fileType) {
      case 'pdf':
        return <FileText className="w-7 h-7 text-red-500/70" />;
      case 'xls':
        return <FileSpreadsheet className="w-7 h-7 text-green-500/70" />;
      case 'image':
        return <ImageIcon className="w-7 h-7 text-blue-500/70" />;
      default:
        return <FileText className="w-7 h-7 text-muted-foreground" />;
    }
  };

  const getAccessIcon = (access: string) => {
    if (access === 'viewer') return <Lock className="w-3 h-3" />;
    if (access === 'editor') return <LockOpen className="w-3 h-3" />;
    return <Users className="w-3 h-3" />;
  };

  const handleManageAccess = (item: FileItem) => {
    setSelectedItem(item);
    setShowAccessModal(true);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={fetchItems} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Try Again
        </Button>
      </div>
    );
  }

  // Empty state
  if (items.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      {/* View Toggle */}
      <div className="flex justify-end gap-1 mb-8">
        <Button
          variant={viewMode === 'grid' ? 'default' : 'ghost'}
          size="icon"
          onClick={() => setViewMode('grid')}
          className={`transition-all ${viewMode === 'grid' ? 'bg-primary hover:bg-primary/90' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
        >
          <Grid className="w-4 h-4" />
        </Button>
        <Button
          variant={viewMode === 'list' ? 'default' : 'ghost'}
          size="icon"
          onClick={() => setViewMode('list')}
          className={`transition-all ${viewMode === 'list' ? 'bg-primary hover:bg-primary/90' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
        >
          <ListIcon className="w-4 h-4" />
        </Button>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => {
            const itemLink = item.type === 'folder' ? `/drive/folder/${item.id}` : `/drive/file/${item.id}`;
            return (
              <Link
                key={item.id}
                href={itemLink}
                className="bg-card rounded-xl p-5 hover:shadow-lg transition-all duration-200 ease-out hover:scale-105 hover:-translate-y-0.5 cursor-pointer group border border-transparent hover:border-primary/10 hover:bg-primary/2 active:scale-95 active:transition-transform active:duration-75 block"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 transform group-hover:scale-110 transition-transform duration-200">
                    {getFileIcon(item)}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 h-8 w-8 hover:bg-muted/50"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.preventDefault(); }}>
                        Open
                      </DropdownMenuItem>
                      {(item.access === 'admin' || item.access === 'editor') && (
                        <DropdownMenuItem onClick={(e) => { e.preventDefault(); setRenameItem(item); }}>
                          Rename
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={(e) => { e.preventDefault(); }}>
                        Move
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={(e) => { e.preventDefault(); handleManageAccess(item); }}>
                        Manage Access
                      </DropdownMenuItem>
                      {item.access === 'admin' && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => { e.preventDefault(); setDeleteItem(item); }}
                          >
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <h3 className="font-500 text-foreground truncate mb-1 text-sm leading-snug">{item.name}</h3>

                {item.owner && (
                  <p className="text-xs text-muted-foreground mb-3">{item.owner}</p>
                )}

                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-xs gap-1.5 px-2 py-0.5 bg-muted/60 text-muted-foreground hover:bg-muted border-0 rounded-full">
                    {getAccessIcon(item.access)}
                    <span className="font-400 text-xs">{item.access}</span>
                  </Badge>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="bg-card border border-transparent rounded-xl overflow-hidden shadow-sm">
          <div className="hidden md:grid grid-cols-5 gap-4 px-6 py-3 bg-muted/20 border-b border-border/20 text-sm font-500 text-muted-foreground">
            <div>Name</div>
            <div>Owner</div>
            <div>Last Modified</div>
            <div>Access</div>
            <div className="text-right">Actions</div>
          </div>

          {items.map((item) => {
            const itemLink = item.type === 'folder' ? `/drive/folder/${item.id}` : `/drive/file/${item.id}`;
            return (
              <Link
                key={item.id}
                href={itemLink}
                className="grid grid-cols-1 md:grid-cols-5 gap-4 px-6 py-3.5 border-b border-border/20 hover:bg-primary/3 transition-colors duration-150 group items-center last:border-b-0 active:bg-primary/5 active:transition-colors active:duration-75"
              >
                <div className="flex items-center gap-3">
                  <div className="group-hover:scale-110 transition-transform duration-200">
                    {getFileIcon(item)}
                  </div>
                  <span className="font-400 text-foreground text-sm">{item.name}</span>
                </div>
                <div className="text-sm text-muted-foreground hidden md:block">
                  {item.owner || '-'}
                </div>
                <div className="text-sm text-muted-foreground hidden md:block">
                  {item.lastModified || '-'}
                </div>
                <Badge variant="secondary" className="text-xs gap-1.5 w-fit bg-muted/60 text-muted-foreground hover:bg-muted border-0 rounded-full px-2 py-0.5">
                  {getAccessIcon(item.access)}
                  <span className="font-400 text-xs">{item.access}</span>
                </Badge>
                <div className="flex justify-end" onClick={(e) => e.preventDefault()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted/50">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Open</DropdownMenuItem>
                      {(item.access === 'admin' || item.access === 'editor') && (
                        <DropdownMenuItem onClick={() => setRenameItem(item)}>
                          Rename
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem>Move</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleManageAccess(item)}>
                        Manage Access
                      </DropdownMenuItem>
                      {item.access === 'admin' && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteItem(item)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {selectedItem && (
        <ManageAccessModal
          isOpen={showAccessModal}
          onClose={() => setShowAccessModal(false)}
          item={selectedItem}
        />
      )}

      <RenameDialog
        isOpen={!!renameItem}
        onClose={() => setRenameItem(null)}
        itemName={renameItem?.name || ''}
        itemType={renameItem?.type || 'folder'}
        onRename={handleRename}
        isLoading={isRenaming}
      />

      <DeleteConfirmDialog
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        itemName={deleteItem?.name || ''}
        itemType={deleteItem?.type || 'folder'}
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </>
  );
}
