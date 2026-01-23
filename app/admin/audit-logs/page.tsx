'use client';

import { useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Clock, Search, FileText, Download, Share2, Lock, Eye } from 'lucide-react';

interface AuditLog {
  id: string;
  user: string;
  action: string;
  resource: string;
  resourceType: 'document' | 'folder' | 'team' | 'user';
  timestamp: Date;
  ipAddress: string;
}

const mockLogs: AuditLog[] = [
  {
    id: '1',
    user: 'Sarah Chen',
    action: 'Downloaded',
    resource: 'Financial Report Q1.pdf',
    resourceType: 'document',
    timestamp: new Date('2024-02-15T14:30:00'),
    ipAddress: '192.168.1.100',
  },
  {
    id: '2',
    user: 'Alex Kim',
    action: 'Shared',
    resource: 'Q1 Reports',
    resourceType: 'folder',
    timestamp: new Date('2024-02-15T13:15:00'),
    ipAddress: '192.168.1.101',
  },
  {
    id: '3',
    user: 'Jordan Lee',
    action: 'Modified',
    resource: 'Budget Analysis.xlsx',
    resourceType: 'document',
    timestamp: new Date('2024-02-15T11:45:00'),
    ipAddress: '192.168.1.102',
  },
  {
    id: '4',
    user: 'Casey Taylor',
    action: 'Added member',
    resource: 'Product Team',
    resourceType: 'team',
    timestamp: new Date('2024-02-15T10:20:00'),
    ipAddress: '192.168.1.103',
  },
  {
    id: '5',
    user: 'Sarah Chen',
    action: 'Granted access',
    resource: 'Confidential.pdf',
    resourceType: 'document',
    timestamp: new Date('2024-02-15T09:00:00'),
    ipAddress: '192.168.1.100',
  },
];

const getActionIcon = (action: string) => {
  switch (action.toLowerCase()) {
    case 'downloaded':
      return <Download className="w-4 h-4 text-blue-600" />;
    case 'shared':
      return <Share2 className="w-4 h-4 text-green-600" />;
    case 'modified':
      return <FileText className="w-4 h-4 text-orange-600" />;
    case 'added member':
      return <Eye className="w-4 h-4 text-purple-600" />;
    case 'granted access':
      return <Lock className="w-4 h-4 text-red-600" />;
    default:
      return <Clock className="w-4 h-4 text-muted-foreground" />;
  }
};

const getActionBadgeColor = (action: string) => {
  switch (action.toLowerCase()) {
    case 'downloaded':
      return 'bg-blue-500/10 text-blue-700 border-0';
    case 'shared':
      return 'bg-green-500/10 text-green-700 border-0';
    case 'modified':
      return 'bg-orange-500/10 text-orange-700 border-0';
    case 'added member':
      return 'bg-purple-500/10 text-purple-700 border-0';
    case 'granted access':
      return 'bg-red-500/10 text-red-700 border-0';
    default:
      return 'bg-muted/60 text-muted-foreground border-0';
  }
};

export default function AdminAuditLogsPage() {
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('all');

  const filteredLogs = mockLogs.filter((log) => {
    const matchesSearch =
      log.user.toLowerCase().includes(search.toLowerCase()) ||
      log.resource.toLowerCase().includes(search.toLowerCase()) ||
      log.ipAddress.includes(search);
    const matchesAction = filterAction === 'all' || log.action === filterAction;
    return matchesSearch && matchesAction;
  });

  return (
    <>
      <AppHeader
        breadcrumbs={[
          { label: 'Admin' },
          { label: 'Audit Logs' },
        ]}
      />

      <div className="flex-1 overflow-auto">
        <div className="p-8 max-w-7xl">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-500 text-foreground tracking-tight">Audit Logs</h1>
            <p className="text-sm text-muted-foreground mt-2 font-400">
              Enterprise compliance and security audit trail
            </p>
          </div>

          {/* Filters */}
          <div className="flex gap-3 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by user, resource, or IP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-muted/30 border-border/20 focus-visible:bg-muted focus-visible:border-primary/20 transition-all duration-250"
              />
            </div>

            <Select value={filterAction} onValueChange={setFilterAction}>
              <SelectTrigger className="w-48 border-border/20 hover:border-primary/30 transition-colors duration-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="Downloaded">Downloaded</SelectItem>
                <SelectItem value="Shared">Shared</SelectItem>
                <SelectItem value="Modified">Modified</SelectItem>
                <SelectItem value="Added member">Added member</SelectItem>
                <SelectItem value="Granted access">Granted access</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              className="border-border/20 hover:bg-muted/50 transition-all duration-200 font-400 gap-2 bg-transparent"
            >
              <Download className="w-4 h-4" />
              Export
            </Button>
          </div>

          {/* Logs Table */}
          <div className="bg-card rounded-xl border border-border/20 overflow-hidden">
            <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-muted/20 border-b border-border/20 text-xs font-600 text-muted-foreground uppercase tracking-wide sticky top-0">
              <div className="col-span-2">User</div>
              <div className="col-span-3">Action & Resource</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-2">Timestamp</div>
              <div className="col-span-3">IP Address</div>
            </div>

            {filteredLogs.length > 0 ? (
              <div>
                {filteredLogs.map((log, index) => (
                  <div
                    key={log.id}
                    className={`grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-primary/3 transition-colors duration-200 ${
                      index !== filteredLogs.length - 1 ? 'border-b border-border/20' : ''
                    }`}
                  >
                    <div className="col-span-2">
                      <p className="text-sm font-500 text-foreground">{log.user}</p>
                    </div>

                    <div className="col-span-3">
                      <div className="flex items-center gap-2">
                        {getActionIcon(log.action)}
                        <div>
                          <p className="text-sm font-400 text-foreground">{log.action}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{log.resource}</p>
                        </div>
                      </div>
                    </div>

                    <div className="col-span-2">
                      <Badge className={`text-xs font-400 capitalize ${getActionBadgeColor(log.action)}`}>
                        {log.resourceType}
                      </Badge>
                    </div>

                    <div className="col-span-2">
                      <div>
                        <p className="text-sm font-400 text-foreground">
                          {log.timestamp.toLocaleDateString()}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {log.timestamp.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="col-span-3">
                      <p className="text-sm font-400 text-muted-foreground font-mono text-xs">
                        {log.ipAddress}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-muted-foreground font-400">No audit logs found</p>
              </div>
            )}
          </div>

          {/* Pagination Info */}
          <div className="mt-6 text-xs text-muted-foreground font-400 text-center">
            Showing {filteredLogs.length} of {mockLogs.length} entries • Logs retained for 1 year
          </div>
        </div>
      </div>
    </>
  );
}
