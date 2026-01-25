'use client';

import { useState, useMemo } from 'react';
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
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ManageAccessModal } from './manage-access-modal';
import { EmptyState } from './empty-state';
import {
  listFoldersAction,
  deleteFolderAction,
  renameFolderAction,
} from '@/lib/folders/actions';
import {
  listFilesAction,
  deleteFileAction,
  renameFileAction,
  getDownloadUrlAction,
} from '@/lib/files/actions';
import type { FolderWithAccess } from '@/lib/folders';
import type { FileWithAccess } from '@/lib/files';
import { RenameDialog } from './rename-dialog';
import { DeleteConfirmDialog } from './delete-confirm-dialog';
import { MoveDialog } from './move-dialog';
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
  /** Initial folders from SSR (required for SSR optimization) */
  initialFolders?: FolderWithAccess[];
  /** Initial files from SSR (required for SSR optimization) */
  initialFiles?: FileWithAccess[];
  /** Callback to trigger create folder dialog */
  onCreateFolder?: () => void;
  /** Callback to trigger upload dialog */
  onUpload?: () => void;
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const driveQueryKeys = {
  all: ['drive'] as const,
  folders: (parentId: string | null) =>
    [...driveQueryKeys.all, 'folders', parentId ?? 'root'] as const,
  files: (parentId: string | null) =>
    [...driveQueryKeys.all, 'files', parentId ?? 'root'] as const,
};

// ============================================================================
// HELPERS
// ============================================================================

function folderToFileItem(folder: FolderWithAccess): FileItem {
  return {
    id: folder.id,
    name: folder.name,
    type: 'folder',
    access: folder.access,
    lastModified: formatDate(folder.updated_at),
  };
}

function fileToFileItem(file: FileWithAccess): FileItem {
  return {
    id: file.id,
    name: file.name,
    type: 'file',
    access: file.effectiveRole,
    lastModified: formatDate(file.updated_at),
    fileType: getFileType(file.mime_type),
  };
}

function getFileType(
  mimeType: string | null
): 'pdf' | 'doc' | 'xls' | 'image' | 'other' {
  if (!mimeType) return 'other';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel'))
    return 'xls';
  if (mimeType.includes('document') || mimeType.includes('word')) return 'doc';
  return 'other';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30)
    return `${Math.floor(diffDays / 7)} week${diffDays >= 14 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

// ============================================================================
// COMPONENT
// ============================================================================

export function FileExplorer({
  parentFolderId,
  initialFolders = [],
  initialFiles = [],
  onCreateFolder,
  onUpload,
}: FileExplorerProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);
  const [showAccessModal, setShowAccessModal] = useState(false);

  // Dialog state
  const [renameItem, setRenameItem] = useState<FileItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<FileItem | null>(null);
  const [moveItem, setMoveItem] = useState<FileItem | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const normalizedParentId = parentFolderId ?? null;

  // Query for folders - seeded with SSR data
  const {
    data: folders = [],
    isError: foldersError,
    refetch: refetchFolders,
  } = useQuery({
    queryKey: driveQueryKeys.folders(normalizedParentId),
    queryFn: async () => {
      const result = await listFoldersAction(normalizedParentId);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    initialData: initialFolders,
    staleTime: 60 * 1000, // Consider data fresh for 1 minute
    refetchOnMount: false, // Don't refetch on mount - we have SSR data
  });

  // Query for files - seeded with SSR data
  const {
    data: files = [],
    isError: filesError,
    refetch: refetchFiles,
  } = useQuery({
    queryKey: driveQueryKeys.files(normalizedParentId),
    queryFn: async () => {
      const result = await listFilesAction(normalizedParentId);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    initialData: initialFiles,
    staleTime: 60 * 1000,
    refetchOnMount: false,
  });

  // Combine folders and files into display items
  const items = useMemo(() => {
    const folderItems = folders.map(folderToFileItem);
    const fileItems = files.map(fileToFileItem);
    return [...folderItems, ...fileItems];
  }, [folders, files]);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (item: FileItem) => {
      const result =
        item.type === 'folder'
          ? await deleteFolderAction(item.id)
          : await deleteFileAction(item.id);

      if (!result.success) throw new Error(result.error);
      return { item, result };
    },
    onSuccess: ({ item }) => {
      toast({
        title: `${item.type === 'folder' ? 'Folder' : 'File'} deleted`,
        description: `"${item.name}" moved to trash`,
      });
      // Invalidate only the relevant query
      if (item.type === 'folder') {
        queryClient.invalidateQueries({
          queryKey: driveQueryKeys.folders(normalizedParentId),
        });
      } else {
        queryClient.invalidateQueries({
          queryKey: driveQueryKeys.files(normalizedParentId),
        });
      }
      setDeleteItem(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Rename mutation
  const renameMutation = useMutation({
    mutationFn: async ({
      item,
      newName,
    }: {
      item: FileItem;
      newName: string;
    }) => {
      const result =
        item.type === 'folder'
          ? await renameFolderAction({ folderId: item.id, newName })
          : await renameFileAction(item.id, newName);

      if (!result.success) throw new Error(result.error);
      return { item, newName, result };
    },
    onSuccess: ({ item, newName }) => {
      toast({
        title: `${item.type === 'folder' ? 'Folder' : 'File'} renamed`,
        description: `Renamed to "${newName}"`,
      });
      // Invalidate only the relevant query
      if (item.type === 'folder') {
        queryClient.invalidateQueries({
          queryKey: driveQueryKeys.folders(normalizedParentId),
        });
      } else {
        queryClient.invalidateQueries({
          queryKey: driveQueryKeys.files(normalizedParentId),
        });
      }
      setRenameItem(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Rename failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Handle rename
  const handleRename = (newName: string) => {
    if (!renameItem) return;
    renameMutation.mutate({ item: renameItem, newName });
  };

  // Handle delete
  const handleDelete = () => {
    if (!deleteItem) return;
    deleteMutation.mutate(deleteItem);
  };

  // Handle move complete - invalidate both queries
  const handleMoveComplete = () => {
    queryClient.invalidateQueries({
      queryKey: driveQueryKeys.folders(normalizedParentId),
    });
    queryClient.invalidateQueries({
      queryKey: driveQueryKeys.files(normalizedParentId),
    });
  };

  // Handle file download
  const handleDownload = async (item: FileItem) => {
    if (item.type !== 'file') return;

    try {
      const result = await getDownloadUrlAction({
        fileId: item.id,
        forceDownload: true,
      });

      if (!result.success) {
        toast({
          title: 'Download failed',
          description:
            result.error || 'Unable to download file. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      if (!result.data?.signedUrl) {
        toast({
          title: 'Download failed',
          description: 'Invalid download URL received',
          variant: 'destructive',
        });
        return;
      }

      const link = document.createElement('a');
      link.href = result.data.signedUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Download error:', err);
      toast({
        title: 'Error',
        description:
          err instanceof Error ? err.message : 'Failed to download file',
        variant: 'destructive',
      });
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

  // Handle manual refresh
  const handleRefresh = () => {
    refetchFolders();
    refetchFiles();
  };

  // Error state
  if (foldersError || filesError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <p className="text-muted-foreground">Failed to load items</p>
        <Button variant="outline" onClick={handleRefresh} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Try Again
        </Button>
      </div>
    );
  }

  // Empty state
  if (items.length === 0) {
    return <EmptyState onCreateFolder={onCreateFolder} onUpload={onUpload} />;
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
            const itemLink =
              item.type === 'folder'
                ? `/drive/folder/${item.id}`
                : `/drive/file/${item.id}`;
            return (
              <ContextMenu key={item.id}>
                <ContextMenuTrigger asChild>
                  <div className="block">
                    <Link
                      href={itemLink}
                      className="bg-card rounded-xl p-5 hover:shadow-lg transition-all duration-200 ease-out hover:scale-105 hover:-translate-y-0.5 cursor-pointer group border border-transparent hover:border-primary/10 hover:bg-primary/2 active:scale-95 active:transition-transform active:duration-75 block"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1 transform group-hover:scale-110 transition-transform duration-200">
                          {getFileIcon(item)}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            asChild
                            onClick={(e) => e.preventDefault()}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 h-8 w-8 hover:bg-muted/50"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={itemLink} className="cursor-pointer">
                                Open
                              </Link>
                            </DropdownMenuItem>
                            {item.type === 'file' && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleDownload(item);
                                }}
                              >
                                Download
                              </DropdownMenuItem>
                            )}
                            {(item.access === 'admin' ||
                              item.access === 'editor') && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.preventDefault();
                                  setRenameItem(item);
                                }}
                              >
                                Rename
                              </DropdownMenuItem>
                            )}
                            {item.access === 'admin' && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.preventDefault();
                                  setMoveItem(item);
                                }}
                              >
                                Move
                              </DropdownMenuItem>
                            )}
                            {(item.access === 'admin' ||
                              item.access === 'editor') && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleManageAccess(item);
                                  }}
                                >
                                  Manage Access
                                </DropdownMenuItem>
                              </>
                            )}
                            {item.access === 'admin' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setDeleteItem(item);
                                  }}
                                >
                                  Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <h3 className="font-500 text-foreground truncate mb-1 text-sm leading-snug">
                        {item.name}
                      </h3>

                      {item.owner && (
                        <p className="text-xs text-muted-foreground mb-3">
                          {item.owner}
                        </p>
                      )}

                      <div className="flex items-center justify-between">
                        <Badge
                          variant="secondary"
                          className="text-xs gap-1.5 px-2 py-0.5 bg-muted/60 text-muted-foreground hover:bg-muted border-0 rounded-full"
                        >
                          {getAccessIcon(item.access)}
                          <span className="font-400 text-xs">{item.access}</span>
                        </Badge>
                      </div>
                    </Link>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem asChild>
                    <Link href={itemLink} className="cursor-pointer">
                      Open
                    </Link>
                  </ContextMenuItem>
                  {item.type === 'file' && (
                    <ContextMenuItem onClick={() => handleDownload(item)}>
                      Download
                    </ContextMenuItem>
                  )}
                  {(item.access === 'admin' || item.access === 'editor') && (
                    <ContextMenuItem onClick={() => setRenameItem(item)}>
                      Rename
                    </ContextMenuItem>
                  )}
                  {item.access === 'admin' && (
                    <ContextMenuItem onClick={() => setMoveItem(item)}>
                      Move
                    </ContextMenuItem>
                  )}
                  {(item.access === 'admin' || item.access === 'editor') && (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => handleManageAccess(item)}>
                        Manage Access
                      </ContextMenuItem>
                    </>
                  )}
                  {item.access === 'admin' && (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        variant="destructive"
                        onClick={() => setDeleteItem(item)}
                      >
                        Delete
                      </ContextMenuItem>
                    </>
                  )}
                </ContextMenuContent>
              </ContextMenu>
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
            const itemLink =
              item.type === 'folder'
                ? `/drive/folder/${item.id}`
                : `/drive/file/${item.id}`;
            return (
              <ContextMenu key={item.id}>
                <ContextMenuTrigger asChild>
                  <div className="block">
                    <Link
                      href={itemLink}
                      className="grid grid-cols-1 md:grid-cols-5 gap-4 px-6 py-3.5 border-b border-border/20 hover:bg-primary/3 transition-colors duration-150 group items-center last:border-b-0 active:bg-primary/5 active:transition-colors active:duration-75"
                    >
                      <div className="flex items-center gap-3">
                        <div className="group-hover:scale-110 transition-transform duration-200">
                          {getFileIcon(item)}
                        </div>
                        <span className="font-400 text-foreground text-sm">
                          {item.name}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground hidden md:block">
                        {item.owner || '-'}
                      </div>
                      <div className="text-sm text-muted-foreground hidden md:block">
                        {item.lastModified || '-'}
                      </div>
                      <Badge
                        variant="secondary"
                        className="text-xs gap-1.5 w-fit bg-muted/60 text-muted-foreground hover:bg-muted border-0 rounded-full px-2 py-0.5"
                      >
                        {getAccessIcon(item.access)}
                        <span className="font-400 text-xs">{item.access}</span>
                      </Badge>
                      <div
                        className="flex justify-end"
                        onClick={(e) => e.preventDefault()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-muted/50"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={itemLink} className="cursor-pointer">
                                Open
                              </Link>
                            </DropdownMenuItem>
                            {item.type === 'file' && (
                              <DropdownMenuItem
                                onClick={() => handleDownload(item)}
                              >
                                Download
                              </DropdownMenuItem>
                            )}
                            {(item.access === 'admin' ||
                              item.access === 'editor') && (
                              <DropdownMenuItem
                                onClick={() => setRenameItem(item)}
                              >
                                Rename
                              </DropdownMenuItem>
                            )}
                            {item.access === 'admin' && (
                              <DropdownMenuItem
                                onClick={() => setMoveItem(item)}
                              >
                                Move
                              </DropdownMenuItem>
                            )}
                            {(item.access === 'admin' ||
                              item.access === 'editor') && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleManageAccess(item)}
                                >
                                  Manage Access
                                </DropdownMenuItem>
                              </>
                            )}
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
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem asChild>
                    <Link href={itemLink} className="cursor-pointer">
                      Open
                    </Link>
                  </ContextMenuItem>
                  {item.type === 'file' && (
                    <ContextMenuItem onClick={() => handleDownload(item)}>
                      Download
                    </ContextMenuItem>
                  )}
                  {(item.access === 'admin' || item.access === 'editor') && (
                    <ContextMenuItem onClick={() => setRenameItem(item)}>
                      Rename
                    </ContextMenuItem>
                  )}
                  {item.access === 'admin' && (
                    <ContextMenuItem onClick={() => setMoveItem(item)}>
                      Move
                    </ContextMenuItem>
                  )}
                  {(item.access === 'admin' || item.access === 'editor') && (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => handleManageAccess(item)}>
                        Manage Access
                      </ContextMenuItem>
                    </>
                  )}
                  {item.access === 'admin' && (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        variant="destructive"
                        onClick={() => setDeleteItem(item)}
                      >
                        Delete
                      </ContextMenuItem>
                    </>
                  )}
                </ContextMenuContent>
              </ContextMenu>
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
        isLoading={renameMutation.isPending}
      />

      <DeleteConfirmDialog
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        itemName={deleteItem?.name || ''}
        itemType={deleteItem?.type || 'folder'}
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
      />

      {moveItem && (
        <MoveDialog
          isOpen={!!moveItem}
          onClose={() => setMoveItem(null)}
          item={moveItem}
          currentFolderId={parentFolderId || null}
          onMoveComplete={handleMoveComplete}
        />
      )}
    </>
  );
}
