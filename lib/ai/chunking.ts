/**
 * Text Chunking Module
 *
 * Sentence-aware chunking for AI document ingestion.
 *
 * SECURITY: This module ONLY operates on AI-safe text (post-redaction).
 * It NEVER receives or processes raw text.
 *
 * CHUNKING RULES:
 * 1. Target chunk size: ~800 characters
 * 2. After reaching ~800 chars, find the NEXT full stop and end there
 * 3. Next chunk starts from the last sentence boundary of the previous chunk (overlap)
 * 4. Small trailing chunks (<100 chars) are discarded
 */

import { TextChunk } from "./types";

// ============================================================================
// CONSTANTS
// ============================================================================

/** Target chunk size in characters */
const TARGET_CHUNK_SIZE = 800;

/** Minimum chunk size to keep (discard smaller trailing chunks) */
const MIN_CHUNK_SIZE = 100;

/** Maximum chunk size before forcing a break (for very long sentences) */
const MAX_CHUNK_SIZE = 2000;

// ============================================================================
// MAIN CHUNKING FUNCTION
// ============================================================================

/**
 * Chunk text into overlapping sentence-aware segments.
 *
 * Algorithm:
 * 1. Start at position 0
 * 2. Advance to target size (~800 chars)
 * 3. Find the NEXT full stop after target position
 * 4. Create chunk from start to that full stop (inclusive)
 * 5. Find the LAST sentence boundary within current chunk
 * 6. Next chunk starts from that last sentence boundary (overlap)
 * 7. Repeat until end of text
 *
 * @param text - AI-SAFE text (post-redaction)
 * @returns Array of text chunks with metadata
 */
export function chunkText(text: string): TextChunk[] {
  // Handle empty text
  if (!text || text.length === 0) {
    return [];
  }

  // Handle text shorter than target size - return as single chunk
  if (text.length <= TARGET_CHUNK_SIZE) {
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
  let chunkIndex = 0;
  let startPosition = 0;

  while (startPosition < text.length) {
    // Step 1: Calculate target end position
    const targetEnd = startPosition + TARGET_CHUNK_SIZE;

    // Step 2: Find chunk end (next full stop after target, or end of text)
    const chunkEnd = findChunkEnd(text, startPosition, targetEnd);

    // Step 3: Extract chunk content
    const content = text.substring(startPosition, chunkEnd);

    // Step 4: Check if this is a valid chunk (meets minimum size)
    // Exception: always include the last chunk if we're at the end
    const isLastChunk = chunkEnd >= text.length;
    const meetsMinSize = content.length >= MIN_CHUNK_SIZE;

    if (meetsMinSize || (isLastChunk && chunks.length === 0)) {
      // Add the chunk
      chunks.push({
        index: chunkIndex,
        content,
        characterStart: startPosition,
        characterEnd: chunkEnd,
      });
      chunkIndex++;
    }

    // Step 5: Determine next start position (sentence overlap)
    // Find the last sentence boundary within the current chunk
    const lastSentenceStart = findLastSentenceStart(text, startPosition, chunkEnd);

    // If we found a sentence boundary, start next chunk there
    // Otherwise, start at chunk end (no overlap for very long sentences)
    if (lastSentenceStart > startPosition && lastSentenceStart < chunkEnd) {
      startPosition = lastSentenceStart;
    } else {
      // No sentence boundary found - this happens with very long sentences
      // Move forward to avoid infinite loop
      startPosition = chunkEnd;
    }

    // Safety: ensure we're making progress
    if (startPosition === 0 && chunkEnd === 0) {
      break;
    }
  }

  return chunks;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Find the end position for a chunk.
 *
 * After reaching the target position, finds the NEXT full stop (`.`).
 * Handles edge cases:
 * - Multiple consecutive full stops
 * - Very long sentences (enforces max chunk size)
 * - End of text without trailing full stop
 *
 * @param text - The full text
 * @param start - Chunk start position
 * @param target - Target end position (~800 chars from start)
 * @returns Actual chunk end position
 */
function findChunkEnd(text: string, start: number, target: number): number {
  // If target is at or past end of text, return text length
  if (target >= text.length) {
    return text.length;
  }

  // Search for the next full stop after target position
  // We search from target to avoid cutting sentences short
  let searchPos = target;
  const maxSearchEnd = Math.min(start + MAX_CHUNK_SIZE, text.length);

  while (searchPos < maxSearchEnd) {
    if (text[searchPos] === ".") {
      // Found a full stop - check if it's followed by whitespace or end of text
      // This avoids breaking on abbreviations like "Dr." or "U.S."
      const nextChar = text[searchPos + 1];
      if (
        nextChar === undefined || // End of text
        nextChar === " " ||
        nextChar === "\n" ||
        nextChar === "\r" ||
        nextChar === "\t"
      ) {
        // Include the full stop and any immediate whitespace
        return findEndAfterPunctuation(text, searchPos);
      }
    }
    searchPos++;
  }

  // No full stop found within max chunk size
  // Fall back to other break points
  return findFallbackBreak(text, target, maxSearchEnd);
}

/**
 * Find the actual end position after punctuation.
 * Includes the punctuation and skips trailing whitespace to start of next sentence.
 *
 * @param text - The full text
 * @param punctuationPos - Position of the punctuation mark
 * @returns End position (after punctuation, before next sentence)
 */
function findEndAfterPunctuation(text: string, punctuationPos: number): number {
  let endPos = punctuationPos + 1; // Include the punctuation

  // Skip whitespace after punctuation (but stop at paragraph breaks)
  while (endPos < text.length) {
    const char = text[endPos];
    if (char === " " || char === "\t") {
      endPos++;
    } else {
      break;
    }
  }

  return endPos;
}

/**
 * Find a fallback break point when no full stop is found.
 * Tries: paragraph break, line break, word boundary.
 *
 * @param text - The full text
 * @param target - Target position
 * @param maxEnd - Maximum allowed end position
 * @returns Break position
 */
function findFallbackBreak(text: string, target: number, maxEnd: number): number {
  const searchText = text.substring(target, maxEnd);

  // Priority 1: Paragraph break (double newline)
  const paragraphBreak = searchText.indexOf("\n\n");
  if (paragraphBreak !== -1) {
    return target + paragraphBreak + 2;
  }

  // Priority 2: Single line break
  const lineBreak = searchText.indexOf("\n");
  if (lineBreak !== -1) {
    return target + lineBreak + 1;
  }

  // Priority 3: Word boundary (space)
  const spaceBreak = searchText.indexOf(" ");
  if (spaceBreak !== -1) {
    return target + spaceBreak + 1;
  }

  // No good break found - use max end
  return maxEnd;
}

/**
 * Find the start of the last sentence within a chunk range.
 * This determines where the next chunk will start (for overlap).
 *
 * Looks for patterns like ". " followed by text, working backwards from chunk end.
 *
 * @param text - The full text
 * @param chunkStart - Start of current chunk
 * @param chunkEnd - End of current chunk
 * @returns Position of last sentence start, or chunkEnd if none found
 */
function findLastSentenceStart(text: string, chunkStart: number, chunkEnd: number): number {
  // Search backwards from near the end of the chunk
  // We want to find the start of the last complete sentence
  // Look in the last 60% of the chunk to ensure meaningful overlap
  const searchStart = chunkStart + Math.floor((chunkEnd - chunkStart) * 0.4);

  // Find sentence boundaries (positions after ". ")
  const sentenceStarts: number[] = [];

  for (let pos = searchStart; pos < chunkEnd - 1; pos++) {
    if (text[pos] === ".") {
      const nextChar = text[pos + 1];
      if (nextChar === " " || nextChar === "\n" || nextChar === "\r" || nextChar === "\t") {
        // Found sentence boundary - next sentence starts after whitespace
        let sentenceStart = pos + 1;

        // Skip whitespace to find actual sentence start
        while (sentenceStart < chunkEnd && isWhitespace(text[sentenceStart])) {
          sentenceStart++;
        }

        if (sentenceStart < chunkEnd) {
          sentenceStarts.push(sentenceStart);
        }
      }
    }
  }

  // Return the last sentence start found, or chunkEnd if none
  if (sentenceStarts.length > 0) {
    return sentenceStarts[sentenceStarts.length - 1];
  }

  return chunkEnd;
}

/**
 * Check if a character is whitespace.
 */
function isWhitespace(char: string): boolean {
  return char === " " || char === "\n" || char === "\r" || char === "\t";
}

// ============================================================================
// CHUNK VALIDATION
// ============================================================================

/**
 * Validate chunks for consistency and coverage.
 * Note: With sentence overlap, chunks WILL have overlapping ranges - this is expected.
 */
export function validateChunks(
  chunks: TextChunk[],
  originalLength: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (chunks.length === 0 && originalLength > 0) {
    errors.push("No chunks generated for non-empty text");
    return { valid: false, errors };
  }

  if (chunks.length === 0) {
    return { valid: true, errors: [] };
  }

  // Check chunk ordering and basic validity
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

    // Content must match the slice of original text
    // (Caller should verify this with original text)
  }

  // Check that first chunk starts at 0
  if (chunks[0].characterStart !== 0) {
    errors.push(`First chunk doesn't start at 0: ${chunks[0].characterStart}`);
  }

  // Check that last chunk reaches end of text
  const lastChunk = chunks[chunks.length - 1];
  if (lastChunk.characterEnd !== originalLength) {
    errors.push(`Last chunk doesn't end at text length: ${lastChunk.characterEnd} vs ${originalLength}`);
  }

  // Check that chunks are in order (with overlap allowed)
  for (let i = 1; i < chunks.length; i++) {
    if (chunks[i].characterStart >= chunks[i - 1].characterEnd) {
      errors.push(`Gap between chunk ${i - 1} and ${i}`);
    }
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
 * Estimate number of chunks for a given text length.
 * This is approximate due to sentence-aware boundaries.
 */
export function estimateChunkCount(textLength: number): number {
  if (textLength <= TARGET_CHUNK_SIZE) {
    return 1;
  }

  // Rough estimate: ~60% effective advance per chunk due to sentence overlap
  const effectiveStep = TARGET_CHUNK_SIZE * 0.6;
  return Math.ceil(textLength / effectiveStep);
}

/**
 * Get chunk containing a specific character position.
 * May return multiple chunks due to overlap - returns the first one.
 */
export function findChunkForPosition(chunks: TextChunk[], position: number): TextChunk | null {
  for (const chunk of chunks) {
    if (position >= chunk.characterStart && position < chunk.characterEnd) {
      return chunk;
    }
  }
  return null;
}

/**
 * Get all chunks overlapping a character range.
 */
export function findChunksInRange(chunks: TextChunk[], start: number, end: number): TextChunk[] {
  return chunks.filter(
    (chunk) =>
      (chunk.characterStart >= start && chunk.characterStart < end) ||
      (chunk.characterEnd > start && chunk.characterEnd <= end) ||
      (chunk.characterStart <= start && chunk.characterEnd >= end)
  );
}

// ============================================================================
// EXPORTS FOR TESTING
// ============================================================================

export const CHUNKING_CONSTANTS = {
  TARGET_CHUNK_SIZE,
  MIN_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
} as const;
