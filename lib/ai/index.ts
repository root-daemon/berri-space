/**
 * AI Foundation Module
 *
 * PHASE 8 IMPLEMENTATION
 *
 * SECURITY GUARANTEES:
 * 1. Raw text is NEVER accessible to AI pipelines
 * 2. AI-visible text is ONLY produced AFTER redaction finalization
 * 3. pgvector search is always org-scoped and permission-aware
 * 4. Redactions are immutable after finalization
 * 5. Raw text is permanently deleted after redaction commit
 */

// Types
export * from "./types";

// Text extraction
export { extractText, isExtractable, validateExtractedText } from "./extraction";

// Redaction
export {
  applyRedactions,
  detectPii,
  findRegexMatches,
  validateRedaction,
  validateRedactions,
  mergeOverlappingRedactions,
  getRedactionPreview,
  getRedactionStats,
  dbRedactionsToDefinitions,
} from "./redaction";

// Chunking
export {
  chunkText,
  validateChunks,
  estimateChunkCount,
  findChunkForPosition,
  findChunksInRange,
  CHUNKING_CONSTANTS,
} from "./chunking";

// Embeddings
export {
  generateEmbedding,
  generateEmbeddings,
  generateChunkEmbeddings,
  generateQueryEmbedding,
  cosineSimilarity,
  estimateEmbeddingCost,
  formatForPgvector,
  parseFromPgvector,
} from "./embeddings";

// Pipeline
export {
  processExtraction,
  commitRedactions,
  indexDocument,
  processFullPipeline,
  getProcessingStatus,
  isDocumentAiReady,
} from "./pipeline";

// Search
export {
  searchSimilar,
  searchWithEmbedding,
  getAiReadyDocuments,
  getChunkContext,
} from "./search";
export type { SearchOptions } from "./search";
