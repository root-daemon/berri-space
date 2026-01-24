'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { createFolderAction } from '@/lib/folders/actions';
import { useToast } from '@/hooks/use-toast';

interface CreateFolderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  parentFolderId?: string | null;
  ownerTeamId: string;
  onCreated?: () => void;
}

export function CreateFolderDialog({
  isOpen,
  onClose,
  parentFolderId,
  ownerTeamId,
  onCreated,
}: CreateFolderDialogProps) {
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setName('');
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setIsLoading(true);
    try {
      const result = await createFolderAction({
        name: trimmedName,
        parentFolderId: parentFolderId || null,
        ownerTeamId,
      });

      if (!result.success) {
        toast({
          title: 'Failed to create folder',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Folder created',
        description: `"${trimmedName}" has been created`,
      });

      onClose();
      onCreated?.();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const isValid = name.trim().length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create folder</DialogTitle>
            <DialogDescription>
              Enter a name for the new folder.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="folder-name">Name</Label>
              <Input
                id="folder-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter folder name"
                autoFocus
                disabled={isLoading}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
