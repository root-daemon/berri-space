'use client';

import React from "react"

import { useState, useRef, useEffect } from 'react';
import { X, Send, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const mockResponses = [
  "I can help you organize your documents better. Try sorting by date modified.",
  "This file appears to be a quarterly report. Would you like me to summarize it?",
  "I found 3 similar documents in your recent folder. Should I consolidate them?",
  "You have 12 documents shared with the Sales team. Would you like to review permissions?",
  "Based on your access patterns, I recommend archiving files older than 6 months.",
];

export function AIAssistantPanel({ isOpen, onClose }: AIAssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'assistant',
      content: "Hi! I'm your AI assistant. I can help you manage and organize your documents. What would you like help with?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: String(messages.length + 1),
      type: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    // Mock AI response delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    const assistantMessage: Message = {
      id: String(messages.length + 2),
      type: 'assistant',
      content: mockResponses[Math.floor(Math.random() * mockResponses.length)],
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, assistantMessage]);
    setLoading(false);
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
              className={`flex gap-2 animate-fade-in-up ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div
                className={`max-w-xs px-3.5 py-2.5 rounded-xl text-sm leading-relaxed transition-all duration-200 ${
                  message.type === 'user'
                    ? 'bg-primary text-primary-foreground shadow-sm hover:shadow-md'
                    : 'bg-muted/50 text-foreground'
                }`}
              >
                <p className="font-400">{message.content}</p>
                <span className={`text-xs opacity-60 mt-1.5 block font-300 ${message.type === 'user' ? '' : ''}`}>
                  {message.timestamp.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          ))}
          {loading && (
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
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t border-border/20 bg-muted/10">
        <div className="text-xs text-muted-foreground mb-3 p-2.5 bg-muted/30 rounded-lg border border-border/20">
          AI answers respect document access and redactions
        </div>
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <Input
            type="text"
            placeholder="Ask something..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            className="bg-muted/30 border-border/20 focus-within:bg-muted focus-within:border-primary/20 transition-all duration-250"
          />
          <Button
            type="submit"
            size="icon"
            className="bg-primary hover:bg-primary/90 transition-all duration-200 h-10 w-10 shadow-sm hover:shadow-md"
            disabled={loading}
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
