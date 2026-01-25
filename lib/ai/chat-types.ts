/**
 * Types for AI Chat functionality
 *
 * These types support the RAG-based chat interface with file mentions
 * and persistent chat history.
 */

// ============================================================================
// CHAT MESSAGE TYPES
// ============================================================================

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  fileIds?: string[];
}

// ============================================================================
// RAG CONTEXT TYPES
// ============================================================================

/**
 * Context selection mode based on user input.
 *
 * - explicit_files: User mentioned specific files with @file
 * - automatic_search: No files mentioned, search all accessible documents
 */
export type ContextMode = 'explicit_files' | 'automatic_search';

export interface ChatContext {
  fileId: string;
  fileName: string;
  chunks: string[];
  similarity: number;
}

/**
 * Result of context retrieval including mode metadata.
 * Used by prompt builder to construct appropriate prompts.
 */
export interface ContextRetrievalResult {
  /** The retrieved document context (may be empty) */
  context: ChatContext[];
  /** How context was selected */
  mode: ContextMode;
  /** Whether any document context was found */
  hasDocumentContext: boolean;
  /** File IDs that were explicitly requested (only for explicit_files mode) */
  requestedFileIds?: string[];
}

// ============================================================================
// FILE MENTION TYPES
// ============================================================================

export interface MentionedFile {
  fileId: string;
  fileName: string;
}

export interface AiReadyFile {
  fileId: string;
  fileName: string;
}

// ============================================================================
// PROMPT BUILDING TYPES
// ============================================================================

export interface ChatPrompt {
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Extended prompt with context metadata for response transparency.
 * Includes information about how context was selected.
 */
export interface ChatPromptWithMetadata extends ChatPrompt {
  /** Context mode used for this prompt */
  mode: ContextMode;
  /** Whether document context was included */
  hasDocumentContext: boolean;
  /** Number of files used as context */
  fileCount: number;
}

// ============================================================================
// CHAT HISTORY TYPES
// ============================================================================

/** Database row for chat_conversations */
export interface DbChatConversation {
  id: string;
  user_id: string;
  organization_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

/** Database row for chat_messages */
export interface DbChatMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  mentioned_file_ids: string[] | null;
  rag_context: ChatContext[] | null;
  created_at: string;
}

/** Conversation summary for list view */
export interface ConversationSummary {
  id: string;
  title: string;
  preview: string;
  updatedAt: Date;
  messageCount: number;
}

/** Full conversation with messages */
export interface ConversationWithMessages {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: StoredMessage[];
}

/** Stored message (from database) */
export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mentionedFileIds: string[];
  createdAt: Date;
}
