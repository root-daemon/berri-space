'use client';

import { Upload, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="mb-6">
        <FolderOpen className="w-16 h-16 text-muted-foreground/50" />
      </div>
      <h3 className="text-xl font-semibold text-foreground mb-2">This folder is empty</h3>
      <p className="text-muted-foreground mb-6 text-center max-w-sm">
        Upload files or create folders to get started. You can drag and drop files here or use the upload button.
      </p>
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => console.log('Create folder')}
        >
          Create Folder
        </Button>
        <Button
          className="bg-primary hover:bg-primary/90"
          onClick={() => console.log('Upload file')}
        >
          <Upload className="w-4 h-4 mr-2" />
          Upload Files
        </Button>
      </div>
    </div>
  );
}

export function NoAccessState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="mb-6">
        <FolderOpen className="w-16 h-16 text-muted-foreground/50" />
      </div>
      <h3 className="text-xl font-semibold text-foreground mb-2">Access Denied</h3>
      <p className="text-muted-foreground text-center max-w-sm">
        You don't have permission to access this folder. Contact the owner for access.
      </p>
    </div>
  );
}
