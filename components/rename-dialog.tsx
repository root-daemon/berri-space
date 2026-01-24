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

interface RenameDialogProps {
  isOpen: boolean;
  onClose: () => void;
  itemName: string;
  itemType: 'folder' | 'file';
  onRename: (newName: string) => void;
  isLoading?: boolean;
}

export function RenameDialog({
  isOpen,
  onClose,
  itemName,
  itemType,
  onRename,
  isLoading = false,
}: RenameDialogProps) {
  const [newName, setNewName] = useState(itemName);

  // Reset name when dialog opens with a new item
  useEffect(() => {
    if (isOpen) {
      setNewName(itemName);
    }
  }, [isOpen, itemName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newName.trim();
    if (trimmedName && trimmedName !== itemName) {
      onRename(trimmedName);
    }
  };

  const isValid = newName.trim().length > 0 && newName.trim() !== itemName;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Rename {itemType}</DialogTitle>
            <DialogDescription>
              Enter a new name for this {itemType}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={`Enter ${itemType} name`}
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
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
