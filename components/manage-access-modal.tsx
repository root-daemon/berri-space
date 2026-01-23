'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AccessUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  type: 'user' | 'team';
  isOwner?: boolean;
}

interface ManageAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: {
    id: string;
    name: string;
    type: 'folder' | 'file';
  };
}

const mockOtherUsers: AccessUser[] = [
  {
    id: '2',
    name: 'Jane Smith',
    email: 'jane@example.com',
    role: 'editor',
    type: 'user',
  },
  {
    id: '3',
    name: 'Sales Team',
    email: 'sales@example.com',
    role: 'viewer',
    type: 'team',
  },
];

export function ManageAccessModal({ isOpen, onClose, item }: ManageAccessModalProps) {
  const { user, isLoaded } = useUser();
  const [accessUsers, setAccessUsers] = useState<AccessUser[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'viewer' | 'editor' | 'admin'>('viewer');

  // Initialize access users with current user as owner/admin
  useEffect(() => {
    if (isLoaded && user) {
      const currentUserAccess: AccessUser = {
        id: user.id,
        name: user.fullName || 'You',
        email: user.primaryEmailAddress?.emailAddress || '',
        role: 'admin',
        type: 'user',
        isOwner: true,
      };
      setAccessUsers([currentUserAccess, ...mockOtherUsers]);
    }
  }, [isLoaded, user]);

  const handleAddAccess = () => {
    if (!newEmail) return;

    const newUser: AccessUser = {
      id: String(accessUsers.length + 1),
      name: newEmail.split('@')[0],
      email: newEmail,
      role: newRole,
      type: 'user',
    };

    setAccessUsers([...accessUsers, newUser]);
    setNewEmail('');
    setNewRole('viewer');
  };

  const handleRemoveAccess = (id: string) => {
    // Don't allow removing the owner
    const userToRemove = accessUsers.find(u => u.id === id);
    if (userToRemove?.isOwner) return;

    setAccessUsers(accessUsers.filter((user) => user.id !== id));
  };

  const handleRoleChange = (id: string, newRole: 'admin' | 'editor' | 'viewer') => {
    // Don't allow changing owner's role
    const userToChange = accessUsers.find(u => u.id === id);
    if (userToChange?.isOwner) return;

    setAccessUsers(
      accessUsers.map((user) => (user.id === id ? { ...user, role: newRole } : user))
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md rounded-xl animate-fade-in-scale" style={{ backgroundClip: 'padding-box' }}>
        <DialogHeader>
          <DialogTitle className="font-500">Manage Access</DialogTitle>
          <DialogDescription className="text-sm font-400">
            Control who can access <span className="text-foreground font-500">{item.name}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Access Users */}
          <div>
            <h3 className="text-xs font-600 text-muted-foreground uppercase tracking-wide mb-3">Current Access</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {accessUsers.map((accessUser) => (
                <div
                  key={accessUser.id}
                  className="flex items-center justify-between p-3.5 bg-muted/30 rounded-lg border border-border/20 hover:bg-muted/50 transition-colors duration-200"
                >
                  <div className="flex-1">
                    <p className="text-sm font-400 text-foreground">
                      {accessUser.name}
                      {accessUser.isOwner && (
                        <span className="ml-2 text-xs text-muted-foreground">(Owner)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{accessUser.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {accessUser.isOwner ? (
                      <span className="text-xs text-muted-foreground px-3 py-1.5 bg-muted/50 rounded border border-border/20">
                        Admin
                      </span>
                    ) : (
                      <>
                        <Select value={accessUser.role} onValueChange={(role: 'admin' | 'editor' | 'viewer') => handleRoleChange(accessUser.id, role)}>
                          <SelectTrigger className="w-24 text-xs border-border/40 hover:border-primary/30 transition-colors duration-200">
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
                          className="h-8 w-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
                          onClick={() => handleRemoveAccess(accessUser.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add New Access */}
          <div className="pt-4 border-t border-border/20">
            <h3 className="text-xs font-600 text-muted-foreground uppercase tracking-wide mb-3">Grant Access</h3>
            <div className="space-y-2.5">
              <Input
                type="email"
                placeholder="Enter email or team name"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddAccess()}
                className="bg-muted/40 border-border/40 focus-visible:bg-muted focus-visible:border-primary/30 transition-all duration-200"
              />
              <div className="flex gap-2">
                <Select value={newRole} onValueChange={(value: 'viewer' | 'editor' | 'admin') => setNewRole(value)}>
                  <SelectTrigger className="flex-1 border-border/40 hover:border-primary/30 transition-colors duration-200">
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
                  size="sm"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Info Text */}
          <div className="bg-muted/20 p-3.5 rounded-lg border border-border/20 text-xs text-muted-foreground space-y-1.5 font-400">
            <div>
              <span className="font-500 text-foreground">Viewer:</span> Can view files only
            </div>
            <div>
              <span className="font-500 text-foreground">Editor:</span> Can view and edit files
            </div>
            <div>
              <span className="font-500 text-foreground">Admin:</span> Full control including sharing
            </div>
          </div>

          {/* Close Button */}
          <Button
            onClick={onClose}
            className="w-full bg-primary hover:bg-primary/90 transition-all duration-200 shadow-sm hover:shadow-md font-400"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
