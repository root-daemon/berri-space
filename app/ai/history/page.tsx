import { Suspense } from 'react';
import { ChatHistoryClient } from '@/components/chat-history-client';
import { loadConversations } from '@/lib/ai/loaders';

// Force dynamic rendering - this page requires authentication
export const dynamic = 'force-dynamic';

/**
 * Chat History Page - Server Component
 *
 * This page SSR-loads the conversation list and passes it to the client.
 * TanStack Query handles cache invalidation for deletes.
 *
 * Benefits:
 * - No loading spinner on initial page load
 * - Conversation list is rendered immediately
 * - Deletes are optimistic (instant UI feedback)
 */
export default async function ChatHistoryPage() {
  const conversations = await loadConversations();

  return (
    <Suspense fallback={null}>
      <ChatHistoryClient initialConversations={conversations} />
    </Suspense>
  );
}
