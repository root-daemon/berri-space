'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FileText, Loader2, Search, X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { listAiReadyFilesAction } from '@/lib/ai/chat-actions';
import type { AiReadyFile } from '@/lib/ai/chat-types';

interface FilePickerDropdownProps {
  onSelect: (fileId: string, fileName: string) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children?: React.ReactNode;
}

// Cache for file list - persists across component mounts
let cachedFiles: AiReadyFile[] | null = null;
let cacheTimestamp: number | null = null;
const CACHE_TTL = 60000; // 1 minute cache

export function FilePickerDropdown({
  onSelect,
  isOpen,
  onOpenChange,
  children,
}: FilePickerDropdownProps) {
  const [files, setFiles] = useState<AiReadyFile[]>(cachedFiles || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Check if cache is valid
  const isCacheValid = useCallback(() => {
    return cachedFiles !== null &&
           cacheTimestamp !== null &&
           Date.now() - cacheTimestamp < CACHE_TTL;
  }, []);

  // Load files when dropdown opens
  useEffect(() => {
    if (isOpen) {
      if (isCacheValid()) {
        // Use cached data
        setFiles(cachedFiles!);
        setError(null);
      } else if (files.length === 0 || !isCacheValid()) {
        // Fetch fresh data
        loadFiles();
      }
    }
  }, [isOpen, isCacheValid]);

  const loadFiles = async (forceRefresh = false) => {
    if (loading) return;

    // Skip if cache is valid and not forcing refresh
    if (!forceRefresh && isCacheValid()) {
      setFiles(cachedFiles!);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await listAiReadyFilesAction();

      if (result.success) {
        // Update cache
        cachedFiles = result.data;
        cacheTimestamp = Date.now();
        setFiles(result.data);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to load files');
      console.error('File picker error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter files by search query - memoized for performance
  const filteredFiles = useMemo(() => {
    if (!searchQuery) return files;
    const query = searchQuery.toLowerCase();
    return files.filter((file) =>
      file.fileName.toLowerCase().includes(query)
    );
  }, [files, searchQuery]);

  const handleSelect = (fileId: string, fileName: string) => {
    onSelect(fileId, fileName);
    onOpenChange(false);
    setSearchQuery('');
  };

  const handleRefresh = () => {
    loadFiles(true);
  };

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {children || <Button variant="ghost">Select File</Button>}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="flex flex-col">
          {/* Header */}
          <div className="p-3 border-b border-border/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-500 text-foreground">
                Select a document
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleRefresh}
                  disabled={loading}
                  title="Refresh file list"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onOpenChange(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9"
                autoFocus
              />
            </div>
          </div>

          {/* File list */}
          <ScrollArea className="h-64">
            {loading && files.length === 0 ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-32 px-4 gap-2">
                <p className="text-sm text-destructive text-center">{error}</p>
                <Button variant="outline" size="sm" onClick={handleRefresh}>
                  Try again
                </Button>
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="flex items-center justify-center h-32 px-4">
                <p className="text-sm text-muted-foreground text-center">
                  {searchQuery
                    ? 'No files match your search'
                    : 'No indexed documents available'}
                </p>
              </div>
            ) : (
              <div className="p-2">
                {filteredFiles.map((file) => (
                  <button
                    key={file.fileId}
                    onClick={() => handleSelect(file.fileId, file.fileName)}
                    className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors text-left"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm text-foreground truncate">
                      {file.fileName}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Footer hint */}
          {!loading && !error && files.length > 0 && (
            <div className="p-2 border-t border-border/20 bg-muted/10">
              <p className="text-xs text-muted-foreground text-center">
                {filteredFiles.length === files.length
                  ? `${files.length} document${files.length !== 1 ? 's' : ''} available`
                  : `${filteredFiles.length} of ${files.length} documents`}
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Export function to invalidate cache (useful when documents are indexed)
export function invalidateFilePickerCache() {
  cachedFiles = null;
  cacheTimestamp = null;
}
