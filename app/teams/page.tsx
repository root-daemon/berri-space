'use client';

import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, Plus, Users2, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface Team {
  id: string;
  name: string;
  memberCount: number;
  role: 'owner' | 'admin' | 'member';
}

const mockTeams: Team[] = [
  { id: '1', name: 'Product Team', memberCount: 8, role: 'owner' },
  { id: '2', name: 'Design Team', memberCount: 5, role: 'admin' },
  { id: '3', name: 'Engineering', memberCount: 12, role: 'member' },
  { id: '4', name: 'Marketing', memberCount: 4, role: 'member' },
];

export default function TeamsPage() {
  return (
    <>
      <AppHeader breadcrumbs={[{ label: 'Teams' }]} />

      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-500 text-foreground tracking-tight">Teams</h1>
              <p className="text-sm text-muted-foreground mt-2 font-400">
                Manage your teams and collaborate with colleagues
              </p>
            </div>
            <Button className="bg-primary hover:bg-primary/90 gap-2 transition-all duration-200 shadow-md hover:shadow-lg font-400">
              <Plus className="w-4 h-4" />
              Create Team
            </Button>
          </div>

          {/* Teams Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mockTeams.map((team) => (
              <Link key={team.id} href={`/teams/${team.id}`}>
                <div className="bg-card rounded-xl p-6 border border-transparent hover:border-primary/10 hover:shadow-lg transition-all duration-200 ease-out hover:scale-105 hover:-translate-y-0.5 cursor-pointer group active:scale-95 active:transition-transform active:duration-75 h-full">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/15 transition-colors duration-200">
                      <Users2 className="w-6 h-6 text-primary" />
                    </div>
                    <Badge className="bg-muted/60 text-muted-foreground border-0 text-xs font-400 capitalize">
                      {team.role}
                    </Badge>
                  </div>

                  <h3 className="text-lg font-500 text-foreground mb-2">{team.name}</h3>

                  <p className="text-sm text-muted-foreground mb-6 font-400">
                    {team.memberCount} {team.memberCount === 1 ? 'member' : 'members'}
                  </p>

                  <div className="flex items-center text-primary text-sm font-500 group-hover:translate-x-1 transition-transform duration-200">
                    View Team
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Empty Create State */}
          <div className="mt-12 text-center">
            <div className="bg-muted/20 rounded-xl border border-border/20 p-8">
              <Users className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-500 text-foreground mb-2">Want to create a team?</h3>
              <p className="text-sm text-muted-foreground mb-6 font-400 max-w-sm mx-auto">
                Teams help you organize your team members and manage documents collaboratively.
              </p>
              <Button className="bg-primary hover:bg-primary/90 gap-2 transition-all duration-200 shadow-md hover:shadow-lg font-400">
                <Plus className="w-4 h-4" />
                Create Your First Team
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
