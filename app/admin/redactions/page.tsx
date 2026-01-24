'use client';

import React, { useState, useEffect } from 'react';
import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  AlertCircle,
  FileText,
  Shield,
  Search,
  X,
  Check,
  Loader2,
  Trash2,
  Eye,
  EyeOff,
  AlertTriangle,
} from 'lucide-react';
import {
  listDocumentsForRedactionAction,
  getDocumentRawTextAction,
  getDocumentRedactionsAction,
  createRedactionAction,
  deleteRedactionAction,
  detectPiiAction,
  findRegexMatchesAction,
  commitRedactionsAction,
  type DocumentForRedaction,
  type DocumentRawText,
  type DocumentRedactionsResult,
} from '@/lib/admin/redactions/actions';
import { RedactionDefinition } from '@/lib/ai/types';
import type { DocumentRedactionWithId } from '@/lib/admin/redactions/actions';
import { getRedactionPreview } from '@/lib/ai/redaction';
import { useToast } from '@/hooks/use-toast';

// Helper to render text with redaction highlights
function renderTextWithRedactions(
  text: string,
  redactions: DocumentRedactionWithId[]
): React.ReactNode {
  if (redactions.length === 0) {
    return <>{text}</>;
  }

  // Sort redactions by start offset
  const sorted = [...redactions].sort((a, b) => a.startOffset - b.startOffset);
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const redaction of sorted) {
    // Add text before redaction
    if (redaction.startOffset > lastIndex) {
      parts.push(
        <span key={`text-${lastIndex}`}>
          {text.substring(lastIndex, redaction.startOffset)}
        </span>
      );
    }

    // Add redacted text (highlighted)
    parts.push(
      <span
        key={`redaction-${redaction.id}`}
        className="bg-red-500/30 text-red-700"
      >
        {text.substring(redaction.startOffset, redaction.endOffset)}
      </span>
    );

    lastIndex = redaction.endOffset;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(<span key={`text-${lastIndex}`}>{text.substring(lastIndex)}</span>);
  }

  return <>{parts}</>;
}

export default function AdminRedactionsPage() {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<DocumentForRedaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [rawText, setRawText] = useState<DocumentRawText | null>(null);
  const [redactions, setRedactions] = useState<DocumentRedactionWithId[]>([]);
  const [canEdit, setCanEdit] = useState(true);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [selectedText, setSelectedText] = useState<{ start: number; end: number } | null>(null);
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [loadingText, setLoadingText] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Load documents
  useEffect(() => {
    loadDocuments();
  }, []);

  // Load document details when selected
  useEffect(() => {
    if (selectedDoc) {
      loadDocumentDetails(selectedDoc);
    }
  }, [selectedDoc]);

  async function loadDocuments() {
    setLoading(true);
    try {
      const result = await listDocumentsForRedactionAction();
      if (result.success) {
        setDocuments(result.data);
        if (result.data.length === 0) {
          toast({
            title: 'No documents found',
            description: 'No extractable documents found, or you may not have admin access to any documents.',
            variant: 'default',
          });
        }
      } else {
        console.error('[AdminRedactionsPage] Error loading documents:', result);
        toast({
          title: 'Error loading documents',
          description: result.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('[AdminRedactionsPage] Unexpected error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load documents',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function loadDocumentDetails(fileId: string) {
    setLoadingText(true);
    setRawText(null);
    setRedactions([]);

    const [textResult, redactionsResult] = await Promise.all([
      getDocumentRawTextAction(fileId),
      getDocumentRedactionsAction(fileId),
    ]);

    if (textResult.success) {
      setRawText(textResult.data);
    } else {
      toast({
        title: 'Error loading text',
        description: textResult.error,
        variant: 'destructive',
      });
    }

    if (redactionsResult.success) {
      setRedactions(redactionsResult.data.redactions);
      setCanEdit(redactionsResult.data.canEdit);
      setProcessingStatus(redactionsResult.data.processingStatus);
    } else {
      toast({
        title: 'Error loading redactions',
        description: redactionsResult.error,
        variant: 'destructive',
      });
    }

    setLoadingText(false);
  }

  async function handleDetectPii() {
    if (!selectedDoc) return;

    const result = await detectPiiAction(selectedDoc);
    if (result.success) {
      // Add suggested redactions (user can review before adding)
      toast({
        title: 'PII Detection',
        description: `Found ${result.data.length} potential PII matches. Review and add redactions.`,
      });
      // For now, auto-add them (in production, show a review dialog)
      for (const redaction of result.data) {
        await handleCreateRedaction(redaction);
      }
    } else {
      toast({
        title: 'Error',
        description: result.error,
        variant: 'destructive',
      });
    }
  }

  async function handleFindRegex(pattern: string) {
    if (!selectedDoc || !pattern.trim()) return;

    const result = await findRegexMatchesAction(selectedDoc, pattern);
    if (result.success) {
      toast({
        title: 'Regex Search',
        description: `Found ${result.data.length} matches.`,
      });
      for (const redaction of result.data) {
        await handleCreateRedaction(redaction);
      }
    } else {
      toast({
        title: 'Error',
        description: result.error,
        variant: 'destructive',
      });
    }
  }

  async function handleCreateRedaction(redaction: RedactionDefinition) {
    if (!selectedDoc) return;

    const result = await createRedactionAction(selectedDoc, redaction);
    if (result.success) {
      toast({
        title: 'Success',
        description: 'Redaction added',
      });
      // Reload redactions
      const redactionsResult = await getDocumentRedactionsAction(selectedDoc);
      if (redactionsResult.success) {
        setRedactions(redactionsResult.data.redactions);
      }
    } else {
      toast({
        title: 'Error',
        description: result.error,
        variant: 'destructive',
      });
    }
  }

  async function handleDeleteRedaction(redactionId: string) {
    if (!selectedDoc) return;

    const result = await deleteRedactionAction(selectedDoc, redactionId);
    if (result.success) {
      toast({
        title: 'Success',
        description: 'Redaction removed',
      });
      // Reload redactions
      const redactionsResult = await getDocumentRedactionsAction(selectedDoc);
      if (redactionsResult.success) {
        setRedactions(redactionsResult.data.redactions);
      }
    } else {
      toast({
        title: 'Error',
        description: result.error,
        variant: 'destructive',
      });
    }
  }

  async function handleCommit() {
    if (!selectedDoc) return;

    const result = await commitRedactionsAction(selectedDoc);
    if (result.success) {
      toast({
        title: 'Success',
        description: 'Redactions committed. Raw text has been permanently deleted.',
      });
      setShowCommitDialog(false);
      // Reload everything
      await loadDocuments();
      await loadDocumentDetails(selectedDoc);
    } else {
      toast({
        title: 'Error',
        description: result.error,
        variant: 'destructive',
      });
    }
  }

  function handleTextSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !rawText) {
      setSelectedText(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const textContainer = document.getElementById('document-text');
    if (!textContainer || !textContainer.contains(range.startContainer)) {
      setSelectedText(null);
      return;
    }

    // Get selected text
    const selectedText = selection.toString();
    if (!selectedText || selectedText.trim().length === 0) {
      setSelectedText(null);
      return;
    }

    // Calculate offsets in the original text
    // The text container contains the original text with spans for highlighting
    const textBefore = textContainer.textContent?.substring(0, range.startOffset) || '';
    const start = textBefore.length;
    const end = start + selectedText.length;

    if (start < end && end <= rawText.content.length) {
      setSelectedText({ start, end });
    } else {
      setSelectedText(null);
    }
  }

  function handleAddManualRedaction() {
    if (!selectedText || !rawText) return;

    if (selectedText.start >= selectedText.end || selectedText.end > rawText.content.length) {
      toast({
        title: 'Invalid selection',
        description: 'Please select valid text to redact',
        variant: 'destructive',
      });
      return;
    }

    const redaction: RedactionDefinition = {
      type: 'manual',
      startOffset: selectedText.start,
      endOffset: selectedText.end,
    };

    handleCreateRedaction(redaction);
    setSelectedText(null);
    window.getSelection()?.removeAllRanges();
  }

  const filteredDocuments = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const previewText = rawText
    ? getRedactionPreview(
        rawText.content,
        redactions.map((r) => ({
          type: r.type,
          startOffset: r.startOffset,
          endOffset: r.endOffset,
          pattern: r.pattern,
          semanticLabel: r.semanticLabel,
        })),
        '[REDACTED]'
      )
    : '';

  return (
    <>
      <AppHeader breadcrumbs={[{ label: 'Admin' }, { label: 'Redactions' }]} />

      <div className="flex-1 overflow-auto">
        <div className="p-8 max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <Shield className="w-6 h-6 text-primary" />
              <h1 className="text-4xl font-500 text-foreground tracking-tight">
                Document Redaction Management
              </h1>
            </div>
            <p className="text-sm text-muted-foreground mt-2 font-400">
              Manage redactions for PDF documents. Redactions permanently remove content before AI processing.
            </p>
          </div>

          {/* Warning Banner */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-8 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-500 text-amber-900">Irreversible Operation</p>
              <p className="text-xs text-amber-800 mt-1">
                Once redactions are committed, the raw text is permanently deleted and cannot be recovered.
                Review all redactions carefully before committing.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Documents List */}
            <div className="lg:col-span-1">
              <div className="bg-card rounded-xl border border-border/20 overflow-hidden">
                <div className="p-4 border-b border-border/20">
                  <div className="flex items-center gap-2 mb-4">
                    <Search className="w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search documents..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-600 text-foreground">Documents</h2>
                    <Badge variant="outline" className="text-xs">
                      {filteredDocuments.length}
                    </Badge>
                  </div>
                </div>

                <div className="max-h-[600px] overflow-y-auto">
                  {loading ? (
                    <div className="p-8 text-center">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                    </div>
                  ) : filteredDocuments.length === 0 ? (
                    <div className="p-8 text-center space-y-2">
                      <p className="text-sm text-muted-foreground">
                        {searchTerm
                          ? 'No documents match your search'
                          : 'No extractable documents found'}
                      </p>
                      {!searchTerm && (
                        <p className="text-xs text-muted-foreground">
                          Only PDF, DOCX, and text files are shown. You need admin access to manage redactions.
                        </p>
                      )}
                    </div>
                  ) : (
                    filteredDocuments.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => setSelectedDoc(doc.id)}
                        className={`w-full text-left p-4 hover:bg-primary/3 transition-colors border-b border-border/20 last:border-b-0 ${
                          selectedDoc === doc.id ? 'bg-primary/5' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-500 text-foreground truncate">
                              {doc.name}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              {doc.hasRawText ? (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-green-500/10 text-green-700 border-green-500/20"
                                >
                                  Extracted
                                </Badge>
                              ) : doc.committedAt ? (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-blue-500/10 text-blue-700 border-blue-500/20"
                                >
                                  Committed
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-gray-500/10 text-gray-700 border-gray-500/20"
                                >
                                  {doc.processingStatus || 'Not processed'}
                                </Badge>
                              )}
                              {doc.redactionCount > 0 && (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-red-500/10 text-red-700 border-red-500/20"
                                >
                                  {doc.redactionCount} redactions
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Document Editor */}
            <div className="lg:col-span-2">
              {selectedDoc ? (
                <div className="bg-card rounded-xl border border-border/20 overflow-hidden">
                  {loadingText ? (
                    <div className="p-8 text-center">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                    </div>
                  ) : rawText ? (
                    <>
                      {/* Toolbar */}
                      <div className="p-4 border-b border-border/20 bg-muted/20">
                        {rawText.isCommitted && (
                          <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                              <div className="flex-1">
                                <p className="text-xs font-500 text-blue-900">
                                  Document Committed
                                </p>
                                <p className="text-xs text-blue-800 mt-1">
                                  This document has been committed. Raw text was permanently deleted.
                                  You are viewing the AI-safe text (post-redaction). Redactions cannot be modified.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h2 className="text-sm font-600 text-foreground">
                              {documents.find((d) => d.id === selectedDoc)?.name}
                            </h2>
                            <p className="text-xs text-muted-foreground mt-1">
                              {rawText.characterCount.toLocaleString()} characters •{' '}
                              {redactions.length} redactions
                              {rawText.isCommitted && ' • Committed (Read-only)'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {canEdit && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={handleDetectPii}
                                  disabled={!canEdit}
                                >
                                  Detect PII
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const pattern = prompt('Enter regex pattern:');
                                    if (pattern) handleFindRegex(pattern);
                                  }}
                                  disabled={!canEdit}
                                >
                                  Find Regex
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => setShowCommitDialog(true)}
                                  disabled={!canEdit || redactions.length === 0}
                                >
                                  Commit Redactions
                                </Button>
                              </>
                            )}
                            {!canEdit && (
                              <Badge variant="outline" className="text-xs">
                                Committed - Read Only
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Redactions List */}
                        {redactions.length > 0 && (
                          <div className="mt-4 space-y-2">
                            <p className="text-xs font-600 text-muted-foreground uppercase">
                              Active Redactions ({redactions.length})
                            </p>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                              {redactions.map((redaction, idx) => {
                                const text = rawText.content.substring(
                                  redaction.startOffset,
                                  redaction.endOffset
                                );
                                return (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between p-2 bg-red-500/10 rounded text-xs"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <span className="font-500">{redaction.type}</span>
                                      <span className="text-muted-foreground ml-2">
                                        {redaction.startOffset}-{redaction.endOffset}
                                      </span>
                                      <span className="text-muted-foreground ml-2 truncate">
                                        "{text.substring(0, 30)}..."
                                      </span>
                                    </div>
                                    {canEdit && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 w-6 p-0"
                                        onClick={() => handleDeleteRedaction(redaction.id)}
                                      >
                                        <X className="w-3 h-3" />
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                        {/* Text Editor */}
                        <div className="p-4 space-y-4">
                          {/* Original Text with Selection */}
                          <div>
                            <Label className="text-xs font-600 text-muted-foreground uppercase mb-2 block">
                              {rawText.isCommitted
                                ? 'AI-Safe Text (post-redaction, read-only)'
                                : 'Original Text (select text to redact)'}
                            </Label>
                          <div
                            id="document-text"
                            className={`bg-muted/20 rounded-lg p-4 max-h-[400px] overflow-y-auto text-sm font-mono whitespace-pre-wrap border border-border/20 relative ${
                              rawText.isCommitted ? '' : 'select-text'
                            }`}
                            onMouseUp={rawText.isCommitted ? undefined : handleTextSelection}
                            onKeyUp={rawText.isCommitted ? undefined : handleTextSelection}
                          >
                            {rawText.isCommitted ? (
                              // For committed documents, show AI-safe text (no redaction highlights needed)
                              <>{rawText.content}</>
                            ) : (
                              // For uncommitted documents, show with redaction highlights
                              renderTextWithRedactions(rawText.content, redactions)
                            )}
                          </div>
                          {!rawText.isCommitted && selectedText && (
                            <div className="mt-2 text-xs text-muted-foreground">
                              Selected: {selectedText.start} - {selectedText.end} (
                              {selectedText.end - selectedText.start} chars)
                              <Button
                                size="sm"
                                className="ml-2 h-6"
                                onClick={handleAddManualRedaction}
                              >
                                Redact Selection
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Preview - only show for uncommitted documents */}
                        {!rawText.isCommitted && (
                          <div>
                            <Label className="text-xs font-600 text-muted-foreground uppercase mb-2 block">
                              Preview (AI-safe text after redactions)
                            </Label>
                            <div className="bg-muted/20 rounded-lg p-4 max-h-[200px] overflow-y-auto text-sm font-mono whitespace-pre-wrap border border-border/20">
                              {previewText}
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="p-8 text-center">
                      <p className="text-sm text-muted-foreground">
                        {processingStatus === 'committed'
                          ? 'Document has been committed. Raw text is no longer available.'
                          : 'Raw text not available. Document may need to be extracted first.'}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-card rounded-xl border border-border/20 p-8 text-center">
                  <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground">
                    Select a document to view and manage redactions
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Commit Confirmation Dialog */}
      <AlertDialog open={showCommitDialog} onOpenChange={setShowCommitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Commit Redactions?</AlertDialogTitle>
            <AlertDialogDescription>
              This action is <strong>irreversible</strong>. Once committed:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>All redactions will be permanently applied</li>
                <li>The raw text will be permanently deleted</li>
                <li>AI-safe text will be generated for indexing</li>
                <li>You will not be able to modify redactions afterward</li>
              </ul>
              <p className="mt-4 font-600">
                Are you sure you want to commit {redactions.length} redaction(s)?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCommit} className="bg-destructive">
              Commit Redactions
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
