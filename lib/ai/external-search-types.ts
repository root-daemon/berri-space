/**
 * Types for External Web Search functionality
 *
 * Supports the NotebookLM-style RAG system where internal documents
 * are the primary source, with external web search as fallback.
 *
 * SECURITY:
 * - External content is EPHEMERAL - never persisted to database
 * - Internal and external context are NEVER mixed silently
 * - Distinct prompt templates per mode ensure transparency
 */

// ============================================================================
// EXTENDED CONTEXT MODES
// ============================================================================

/**
 * Extended context selection mode based on user input and retrieval results.
 *
 * - explicit_files: User mentioned @file - search ONLY those files
 * - automatic_search: No files mentioned - search ALL accessible documents
 * - external_search: Internal search returned no results - web search fallback
 * - general_knowledge: No context found anywhere - use AI general knowledge
 */
export type ExtendedContextMode =
  | 'explicit_files'
  | 'automatic_search'
  | 'external_search'
  | 'general_knowledge';

// ============================================================================
// EXTERNAL CONTEXT TYPES
// ============================================================================

/**
 * Web search result from SearXNG.
 */
export interface WebSearchResult {
  url: string;
  title: string;
  snippet: string;
  engine: string;
}

/**
 * Crawled web content (ephemeral - NOT persisted).
 *
 * SECURITY: This content is temporary and must NEVER be stored in the database.
 * It exists only for the duration of the chat request.
 */
export interface ExternalContext {
  /** Source URL */
  url: string;
  /** Page title (may be null if extraction failed) */
  title: string | null;
  /** Extracted main content */
  content: string;
  /** Content chunks for prompt building (NOT stored) */
  chunks: string[];
}

/**
 * Result of external search operation.
 */
export interface ExternalSearchResult {
  /** Successfully crawled content */
  contexts: ExternalContext[];
  /** Whether any content was retrieved */
  hasContent: boolean;
  /** Search query used */
  query: string;
  /** URLs that were searched */
  searchedUrls: string[];
  /** Any errors encountered */
  errors: string[];
}

// ============================================================================
// EXTENDED CONTEXT RETRIEVAL RESULT
// ============================================================================

/**
 * Combined result of internal and external context retrieval.
 *
 * Supports the decision tree:
 * 1. User mentions @file → internal search only
 * 2. No @file → search all documents
 *    - Found → use internal context
 *    - Not found → trigger external search
 * 3. External search
 *    - Found → use external context (with citations)
 *    - Not found → general knowledge with disclaimer
 */
export interface ExtendedContextRetrievalResult {
  /** Internal document context from pgvector search */
  internalContext: InternalContext[];
  /** Whether internal documents provided relevant context */
  hasInternalContext: boolean;

  /** External web context (ephemeral, NOT persisted) */
  externalContext: ExternalContext[];
  /** Whether external search provided context */
  hasExternalContext: boolean;

  /** Final mode selected based on decision tree */
  mode: ExtendedContextMode;

  /** File IDs explicitly requested by user (only for explicit_files mode) */
  requestedFileIds?: string[];

  /** Which searches were performed */
  searchPerformed: {
    internal: boolean;
    external: boolean;
  };
}

/**
 * Internal context from document chunks.
 * Mirrors ChatContext from chat-types.ts for consistency.
 */
export interface InternalContext {
  fileId: string;
  fileName: string;
  chunks: string[];
  similarity: number;
}

// ============================================================================
// EXTENDED PROMPT TYPES
// ============================================================================

/**
 * Extended prompt with context metadata for response transparency.
 */
export interface ExtendedChatPromptResult {
  /** System prompt for the LLM */
  systemPrompt: string;
  /** User prompt with context and question */
  userPrompt: string;
  /** Context mode used */
  mode: ExtendedContextMode;
  /** Whether internal document context was included */
  hasInternalContext: boolean;
  /** Whether external web context was included */
  hasExternalContext: boolean;
  /** Number of internal files used */
  internalFileCount: number;
  /** Number of external sources used */
  externalSourceCount: number;
}

// ============================================================================
// SERVICE HEALTH TYPES
// ============================================================================

/**
 * Health status of external search services.
 */
export interface ExternalSearchHealthStatus {
  /** SearXNG availability */
  searxng: {
    available: boolean;
    url: string;
    error?: string;
  };
  /** Crawlee service availability */
  crawlee: {
    available: boolean;
    url: string;
    error?: string;
  };
  /** Overall external search availability */
  externalSearchEnabled: boolean;
}
