/**
 * Types for AI Foundation (Phase 8)
 *
 * SECURITY PRINCIPLES:
 * - Raw text types are separate from AI-visible types
 * - No type allows mixing raw and AI-safe content
 * - Processing status controls what operations are allowed
 */

// ============================================================================
// ENUMS (must match database)
// ============================================================================

export type DocumentProcessingStatus =
  | "pending_extraction"
  | "extraction_failed"
  | "pending_redaction"
  | "redaction_in_progress"
  | "pending_commit"
  | "committed"
  | "indexing"
  | "indexed"
  | "indexing_failed";

export type RedactionType =
  | "manual"
  | "regex"
  | "pii_email"
  | "pii_phone"
  | "pii_ssn"
  | "pii_address"
  | "pii_name"
  | "financial"
  | "medical"
  | "legal"
  | "custom";

// ============================================================================
// DATABASE ROW TYPES
// ============================================================================

export interface DbDocumentProcessing {
  id: string;
  file_id: string;
  organization_id: string;
  status: DocumentProcessingStatus;
  extracted_at: string | null;
  extraction_error: string | null;
  character_count: number | null;
  redaction_started_at: string | null;
  redaction_started_by: string | null;
  committed_at: string | null;
  committed_by: string | null;
  indexed_at: string | null;
  indexing_error: string | null;
  chunk_count: number | null;
  embedding_model: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbDocumentRawText {
  id: string;
  file_id: string;
  organization_id: string;
  content: string;
  source_mime_type: string;
  extraction_method: string;
  created_at: string;
}

export interface DbDocumentRedaction {
  id: string;
  file_id: string;
  organization_id: string;
  redaction_type: RedactionType;
  start_offset: number;
  end_offset: number;
  pattern: string | null;
  semantic_label: string | null;
  created_by: string;
  created_at: string;
}

export interface DbDocumentAiText {
  id: string;
  file_id: string;
  organization_id: string;
  content: string;
  character_count: number;
  redaction_count: number;
  processing_id: string;
  created_at: string;
}

export interface DbDocumentChunk {
  id: string;
  file_id: string;
  organization_id: string;
  chunk_index: number;
  content: string;
  character_start: number;
  character_end: number;
  embedding: number[] | null;
  embedding_model: string;
  processing_id: string;
  created_at: string;
}

export interface DbAiQueryLog {
  id: string;
  organization_id: string;
  user_id: string;
  query_text: string;
  query_embedding: number[] | null;
  result_file_ids: string[];
  result_count: number;
  search_duration_ms: number | null;
  created_at: string;
}

// ============================================================================
// INSERT TYPES
// ============================================================================

export interface DocumentProcessingInsert {
  file_id: string;
  organization_id: string;
  status?: DocumentProcessingStatus;
}

export interface DocumentRawTextInsert {
  file_id: string;
  organization_id: string;
  content: string;
  source_mime_type: string;
  extraction_method: string;
}

export interface DocumentRedactionInsert {
  file_id: string;
  organization_id: string;
  redaction_type: RedactionType;
  start_offset: number;
  end_offset: number;
  pattern?: string | null;
  semantic_label?: string | null;
  created_by: string;
}

export interface DocumentAiTextInsert {
  file_id: string;
  organization_id: string;
  content: string;
  character_count: number;
  redaction_count: number;
  processing_id: string;
}

export interface DocumentChunkInsert {
  file_id: string;
  organization_id: string;
  chunk_index: number;
  content: string;
  character_start: number;
  character_end: number;
  embedding: number[];
  embedding_model: string;
  processing_id: string;
}

export interface AiQueryLogInsert {
  organization_id: string;
  user_id: string;
  query_text: string;
  query_embedding?: number[] | null;
  result_file_ids: string[];
  result_count: number;
  search_duration_ms?: number | null;
}

// ============================================================================
// APPLICATION TYPES
// ============================================================================

/** Redaction definition for admin UI */
export interface RedactionDefinition {
  type: RedactionType;
  startOffset: number;
  endOffset: number;
  pattern?: string;
  semanticLabel?: string;
}

/** Result from text extraction */
export interface ExtractionResult {
  success: boolean;
  content?: string;
  characterCount?: number;
  error?: string;
  method: string;
}

/** Chunk for embedding */
export interface TextChunk {
  index: number;
  content: string;
  characterStart: number;
  characterEnd: number;
}

/** Similarity search result */
export interface SimilarityResult {
  chunkId: string;
  fileId: string;
  fileName: string;
  chunkIndex: number;
  content: string;
  similarity: number;
}

/** Configuration for embedding */
export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  batchSize: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default embedding configuration (Google Gemini embedding-001) */
export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  model: "gemini-embedding-001",
  dimensions: 1536, // Using 1536 to match database vector dimension
  batchSize: 100,
};

/** Supported MIME types for text extraction */
export const EXTRACTABLE_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;

export type ExtractableMimeType = (typeof EXTRACTABLE_MIME_TYPES)[number];

/** PII detection patterns */
export const PII_PATTERNS: Record<RedactionType, RegExp | null> = {
  manual: null,
  regex: null,
  custom: null,
  pii_email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  pii_phone: /(\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
  pii_ssn: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
  pii_address:
    /\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|way|place|pl)\.?\s*(?:,?\s*(?:apt|apartment|suite|ste|unit|#)\.?\s*\d+)?/gi,
  pii_name: null, // Requires NER, not regex
  financial: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, // Credit card pattern
  medical: null, // Requires domain-specific detection
  legal: null, // Requires domain-specific detection
};
