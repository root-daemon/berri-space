'use client';

import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';

interface AccessUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  type: 'user' | 'team';
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

const mockAccessUsers: AccessUser[] = [
  {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
    role: 'admin',
    type: 'user',
  },
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
  const [accessUsers, setAccessUsers] = useState(mockAccessUsers);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'viewer' | 'editor' | 'admin'>('viewer');

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
    setAccessUsers(accessUsers.filter((user) => user.id !== id));
  };

  const handleRoleChange = (id: string, newRole: 'admin' | 'editor' | 'viewer') => {
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
              {accessUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3.5 bg-muted/30 rounded-lg border border-border/20 hover:bg-muted/50 transition-colors duration-200"
                >
                  <div className="flex-1">
                    <p className="text-sm font-400 text-foreground">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={user.role} onValueChange={(role: any) => handleRoleChange(user.id, role)}>
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
                      onClick={() => handleRemoveAccess(user.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
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
                <Select value={newRole} onValueChange={(value: any) => setNewRole(value)}>
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
