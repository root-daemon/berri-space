/**
 * Server-side Data Loaders for AI Chat Pages
 *
 * These functions are optimized for SSR - they run only on the server
 * and avoid the overhead of server actions.
 *
 * IMPORTANT: Only import this file in Server Components.
 */

import { cache } from 'react';
import { getServerSupabaseClient } from '@/lib/supabase/server';
import { getCurrentUser, getCurrentOrganization } from '@/lib/auth';
import type { ConversationWithMessages, ConversationSummary } from './chat-types';

// ============================================================================
// CONVERSATION DETAIL
// ============================================================================

/**
 * Loads a conversation with its messages.
 * Uses React.cache() for per-request deduplication.
 */
export const loadConversation = cache(
  async (chatId: string): Promise<ConversationWithMessages | null> => {
    const user = await getCurrentUser();
    const supabase = getServerSupabaseClient();

    const { data, error } = await supabase
      .from('chat_conversations')
      .select(
        `
        id,
        title,
        created_at,
        updated_at,
        chat_messages (
          id,
          role,
          content,
          mentioned_file_ids,
          created_at
        )
      `
      )
      .eq('id', chatId)
      .eq('user_id', user.id)
      .order('created_at', { referencedTable: 'chat_messages', ascending: true })
      .single();

    if (error || !data) {
      console.error('loadConversation error:', error);
      return null;
    }

    // Type assertion for the nested data
    const messages = (data.chat_messages as Array<{
      id: string;
      role: string;
      content: string;
      mentioned_file_ids: string[] | null;
      created_at: string;
    }>) || [];

    return {
      id: data.id,
      title: data.title,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        mentionedFileIds: m.mentioned_file_ids || [],
        createdAt: new Date(m.created_at),
      })),
    };
  }
);

// ============================================================================
// CONVERSATION LIST
// ============================================================================

/**
 * Loads all conversations for the current user.
 * Uses React.cache() for per-request deduplication.
 */
export const loadConversations = cache(
  async (): Promise<ConversationSummary[]> => {
    const user = await getCurrentUser();
    const { organization } = await getCurrentOrganization();
    const supabase = getServerSupabaseClient();

    const { data, error } = await supabase
      .from('chat_conversations')
      .select(
        `
        id,
        title,
        created_at,
        updated_at,
        chat_messages (
          id,
          content,
          role
        )
      `
      )
      .eq('user_id', user.id)
      .eq('organization_id', organization.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('loadConversations error:', error);
      return [];
    }

    return (data || []).map((conv) => {
      const messages = (conv.chat_messages as Array<{
        id: string;
        content: string;
        role: string;
      }>) || [];

      // Get preview from the first user message
      const firstUserMessage = messages.find((m) => m.role === 'user');
      const preview = firstUserMessage?.content?.slice(0, 100) || '';

      return {
        id: conv.id,
        title: conv.title,
        messageCount: messages.length,
        preview,
        createdAt: new Date(conv.created_at),
        updatedAt: new Date(conv.updated_at),
      };
    });
  }
);
