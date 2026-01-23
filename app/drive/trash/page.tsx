'use client';

import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

export default function TrashPage() {
  return (
    <>
      <AppHeader breadcrumbs={[{ label: 'My Drive', href: '/drive' }, { label: 'Trash' }]} />
      
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-500 text-foreground tracking-tight">Trash</h1>
              <p className="text-sm text-muted-foreground mt-2 font-400">
                Deleted files will appear here for 30 days
              </p>
            </div>
            <Button variant="outline" className="gap-2 bg-transparent border-border/40 hover:bg-muted/50 transition-all duration-200 font-400">
              Empty Trash
            </Button>
          </div>

          {/* Empty Trash State */}
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <div className="mb-6 w-20 h-20 bg-muted/40 rounded-full flex items-center justify-center">
              <Trash2 className="w-10 h-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-500 text-foreground mb-2">Trash is empty</h3>
            <p className="text-muted-foreground text-center max-w-sm text-sm font-400">
              Deleted files will appear here and can be restored within 30 days
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
