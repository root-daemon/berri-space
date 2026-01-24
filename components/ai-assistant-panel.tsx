'use client';

import React from "react"

import { useState, useRef, useEffect, FormEvent } from 'react';
import { X, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChat } from '@ai-sdk/react';
import { ChatInput } from './chat-input';
import type { MentionedFile } from '@/lib/ai/chat-types';

interface AIAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AIAssistantPanel({ isOpen, onClose }: AIAssistantPanelProps) {
  const [mentionedFiles, setMentionedFiles] = useState<MentionedFile[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, input, setInput, handleSubmit, isLoading, error } = useChat({
    api: '/api/ai/chat',
    body: {
      fileIds: mentionedFiles.map((f) => f.fileId),
    },
    initialMessages: [
      {
        id: 'welcome',
        role: 'assistant',
        content: "Hi! I'm your AI assistant. I can help you understand your documents. Type @ to mention a specific file, or just ask a question.",
      },
    ],
    onError: (error) => {
      console.error('Chat error:', error);
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!(input ?? '').trim() || isLoading) return;
    
    handleSubmit(e);
    // Clear mentions after sending
    setMentionedFiles([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 bottom-0 w-96 bg-background border-l border-border/20 shadow-2xl z-40 flex flex-col animate-in slide-in-from-right-80 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-border/20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
            <MessageCircle className="w-4 h-4 text-primary" />
          </div>
          <h2 className="font-500 text-foreground">Ask AI</h2>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted/50 transition-all duration-200" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3 pb-4">
          {messages.map((message, index) => (
            <div
              key={message.id}
              className={`flex gap-2 animate-fade-in-up ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div
                className={`max-w-xs px-3.5 py-2.5 rounded-xl text-sm leading-relaxed transition-all duration-200 ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground shadow-sm hover:shadow-md'
                    : 'bg-muted/50 text-foreground'
                }`}
              >
                <p className="font-400 whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted/60 text-foreground px-3.5 py-2.5 rounded-xl">
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
              <div className="bg-destructive/10 text-destructive px-3.5 py-2.5 rounded-xl text-sm">
                <p>Error: {error.message}</p>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t border-border/20 bg-muted/10">
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
          placeholder="Ask something..."
        />
      </div>
    </div>
  );
}
