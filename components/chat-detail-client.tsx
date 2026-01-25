'use client';

import React, { useState, useRef, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ChatInput } from '@/components/chat-input';
import { addMessageAction } from '@/lib/ai/chat-actions';
import { useChatStream } from '@/hooks/use-chat-stream';
import type { MentionedFile, ConversationWithMessages } from '@/lib/ai/chat-types';

// ============================================================================
// TYPES
// ============================================================================

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatDetailClientProps {
  /** Conversation data from SSR (null if not found) */
  conversation: ConversationWithMessages | null;
  /** Chat ID for this conversation */
  chatId: string;
  /** Error message if conversation couldn't be loaded */
  error?: string | null;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ChatDetailClient({
  conversation: initialConversation,
  chatId,
  error: initialError,
}: ChatDetailClientProps) {
  const router = useRouter();

  const [input, setInput] = useState('');
  const [mentionedFiles, setMentionedFiles] = useState<MentionedFile[]>([]);
  const [messages, setMessages] = useState<Message[]>(() =>
    initialConversation?.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
    })) || []
  );
  const [conversation] = useState(initialConversation);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError || null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Batched streaming hook
  const { streamResponse } = useChatStream({
    onUpdate: setMessages,
    onError: setError,
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Redirect to history if conversation not found
  useEffect(() => {
    if (!conversation && initialError) {
      router.push('/ai/history');
    }
  }, [conversation, initialError, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isSubmitting) return;

    setError(null);
    setIsSubmitting(true);

    // Add user message to UI immediately (optimistic)
    const userMsgId = `user-${Date.now()}`;
    setMessages((prev) => [...prev, { id: userMsgId, role: 'user', content: text }]);
    setInput('');

    const fileIds = mentionedFiles.map((f) => f.fileId);
    setMentionedFiles([]);

    try {
      // Save user message to database (fire and forget - don't block stream)
      const saveUserMessage = addMessageAction(chatId, 'user', text, fileIds);

      // Build messages array for API (include history for context)
      const apiMessages = [...messages, { role: 'user' as const, content: text }].map(
        (m) => ({
          role: m.role,
          content: m.content,
        })
      );

      // Start streaming response
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: apiMessages,
          fileIds,
          conversationId: chatId,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to get response');
      }

      // Stream with batched updates
      const assistantMsgId = `assistant-${Date.now()}`;
      const result = await streamResponse(response, assistantMsgId);

      if (!result.success) {
        throw new Error(result.error || 'Stream failed');
      }

      // Wait for user message to be saved, then save assistant message
      await saveUserMessage;
      await addMessageAction(chatId, 'assistant', result.content);
    } catch (err) {
      console.error('Chat submit error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      // Remove the user message on error
      setMessages((prev) => prev.filter((m) => m.id !== userMsgId));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Error state (not found)
  if (!conversation && error) {
    return (
      <>
        <AppHeader
          breadcrumbs={[
            { label: 'AI History', href: '/ai/history' },
            { label: 'Chat' },
          ]}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">{error}</p>
            <Link href="/ai/history">
              <Button>Back to History</Button>
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader
        breadcrumbs={[
          { label: 'AI History', href: '/ai/history' },
          { label: conversation?.title || 'Chat' },
        ]}
      />

      <div className="flex-1 overflow-auto flex flex-col">
        {/* Header */}
        <div className="border-b border-border/20 p-5 bg-background/50">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/ai/history">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 hover:bg-muted/50 transition-all duration-200"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-500 text-foreground truncate max-w-md">
                  {conversation?.title || 'AI Chat'}
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ask questions about your documents
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="max-w-4xl mx-auto p-5 space-y-4">
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground text-center">
                  Start a conversation by asking a question
                </p>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-2xl px-4 py-3 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-foreground'
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {message.content ||
                      (isSubmitting && message.role === 'assistant' ? '...' : '')}
                  </p>
                </div>
              </div>
            ))}

            {isSubmitting &&
              messages.length > 0 &&
              messages[messages.length - 1]?.role === 'user' && (
                <div className="flex justify-start">
                  <div className="bg-muted/60 text-foreground px-4 py-3 rounded-lg">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" />
                      <div
                        className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce"
                        style={{ animationDelay: '0.1s' }}
                      />
                      <div
                        className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce"
                        style={{ animationDelay: '0.2s' }}
                      />
                    </div>
                  </div>
                </div>
              )}

            {error && (
              <div className="flex justify-center">
                <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg text-sm">
                  <p>Error: {error}</p>
                </div>
              </div>
            )}

            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-border/20 p-5 bg-background/50">
          <div className="max-w-4xl mx-auto">
            <div className="text-xs text-muted-foreground mb-3 p-2.5 bg-muted/30 rounded-lg border border-border/20">
              AI answers respect document access and redactions
            </div>
            <ChatInput
              value={input}
              onChange={(v) => setInput(v)}
              onSubmit={onSubmit}
              mentionedFiles={mentionedFiles}
              onMentionFile={(file) => setMentionedFiles([...mentionedFiles, file])}
              onRemoveMention={(fileId) =>
                setMentionedFiles(mentionedFiles.filter((f) => f.fileId !== fileId))
              }
              disabled={isSubmitting}
              placeholder="Ask a question about your documents..."
            />
          </div>
        </div>
      </div>
    </>
  );
}
