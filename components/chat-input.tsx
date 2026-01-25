'use client';

import React, { useState, KeyboardEvent, FormEvent, useRef, useEffect } from 'react';
import { Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FilePickerDropdown } from './file-picker-dropdown';
import type { MentionedFile } from '@/lib/ai/chat-types';

interface ChatInputProps {
  value?: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  mentionedFiles: MentionedFile[];
  onMentionFile: (file: MentionedFile) => void;
  onRemoveMention: (fileId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  mentionedFiles,
  onMentionFile,
  onRemoveMention,
  disabled = false,
  placeholder = 'Ask a question...',
}: ChatInputProps) {
  const safeValue = value ?? '';
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [atPosition, setAtPosition] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle @ key detection
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Detect @ symbol
    if (e.key === '@') {
      const cursorPosition = inputRef.current?.selectionStart || 0;
      setAtPosition(cursorPosition);
      setShowFilePicker(true);
    }

    // Close picker on Escape
    if (e.key === 'Escape' && showFilePicker) {
      setShowFilePicker(false);
      setAtPosition(null);
    }
  };

  // Handle file selection
  const handleFileSelect = (fileId: string, fileName: string) => {
    // Add file to mentions
    onMentionFile({ fileId, fileName });

    // Insert @mention into input at cursor position
    if (atPosition !== null && inputRef.current) {
      const before = safeValue.substring(0, atPosition);
      const after = safeValue.substring(atPosition);
      const newValue = `${before}@${fileName} ${after}`;
      onChange(newValue);

      // Move cursor after the mention
      setTimeout(() => {
        if (inputRef.current) {
          const newPosition = atPosition + fileName.length + 2; // @ + filename + space
          inputRef.current.setSelectionRange(newPosition, newPosition);
          inputRef.current.focus();
        }
      }, 0);
    }

    setShowFilePicker(false);
    setAtPosition(null);
  };

  // Handle form submission
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    console.warn('[Chat Stream] 0. ChatInput handleSubmit', {
      hasValue: !!safeValue.trim(),
      disabled,
    });
    if (!safeValue.trim() || disabled) return;
    console.warn('[Chat Stream] 0b. ChatInput calling onSubmit');
    onSubmit(e);
  };

  // Focus input when a mention is removed (not on mount)
  const prevMentionCount = useRef(mentionedFiles.length);
  useEffect(() => {
    if (prevMentionCount.current > mentionedFiles.length && inputRef.current) {
      inputRef.current.focus();
    }
    prevMentionCount.current = mentionedFiles.length;
  }, [mentionedFiles.length]);

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {/* Mentioned files badges */}
      {mentionedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {mentionedFiles.map((file) => (
            <Badge
              key={file.fileId}
              variant="secondary"
              className="gap-1 pr-1 py-1 text-xs"
            >
              <span className="truncate max-w-[200px]">{file.fileName}</span>
              <button
                type="button"
                onClick={() => onRemoveMention(file.fileId)}
                className="ml-1 rounded-full hover:bg-muted p-0.5 transition-colors"
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Input with file picker */}
      <div className="flex gap-2 items-end">
        <div className="flex-1 relative">
          <Input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            value={safeValue}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className="pr-10"
          />
          
          {/* @ button hint */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <FilePickerDropdown
              onSelect={handleFileSelect}
              isOpen={showFilePicker}
              onOpenChange={setShowFilePicker}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={disabled}
              >
                <span className="text-sm text-muted-foreground">@</span>
              </Button>
            </FilePickerDropdown>
          </div>
        </div>

        <Button
          type="submit"
          size="icon"
          disabled={disabled || !safeValue.trim()}
          className="flex-shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {/* Hint text */}
      <p className="text-xs text-muted-foreground">
        Type @ or click the button to mention a document
      </p>
    </form>
  );
}
