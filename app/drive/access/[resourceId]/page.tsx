'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, FileText, Plus, Trash2, Users, Lock, Loader2, Folder } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  getResourceInfoAction,
  listResourcePermissionsAction,
  grantResourcePermissionAction,
  revokeResourcePermissionAction,
  updateResourcePermissionAction,
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
  permissionId?: string;
}

export default function ManageAccessPage({ params }: { params: Promise<{ resourceId: string }> }) {
  const router = useRouter();
  const { toast } = useToast();
  const { resourceId } = use(params);
  const [resourceType, setResourceType] = useState<'folder' | 'file' | null>(null);
  const [resourceName, setResourceName] = useState<string>('');
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [newIdentifier, setNewIdentifier] = useState('');
  const [newRole, setNewRole] = useState<'viewer' | 'editor' | 'admin'>('viewer');
  const [newGranteeType, setNewGranteeType] = useState<'user' | 'team'>('user');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<ResourceRole | null>(null);
  const [teams, setTeams] = useState<DbTeam[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);

  // Fetch resource info and permissions
  useEffect(() => {
    fetchResourceData();
    fetchTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId]);

  // Fetch teams when grantee type changes to team
  useEffect(() => {
    if (newGranteeType === 'team' && teams.length === 0) {
      fetchTeams();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newGranteeType, teams.length]);

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

  const fetchResourceData = async () => {
    if (!resourceId) return;

    setIsLoading(true);
    setError(null);

    try {
      // Get resource info (type and name)
      const resourceInfo = await getResourceInfoAction(resourceId);
      if (!resourceInfo.success) {
        setError(resourceInfo.error);
        toast({
          title: 'Resource not found',
          description: resourceInfo.error,
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      setResourceType(resourceInfo.data.type);
      setResourceName(resourceInfo.data.name);

      // Get permissions
      const permissionsResult = await listResourcePermissionsAction(
        resourceInfo.data.type,
        resourceId
      );

      if (!permissionsResult.success) {
        setError(permissionsResult.error);
        toast({
          title: 'Failed to load permissions',
          description: permissionsResult.error,
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      // Build access users list
      const accessUsers: AccessUser[] = [];

      // Add owner team if exists
      if (permissionsResult.data.ownerTeam) {
        accessUsers.push({
          id: permissionsResult.data.ownerTeam.id,
          name: permissionsResult.data.ownerTeam.name,
          role: 'admin',
          type: 'team',
          isOwner: true,
        });
      }

      // Add explicit permissions
      for (const perm of permissionsResult.data.permissions) {
        // Skip deny permissions in the UI
        if (perm.permissionType === 'deny') {
          continue;
        }

        // Skip if this is the owner team (already added above)
        if (perm.granteeType === 'team' && permissionsResult.data.ownerTeam?.id === perm.granteeId) {
          continue;
        }

        accessUsers.push({
          id: perm.granteeId,
          name: perm.granteeName,
          email: perm.granteeEmail,
          role: perm.role,
          type: perm.granteeType,
          permissionId: perm.id,
        });
      }

      setUsers(accessUsers);
      setUserRole(permissionsResult.data.userRole);
    } catch (err) {
      console.error('Failed to fetch resource data:', err);
      setError('Failed to load resource');
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddAccess = async () => {
    if (!resourceId || !resourceType || !newIdentifier.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await grantResourcePermissionAction(
        resourceType,
        resourceId,
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

      // Refresh permissions
      await fetchResourceData();
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
    if (!resourceId || !resourceType || accessUser.isOwner) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await revokeResourcePermissionAction(
        resourceType,
        resourceId,
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

      // Refresh permissions
      await fetchResourceData();
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
    if (!resourceId || !resourceType || accessUser.isOwner) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await updateResourcePermissionAction(
        resourceType,
        resourceId,
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

      // Refresh permissions
      await fetchResourceData();
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

  // Build breadcrumbs
  const breadcrumbs = [
    { label: 'My Drive', href: '/drive' },
    { label: 'Access Settings' },
  ];

  return (
    <>
      <AppHeader breadcrumbs={breadcrumbs} />

      <div className="flex-1 overflow-auto">
        <div className="p-8 max-w-4xl">
          {isLoading && !resourceName ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : error && !resourceName ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <AlertTriangle className="w-12 h-12 text-destructive" />
              <p className="text-muted-foreground">{error}</p>
              <Button variant="outline" onClick={() => router.push('/drive')}>
                Go to Drive
              </Button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="mb-8">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    {resourceType === 'folder' ? (
                      <Folder className="w-6 h-6 text-primary" />
                    ) : (
                      <FileText className="w-6 h-6 text-primary" />
                    )}
                  </div>
                  <div>
                    <h1 className="text-4xl font-500 text-foreground tracking-tight">
                      Manage Access
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1 font-400">{resourceName}</p>
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-8 flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-500 text-destructive">Error</p>
                    <p className="text-xs text-destructive/80 mt-1">{error}</p>
                  </div>
                </div>
              )}

              {/* Warning Banner */}
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-8 flex gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-500 text-yellow-900">Access Control Active</p>
                  <p className="text-xs text-yellow-800 mt-1">
                    This {resourceType} is shared with {users.length} {users.length === 1 ? 'person' : 'people'}. Changes will take effect immediately.
                  </p>
                </div>
              </div>

              {/* Current Access Section */}
              <div className="mb-8">
                <h2 className="text-sm font-600 text-muted-foreground uppercase tracking-wide mb-4">
                  Current Access
                </h2>

                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : users.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No explicit permissions set
                  </p>
                ) : (
                  <div className="space-y-2">
                    {users.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-4 bg-card rounded-lg border border-border/20 hover:bg-muted/30 transition-colors duration-200"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-500 text-foreground">
                            {user.name}
                            {user.isOwner && (
                              <span className="ml-2 text-xs text-muted-foreground">(Owner)</span>
                            )}
                            {user.type === 'team' && (
                              <span className="ml-2 text-xs text-muted-foreground">(Team)</span>
                            )}
                          </p>
                          {user.email && (
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          {user.isOwner ? (
                            <span className="text-xs text-muted-foreground px-3 py-1.5 bg-muted/50 rounded border border-border/20">
                              Admin
                            </span>
                          ) : (
                            <>
                              <Select
                                value={user.role}
                                onValueChange={(role) => handleRoleChange(user, role as any)}
                                disabled={!canRevoke || isLoading}
                              >
                                <SelectTrigger className="w-28 text-xs border-border/20 hover:border-primary/30 transition-colors duration-200">
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
                                  className="h-9 w-9 text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
                                  onClick={() => handleRemoveAccess(user)}
                                  disabled={isLoading}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Grant Access Section */}
              <div className="mb-8 border-t border-border/20 pt-8">
                <h2 className="text-sm font-600 text-muted-foreground uppercase tracking-wide mb-4">
                  Grant Access
                </h2>

                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Select
                      value={newGranteeType}
                      onValueChange={(value: 'user' | 'team') => {
                        setNewGranteeType(value);
                        setNewIdentifier(''); // Reset identifier when switching types
                      }}
                      disabled={isLoading}
                    >
                      <SelectTrigger className="w-24 border-border/20 hover:border-primary/30 transition-colors duration-200">
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
                        <SelectTrigger className="flex-1 border-border/20 hover:border-primary/30 transition-colors duration-200">
                          <SelectValue placeholder={isLoadingTeams ? 'Loading teams...' : 'Select a team'} />
                        </SelectTrigger>
                        <SelectContent>
                          {teams
                            .filter((team) => !users.some((u) => u.id === team.id && u.type === 'team'))
                            .map((team) => (
                              <SelectItem key={team.id} value={team.name}>
                                {team.name}
                              </SelectItem>
                            ))}
                          {teams.filter((team) => !users.some((u) => u.id === team.id && u.type === 'team')).length === 0 && !isLoadingTeams && (
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
                        className="flex-1 bg-muted/30 border-border/20 focus-visible:bg-muted focus-visible:border-primary/20 transition-all duration-250"
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
                      <SelectTrigger className="flex-1 border-border/20 hover:border-primary/30 transition-colors duration-200">
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
            </>
          )}
        </div>
      </div>
    </>
  );
}
