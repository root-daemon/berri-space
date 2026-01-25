'use client';

import React, { useState, useRef, useEffect, FormEvent, use } from 'react';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ChatInput } from '@/components/chat-input';
import { getConversationAction, addMessageAction } from '@/lib/ai/chat-actions';
import type { MentionedFile, ConversationWithMessages } from '@/lib/ai/chat-types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function AIChatDetailPage({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = use(params);
  const router = useRouter();

  const [input, setInput] = useState('');
  const [mentionedFiles, setMentionedFiles] = useState<MentionedFile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<ConversationWithMessages | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load conversation on mount
  useEffect(() => {
    loadConversation();
  }, [chatId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const loadConversation = async () => {
    const handoffKey = `ai-chat-handoff-${chatId}`;
    const raw =
      typeof window !== 'undefined' ? sessionStorage.getItem(handoffKey) : null;

    if (raw) {
      try {
        const { title, messages: handoffMessages } = JSON.parse(raw) as {
          title?: string;
          messages: Message[];
        };
        sessionStorage.removeItem(handoffKey);
        setConversation({
          id: chatId,
          title: title ?? 'Chat',
          createdAt: new Date(),
          updatedAt: new Date(),
          messages: handoffMessages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            mentionedFileIds: [] as string[],
            createdAt: new Date(),
          })),
        });
        setMessages(
          handoffMessages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
          }))
        );
        setError(null);
        setLoading(false);
        return;
      } catch {
        /* invalid handoff, fall through to fetch */
      }
    }

    setLoading(true);
    setError(null);

    try {
      const result = await getConversationAction(chatId);

      if (result.success) {
        setConversation(result.data);
        setMessages(
          result.data.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
          }))
        );
      } else {
        setError(result.error);
        if (result.code === 'NOT_FOUND') {
          router.push('/ai/history');
        }
      }
    } catch (err) {
      console.error('Load error:', err);
      setError('Failed to load conversation');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    console.warn('[Chat Stream] 1. onSubmit invoked (sync)');
    e.preventDefault();
    const text = input.trim();
    if (!text || isSubmitting) {
      console.warn('[Chat Stream] 2. early return', { hasText: !!text, isSubmitting });
      return;
    }
    console.warn('[Chat Stream] 3. past early return');

    setError(null);
    setIsSubmitting(true);

    // Add user message to UI immediately
    const userMsgId = `user-${Date.now()}`;
    setMessages((prev) => [...prev, { id: userMsgId, role: 'user', content: text }]);
    setInput('');

    const fileIds = mentionedFiles.map((f) => f.fileId);
    setMentionedFiles([]);

    try {
      console.warn('[Chat Stream] 4. calling addMessageAction');
      // Save user message to database
      await addMessageAction(chatId, 'user', text, fileIds);
      console.warn('[Chat Stream] 5. addMessageAction done');

      // Build messages array for API (include history for context)
      const apiMessages = [...messages, { role: 'user' as const, content: text }].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Call the chat API to get the AI response
      const log = (msg: string, data?: unknown) =>
        console.log(`[Chat Stream] ${msg}`, data ?? '');

      log('fetch start', {
        messagesCount: apiMessages.length,
        fileIdsCount: fileIds.length,
        conversationId: chatId,
      });

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

      log('fetch done', {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get('content-type'),
        hasBody: !!response.body,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        log('fetch error response', errData);
        throw new Error(errData.error || 'Failed to get response');
      }

      // Read the streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        log('no response body');
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let assistantContent = '';
      let buffer = '';
      const assistantMsgId = `assistant-${Date.now()}`;
      let chunkIndex = 0;

      // Add assistant message placeholder
      setMessages((prev) => [...prev, { id: assistantMsgId, role: 'assistant', content: '' }]);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            log('stream done', { bufferLength: buffer.length, assistantLength: assistantContent.length });
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          chunkIndex += 1;
          if (chunkIndex <= 3) {
            log(`chunk ${chunkIndex} raw`, {
              length: chunk.length,
              preview: chunk.slice(0, 200).replace(/\n/g, '\\n'),
            });
          }

          // SSE format: events separated by "\n\n", each "data: <json>\n" or "data: [DONE]\n"
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const raw of events) {
            const line = raw.trim();
            if (!line.startsWith('data:')) {
              if (line && chunkIndex <= 2) log('skip non-data line', { preview: line.slice(0, 80) });
              continue;
            }
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') {
              log('saw [DONE]');
              continue;
            }

            try {
              const part = JSON.parse(payload) as {
                type?: string;
                delta?: string;
                errorText?: string;
              };
              if (chunkIndex <= 2 && events.indexOf(raw) < 2) {
                log('parsed part', { type: part.type, deltaLen: part.delta?.length });
              }
              if (part.type === 'text-delta' && typeof part.delta === 'string') {
                assistantContent += part.delta;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, content: assistantContent } : m
                  )
                );
              } else if (part.type === 'error' && typeof part.errorText === 'string') {
                log('stream error part', { errorText: part.errorText });
                throw new Error(part.errorText);
              }
            } catch (e) {
              if (e instanceof SyntaxError) {
                if (chunkIndex <= 2) log('parse skip', { payloadPreview: payload.slice(0, 60) });
                continue;
              }
              throw e;
            }
          }
        }

        // Process remaining buffer (incomplete event)
        const remaining = buffer.trim();
        if (remaining) {
          log('remaining buffer', { length: remaining.length, preview: remaining.slice(0, 120) });
        }
        if (remaining.startsWith('data:') && remaining !== 'data: [DONE]') {
          const payload = remaining.slice(5).trim();
          try {
            const part = JSON.parse(payload) as { type?: string; delta?: string };
            if (part.type === 'text-delta' && typeof part.delta === 'string') {
              assistantContent += part.delta;
              log('remaining had text-delta', { deltaLen: part.delta.length });
            }
          } catch {
            // ignore
          }
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: assistantContent } : m
          )
        );

        log('stream complete', {
          assistantContentLength: assistantContent.length,
          assistantPreview: assistantContent.slice(0, 100),
        });
      } catch (streamError) {
        console.error('[Chat Stream] stream error', streamError);
        throw streamError instanceof Error
          ? streamError
          : new Error('Failed to read stream response');
      }

      // Save the assistant message to the database
      await addMessageAction(chatId, 'assistant', assistantContent);
    } catch (err) {
      console.error('[Chat Stream] submit error', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      // Remove the user message on error
      setMessages((prev) => prev.filter((m) => m.id !== userMsgId));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <>
        <AppHeader
          breadcrumbs={[
            { label: 'AI History', href: '/ai/history' },
            { label: 'Chat' },
          ]}
        />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

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
                    {message.content || (isSubmitting && message.role === 'assistant' ? '...' : '')}
                  </p>
                </div>
              </div>
            ))}

            {isSubmitting && messages.length > 0 && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex justify-start">
                <div className="bg-muted/60 text-foreground px-4 py-3 rounded-lg">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
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
              onRemoveMention={(fileId) => setMentionedFiles(mentionedFiles.filter((f) => f.fileId !== fileId))}
              disabled={isSubmitting}
              placeholder="Ask a question about your documents..."
            />
          </div>
        </div>
      </div>
    </>
  );
}
