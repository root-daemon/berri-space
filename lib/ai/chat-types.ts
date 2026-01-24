/**
 * Types for AI Chat functionality
 *
 * These types support the RAG-based chat interface with file mentions.
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

export interface ChatContext {
  fileId: string;
  fileName: string;
  chunks: string[];
  similarity: number;
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
