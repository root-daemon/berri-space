'use client';

import { useState } from 'react';
import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Users2, Plus, Mail, Trash2 } from 'lucide-react';

interface Member {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
}

const mockMembers: Member[] = [
  { id: '1', name: 'Sarah Chen', email: 'sarah@company.com', role: 'owner' },
  { id: '2', name: 'Alex Kim', email: 'alex@company.com', role: 'admin' },
  { id: '3', name: 'Jordan Lee', email: 'jordan@company.com', role: 'member' },
  { id: '4', name: 'Casey Taylor', email: 'casey@company.com', role: 'member' },
];

export default function TeamDetailPage({ params }: { params: { teamId: string } }) {
  const [members, setMembers] = useState<Member[]>(mockMembers);
  const [inviteEmail, setInviteEmail] = useState('');

  const handleRemoveMember = (memberId: string) => {
    setMembers(members.filter((m) => m.id !== memberId));
  };

  const handleInvite = () => {
    if (inviteEmail) {
      const newMember: Member = {
        id: Date.now().toString(),
        name: inviteEmail.split('@')[0],
        email: inviteEmail,
        role: 'member',
      };
      setMembers([...members, newMember]);
      setInviteEmail('');
    }
  };

  return (
    <>
      <AppHeader
        breadcrumbs={[
          { label: 'Teams', href: '/teams' },
          { label: 'Product Team' },
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
                <h1 className="text-4xl font-500 text-foreground tracking-tight">Product Team</h1>
                <p className="text-sm text-muted-foreground mt-1 font-400">
                  {members.length} members
                </p>
              </div>
            </div>
            <Badge className="bg-primary/10 text-primary border-0">Owner</Badge>
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
                    onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                    className="bg-muted/30 border-border/20 focus-visible:bg-muted focus-visible:border-primary/20 transition-all duration-250"
                  />
                  <Button
                    onClick={handleInvite}
                    className="bg-primary hover:bg-primary/90 transition-all duration-200 shadow-sm hover:shadow-md"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Members List */}
              <div className="space-y-2">
                <h3 className="text-sm font-600 text-muted-foreground uppercase tracking-wide mb-4">
                  Team Members
                </h3>

                <div className="bg-card rounded-xl border border-border/20 overflow-hidden">
                  {members.map((member, index) => (
                    <div
                      key={member.id}
                      className={`flex items-center justify-between p-4 hover:bg-primary/3 transition-colors duration-200 ${
                        index !== members.length - 1 ? 'border-b border-border/20' : ''
                      }`}
                    >
                      <div className="flex-1">
                        <p className="text-sm font-500 text-foreground">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>

                      <div className="flex items-center gap-3">
                        <Badge className="bg-muted/60 text-muted-foreground border-0 text-xs font-400 capitalize">
                          {member.role}
                        </Badge>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
                          onClick={() => handleRemoveMember(member.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
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
