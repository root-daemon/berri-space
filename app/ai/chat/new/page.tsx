'use client';

import React, { useState, useRef, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ChatInput } from '@/components/chat-input';
import { createConversationAction, addMessageAction } from '@/lib/ai/chat-actions';
import type { MentionedFile, ChatContext } from '@/lib/ai/chat-types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function NewChatPage() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [mentionedFiles, setMentionedFiles] = useState<MentionedFile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    setError(null);
    setIsLoading(true);

    // Add user message to UI immediately
    const userMsgId = `user-${Date.now()}`;
    setMessages((prev) => [...prev, { id: userMsgId, role: 'user', content: text }]);
    setInput('');

    const fileIds = mentionedFiles.map((f) => f.fileId);
    setMentionedFiles([]);

    try {
      // Create the conversation with the first message
      const createResult = await createConversationAction(text, fileIds);

      if (!createResult.success) {
        throw new Error(createResult.error);
      }

      const conversationId = createResult.data.conversationId;

      // Now call the chat API to get the AI response (SSE stream)
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: [{ role: 'user', content: text }],
          fileIds,
          conversationId,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to get response');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let assistantContent = '';
      let buffer = '';
      const assistantMsgId = `assistant-${Date.now()}`;

      setMessages((prev) => [...prev, { id: assistantMsgId, role: 'assistant', content: '' }]);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE: events separated by "\n\n", each "data: <json>\n" or "data: [DONE]\n"
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const raw of events) {
            const line = raw.trim();
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') continue;

            try {
              const part = JSON.parse(payload) as {
                type?: string;
                delta?: string;
                errorText?: string;
              };
              if (part.type === 'text-delta' && typeof part.delta === 'string') {
                assistantContent += part.delta;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, content: assistantContent } : m
                  )
                );
              } else if (part.type === 'error' && typeof part.errorText === 'string') {
                throw new Error(part.errorText);
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }

        // Process remaining buffer
        const remaining = buffer.trim();
        if (remaining.startsWith('data:') && remaining !== 'data: [DONE]') {
          try {
            const part = JSON.parse(remaining.slice(5).trim()) as {
              type?: string;
              delta?: string;
            };
            if (part.type === 'text-delta' && typeof part.delta === 'string') {
              assistantContent += part.delta;
            }
          } catch {
            /* ignore */
          }
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: assistantContent } : m
          )
        );
      } catch (streamError) {
        console.error('Stream error:', streamError);
        throw streamError instanceof Error
          ? streamError
          : new Error('Failed to read stream response');
      }

      await addMessageAction(conversationId, 'assistant', assistantContent);

      // Hand off to [chatId] so it can render immediately without a loading flash
      const title =
        text.length > 50 ? text.substring(0, 47) + '...' : text;
      const handoffKey = `ai-chat-handoff-${conversationId}`;
      try {
        sessionStorage.setItem(
          handoffKey,
          JSON.stringify({ conversationId, title, messages })
        );
      } catch {
        /* ignore */
      }
      router.replace(`/ai/chat/${conversationId}`);
    } catch (err) {
      console.error('Chat error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      // Remove the user message on error
      setMessages((prev) => prev.filter((m) => m.id !== userMsgId));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <AppHeader
        breadcrumbs={[
          { label: 'AI History', href: '/ai/history' },
          { label: 'New Chat' },
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
                <h1 className="text-xl font-500 text-foreground">
                  New Chat
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
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-lg font-500 text-foreground mb-2">
                  Start a new conversation
                </h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  Ask questions about your documents. Use @ to mention specific files
                  and focus the AI's answers on those documents.
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
                    {message.content || (isLoading && message.role === 'assistant' ? '...' : '')}
                  </p>
                </div>
              </div>
            ))}

            {isLoading && messages.length > 0 && messages[messages.length - 1]?.role === 'user' && (
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
              disabled={isLoading}
              placeholder="Ask a question about your documents..."
            />
          </div>
        </div>
      </div>
    </>
  );
}
