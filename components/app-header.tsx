'use client';

import React from 'react';
import Link from 'next/link';
import { Search, Settings } from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { useCommandSearch } from '@/components/command-search';
import { Kbd } from '@/components/ui/kbd';

interface AppHeaderProps {
  breadcrumbs?: { label: string; href?: string }[];
}

export function AppHeader({ breadcrumbs = [{ label: 'My Drive' }] }: AppHeaderProps) {
  const [isMac, setIsMac] = React.useState(false);
  const [isMounted, setIsMounted] = React.useState(false);
  const { open } = useCommandSearch();

  // Fix hydration: detect platform only on client
  React.useEffect(() => {
    setIsMac(/Mac|iPhone|iPod|iPad/i.test(navigator.platform));
    setIsMounted(true);
  }, []);

  return (
    <header className="h-16 bg-background border-b border-border/20 px-6 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm bg-background/80">
      {/* Left: Breadcrumb */}
      <div className="flex items-center gap-2">
        <nav className="flex items-center gap-1 text-sm">
          {breadcrumbs.map((crumb, index) => (
            <div key={index} className="flex items-center gap-1">
              {index > 0 && <span className="text-muted-foreground/50">/</span>}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="text-muted-foreground hover:text-primary transition-colors duration-200 font-400"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-foreground font-500">{crumb.label}</span>
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* Center: Search Hint */}
      <div className="flex-1 mx-6 max-w-sm flex items-center justify-center">
        <Button
          variant="outline"
          className="w-full max-w-md justify-between text-muted-foreground hover:text-foreground bg-muted/30 border-border/20 hover:bg-muted hover:border-primary/20 transition-all duration-200"
          onClick={open}
        >
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            <span className="text-sm">Search or ask AI…</span>
          </div>
          <Kbd className="text-xs">
            {isMac ? '⌘' : 'Ctrl'}K
          </Kbd>
        </Button>
      </div>

      {/* Right: User Menu */}
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 h-9 w-9">
            <Settings className="w-4 h-4" />
          </Button>
        </Link>

        {isMounted ? (
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox: 'w-8 h-8',
                userButtonPopoverCard: 'shadow-lg border-border/20',
                userButtonPopoverActionButton: 'hover:bg-muted/50',
                userButtonPopoverActionButtonText: 'text-foreground',
                userButtonPopoverFooter: 'hidden',
              },
            }}
          />
        ) : (
          <div className="w-8 h-8" /> // Placeholder to prevent layout shift
        )}
      </div>
    </header>
  );
}
