'use client';

import { AppHeader } from '@/components/app-header';
import { MessageCircle, FileText, Clock, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface ChatHistoryItem {
  id: string;
  title: string;
  document: string;
  timestamp: Date;
  preview: string;
}

const mockChats: ChatHistoryItem[] = [
  {
    id: '1',
    title: 'Summarize Q1 financial data',
    document: 'Financial Report Q1.pdf',
    timestamp: new Date('2024-02-15T14:30:00'),
    preview: 'What are the key metrics from this quarter?',
  },
  {
    id: '2',
    title: 'Extract action items',
    document: 'Board Meeting Notes.docx',
    timestamp: new Date('2024-02-14T10:15:00'),
    preview: 'List all action items and owners...',
  },
  {
    id: '3',
    title: 'Explain budget variance',
    document: 'Budget Analysis.xlsx',
    timestamp: new Date('2024-02-13T16:45:00'),
    preview: 'Why is marketing spend 15% over budget?',
  },
  {
    id: '4',
    title: 'Product roadmap questions',
    document: 'Product Strategy 2024.pdf',
    timestamp: new Date('2024-02-12T09:20:00'),
    preview: 'What features are planned for Q2?',
  },
];

export default function AIChatHistoryPage() {
  const formatTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <>
      <AppHeader breadcrumbs={[{ label: 'AI Chat History' }]} />

      <div className="flex-1 overflow-auto">
        <div className="p-8 max-w-4xl">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <MessageCircle className="w-6 h-6 text-primary" />
              <h1 className="text-4xl font-500 text-foreground tracking-tight">Chat History</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-2 font-400">
              View and continue your AI conversations
            </p>
          </div>

          {/* Chat List */}
          <div className="space-y-2">
            {mockChats.map((chat) => (
              <Link key={chat.id} href={`/ai/chat/${chat.id}`}>
                <div className="bg-card rounded-xl p-5 border border-transparent hover:border-primary/10 hover:shadow-lg transition-all duration-200 ease-out cursor-pointer group active:scale-95 active:transition-transform active:duration-75">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1">
                      <h3 className="text-base font-500 text-foreground group-hover:text-primary transition-colors duration-200">
                        {chat.title}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1.5 font-400">
                        {chat.preview}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-all duration-200 flex-shrink-0 mt-1 group-hover:translate-x-1" />
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <FileText className="w-3.5 h-3.5" />
                      <span className="font-400">{chat.document}</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="font-400">{formatTime(chat.timestamp)}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Info Box */}
          <div className="mt-8 bg-muted/20 p-4 rounded-lg border border-border/20 text-center">
            <p className="text-xs text-muted-foreground font-400">
              Chat history is retained for 90 days. Limited to {mockChats.length} most recent conversations.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
