'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2, AlertCircle } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';
import {
  listResourcePermissionsAction,
  grantResourcePermissionAction,
  revokeResourcePermissionAction,
  updateResourcePermissionAction,
  type PermissionEntry,
} from '@/lib/permissions/actions';
import { getUserTeamsAction } from '@/lib/teams/actions';
import type { ResourceRole, GranteeType } from '@/lib/supabase/types';
import type { DbTeam } from '@/lib/supabase/types';

interface AccessUser {
  id: string;
  name: string;
  email?: string;
  role: 'admin' | 'editor' | 'viewer';
  type: 'user' | 'team';
  isOwner?: boolean;
  permissionId?: string; // For revoking/updating
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

export function ManageAccessModal({ isOpen, onClose, item }: ManageAccessModalProps) {
  const { toast } = useToast();
  const [accessUsers, setAccessUsers] = useState<AccessUser[]>([]);
  const [newIdentifier, setNewIdentifier] = useState('');
  const [newRole, setNewRole] = useState<'viewer' | 'editor' | 'admin'>('viewer');
  const [newGranteeType, setNewGranteeType] = useState<'user' | 'team'>('user');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<ResourceRole | null>(null);
  const [teams, setTeams] = useState<DbTeam[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);

  // Fetch permissions and teams when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchPermissions();
      fetchTeams();
    } else {
      // Reset state when modal closes
      setAccessUsers([]);
      setNewIdentifier('');
      setNewRole('viewer');
      setNewGranteeType('user');
      setError(null);
      setTeams([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, item.id, item.type]);

  // Fetch teams when grantee type changes to team
  useEffect(() => {
    if (isOpen && newGranteeType === 'team' && teams.length === 0) {
      fetchTeams();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, newGranteeType, teams.length]);

  const fetchPermissions = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await listResourcePermissionsAction(item.type, item.id);

      if (!result.success) {
        setError(result.error);
        toast({
          title: 'Failed to load permissions',
          description: result.error,
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      // Build access users list
      const users: AccessUser[] = [];

      // Add owner team if exists (read-only, admin role)
      if (result.data.ownerTeam) {
        users.push({
          id: result.data.ownerTeam.id,
          name: result.data.ownerTeam.name,
          role: 'admin',
          type: 'team',
          isOwner: true,
        });
      }

      // Add explicit permissions
      for (const perm of result.data.permissions) {
        // Skip deny permissions in the UI (they're handled by the backend)
        if (perm.permissionType === 'deny') {
          continue;
        }

        // Skip if this is the owner team (already added above)
        if (perm.granteeType === 'team' && result.data.ownerTeam?.id === perm.granteeId) {
          continue;
        }

        users.push({
          id: perm.granteeId,
          name: perm.granteeName,
          email: perm.granteeEmail,
          role: perm.role,
          type: perm.granteeType,
          permissionId: perm.id,
        });
      }

      setAccessUsers(users);
      setUserRole(result.data.userRole);
    } catch (err) {
      console.error('Failed to fetch permissions:', err);
      setError('Failed to load permissions');
      toast({
        title: 'Error',
        description: 'Failed to load permissions',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTeams = async () => {
    setIsLoadingTeams(true);
    try {
      const result = await getUserTeamsAction();
      if (result.success) {
        setTeams(result.data);
      } else {
        console.error('Failed to fetch teams:', result.error);
      }
    } catch (err) {
      console.error('Failed to fetch teams:', err);
    } finally {
      setIsLoadingTeams(false);
    }
  };

  const handleAddAccess = async () => {
    if (!newIdentifier.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await grantResourcePermissionAction(
        item.type,
        item.id,
        newGranteeType,
        newIdentifier.trim(),
        newRole
      );

      if (!result.success) {
        setError(result.error);
        toast({
          title: 'Failed to grant access',
          description: result.error,
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      toast({
        title: 'Access granted',
        description: `${result.data.granteeName} now has ${newRole} access`,
      });

      // Refresh permissions list
      await fetchPermissions();
      setNewIdentifier('');
      setNewRole('viewer');
      // Refresh teams to update available options
      await fetchTeams();
    } catch (err) {
      console.error('Failed to grant access:', err);
      setError('Failed to grant access');
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveAccess = async (accessUser: AccessUser) => {
    // Don't allow removing the owner
    if (accessUser.isOwner) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await revokeResourcePermissionAction(
        item.type,
        item.id,
        accessUser.type as GranteeType,
        accessUser.id
      );

      if (!result.success) {
        setError(result.error);
        toast({
          title: 'Failed to revoke access',
          description: result.error,
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      toast({
        title: 'Access revoked',
        description: `${accessUser.name}'s access has been removed`,
      });

      // Refresh permissions list
      await fetchPermissions();
    } catch (err) {
      console.error('Failed to revoke access:', err);
      setError('Failed to revoke access');
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleChange = async (accessUser: AccessUser, newRole: 'admin' | 'editor' | 'viewer') => {
    // Don't allow changing owner's role
    if (accessUser.isOwner) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await updateResourcePermissionAction(
        item.type,
        item.id,
        accessUser.type as GranteeType,
        accessUser.id,
        newRole
      );

      if (!result.success) {
        setError(result.error);
        toast({
          title: 'Failed to update role',
          description: result.error,
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      toast({
        title: 'Role updated',
        description: `${accessUser.name}'s role changed to ${newRole}`,
      });

      // Refresh permissions list
      await fetchPermissions();
    } catch (err) {
      console.error('Failed to update role:', err);
      setError('Failed to update role');
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Determine if user can grant admin role (only admins can)
  const canGrantAdmin = userRole === 'admin';
  // Determine if user can revoke/update (only admins can)
  const canRevoke = userRole === 'admin';

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
          {/* Error Message */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex gap-2">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          {/* Loading State */}
          {isLoading && accessUsers.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Current Access Users */}
              <div>
                <h3 className="text-xs font-600 text-muted-foreground uppercase tracking-wide mb-3">Current Access</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {accessUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No explicit permissions set</p>
                  ) : (
                    accessUsers.map((accessUser) => (
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
                            {accessUser.type === 'team' && (
                              <span className="ml-2 text-xs text-muted-foreground">(Team)</span>
                            )}
                          </p>
                          {accessUser.email && (
                            <p className="text-xs text-muted-foreground">{accessUser.email}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {accessUser.isOwner ? (
                            <span className="text-xs text-muted-foreground px-3 py-1.5 bg-muted/50 rounded border border-border/20">
                              Admin
                            </span>
                          ) : (
                            <>
                              <Select
                                value={accessUser.role}
                                onValueChange={(role: 'admin' | 'editor' | 'viewer') => handleRoleChange(accessUser, role)}
                                disabled={!canRevoke || isLoading}
                              >
                                <SelectTrigger className="w-24 text-xs border-border/40 hover:border-primary/30 transition-colors duration-200">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="viewer">Viewer</SelectItem>
                                  <SelectItem value="editor">Editor</SelectItem>
                                  {canGrantAdmin && <SelectItem value="admin">Admin</SelectItem>}
                                </SelectContent>
                              </Select>
                              {canRevoke && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
                                  onClick={() => handleRemoveAccess(accessUser)}
                                  disabled={isLoading}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add New Access */}
              <div className="pt-4 border-t border-border/20">
                <h3 className="text-xs font-600 text-muted-foreground uppercase tracking-wide mb-3">Grant Access</h3>
                <div className="space-y-2.5">
                  <div className="flex gap-2">
                    <Select value={newGranteeType} onValueChange={(value: 'user' | 'team') => {
                      setNewGranteeType(value);
                      setNewIdentifier(''); // Reset identifier when switching types
                    }}>
                      <SelectTrigger className="w-24 border-border/40 hover:border-primary/30 transition-colors duration-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="team">Team</SelectItem>
                      </SelectContent>
                    </Select>
                    {newGranteeType === 'team' ? (
                      <Select
                        value={newIdentifier}
                        onValueChange={setNewIdentifier}
                        disabled={isLoading || isLoadingTeams}
                      >
                        <SelectTrigger className="flex-1 border-border/40 hover:border-primary/30 transition-colors duration-200">
                          <SelectValue placeholder={isLoadingTeams ? 'Loading teams...' : 'Select a team'} />
                        </SelectTrigger>
                        <SelectContent>
                          {teams
                            .filter((team) => !accessUsers.some((au) => au.id === team.id && au.type === 'team'))
                            .map((team) => (
                              <SelectItem key={team.id} value={team.name}>
                                {team.name}
                              </SelectItem>
                            ))}
                          {teams.filter((team) => !accessUsers.some((au) => au.id === team.id && au.type === 'team')).length === 0 && !isLoadingTeams && (
                            <div className="px-2 py-1.5 text-sm text-muted-foreground">
                              No teams available
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type="email"
                        placeholder="Enter email"
                        value={newIdentifier}
                        onChange={(e) => setNewIdentifier(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleAddAccess()}
                        className="flex-1 bg-muted/40 border-border/40 focus-visible:bg-muted focus-visible:border-primary/30 transition-all duration-200"
                        disabled={isLoading}
                      />
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Select
                      value={newRole}
                      onValueChange={(value: 'viewer' | 'editor' | 'admin') => setNewRole(value)}
                      disabled={isLoading}
                    >
                      <SelectTrigger className="flex-1 border-border/40 hover:border-primary/30 transition-colors duration-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">Viewer</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        {canGrantAdmin && <SelectItem value="admin">Admin</SelectItem>}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={handleAddAccess}
                      className="bg-primary hover:bg-primary/90 transition-all duration-200 shadow-sm hover:shadow-md"
                      size="sm"
                      disabled={isLoading || !newIdentifier.trim()}
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
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
            </>
          )}

          {/* Close Button */}
          <Button
            onClick={onClose}
            className="w-full bg-primary hover:bg-primary/90 transition-all duration-200 shadow-sm hover:shadow-md font-400"
            disabled={isLoading}
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
