'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Users2, Plus, Trash2, Loader2 } from 'lucide-react';
import {
  getTeamByIdAction,
  getTeamMembersAction,
  addTeamMemberAction,
  removeTeamMemberAction,
  checkIsSuperAdminAction,
} from '@/lib/teams/actions';
import { useToast } from '@/hooks/use-toast';

interface Member {
  user_id: string;
  email: string;
  name: string | null;
  created_at: string;
}

export default function TeamDetailPage({ params }: { params: Promise<{ teamId: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [team, setTeam] = useState<{ id: string; name: string; memberCount: number } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isInviting, setIsInviting] = useState(false);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    loadTeamData();
    checkPermissions();
  }, [resolvedParams.teamId]);

  const checkPermissions = async () => {
    try {
      const result = await checkIsSuperAdminAction();
      if (result.success) {
        setIsSuperAdmin(result.data);
      }
    } catch (error) {
      console.error('Failed to check permissions:', error);
    }
  };

  const loadTeamData = async () => {
    setIsLoading(true);
    try {
      const [teamResult, membersResult] = await Promise.all([
        getTeamByIdAction(resolvedParams.teamId),
        getTeamMembersAction(resolvedParams.teamId),
      ]);

      if (!teamResult.success) {
        if (teamResult.code === 'NOT_FOUND') {
          router.push('/teams');
          toast({
            title: 'Team not found',
            description: 'The team you are looking for does not exist.',
            variant: 'destructive',
          });
          return;
        }
        toast({
          title: 'Failed to load team',
          description: teamResult.error,
          variant: 'destructive',
        });
        return;
      }

      if (!membersResult.success) {
        toast({
          title: 'Failed to load members',
          description: membersResult.error,
          variant: 'destructive',
        });
        return;
      }

      setTeam({
        id: teamResult.data.id,
        name: teamResult.data.name,
        memberCount: teamResult.data.memberCount,
      });
      setMembers(membersResult.data);
    } catch (error) {
      console.error('Failed to load team data:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInvite = async () => {
    const trimmedEmail = inviteEmail.trim();
    if (!trimmedEmail) return;

    setIsInviting(true);
    try {
      const result = await addTeamMemberAction(resolvedParams.teamId, trimmedEmail);

      if (!result.success) {
        toast({
          title: 'Failed to invite member',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Member added',
        description: `${trimmedEmail} has been added to the team`,
      });

      setInviteEmail('');
      loadTeamData(); // Reload to get updated member list
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    setIsRemoving(userId);
    try {
      const result = await removeTeamMemberAction(resolvedParams.teamId, userId);

      if (!result.success) {
        toast({
          title: 'Failed to remove member',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Member removed',
        description: 'The member has been removed from the team',
      });

      loadTeamData(); // Reload to get updated member list
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsRemoving(null);
    }
  };

  if (isLoading) {
    return (
      <>
        <AppHeader breadcrumbs={[{ label: 'Teams', href: '/teams' }, { label: 'Loading...' }]} />
        <div className="flex-1 overflow-auto">
          <div className="p-8">
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!team) {
    return null; // Will redirect in useEffect
  }

  return (
    <>
      <AppHeader
        breadcrumbs={[
          { label: 'Teams', href: '/teams' },
          { label: team.name },
        ]}
      />

      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center">
                <Users2 className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h1 className="text-4xl font-500 text-foreground tracking-tight">{team.name}</h1>
                <p className="text-sm text-muted-foreground mt-1 font-400">
                  {team.memberCount} {team.memberCount === 1 ? 'member' : 'members'}
                </p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="members" className="w-full">
            <TabsList className="bg-muted/30 border-border/20 border rounded-lg p-1 w-full justify-start">
              <TabsTrigger
                value="members"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md transition-all duration-200"
              >
                Members
              </TabsTrigger>
              <TabsTrigger
                value="documents"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md transition-all duration-200"
              >
                Documents
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md transition-all duration-200"
              >
                Settings
              </TabsTrigger>
            </TabsList>

            {/* Members Tab */}
            <TabsContent value="members" className="space-y-6 mt-6">
              {/* Invite Section */}
              {isSuperAdmin && (
                <div className="bg-card rounded-xl border border-border/20 p-6">
                  <h3 className="text-sm font-600 text-foreground uppercase tracking-wide mb-4">
                    Invite Members
                  </h3>

                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="Enter email address"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !isInviting && handleInvite()}
                      disabled={isInviting}
                      className="bg-muted/30 border-border/20 focus-visible:bg-muted focus-visible:border-primary/20 transition-all duration-250"
                    />
                    <Button
                      onClick={handleInvite}
                      disabled={isInviting || !inviteEmail.trim()}
                      className="bg-primary hover:bg-primary/90 transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      {isInviting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Members List */}
              <div className="space-y-2">
                <h3 className="text-sm font-600 text-muted-foreground uppercase tracking-wide mb-4">
                  Team Members
                </h3>

                <div className="bg-card rounded-xl border border-border/20 overflow-hidden">
                  {members.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      No members in this team
                    </div>
                  ) : (
                    members.map((member, index) => (
                      <div
                        key={member.user_id}
                        className={`flex items-center justify-between p-4 hover:bg-primary/3 transition-colors duration-200 ${
                          index !== members.length - 1 ? 'border-b border-border/20' : ''
                        }`}
                      >
                        <div className="flex-1">
                          <p className="text-sm font-500 text-foreground">
                            {member.name || member.email.split('@')[0]}
                          </p>
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        </div>

                        {isSuperAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
                            onClick={() => handleRemoveMember(member.user_id)}
                            disabled={isRemoving === member.user_id}
                          >
                            {isRemoving === member.user_id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Documents Tab */}
            <TabsContent value="documents" className="mt-6">
              <div className="bg-card rounded-xl border border-border/20 p-8 text-center">
                <p className="text-sm text-muted-foreground font-400">
                  Team documents would be displayed here
                </p>
              </div>
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings" className="mt-6">
              <div className="bg-card rounded-xl border border-border/20 p-8 text-center">
                <p className="text-sm text-muted-foreground font-400">
                  Team settings would be displayed here
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}
