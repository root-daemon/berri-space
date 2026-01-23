'use client';

import React from "react"

import { useState, useRef, useEffect } from 'react';
import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Send, AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
}

const mockMessages: Message[] = [
  {
    id: '1',
    type: 'user',
    content: 'Can you summarize the Q1 financial results?',
    timestamp: new Date('2024-02-15T14:30:00'),
  },
  {
    id: '2',
    type: 'ai',
    content:
      'Based on the Financial Report Q1.pdf, here are the key results:\n\n• Revenue: $2.5M (up 15% YoY)\n• Operating expenses: $1.8M\n• Net profit margin: 28%\n• Customer acquisition cost decreased by 12%',
    timestamp: new Date('2024-02-15T14:31:00'),
  },
  {
    id: '3',
    type: 'user',
    content: 'What about the department breakdown?',
    timestamp: new Date('2024-02-15T14:32:00'),
  },
  {
    id: '4',
    type: 'ai',
    content:
      'The report shows revenue distribution across:\n\n• Product Sales: 60% ($1.5M)\n• Services: 30% ($750K)\n• Licensing: 10% ($250K)\n\nProduct sales showed the strongest growth at 22% YoY.',
    timestamp: new Date('2024-02-15T14:33:00'),
  },
];

export default function AIChatDetailPage({ params }: { params: { chatId: string } }) {
  const [messages, setMessages] = useState<Message[]>(mockMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages([...messages, newMessage]);
    setInput('');
    setLoading(true);

    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: 'This is a simulated AI response. In a real app, this would connect to an AI service.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiResponse]);
      setLoading(false);
    }, 800);
  };

  return (
    <>
      <AppHeader
        breadcrumbs={[
          { label: 'AI History', href: '/ai/history' },
          { label: 'Chat' },
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
                  Summarize Q1 financial data
                </h1>
                <div className="flex items-center gap-2 mt-1.5">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-400">
                    Financial Report Q1.pdf
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 max-w-4xl w-full mx-auto px-6 py-6">
          <div className="space-y-4 pb-4">
            {/* System Notice */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3.5 flex gap-2.5 mb-4">
              <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-500 text-blue-900">Limited AI Access</p>
                <p className="text-xs text-blue-800 mt-0.5 font-400">
                  AI responses are limited to content you've authorized for AI analysis
                </p>
              </div>
            </div>

            {/* Chat Messages */}
            {messages.map((message, index) => (
              <div
                key={message.id}
                className={`flex gap-3 animate-fade-in-up ${
                  message.type === 'user' ? 'justify-end' : 'justify-start'
                }`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div
                  className={`max-w-lg px-4 py-3 rounded-xl text-sm leading-relaxed transition-all duration-200 ${
                    message.type === 'user'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/50 text-foreground'
                  }`}
                >
                  <p className="font-400 whitespace-pre-wrap">{message.content}</p>
                  <span
                    className={`text-xs opacity-60 mt-2 block font-300 ${
                      message.type === 'user' ? '' : ''
                    }`}
                  >
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
                <div className="bg-muted/50 text-foreground px-4 py-3 rounded-xl">
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

            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {/* Input Footer */}
        <div className="border-t border-border/20 bg-background/50 p-5">
          <div className="max-w-4xl mx-auto">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <Input
                type="text"
                placeholder="Ask a follow-up question..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
                className="bg-muted/30 border-border/20 focus-visible:bg-muted focus-visible:border-primary/20 transition-all duration-250"
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
      </div>
    </>
  );
}
