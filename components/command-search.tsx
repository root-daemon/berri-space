'use client';

import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { File, Folder, Sparkles, FolderOpen, Share2, Clock, Trash2, MessageSquare, Settings } from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import { Kbd } from '@/components/ui/kbd';
import type { SearchResult } from '@/app/api/search/route';

// Context for controlling command palette
const CommandSearchContext = createContext<{
  open: () => void;
  close: () => void;
} | null>(null);

export function useCommandSearch() {
  const context = useContext(CommandSearchContext);
  if (!context) {
    throw new Error('useCommandSearch must be used within CommandSearchProvider');
  }
  return context;
}

function CommandSearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Debounced search function
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) {
        throw new Error('Search failed');
      }
      const data = await response.json();
      setResults(data.results || []);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Handle input change with debouncing
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (query.trim()) {
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(query);
      }, 300);
    } else {
      setResults([]);
      setIsSearching(false);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, performSearch]);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  // Handle result selection
  const handleSelect = (result: SearchResult) => {
    if (result.type === 'file') {
      router.push(`/drive/file/${result.id}`);
    } else {
      router.push(`/drive/folder/${result.id}`);
    }
    onOpenChange(false);
    setQuery('');
    setResults([]);
  };

  // Handle AI fallback selection
  const handleAskAI = () => {
    if (!query.trim()) return;
    // Navigate to AI chat with the query
    router.push(`/ai/chat/new?q=${encodeURIComponent(query)}`);
    onOpenChange(false);
    setQuery('');
    setResults([]);
  };

  const hasResults = results.length > 0;
  const showAIFallback = query.trim().length > 0 && !isSearching && !hasResults;

  // Default navigation options (sidebar items)
  const navigationItems = [
    { icon: FolderOpen, label: 'My Drive', href: '/drive' },
    { icon: Share2, label: 'Shared with Me', href: '/drive/shared' },
    { icon: Clock, label: 'Recent', href: '/drive/recent' },
    { icon: Trash2, label: 'Trash', href: '/drive/trash' },
    { icon: MessageSquare, label: 'AI Chat History', href: '/ai/history' },
    { icon: Settings, label: 'Settings', href: '/settings' },
  ];

  const handleNavigation = (href: string) => {
    router.push(href);
    onOpenChange(false);
    setQuery('');
    setResults([]);
  };

  // Handle Enter key when no results are found - automatically go to AI chat
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // If Enter is pressed and we have a query with no results (AI fallback scenario)
    if (e.key === 'Enter' && showAIFallback) {
      e.preventDefault();
      handleAskAI();
    }
  };

  return (
      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        className="max-w-2xl w-full p-0"
        showCloseButton={false}
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          onKeyDown={handleKeyDown}
          placeholder="Search or ask AI…"
        />
        <CommandList>
          {!query && (
            <CommandGroup heading="Navigation">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.href}
                    value={item.label.toLowerCase()}
                    onSelect={() => handleNavigation(item.href)}
                    className="cursor-pointer"
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    <span>{item.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          {hasResults && (
            <CommandGroup heading="Results">
              {results.map((result) => (
                <CommandItem
                  key={`${result.type}-${result.id}`}
                  value={`${result.type}-${result.id}`}
                  onSelect={() => handleSelect(result)}
                  className="cursor-pointer"
                >
                  {result.type === 'file' ? (
                    <File className="mr-2 h-4 w-4" />
                  ) : (
                    <Folder className="mr-2 h-4 w-4" />
                  )}
                  <span>{result.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {showAIFallback && (
            <CommandEmpty>
              <div className="flex flex-col items-center justify-center py-6">
                <p className="text-sm text-muted-foreground mb-3">
                  No results found
                </p>
                <CommandItem
                  onSelect={handleAskAI}
                  className="cursor-pointer text-primary hover:bg-accent"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  <span>Ask AI: {query}</span>
                </CommandItem>
              </div>
            </CommandEmpty>
          )}

          {query && !hasResults && !showAIFallback && (
            <CommandEmpty>
              <div className="flex flex-col items-center justify-center py-8">
                <p className="text-sm text-muted-foreground">
                  Searching...
                </p>
              </div>
            </CommandEmpty>
          )}
        </CommandList>
      </CommandDialog>
  );
}

// Provider component that should be used at the app level
// This must be a client component to use hooks
export function CommandSearchProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);

  // Fix hydration: detect platform only on client
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPod|iPad/i.test(navigator.platform));
  }, []);


  // Handle keyboard shortcut (⌘K / Ctrl+K) at provider level
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for ⌘K (Mac) or Ctrl+K (Windows/Linux)
      // Handle both lowercase 'k' and uppercase 'K'
      const isKKey = e.key === 'k' || e.key === 'K';
      const isModifierPressed = isMac ? e.metaKey : e.ctrlKey;
      
      if (isModifierPressed && isKKey) {
        // Don't trigger if user is typing in an input/textarea/contenteditable
        const target = e.target as HTMLElement;
        const isInput = target.tagName === 'INPUT' || 
                       target.tagName === 'TEXTAREA' || 
                       target.isContentEditable;
        
        // Allow if it's the command input itself
        if (isInput && target.getAttribute('data-slot') !== 'command-input') {
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        setOpen((prev) => !prev);
        return;
      }

      // Close on Escape
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };

    // Use capture phase to catch events early
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isMac, open]);

  const contextValue = React.useMemo(
    () => ({
      open: () => setOpen(true),
      close: () => setOpen(false),
    }),
    []
  );

  return (
    <CommandSearchContext.Provider value={contextValue}>
      <CommandSearchDialog open={open} onOpenChange={setOpen} />
      {children}
    </CommandSearchContext.Provider>
  );
}

// Export the hook for components to use
export { useCommandSearch };
