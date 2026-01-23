'use client';

import { useState } from 'react';
import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Eye, EyeOff, FileText, Shield } from 'lucide-react';

interface Document {
  id: string;
  name: string;
  owner: string;
  aiAccess: boolean;
}

const mockDocuments: Document[] = [
  { id: '1', name: 'Financial Report Q1.pdf', owner: 'Sarah Chen', aiAccess: true },
  { id: '2', name: 'Employee Records.xlsx', owner: 'HR Team', aiAccess: false },
  { id: '3', name: 'Product Strategy.docx', owner: 'Product Team', aiAccess: true },
  { id: '4', name: 'Legal Documents.pdf', owner: 'Legal Team', aiAccess: false },
];

export default function AdminRedactionsPage() {
  const [documents, setDocuments] = useState<Document[]>(mockDocuments);

  const handleToggleAIAccess = (docId: string) => {
    setDocuments(
      documents.map((doc) =>
        doc.id === docId ? { ...doc, aiAccess: !doc.aiAccess } : doc
      )
    );
  };

  return (
    <>
      <AppHeader breadcrumbs={[{ label: 'Admin' }, { label: 'AI Redactions' }]} />

      <div className="flex-1 overflow-auto">
        <div className="p-8 max-w-6xl">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <Shield className="w-6 h-6 text-primary" />
              <h1 className="text-4xl font-500 text-foreground tracking-tight">
                AI Content Access Control
              </h1>
            </div>
            <p className="text-sm text-muted-foreground mt-2 font-400">
              Control which documents AI assistants can analyze and learn from
            </p>
          </div>

          {/* Warning Banner */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-8 flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-500 text-blue-900">Enterprise Security</p>
              <p className="text-xs text-blue-800 mt-1">
                All AI access is logged and audited. Redaction settings apply in real-time.
              </p>
            </div>
          </div>

          {/* Documents Table */}
          <div className="bg-card rounded-xl border border-border/20 overflow-hidden">
            <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-muted/20 border-b border-border/20 text-xs font-600 text-muted-foreground uppercase tracking-wide">
              <div className="col-span-4">Document</div>
              <div className="col-span-3">Owner</div>
              <div className="col-span-3">AI Access</div>
              <div className="col-span-2 text-right">Action</div>
            </div>

            {documents.map((doc, index) => (
              <div
                key={doc.id}
                className={`grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-primary/3 transition-colors duration-200 ${
                  index !== documents.length - 1 ? 'border-b border-border/20' : ''
                }`}
              >
                <div className="col-span-4 flex items-center gap-3">
                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-sm font-500 text-foreground">{doc.name}</p>
                  </div>
                </div>

                <div className="col-span-3">
                  <p className="text-sm text-muted-foreground font-400">{doc.owner}</p>
                </div>

                <div className="col-span-3">
                  <Badge
                    className={`text-xs font-400 border-0 ${
                      doc.aiAccess
                        ? 'bg-green-500/10 text-green-700'
                        : 'bg-red-500/10 text-red-700'
                    }`}
                  >
                    {doc.aiAccess ? (
                      <div className="flex items-center gap-1.5">
                        <Eye className="w-3 h-3" />
                        Allowed
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <EyeOff className="w-3 h-3" />
                        Redacted
                      </div>
                    )}
                  </Badge>
                </div>

                <div className="col-span-2 text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleAIAccess(doc.id)}
                    className="border-border/20 hover:bg-muted/50 transition-all duration-200 font-400 text-xs"
                  >
                    Toggle
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Info Section */}
          <div className="mt-8 grid grid-cols-2 gap-6">
            <div className="bg-muted/20 p-4 rounded-lg border border-border/20">
              <div className="flex items-start gap-3">
                <Eye className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-500 text-foreground mb-1">Allowed</p>
                  <p className="text-xs text-muted-foreground font-400">
                    AI can access and analyze this document's content for insights and responses
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-muted/20 p-4 rounded-lg border border-border/20">
              <div className="flex items-start gap-3">
                <EyeOff className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-500 text-foreground mb-1">Redacted</p>
                  <p className="text-xs text-muted-foreground font-400">
                    AI cannot access this document. Users won't see it in AI recommendations
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
