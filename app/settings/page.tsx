'use client';

import { useState, useEffect } from 'react';
import { useUser, SignOutButton } from '@clerk/nextjs';
import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { User, Bell, Lock, LogOut, Moon, Sun, Monitor, Users, Loader2, Trash2 } from 'lucide-react';
import {
  getOrganizationMembersAction,
  addOrganizationMemberAction,
  removeOrganizationMemberAction,
  updateOrganizationMemberRoleAction,
  getCurrentUserIdAction,
} from '@/lib/auth/organization-actions';
import { checkIsSuperAdminAction } from '@/lib/teams/actions';
import { useToast } from '@/hooks/use-toast';

type OrganizationMember = {
  user_id: string;
  email: string;
  name: string | null;
  role: 'super_admin' | 'member' | 'admin';
  created_at: string;
};

export default function SettingsPage() {
  const { user, isLoaded } = useUser();
  const [theme, setTheme] = useState('system');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('admin');
  const [isInviting, setIsInviting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { toast } = useToast();

  // Check if user is super_admin and load members
  useEffect(() => {
    async function loadData() {
      if (!isLoaded) return;

      // Get current user's database ID
      const userIdResult = await getCurrentUserIdAction();
      if (userIdResult.success) {
        setCurrentUserId(userIdResult.data);
      }

      // Check if user is super_admin
      const adminCheck = await checkIsSuperAdminAction();
      if (adminCheck.success) {
        setIsSuperAdmin(adminCheck.data);
        if (adminCheck.data) {
          // Load organization members
          await loadMembers();
        }
      } else {
        setIsSuperAdmin(false);
      }
    }
    loadData();
  }, [isLoaded]);

  async function loadMembers() {
    setIsLoadingMembers(true);
    try {
      const result = await getOrganizationMembersAction();
      if (result.success) {
        setMembers(result.data);
      } else {
        toast({
          title: 'Failed to load members',
          description: result.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingMembers(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = inviteEmail.trim().toLowerCase();
    if (!trimmedEmail) return;

    setIsInviting(true);
    try {
      const result = await addOrganizationMemberAction(trimmedEmail, inviteRole);
      if (result.success) {
        toast({
          title: 'Member invited',
          description: `${trimmedEmail} has been added to the organization`,
        });
        setInviteEmail('');
        setInviteRole('admin');
        await loadMembers();
      } else {
        toast({
          title: 'Failed to invite member',
          description: result.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsInviting(false);
    }
  }

  async function handleRemoveMember(userId: string, email: string) {
    if (!confirm(`Are you sure you want to remove ${email} from the organization?`)) {
      return;
    }

    try {
      const result = await removeOrganizationMemberAction(userId);
      if (result.success) {
        toast({
          title: 'Member removed',
          description: `${email} has been removed from the organization`,
        });
        await loadMembers();
      } else {
        toast({
          title: 'Failed to remove member',
          description: result.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    }
  }

  async function handleRoleChange(userId: string, newRole: 'member' | 'admin') {
    try {
      const result = await updateOrganizationMemberRoleAction(userId, newRole);
      if (result.success) {
        toast({
          title: 'Role updated',
          description: `Member role has been updated to ${newRole}`,
        });
        await loadMembers();
      } else {
        toast({
          title: 'Failed to update role',
          description: result.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    }
  }

  // Format the account creation date
  const formatDate = (date: Date | undefined) => {
    if (!date) return 'Unknown';
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };


  return (
    <>
      <AppHeader breadcrumbs={[{ label: 'Settings' }]} />

      <div className="flex-1 overflow-auto">
        <div className="p-8 max-w-3xl">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-500 text-foreground tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground mt-2 font-400">
              Manage your account and preferences
            </p>
          </div>

          {/* Profile Section */}
          <div className="space-y-8">
            {/* Profile Information */}
            <div className="bg-card rounded-xl border border-border/20 p-6">
              <div className="flex items-center gap-3 mb-6">
                <User className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-500 text-foreground">Profile Information</h2>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-border/20">
                  <div>
                    <p className="text-sm font-500 text-foreground">Name</p>
                    <p className="text-xs text-muted-foreground mt-1 font-400">
                      {isLoaded ? (user?.fullName || 'Not set') : 'Loading...'}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border/20 hover:bg-muted/50 transition-all duration-200 font-400 text-xs bg-transparent"
                    onClick={() => user?.update && window.open('https://accounts.clerk.dev/user', '_blank')}
                  >
                    Edit
                  </Button>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-border/20">
                  <div>
                    <p className="text-sm font-500 text-foreground">Email</p>
                    <p className="text-xs text-muted-foreground mt-1 font-400">
                      {isLoaded ? (user?.primaryEmailAddress?.emailAddress || 'Not set') : 'Loading...'}
                    </p>
                  </div>
                  {user?.primaryEmailAddress?.verification?.status === 'verified' ? (
                    <Badge className="bg-green-500/10 text-green-700 border-0 text-xs font-400">
                      Verified
                    </Badge>
                  ) : (
                    <Badge className="bg-yellow-500/10 text-yellow-700 border-0 text-xs font-400">
                      Unverified
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-500 text-foreground">Account Created</p>
                    <p className="text-xs text-muted-foreground mt-1 font-400">
                      {isLoaded ? formatDate(user?.createdAt ? new Date(user.createdAt) : undefined) : 'Loading...'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Appearance */}
            <div className="bg-card rounded-xl border border-border/20 p-6">
              <h2 className="text-lg font-500 text-foreground mb-6 flex items-center gap-3">
                <Sun className="w-5 h-5 text-primary" />
                Appearance
              </h2>

              <div>
                <p className="text-sm font-500 text-foreground mb-3">Theme</p>
                <Select value={theme} onValueChange={setTheme}>
                  <SelectTrigger className="border-border/20 hover:border-primary/30 transition-colors duration-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">
                      <div className="flex items-center gap-2">
                        <Sun className="w-4 h-4" />
                        Light
                      </div>
                    </SelectItem>
                    <SelectItem value="dark">
                      <div className="flex items-center gap-2">
                        <Moon className="w-4 h-4" />
                        Dark
                      </div>
                    </SelectItem>
                    <SelectItem value="system">
                      <div className="flex items-center gap-2">
                        <Monitor className="w-4 h-4" />
                        System
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Notifications */}
            <div className="bg-card rounded-xl border border-border/20 p-6">
              <div className="flex items-center gap-3 mb-6">
                <Bell className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-500 text-foreground">Notifications</h2>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-border/20">
                  <div>
                    <p className="text-sm font-500 text-foreground">Email Notifications</p>
                    <p className="text-xs text-muted-foreground mt-1 font-400">
                      Receive updates about shared documents
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEmailNotifications(!emailNotifications)}
                    className={`border-border/20 font-400 text-xs transition-all duration-200 ${
                      emailNotifications
                        ? 'bg-primary/10 text-primary border-primary/20'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    {emailNotifications ? 'On' : 'Off'}
                  </Button>
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-500 text-foreground">AI Insights</p>
                    <p className="text-xs text-muted-foreground mt-1 font-400">
                      Get notified when AI finds important information
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border/20 hover:bg-muted/50 transition-all duration-200 font-400 text-xs bg-primary/10 text-primary border-primary/20"
                  >
                    On
                  </Button>
                </div>
              </div>
            </div>

            {/* Organization Section - Only visible to super_admins */}
            {isSuperAdmin === true && (
              <div className="bg-card rounded-xl border border-border/20 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Users className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-500 text-foreground">Organization</h2>
                </div>

                <div className="space-y-6">
                  {/* Invite Member Card */}
                  <div className="border border-border/20 rounded-lg p-4 bg-muted/30">
                    <h3 className="text-sm font-500 text-foreground mb-4">Invite Member</h3>
                    <form onSubmit={handleInvite} className="space-y-4">
                      <div className="grid gap-2">
                        <Label htmlFor="invite-email">Email</Label>
                        <Input
                          id="invite-email"
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="user@example.com"
                          disabled={isInviting}
                          required
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="invite-role">Role</Label>
                        <Select
                          value={inviteRole}
                          onValueChange={(value: 'member' | 'admin') => setInviteRole(value)}
                          disabled={isInviting}
                        >
                          <SelectTrigger className="border-border/20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button type="submit" disabled={isInviting || !inviteEmail.trim()}>
                        {isInviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Invite to Organization
                      </Button>
                    </form>
                  </div>

                  {/* Members List */}
                  <div>
                    <h3 className="text-sm font-500 text-foreground mb-4">Members</h3>
                    {isLoadingMembers ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : members.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-8 text-center">
                        No members found
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {members.map((member) => {
                          const isCurrentUser = currentUserId !== null && member.user_id === currentUserId;
                          // Super admin cannot be removed or have role changed
                          const isSuperAdmin = member.role === 'super_admin';
                          // Admin and member users can be removed, super_admin cannot be removed
                          const canRemove = !isCurrentUser && !isSuperAdmin;
                          // Can only change role for admin and member users (not super_admin)
                          const canChangeRole = !isSuperAdmin;

                          return (
                            <div
                              key={member.user_id}
                              className="flex items-center justify-between py-3 px-4 border border-border/20 rounded-lg bg-muted/30"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-500 text-foreground">
                                    {member.name || member.email}
                                  </p>
                                  {isCurrentUser && (
                                    <Badge variant="outline" className="text-xs">
                                      You
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">{member.email}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                <Select
                                  value={member.role}
                                  onValueChange={(value: 'member' | 'admin') =>
                                    handleRoleChange(member.user_id, value)
                                  }
                                  disabled={!canChangeRole}
                                >
                                  <SelectTrigger className="w-32 border-border/20">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="member">Member</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Badge
                                  className={
                                    member.role === 'super_admin'
                                      ? 'bg-primary/10 text-primary border-0'
                                      : member.role === 'admin'
                                      ? 'bg-primary/10 text-primary border-0'
                                      : 'bg-muted text-muted-foreground border-0'
                                  }
                                >
                                  {member.role === 'super_admin' ? 'Super Admin' : member.role === 'admin' ? 'Admin' : 'Member'}
                                </Badge>
                                {canRemove && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveMember(member.user_id, member.email)}
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Security */}
            <div className="bg-card rounded-xl border border-border/20 p-6">
              <div className="flex items-center gap-3 mb-6">
                <Lock className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-500 text-foreground">Security</h2>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-border/20">
                  <div>
                    <p className="text-sm font-500 text-foreground">Password</p>
                    <p className="text-xs text-muted-foreground mt-1 font-400">
                      Manage your password
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border/20 hover:bg-muted/50 transition-all duration-200 font-400 text-xs bg-transparent"
                    onClick={() => window.open('https://accounts.clerk.dev/user/security', '_blank')}
                  >
                    Change
                  </Button>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-border/20">
                  <div>
                    <p className="text-sm font-500 text-foreground">Active Sessions</p>
                    <p className="text-xs text-muted-foreground mt-1 font-400">
                      Manage your active sessions
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border/20 hover:bg-muted/50 transition-all duration-200 font-400 text-xs bg-transparent"
                    onClick={() => window.open('https://accounts.clerk.dev/user/security', '_blank')}
                  >
                    Manage
                  </Button>
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-500 text-foreground">Two-Factor Auth</p>
                    <p className="text-xs text-muted-foreground mt-1 font-400">
                      {user?.twoFactorEnabled ? 'Enabled' : 'Not enabled'}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border/20 hover:bg-muted/50 transition-all duration-200 font-400 text-xs bg-transparent"
                    onClick={() => window.open('https://accounts.clerk.dev/user/security', '_blank')}
                  >
                    {user?.twoFactorEnabled ? 'Manage' : 'Enable'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Sign Out */}
            <SignOutButton redirectUrl="/">
              <Button
                variant="outline"
                className="w-full border-destructive/30 hover:bg-destructive/10 text-destructive transition-all duration-200 font-400 gap-2 bg-transparent"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </Button>
            </SignOutButton>
          </div>
        </div>
      </div>
    </>
  );
}
