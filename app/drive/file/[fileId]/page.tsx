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
import mammoth from 'mammoth';

interface FilePreviewPageProps {
  params: Promise<{ fileId: string }>;
}

// File Preview Component
function FilePreview({
  mimeType,
  previewUrl,
  fileName,
}: {
  mimeType: string;
  previewUrl: string;
  fileName: string;
}) {
  const isImage = mimeType.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';
  const isDocx = mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  if (isImage) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/20 p-4">
        <img
          src={previewUrl}
          alt={fileName}
          className="max-w-full max-h-full object-contain rounded-lg"
          onError={(e) => {
            console.error('Failed to load image preview');
            e.currentTarget.style.display = 'none';
          }}
        />
      </div>
    );
  }

  if (isPdf) {
    return (
      <div className="w-full h-full bg-muted/20">
        <iframe
          src={previewUrl}
          className="w-full h-full border-0"
          title={fileName}
          onError={(e) => {
            console.error('Failed to load PDF preview');
          }}
        />
      </div>
    );
  }

  if (isDocx) {
    return <DocxPreview previewUrl={previewUrl} fileName={fileName} />;
  }

  return null;
}

// DOCX Preview Component using mammoth
function DocxPreview({ previewUrl, fileName }: { previewUrl: string; fileName: string }) {
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function convertDocx() {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch the DOCX file as a blob
        const response = await fetch(previewUrl);
        if (!response.ok) {
          throw new Error('Failed to fetch DOCX file');
        }

        const arrayBuffer = await response.arrayBuffer();

        // Convert DOCX to HTML using mammoth
        const result = await mammoth.convertToHtml({ arrayBuffer });

        setHtmlContent(result.value);
        if (result.messages.length > 0) {
          console.warn('Mammoth conversion warnings:', result.messages);
        }
      } catch (err) {
        console.error('Failed to convert DOCX:', err);
        setError(err instanceof Error ? err.message : 'Failed to load DOCX preview');
      } finally {
        setIsLoading(false);
      }
    }

    convertDocx();
  }, [previewUrl]);

  if (isLoading) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-muted/50 to-muted/20 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Loading DOCX preview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-muted/50 to-muted/20 flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-md">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <div>
            <p className="text-sm font-500 text-foreground mb-2">Preview Error</p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!htmlContent) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-muted/50 to-muted/20 flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-md">
          <FileText className="w-16 h-16 text-muted-foreground mx-auto" />
          <div>
            <p className="text-sm font-500 text-foreground mb-2">No Preview Available</p>
            <p className="text-xs text-muted-foreground">
              Unable to generate preview for this DOCX file. Please download to view.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-white overflow-auto p-8">
      <div
        className="max-w-none [&_p]:mb-4 [&_p]:text-sm [&_p]:leading-relaxed [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-4 [&_li]:mb-1 [&_strong]:font-semibold [&_em]:italic [&_table]:border-collapse [&_table]:w-full [&_table]:mb-4 [&_th]:border [&_th]:border-gray-300 [&_th]:px-4 [&_th]:py-2 [&_th]:bg-gray-100 [&_td]:border [&_td]:border-gray-300 [&_td]:px-4 [&_td]:py-2"
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    </div>
  );
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

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

        // Fetch preview URL if file is previewable (after setting file state)
        const fileData = fileResult.data;
        if (fileData) {
          const mimeType = fileData.mime_type;
          if (mimeType) {
            const isImage = mimeType.startsWith('image/');
            const isPdf = mimeType === 'application/pdf';
            const isDocx = mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

            if (isImage || isPdf || isDocx) {
              setIsLoadingPreview(true);
              try {
                const previewResult = await getDownloadUrlAction({
                  fileId: fileData.id,
                  forceDownload: false,
                });

                if (previewResult.success && previewResult.data?.signedUrl) {
                  setPreviewUrl(previewResult.data.signedUrl);
                }
              } catch (err) {
                console.error('Failed to fetch preview URL:', err);
              } finally {
                setIsLoadingPreview(false);
              }
            }
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
                {isLoadingPreview ? (
                  <div className="w-full h-full bg-gradient-to-br from-muted/50 to-muted/20 flex items-center justify-center">
                    <div className="text-center space-y-4">
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto" />
                      <p className="text-sm text-muted-foreground">Loading preview...</p>
                    </div>
                  </div>
                ) : previewUrl && file.mime_type ? (
                  <FilePreview
                    mimeType={file.mime_type}
                    previewUrl={previewUrl}
                    fileName={file.name}
                  />
                ) : (
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
                )}
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
