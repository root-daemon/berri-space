'use client';

import { useState } from 'react';
import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, FileText, Plus, Trash2, Users, Lock } from 'lucide-react';

interface AccessUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  avatar?: string;
}

const mockAccessUsers: AccessUser[] = [
  { id: '1', name: 'Sarah Chen', email: 'sarah@company.com', role: 'admin' },
  { id: '2', name: 'Alex Kim', email: 'alex@company.com', role: 'editor' },
  { id: '3', name: 'Jordan Lee', email: 'jordan@company.com', role: 'viewer' },
];

export default function ManageAccessPage({ params }: { params: { resourceId: string } }) {
  const [users, setUsers] = useState<AccessUser[]>(mockAccessUsers);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('editor');

  const handleRemoveAccess = (userId: string) => {
    setUsers(users.filter((u) => u.id !== userId));
  };

  const handleRoleChange = (userId: string, role: string) => {
    setUsers(
      users.map((u) => (u.id === userId ? { ...u, role: role as any } : u))
    );
  };

  const handleAddAccess = () => {
    if (newEmail) {
      const newUser: AccessUser = {
        id: Date.now().toString(),
        name: newEmail.split('@')[0],
        email: newEmail,
        role: newRole as any,
      };
      setUsers([...users, newUser]);
      setNewEmail('');
    }
  };

  return (
    <>
      <AppHeader
        breadcrumbs={[
          { label: 'My Drive', href: '/drive' },
          { label: 'Access Settings' },
        ]}
      />

      <div className="flex-1 overflow-auto">
        <div className="p-8 max-w-4xl">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-4xl font-500 text-foreground tracking-tight">
                  Manage Access
                </h1>
                <p className="text-sm text-muted-foreground mt-1 font-400">Report.pdf</p>
              </div>
            </div>
          </div>

          {/* Warning Banner */}
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-8 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-500 text-yellow-900">Access Control Active</p>
              <p className="text-xs text-yellow-800 mt-1">
                This document is shared with {users.length} people. Changes will take effect immediately.
              </p>
            </div>
          </div>

          {/* Current Access Section */}
          <div className="mb-8">
            <h2 className="text-sm font-600 text-muted-foreground uppercase tracking-wide mb-4">
              Current Access
            </h2>

            <div className="space-y-2">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 bg-card rounded-lg border border-border/20 hover:bg-muted/30 transition-colors duration-200"
                >
                  <div className="flex-1">
                    <p className="text-sm font-500 text-foreground">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Select value={user.role} onValueChange={(role) => handleRoleChange(user.id, role)}>
                      <SelectTrigger className="w-28 text-xs border-border/20 hover:border-primary/30 transition-colors duration-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">Viewer</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
                      onClick={() => handleRemoveAccess(user.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Grant Access Section */}
          <div className="mb-8 border-t border-border/20 pt-8">
            <h2 className="text-sm font-600 text-muted-foreground uppercase tracking-wide mb-4">
              Grant Access
            </h2>

            <div className="space-y-3">
              <Input
                type="email"
                placeholder="Enter email or team name"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddAccess()}
                className="bg-muted/30 border-border/20 focus-visible:bg-muted focus-visible:border-primary/20 transition-all duration-250"
              />

              <div className="flex gap-2">
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger className="flex-1 border-border/20 hover:border-primary/30 transition-colors duration-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  onClick={handleAddAccess}
                  className="bg-primary hover:bg-primary/90 transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Permission Levels Info */}
          <div className="bg-muted/20 p-4 rounded-lg border border-border/20 space-y-2">
            <h3 className="text-xs font-600 text-foreground uppercase tracking-wide mb-3">
              Permission Levels
            </h3>

            <div className="space-y-2.5">
              <div className="flex gap-2">
                <Lock className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-500 text-foreground">Viewer</p>
                  <p className="text-xs text-muted-foreground">Can view and download only</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Users className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-500 text-foreground">Editor</p>
                  <p className="text-xs text-muted-foreground">Can view, edit, and comment</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Lock className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-500 text-foreground">Admin</p>
                  <p className="text-xs text-muted-foreground">Full control including sharing</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
