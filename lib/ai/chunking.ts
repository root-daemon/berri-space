/**
 * Text Chunking Module
 *
 * Chunks AI-safe text for embedding generation.
 *
 * SECURITY: This module ONLY operates on AI-safe text (post-redaction).
 * It NEVER receives or processes raw text.
 */

import {
  TextChunk,
  ChunkingConfig,
  DEFAULT_CHUNKING_CONFIG,
} from "./types";

// ============================================================================
// CHUNKING FUNCTIONS
// ============================================================================

/**
 * Chunk text into overlapping segments for embedding.
 *
 * @param text - AI-SAFE text (post-redaction)
 * @param config - Chunking configuration
 * @returns Array of text chunks with metadata
 */
export function chunkText(
  text: string,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG
): TextChunk[] {
  const { chunkSize, chunkOverlap, minChunkSize } = config;

  if (text.length === 0) {
    return [];
  }

  // If text is smaller than chunk size, return as single chunk
  if (text.length <= chunkSize) {
    return [
      {
        index: 0,
        content: text,
        characterStart: 0,
        characterEnd: text.length,
      },
    ];
  }

  const chunks: TextChunk[] = [];
  let position = 0;
  let index = 0;

  while (position < text.length) {
    // Calculate chunk boundaries
    let chunkEnd = Math.min(position + chunkSize, text.length);

    // Try to end at a natural boundary (sentence or paragraph)
    if (chunkEnd < text.length) {
      const naturalEnd = findNaturalBreak(text, position, chunkEnd);
      if (naturalEnd > position + minChunkSize) {
        chunkEnd = naturalEnd;
      }
    }

    const content = text.substring(position, chunkEnd);

    // Only add if meets minimum size (or is the last chunk)
    if (content.length >= minChunkSize || position + content.length >= text.length) {
      chunks.push({
        index,
        content,
        characterStart: position,
        characterEnd: chunkEnd,
      });
      index++;
    }

    // Move position forward, accounting for overlap
    const step = chunkEnd - position - chunkOverlap;
    position += Math.max(step, minChunkSize);

    // Safety: ensure we're making progress
    if (position >= chunkEnd) {
      position = chunkEnd;
    }
  }

  return chunks;
}

/**
 * Find a natural break point (end of sentence or paragraph) near the target position.
 *
 * @param text - The text to search
 * @param start - Chunk start position
 * @param target - Target end position
 * @returns Best break position
 */
function findNaturalBreak(text: string, start: number, target: number): number {
  // Search window: look back up to 20% of chunk size for a good break
  const searchStart = Math.max(start, target - Math.floor((target - start) * 0.2));
  const searchText = text.substring(searchStart, target);

  // Priority 1: End of paragraph (double newline)
  const paragraphBreak = searchText.lastIndexOf("\n\n");
  if (paragraphBreak !== -1) {
    return searchStart + paragraphBreak + 2;
  }

  // Priority 2: End of sentence (. ! ?)
  const sentenceMatch = searchText.match(/[.!?]\s+(?=[A-Z])/g);
  if (sentenceMatch) {
    const lastSentence = searchText.lastIndexOf(sentenceMatch[sentenceMatch.length - 1]);
    if (lastSentence !== -1) {
      return searchStart + lastSentence + sentenceMatch[sentenceMatch.length - 1].length;
    }
  }

  // Priority 3: End of line
  const lineBreak = searchText.lastIndexOf("\n");
  if (lineBreak !== -1) {
    return searchStart + lineBreak + 1;
  }

  // Priority 4: Space (word boundary)
  const spaceBreak = searchText.lastIndexOf(" ");
  if (spaceBreak !== -1) {
    return searchStart + spaceBreak + 1;
  }

  // No good break found, use target
  return target;
}

// ============================================================================
// CHUNK VALIDATION
// ============================================================================

/**
 * Validate chunks before embedding
 */
export function validateChunks(
  chunks: TextChunk[],
  originalLength: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (chunks.length === 0) {
    errors.push("No chunks generated");
    return { valid: false, errors };
  }

  // Check chunk ordering
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (chunk.index !== i) {
      errors.push(`Chunk ${i} has incorrect index: ${chunk.index}`);
    }

    if (chunk.content.length === 0) {
      errors.push(`Chunk ${i} has empty content`);
    }

    if (chunk.characterStart < 0 || chunk.characterEnd > originalLength) {
      errors.push(`Chunk ${i} has invalid boundaries: ${chunk.characterStart}-${chunk.characterEnd}`);
    }

    if (chunk.characterStart >= chunk.characterEnd) {
      errors.push(`Chunk ${i} has invalid range: start >= end`);
    }
  }

  // Check coverage (first chunk starts at 0, last chunk ends at length)
  if (chunks[0].characterStart !== 0) {
    errors.push(`First chunk doesn't start at 0: ${chunks[0].characterStart}`);
  }

  const lastChunk = chunks[chunks.length - 1];
  if (lastChunk.characterEnd !== originalLength) {
    errors.push(`Last chunk doesn't end at text length: ${lastChunk.characterEnd} vs ${originalLength}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Estimate number of chunks for a given text length
 */
export function estimateChunkCount(
  textLength: number,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG
): number {
  if (textLength <= config.chunkSize) {
    return 1;
  }

  const effectiveStep = config.chunkSize - config.chunkOverlap;
  return Math.ceil((textLength - config.chunkSize) / effectiveStep) + 1;
}

/**
 * Get chunk containing a specific character position
 */
export function findChunkForPosition(
  chunks: TextChunk[],
  position: number
): TextChunk | null {
  for (const chunk of chunks) {
    if (position >= chunk.characterStart && position < chunk.characterEnd) {
      return chunk;
    }
  }
  return null;
}

/**
 * Get chunks overlapping a character range
 */
export function findChunksInRange(
  chunks: TextChunk[],
  start: number,
  end: number
): TextChunk[] {
  return chunks.filter(
    (chunk) =>
      (chunk.characterStart >= start && chunk.characterStart < end) ||
      (chunk.characterEnd > start && chunk.characterEnd <= end) ||
      (chunk.characterStart <= start && chunk.characterEnd >= end)
  );
}
