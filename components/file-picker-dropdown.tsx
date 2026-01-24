'use client';

import React, { useState, useEffect } from 'react';
import { FileText, Loader2, Search, X } from 'lucide-react';
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

export function FilePickerDropdown({
  onSelect,
  isOpen,
  onOpenChange,
  children,
}: FilePickerDropdownProps) {
  const [files, setFiles] = useState<AiReadyFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Load files when dropdown opens
  useEffect(() => {
    if (isOpen && files.length === 0) {
      loadFiles();
    }
  }, [isOpen]);

  const loadFiles = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await listAiReadyFilesAction();

      if (result.success) {
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

  // Filter files by search query
  const filteredFiles = searchQuery
    ? files.filter((file) =>
        file.fileName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : files;

  const handleSelect = (fileId: string, fileName: string) => {
    onSelect(fileId, fileName);
    onOpenChange(false);
    setSearchQuery('');
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
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </div>

          {/* File list */}
          <ScrollArea className="h-64">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-32 px-4">
                <p className="text-sm text-destructive text-center">{error}</p>
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
          {!loading && !error && filteredFiles.length > 0 && (
            <div className="p-2 border-t border-border/20 bg-muted/10">
              <p className="text-xs text-muted-foreground text-center">
                {filteredFiles.length} document{filteredFiles.length !== 1 ? 's' : ''} available
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
