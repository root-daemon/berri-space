'use client';

import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, FileText, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { prepareUploadAction, confirmUploadAction } from '@/lib/files/actions';
import { useToast } from '@/hooks/use-toast';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '@/lib/files/constants';
import { driveQueryKeys } from '@/components/file-explorer';

interface FileUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  folderId: string | null;
  /** @deprecated Use TanStack Query invalidation instead */
  onUploadComplete?: () => void;
}

type UploadState = 'idle' | 'preparing' | 'uploading' | 'confirming' | 'success' | 'error';

export function FileUploadDialog({
  isOpen,
  onClose,
  folderId,
  onUploadComplete,
}: FileUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const resetState = () => {
    setFile(null);
    setUploadState('idle');
    setUploadProgress(0);
    setError(null);
  };

  const handleClose = () => {
    if (uploadState === 'uploading' || uploadState === 'preparing' || uploadState === 'confirming') {
      return; // Prevent closing during upload
    }
    resetState();
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Client-side validation (backend will validate too)
    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setError(`File size exceeds ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB limit`);
      return;
    }

    if (!ALLOWED_MIME_TYPES.includes(selectedFile.type as typeof ALLOWED_MIME_TYPES[number])) {
      setError('File type not allowed. Supported: PDF, Word, Excel, PowerPoint, text files, and images.');
      return;
    }

    setFile(selectedFile);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file) return;

    setError(null);

    try {
      // Step 1: Prepare upload (get signed URL)
      setUploadState('preparing');
      setUploadProgress(10);

      const prepareResult = await prepareUploadAction({
        folderId,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });

      if (!prepareResult.success) {
        throw new Error(prepareResult.error);
      }

      const { signedUrl, fileId, storagePath } = prepareResult.data;

      // Step 2: Upload to signed URL
      setUploadState('uploading');
      setUploadProgress(30);

      const uploadResponse = await fetch(signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text().catch(() => 'Unknown error');
        console.error('Upload failed:', uploadResponse.status, errorText);
        throw new Error(`Failed to upload file to storage (${uploadResponse.status}). Please try again.`);
      }

      setUploadProgress(70);

      // Step 3: Confirm upload (create database record)
      setUploadState('confirming');
      setUploadProgress(85);

      const confirmResult = await confirmUploadAction({
        fileId,
        storagePath,
        folderId,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });

      if (!confirmResult.success) {
        throw new Error(confirmResult.error);
      }

      // Success
      setUploadProgress(100);
      setUploadState('success');

      toast({
        title: 'File uploaded',
        description: `"${file.name}" uploaded successfully`,
      });

      // Invalidate the files query to refresh the list
      queryClient.invalidateQueries({
        queryKey: driveQueryKeys.files(folderId),
      });

      // Close after a brief delay to show success state
      setTimeout(() => {
        resetState();
        onClose();
        onUploadComplete?.(); // Keep for backwards compatibility
      }, 1000);

    } catch (err) {
      console.error('Upload failed:', err);
      setUploadState('error');
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const isUploading = uploadState === 'preparing' || uploadState === 'uploading' || uploadState === 'confirming';

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload File</DialogTitle>
          <DialogDescription>
            Select a file to upload to {folderId ? 'this folder' : 'My Drive'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Selection Area */}
          {!file && uploadState === 'idle' && (
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">
                Click to select a file
              </p>
              <p className="text-xs text-muted-foreground">
                Max size: {MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileSelect}
                accept={ALLOWED_MIME_TYPES.join(',')}
              />
            </div>
          )}

          {/* Selected File Display */}
          {file && (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <FileText className="w-8 h-8 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
              {!isUploading && uploadState !== 'success' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0"
                  onClick={() => {
                    setFile(null);
                    setError(null);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
              {uploadState === 'success' && (
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              )}
            </div>
          )}

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-2">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                {uploadState === 'preparing' && 'Preparing upload...'}
                {uploadState === 'uploading' && 'Uploading file...'}
                {uploadState === 'confirming' && 'Finalizing...'}
              </p>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!file || isUploading || uploadState === 'success'}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
