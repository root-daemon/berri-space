'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Search, Settings } from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AppHeaderProps {
  breadcrumbs?: { label: string; href?: string }[];
}

export function AppHeader({ breadcrumbs = [{ label: 'My Drive' }] }: AppHeaderProps) {
  const [searchQuery, setSearchQuery] = useState('');

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

      {/* Center: Search */}
      <div className="flex-1 mx-6 max-w-sm">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors duration-200" />
          <Input
            type="search"
            placeholder="Search files..."
            className="pl-9 bg-muted/30 border-border/20 group-focus-within:bg-muted group-focus-within:shadow-sm group-focus-within:border-primary/20 transition-all duration-250"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Right: User Menu */}
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 h-9 w-9">
            <Settings className="w-4 h-4" />
          </Button>
        </Link>

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
      </div>
    </header>
  );
}
