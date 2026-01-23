'use client';

import { useState } from 'react';
import { AppHeader } from '@/components/app-header';
import { FileExplorer } from '@/components/file-explorer';
import { AIAssistantPanel } from '@/components/ai-assistant-panel';
import { Button } from '@/components/ui/button';
import { MessageCircle } from 'lucide-react';

export default function DrivePage() {
  const [showAI, setShowAI] = useState(false);

  return (
    <>
      <AppHeader breadcrumbs={[{ label: 'My Drive' }]} />
      
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-500 text-foreground tracking-tight">My Drive</h1>
              <p className="text-sm text-muted-foreground mt-2 font-400">
                Manage and organize your documents
              </p>
            </div>
            <Button
              onClick={() => setShowAI(true)}
              className="bg-primary hover:bg-primary/90 gap-2 transition-all duration-200 shadow-md hover:shadow-lg font-400"
            >
              <MessageCircle className="w-4 h-4" />
              Ask AI
            </Button>
          </div>

          <FileExplorer />
        </div>
      </div>

      <AIAssistantPanel isOpen={showAI} onClose={() => setShowAI(false)} />
    </>
  );
}
