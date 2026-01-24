'use client';

import React, { useEffect, useState } from "react"

import Link from 'next/link';
import { SignOutButton } from '@clerk/nextjs';
import {
  FolderOpen,
  Share2,
  Users,
  Clock,
  Trash2,
  Plus,
  Upload,
  LogOut,
  Settings,
  MessageSquare,
  Shield,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getUserTeamsAction } from '@/lib/teams/actions';
import type { DbTeam } from '@/lib/supabase/types';

export function AppSidebar() {
  const [teams, setTeams] = useState<DbTeam[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(true);

  useEffect(() => {
    loadTeams();
  }, []);

  const loadTeams = async () => {
    setIsLoadingTeams(true);
    try {
      const result = await getUserTeamsAction();
      if (result.success) {
        // Limit to 5 teams for display
        setTeams(result.data.slice(0, 5));
      }
    } catch (error) {
      console.error('Failed to load teams:', error);
    } finally {
      setIsLoadingTeams(false);
    }
  };

  return (
    <aside className="w-64 h-screen bg-background border-r border-border/20 overflow-y-auto flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-border/20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center transform hover:scale-105 transition-transform duration-200">
            <span className="text-primary-foreground font-bold text-lg">D</span>
          </div>
          <h1 className="text-lg font-500 text-foreground">DriveHub</h1>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        <NavItem
          icon={<FolderOpen className="w-4 h-4" />}
          label="My Drive"
          href="/drive"
        />
        <NavItem
          icon={<Share2 className="w-4 h-4" />}
          label="Shared with Me"
          href="/drive/shared"
        />
        <NavItem
          icon={<Clock className="w-4 h-4" />}
          label="Recent"
          href="/drive/recent"
        />
        <NavItem
          icon={<Trash2 className="w-4 h-4" />}
          label="Trash"
          href="/drive/trash"
        />
      </nav>

      {/* Teams Section */}
      <div className="px-4 py-4 border-t border-border/20">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-600 text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Users className="w-4 h-4" />
            Teams
          </h3>
          <Link
            href="/teams"
            className="text-xs text-primary hover:text-primary/80 transition-colors font-500"
          >
            View All
          </Link>
        </div>
        <div className="space-y-1 mb-4">
          {isLoadingTeams ? (
            <div className="px-3 py-2 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : teams.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No teams
            </div>
          ) : (
            teams.map((team) => (
              <Link
                key={team.id}
                href={`/teams/${team.id}`}
                className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-primary/5 rounded-lg transition-all duration-150 block"
              >
                {team.name}
              </Link>
            ))
          )}
        </div>
      </div>

      {/* AI & Admin Section */}
      <div className="px-4 py-3 border-t border-border/20 space-y-1">
        <Link
          href="/ai/history"
          className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-primary/5 rounded-lg transition-all duration-150 font-400"
        >
          <MessageSquare className="w-4 h-4" />
          AI Chat History
        </Link>
        <Link
          href="/admin/redactions"
          className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-primary/5 rounded-lg transition-all duration-150 font-400"
        >
          <Shield className="w-4 h-4" />
          Admin
        </Link>
      </div>

      {/* Action Buttons */}
      <div className="p-4 border-t border-border/20 space-y-2">
        <Button
          variant="outline"
          className="w-full justify-start gap-2 bg-muted/50 hover:bg-muted border-0 text-foreground transition-all duration-200"
          onClick={() => console.log('Create folder')}
        >
          <Plus className="w-4 h-4" />
          <span className="font-400">New Folder</span>
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start gap-2 bg-muted/50 hover:bg-muted border-0 text-foreground transition-all duration-200"
          onClick={() => console.log('Upload file')}
        >
          <Upload className="w-4 h-4" />
          <span className="font-400">Upload</span>
        </Button>
      </div>

      {/* Settings & Sign Out */}
      <div className="p-4 border-t border-border/20 space-y-2">
        <Link
          href="/settings"
          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-all duration-200 font-400"
        >
          <Settings className="w-4 h-4" />
          Settings
        </Link>
        <SignOutButton redirectUrl="/">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 bg-transparent border-0 transition-all duration-200"
          >
            <LogOut className="w-4 h-4" />
            <span className="font-400">Sign Out</span>
          </Button>
        </SignOutButton>
      </div>
    </aside>
  );
}

function NavItem({
  icon,
  label,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2.5 text-sm text-foreground bg-primary/6 hover:bg-primary/12 rounded-lg transition-all duration-250 font-400 relative group"
    >
      <span className="transition-transform duration-250">{icon}</span>
      {label}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full opacity-0 group-hover:opacity-100 transition-all duration-300 ease-out" />
    </Link>
  );
}
