'use client';

import { useState } from 'react';
import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Download,
  Share2,
  MessageCircle,
  FileText,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';

export default function FilePreviewPage({ params }: { params: { fileId: string } }) {
  const [showAI, setShowAI] = useState(false);

  return (
    <>
      <AppHeader
        breadcrumbs={[
          { label: 'My Drive', href: '/drive' },
          { label: 'Q1 Reports', href: '/drive/folder/1' },
          { label: 'Report.pdf' },
        ]}
      />

      <div className="flex-1 overflow-auto flex flex-col">
        {/* Header */}
        <div className="border-b border-border/20 p-6 bg-background/50">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/drive/folder/1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 hover:bg-muted/50 transition-all duration-200"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-500 text-foreground">Report.pdf</h1>
                <p className="text-xs text-muted-foreground mt-1">Sarah Chen • Feb 15, 2024</p>
              </div>
            </div>
            <Badge className="bg-primary/10 text-primary border-0">Editor</Badge>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Preview Area */}
            <div className="lg:col-span-3">
              <div className="bg-card rounded-xl border border-border/20 overflow-hidden shadow-lg h-96 lg:h-screen max-h-[600px]">
                <div className="w-full h-full bg-gradient-to-br from-muted/50 to-muted/20 flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <div className="w-20 h-20 bg-red-500/10 rounded-lg flex items-center justify-center mx-auto">
                      <FileText className="w-10 h-10 text-red-500/70" />
                    </div>
                    <div>
                      <p className="text-sm font-500 text-foreground">PDF Preview</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Full document preview would display here
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Metadata Panel */}
            <div className="space-y-6">
              {/* Info Card */}
              <div className="bg-card rounded-xl border border-border/20 p-5 space-y-4">
                <div>
                  <p className="text-xs font-500 text-muted-foreground uppercase tracking-wide mb-1">
                    Owner
                  </p>
                  <p className="text-sm font-400 text-foreground">Sarah Chen</p>
                </div>
                <div className="border-t border-border/20 pt-4">
                  <p className="text-xs font-500 text-muted-foreground uppercase tracking-wide mb-1">
                    Created
                  </p>
                  <p className="text-sm font-400 text-foreground">Feb 15, 2024</p>
                </div>
                <div className="border-t border-border/20 pt-4">
                  <p className="text-xs font-500 text-muted-foreground uppercase tracking-wide mb-2">
                    Access
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <Badge className="bg-muted/60 text-muted-foreground border-0 text-xs">
                      Sarah (Editor)
                    </Badge>
                    <Badge className="bg-muted/60 text-muted-foreground border-0 text-xs">
                      Alex (Viewer)
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <Button className="w-full bg-primary hover:bg-primary/90 transition-all duration-200 shadow-sm hover:shadow-md font-400 gap-2">
                  <Download className="w-4 h-4" />
                  Download
                </Button>
                <Button
                  variant="outline"
                  className="w-full border-border/20 hover:bg-muted/50 transition-all duration-200 font-400 gap-2 bg-transparent"
                >
                  <Share2 className="w-4 h-4" />
                  Share
                </Button>
                <Button
                  variant="outline"
                  className="w-full border-border/20 hover:bg-muted/50 transition-all duration-200 font-400 gap-2 bg-transparent"
                  onClick={() => setShowAI(true)}
                >
                  <MessageCircle className="w-4 h-4" />
                  Ask AI
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
