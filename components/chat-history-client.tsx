'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppHeader } from '@/components/app-header';
import { MessageCircle, Clock, ArrowRight, Plus, Trash2, AlertCircle, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
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
import { listConversationsAction, deleteConversationAction } from '@/lib/ai/chat-actions';
import type { ConversationSummary } from '@/lib/ai/chat-types';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const chatQueryKeys = {
  all: ['chat'] as const,
  conversations: () => [...chatQueryKeys.all, 'conversations'] as const,
  conversation: (id: string) => [...chatQueryKeys.all, 'conversation', id] as const,
};

// ============================================================================
// TYPES
// ============================================================================

interface ChatHistoryClientProps {
  /** Initial conversations from SSR */
  initialConversations: ConversationSummary[];
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ChatHistoryClient({ initialConversations }: ChatHistoryClientProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Query for conversations - seeded with SSR data
  const {
    data: conversations = [],
    isError,
    refetch,
  } = useQuery({
    queryKey: chatQueryKeys.conversations(),
    queryFn: async () => {
      const result = await listConversationsAction();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    initialData: initialConversations,
    staleTime: 60 * 1000, // Consider data fresh for 1 minute
    refetchOnMount: false, // Don't refetch on mount - we have SSR data
  });

  // Delete mutation with optimistic update
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteConversationAction(id);
      if (!result.success) throw new Error(result.error);
      return id;
    },
    // Optimistic update - remove from list immediately
    onMutate: async (id) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: chatQueryKeys.conversations() });

      // Snapshot the previous value
      const previousConversations = queryClient.getQueryData<ConversationSummary[]>(
        chatQueryKeys.conversations()
      );

      // Optimistically update to remove the conversation
      queryClient.setQueryData<ConversationSummary[]>(
        chatQueryKeys.conversations(),
        (old) => old?.filter((c) => c.id !== id) ?? []
      );

      // Return context with the snapshot
      return { previousConversations };
    },
    // If the mutation fails, roll back to the previous value
    onError: (_err, _id, context) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(
          chatQueryKeys.conversations(),
          context.previousConversations
        );
      }
    },
    // Always refetch after error or success
    onSettled: () => {
      setDeleteId(null);
    },
  });

  const handleDelete = () => {
    if (!deleteId) return;
    deleteMutation.mutate(deleteId);
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Error state
  if (isError) {
    return (
      <>
        <AppHeader breadcrumbs={[{ label: 'AI Chat History' }]} />
        <div className="flex-1 overflow-auto">
          <div className="p-8 max-w-4xl">
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <AlertCircle className="w-12 h-12 text-destructive" />
              <p className="text-muted-foreground">Failed to load conversations</p>
              <Button variant="outline" onClick={() => refetch()} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Try Again
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader breadcrumbs={[{ label: 'AI Chat History' }]} />

      <div className="flex-1 overflow-auto">
        <div className="p-8 max-w-4xl">
          {/* Header */}
          <div className="mb-8 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <MessageCircle className="w-6 h-6 text-primary" />
                <h1 className="text-4xl font-500 text-foreground tracking-tight">
                  Chat History
                </h1>
              </div>
              <p className="text-sm text-muted-foreground mt-2 font-400">
                View and continue your AI conversations
              </p>
            </div>

            <Link href="/ai/chat/new">
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                New Chat
              </Button>
            </Link>
          </div>

          {/* Empty state */}
          {conversations.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <MessageCircle className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-500 text-foreground mb-2">
                No conversations yet
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Start a new chat to ask questions about your documents
              </p>
              <Link href="/ai/chat/new">
                <Button>Start a conversation</Button>
              </Link>
            </div>
          )}

          {/* Chat List */}
          {conversations.length > 0 && (
            <div className="space-y-2">
              {conversations.map((chat) => (
                <div
                  key={chat.id}
                  className="bg-card rounded-xl p-5 border border-transparent hover:border-primary/10 hover:shadow-lg transition-all duration-200 ease-out group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <Link href={`/ai/chat/${chat.id}`} className="flex-1 min-w-0">
                      <div className="cursor-pointer">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base font-500 text-foreground group-hover:text-primary transition-colors duration-200 truncate">
                              {chat.title}
                            </h3>
                            <p className="text-xs text-muted-foreground mt-1.5 font-400 line-clamp-2">
                              {chat.preview || 'No preview available'}
                            </p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-all duration-200 flex-shrink-0 mt-1 group-hover:translate-x-1" />
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {chat.messageCount} message
                            {chat.messageCount !== 1 ? 's' : ''}
                          </span>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="w-3.5 h-3.5" />
                            <span className="font-400">{formatTime(chat.updatedAt)}</span>
                          </div>
                        </div>
                      </div>
                    </Link>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.preventDefault();
                        setDeleteId(chat.id);
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Info Box */}
          {conversations.length > 0 && (
            <div className="mt-8 bg-muted/20 p-4 rounded-lg border border-border/20 text-center">
              <p className="text-xs text-muted-foreground font-400">
                Showing {conversations.length} conversation
                {conversations.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this conversation and all its messages.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
