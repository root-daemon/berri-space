'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Folder,
  FileText,
  FileSpreadsheet,
  ImageIcon,
  MoreVertical,
  Grid,
  List as ListIcon,
  Lock,
  Users,
} from 'lucide-react';
import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface FolderItem {
  id: string;
  name: string;
  type: 'folder' | 'file';
  owner?: string;
  access: 'admin' | 'editor' | 'viewer';
  fileType?: 'pdf' | 'xls' | 'image' | 'other';
}

const mockItems: FolderItem[] = [
  {
    id: '1',
    name: 'Subfolder',
    type: 'folder',
    access: 'admin',
  },
  {
    id: '2',
    name: 'Report.pdf',
    type: 'file',
    fileType: 'pdf',
    owner: 'Sarah Chen',
    access: 'editor',
  },
  {
    id: '3',
    name: 'Data.xlsx',
    type: 'file',
    fileType: 'xls',
    owner: 'Alex Kim',
    access: 'viewer',
  },
];

export default function FolderPage({ params }: { params: { folderId: string } }) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const getFileIcon = (item: FolderItem) => {
    if (item.type === 'folder') {
      return <Folder className="w-7 h-7 text-primary" />;
    }
    switch (item.fileType) {
      case 'pdf':
        return <FileText className="w-7 h-7 text-red-500/70" />;
      case 'xls':
        return <FileSpreadsheet className="w-7 h-7 text-green-500/70" />;
      case 'image':
        return <ImageIcon className="w-7 h-7 text-blue-500/70" />;
      default:
        return <FileText className="w-7 h-7 text-muted-foreground" />;
    }
  };

  const getAccessIcon = (access: string) => {
    if (access === 'admin') return <Lock className="w-3.5 h-3.5" />;
    return <Users className="w-3.5 h-3.5" />;
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Folder className="w-10 h-10 text-primary" />
            <div>
              <h1 className="text-4xl font-500 text-foreground tracking-tight">
                Q1 Reports
              </h1>
              <Badge className="mt-2 bg-primary/10 text-primary border-0">Admin</Badge>
            </div>
          </div>
          <Button
            variant="outline"
            className="gap-2 bg-transparent border-border/40 hover:bg-muted/50 transition-all duration-200 font-400"
          >
            Share
          </Button>
        </div>

        {/* View Toggle */}
        <div className="flex justify-end gap-1 mb-8">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            size="icon"
            onClick={() => setViewMode('grid')}
            className={`transition-all ${
              viewMode === 'grid'
                ? 'bg-primary hover:bg-primary/90'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Grid className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="icon"
            onClick={() => setViewMode('list')}
            className={`transition-all ${
              viewMode === 'list'
                ? 'bg-primary hover:bg-primary/90'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <ListIcon className="w-4 h-4" />
          </Button>
        </div>

        {/* Grid View */}
        {viewMode === 'grid' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {mockItems.map((item) => {
              const itemLink = item.type === 'folder' ? `/drive/folder/${item.id}` : `/drive/file/${item.id}`;
              return (
                <Link
                  key={item.id}
                  href={itemLink}
                  className="bg-card rounded-xl p-5 hover:shadow-lg transition-all duration-200 ease-out hover:scale-105 hover:-translate-y-0.5 cursor-pointer group border border-transparent hover:border-primary/10 hover:bg-primary/2 active:scale-95 active:transition-transform active:duration-75 block"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 transform group-hover:scale-110 transition-transform duration-200">
                      {getFileIcon(item)}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 h-8 w-8 hover:bg-muted/50"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Open</DropdownMenuItem>
                        <DropdownMenuItem>Rename</DropdownMenuItem>
                        <DropdownMenuItem>Move</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>Manage Access</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <h3 className="font-500 text-foreground truncate mb-1 text-sm leading-snug">
                    {item.name}
                  </h3>

                  {item.owner && (
                    <p className="text-xs text-muted-foreground mb-3">{item.owner}</p>
                  )}

                  <div className="flex items-center justify-between">
                    <Badge
                      variant="secondary"
                      className="text-xs gap-1.5 px-2 py-0.5 bg-muted/60 text-muted-foreground hover:bg-muted border-0 rounded-full"
                    >
                      {getAccessIcon(item.access)}
                      <span className="font-400 text-xs">{item.access}</span>
                    </Badge>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <div className="bg-card border border-transparent rounded-xl overflow-hidden shadow-sm">
            <div className="hidden md:grid grid-cols-5 gap-4 px-6 py-3 bg-muted/20 border-b border-border/20 text-sm font-500 text-muted-foreground">
              <div>Name</div>
              <div>Owner</div>
              <div>Access</div>
              <div>Modified</div>
              <div className="text-right">Actions</div>
            </div>

            {mockItems.map((item) => {
              const itemLink = item.type === 'folder' ? `/drive/folder/${item.id}` : `/drive/file/${item.id}`;
              return (
                <Link
                  key={item.id}
                  href={itemLink}
                  className="grid grid-cols-1 md:grid-cols-5 gap-4 px-6 py-3.5 border-b border-border/20 hover:bg-primary/3 transition-colors duration-150 group items-center last:border-b-0 active:bg-primary/5 active:transition-colors active:duration-75"
                >
                  <div className="flex items-center gap-3">
                    <div className="group-hover:scale-110 transition-transform duration-200">
                      {getFileIcon(item)}
                    </div>
                    <span className="font-400 text-foreground text-sm">{item.name}</span>
                  </div>
                  <div className="text-sm text-muted-foreground hidden md:block">
                    {item.owner || '-'}
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge
                      variant="secondary"
                      className="text-xs gap-1.5 w-fit bg-muted/60 text-muted-foreground hover:bg-muted border-0 rounded-full px-2 py-0.5"
                    >
                      {getAccessIcon(item.access)}
                      <span className="font-400 text-xs">{item.access}</span>
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground hidden md:block">Feb 15</div>
                  <div className="flex justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted/50">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Open</DropdownMenuItem>
                        <DropdownMenuItem>Rename</DropdownMenuItem>
                        <DropdownMenuItem>Move</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>Manage Access</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
