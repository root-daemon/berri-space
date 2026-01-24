'use client';

import { useState, useEffect, use } from 'react';
import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Download,
  Share2,
  MessageCircle,
  FileText,
  FileSpreadsheet,
  ImageIcon,
  ArrowLeft,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { getFileAction, getDownloadUrlAction } from '@/lib/files/actions';
import { getFolderPathAction } from '@/lib/folders/actions';
import { ManageAccessModal } from '@/components/manage-access-modal';
import { AIAssistantPanel } from '@/components/ai-assistant-panel';
import { useToast } from '@/hooks/use-toast';
import type { FileWithAccess } from '@/lib/files';
import type { FolderWithAccess } from '@/lib/folders';

interface FilePreviewPageProps {
  params: Promise<{ fileId: string }>;
}

export default function FilePreviewPage({ params }: FilePreviewPageProps) {
  const { fileId } = use(params);

  const [file, setFile] = useState<FileWithAccess | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<FolderWithAccess[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showAccessModal, setShowAccessModal] = useState(false);

  const { toast } = useToast();

  // Fetch file details
  useEffect(() => {
    async function fetchFileData() {
      setIsLoading(true);
      setError(null);

      try {
        const fileResult = await getFileAction(fileId);

        if (!fileResult.success) {
          setError(fileResult.error);
          return;
        }

        if (!fileResult.data) {
          setError('File not found');
          return;
        }

        setFile(fileResult.data);

        // Fetch breadcrumbs if file is in a folder
        if (fileResult.data.folder_id) {
          const pathResult = await getFolderPathAction(fileResult.data.folder_id);
          if (pathResult.success) {
            setBreadcrumbs(pathResult.data);
          }
        }
      } catch (err) {
        console.error('Failed to fetch file:', err);
        setError('Failed to load file');
      } finally {
        setIsLoading(false);
      }
    }

    fetchFileData();
  }, [fileId]);

  const handleDownload = async () => {
    if (!file) return;

    setIsDownloading(true);
    try {
      const result = await getDownloadUrlAction({
        fileId: file.id,
        forceDownload: true,
      });

      if (!result.success) {
        toast({
          title: 'Download failed',
          description: result.error,
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

      // Use a temporary anchor element for better download handling
      const link = document.createElement('a');
      link.href = result.data.signedUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to download file',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const getFileIcon = () => {
    if (!file?.mime_type) return <FileText className="w-10 h-10 text-muted-foreground" />;

    if (file.mime_type === 'application/pdf') {
      return <FileText className="w-10 h-10 text-red-500/70" />;
    }
    if (file.mime_type.startsWith('image/')) {
      return <ImageIcon className="w-10 h-10 text-blue-500/70" />;
    }
    if (file.mime_type.includes('spreadsheet') || file.mime_type.includes('excel')) {
      return <FileSpreadsheet className="w-10 h-10 text-green-500/70" />;
    }
    return <FileText className="w-10 h-10 text-muted-foreground" />;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Build breadcrumb items for header
  const headerBreadcrumbs = [
    { label: 'My Drive', href: '/drive' },
    ...breadcrumbs.map((bc) => ({
      label: bc.name,
      href: `/drive/folder/${bc.id}`,
    })),
    ...(file ? [{ label: file.name }] : []),
  ];

  // Loading state
  if (isLoading) {
    return (
      <>
        <AppHeader breadcrumbs={[{ label: 'My Drive', href: '/drive' }]} />
        <div className="flex-1 overflow-auto">
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </>
    );
  }

  // Error state
  if (error || !file) {
    return (
      <>
        <AppHeader breadcrumbs={[{ label: 'My Drive', href: '/drive' }]} />
        <div className="flex-1 overflow-auto">
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mb-4" />
            <h2 className="text-lg font-medium text-foreground mb-2">
              {error || 'File not found'}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              The file you&apos;re looking for doesn&apos;t exist or you don&apos;t have access.
            </p>
            <Button variant="outline" onClick={() => window.history.back()}>
              Go Back
            </Button>
          </div>
        </div>
      </>
    );
  }

  const canManageAccess = file.effectiveRole === 'admin' || file.effectiveRole === 'editor';
  const backLink = file.folder_id ? `/drive/folder/${file.folder_id}` : '/drive';

  return (
    <>
      <AppHeader breadcrumbs={headerBreadcrumbs} />

      <div className="flex-1 overflow-auto flex flex-col">
        {/* Header */}
        <div className="border-b border-border/20 p-6 bg-background/50">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href={backLink}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 hover:bg-muted/50 transition-all duration-200"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-500 text-foreground">{file.name}</h1>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatFileSize(file.size_bytes)} • {formatDate(file.created_at)}
                </p>
              </div>
            </div>
            <Badge className="bg-primary/10 text-primary border-0 capitalize">
              {file.effectiveRole}
            </Badge>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Preview Area */}
            <div className="lg:col-span-3">
              <div className="bg-card rounded-xl border border-border/20 overflow-hidden shadow-lg h-96 lg:h-screen max-h-[600px]">
                <div className="w-full h-full bg-gradient-to-br from-muted/50 to-muted/20 flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <div className="w-20 h-20 bg-muted rounded-lg flex items-center justify-center mx-auto">
                      {getFileIcon()}
                    </div>
                    <div>
                      <p className="text-sm font-500 text-foreground">{file.mime_type || 'Unknown type'}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Preview not available. Click Download to view the file.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Metadata Panel */}
            <div className="space-y-6">
              {/* Info Card */}
              <div className="bg-card rounded-xl border border-border/20 p-5 space-y-4">
                <div>
                  <p className="text-xs font-500 text-muted-foreground uppercase tracking-wide mb-1">
                    File Type
                  </p>
                  <p className="text-sm font-400 text-foreground">{file.mime_type || 'Unknown'}</p>
                </div>
                <div className="border-t border-border/20 pt-4">
                  <p className="text-xs font-500 text-muted-foreground uppercase tracking-wide mb-1">
                    Size
                  </p>
                  <p className="text-sm font-400 text-foreground">{formatFileSize(file.size_bytes)}</p>
                </div>
                <div className="border-t border-border/20 pt-4">
                  <p className="text-xs font-500 text-muted-foreground uppercase tracking-wide mb-1">
                    Created
                  </p>
                  <p className="text-sm font-400 text-foreground">{formatDate(file.created_at)}</p>
                </div>
                <div className="border-t border-border/20 pt-4">
                  <p className="text-xs font-500 text-muted-foreground uppercase tracking-wide mb-1">
                    Last Modified
                  </p>
                  <p className="text-sm font-400 text-foreground">{formatDate(file.updated_at)}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <Button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="w-full bg-primary hover:bg-primary/90 transition-all duration-200 shadow-sm hover:shadow-md font-400 gap-2"
                >
                  {isDownloading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Download
                </Button>
                {canManageAccess && (
                  <Button
                    variant="outline"
                    onClick={() => setShowAccessModal(true)}
                    className="w-full border-border/20 hover:bg-muted/50 transition-all duration-200 font-400 gap-2 bg-transparent"
                  >
                    <Share2 className="w-4 h-4" />
                    Manage Access
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full border-border/20 hover:bg-muted/50 transition-all duration-200 font-400 gap-2 bg-transparent"
                  onClick={() => setShowAI(true)}
                >
                  <MessageCircle className="w-4 h-4" />
                  Ask AI
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AIAssistantPanel isOpen={showAI} onClose={() => setShowAI(false)} />

      {canManageAccess && (
        <ManageAccessModal
          isOpen={showAccessModal}
          onClose={() => setShowAccessModal(false)}
          item={{
            id: file.id,
            name: file.name,
            type: 'file',
            access: file.effectiveRole,
          }}
        />
      )}
    </>
  );
}
