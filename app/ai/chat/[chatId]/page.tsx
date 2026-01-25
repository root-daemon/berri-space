import { Suspense } from 'react';
import { ChatDetailClient } from '@/components/chat-detail-client';
import { loadConversation } from '@/lib/ai/loaders';

// Force dynamic rendering - this page requires authentication
export const dynamic = 'force-dynamic';

interface ChatDetailPageProps {
  params: Promise<{ chatId: string }>;
}

/**
 * Chat Detail Page - Server Component
 *
 * This page SSR-loads the conversation data and passes it to the client.
 * Streaming responses are handled client-side with batched state updates.
 *
 * Benefits:
 * - No loading spinner on initial page load
 * - Conversation content is rendered immediately
 * - Streaming updates are batched to reduce re-renders
 */
export default async function ChatDetailPage({ params }: ChatDetailPageProps) {
  const { chatId } = await params;

  // Check for sessionStorage handoff data from new chat page
  // This is handled client-side, so we still fetch server-side as fallback
  const conversation = await loadConversation(chatId);

  return (
    <Suspense fallback={null}>
      <ChatDetailClient
        conversation={conversation}
        chatId={chatId}
        error={!conversation ? 'Conversation not found' : null}
      />
    </Suspense>
  );
}
