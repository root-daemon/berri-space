/**
 * Redaction Module
 *
 * SECURITY CRITICAL: This module handles the transformation from
 * raw text (NEVER AI-visible) to AI-safe text (post-redaction).
 *
 * GUARANTEES:
 * 1. Redacted content is PERMANENTLY REMOVED (not masked)
 * 2. Redactions are immutable after commit
 * 3. Raw text is deleted after commit
 * 4. AI NEVER sees raw text
 */

import {
  RedactionDefinition,
  RedactionType,
  PII_PATTERNS,
  DbDocumentRedaction,
} from "./types";

// ============================================================================
// REDACTION APPLICATION
// ============================================================================

/**
 * Apply redactions to raw text, producing AI-safe text.
 *
 * SECURITY: This permanently removes content. The operation is irreversible.
 *
 * @param rawText - The raw extracted text (SENSITIVE)
 * @param redactions - Array of redaction definitions
 * @returns AI-safe text with redactions permanently removed
 */
export function applyRedactions(
  rawText: string,
  redactions: RedactionDefinition[]
): string {
  if (redactions.length === 0) {
    return rawText;
  }

  // Sort redactions by start offset (descending) to apply from end to start
  // This preserves offset validity during removal
  const sortedRedactions = [...redactions].sort(
    (a, b) => b.startOffset - a.startOffset
  );

  let result = rawText;

  for (const redaction of sortedRedactions) {
    // Validate offsets
    if (
      redaction.startOffset < 0 ||
      redaction.endOffset > result.length ||
      redaction.startOffset >= redaction.endOffset
    ) {
      console.warn(
        `Invalid redaction offsets: ${redaction.startOffset}-${redaction.endOffset}, text length: ${result.length}`
      );
      continue;
    }

    // PERMANENTLY REMOVE the redacted content (not replace with placeholder)
    result =
      result.substring(0, redaction.startOffset) +
      result.substring(redaction.endOffset);
  }

  return result;
}

/**
 * Convert database redaction rows to RedactionDefinition
 */
export function dbRedactionsToDefinitions(
  dbRedactions: DbDocumentRedaction[]
): RedactionDefinition[] {
  return dbRedactions.map((r) => ({
    type: r.redaction_type,
    startOffset: r.start_offset,
    endOffset: r.end_offset,
    pattern: r.pattern || undefined,
    semanticLabel: r.semantic_label || undefined,
  }));
}

// ============================================================================
// PII DETECTION
// ============================================================================

/**
 * Detect PII patterns in text and return suggested redactions.
 *
 * NOTE: This is for admin UI suggestions only.
 * Admin must review and confirm before redactions are applied.
 *
 * @param text - Text to scan for PII
 * @param types - PII types to detect
 * @returns Array of suggested redaction definitions
 */
export function detectPii(
  text: string,
  types: RedactionType[] = [
    "pii_email",
    "pii_phone",
    "pii_ssn",
    "financial",
  ]
): RedactionDefinition[] {
  const suggestions: RedactionDefinition[] = [];

  for (const type of types) {
    const pattern = PII_PATTERNS[type];
    if (!pattern) continue;

    // Reset regex state for global patterns
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      suggestions.push({
        type,
        startOffset: match.index,
        endOffset: match.index + match[0].length,
      });
    }
  }

  // Sort by start offset and merge overlapping ranges
  return mergeOverlappingRedactions(suggestions);
}

/**
 * Apply a regex pattern to find matches for redaction
 *
 * @param text - Text to search
 * @param pattern - Regex pattern string
 * @returns Array of redaction definitions for matches
 */
export function findRegexMatches(
  text: string,
  pattern: string
): RedactionDefinition[] {
  try {
    const regex = new RegExp(pattern, "g");
    const matches: RedactionDefinition[] = [];

    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        type: "regex",
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        pattern,
      });
    }

    return matches;
  } catch {
    console.error(`Invalid regex pattern: ${pattern}`);
    return [];
  }
}

// ============================================================================
// REDACTION VALIDATION
// ============================================================================

/**
 * Validate a redaction definition
 */
export function validateRedaction(
  redaction: RedactionDefinition,
  textLength: number
): { valid: boolean; error?: string } {
  if (redaction.startOffset < 0) {
    return { valid: false, error: "Start offset cannot be negative" };
  }

  if (redaction.endOffset > textLength) {
    return {
      valid: false,
      error: `End offset (${redaction.endOffset}) exceeds text length (${textLength})`,
    };
  }

  if (redaction.startOffset >= redaction.endOffset) {
    return { valid: false, error: "Start offset must be less than end offset" };
  }

  if (redaction.type === "regex" && !redaction.pattern) {
    return { valid: false, error: "Regex redaction requires a pattern" };
  }

  if (redaction.type === "custom" && !redaction.semanticLabel) {
    return { valid: false, error: "Custom redaction requires a semantic label" };
  }

  return { valid: true };
}

/**
 * Validate all redactions for a document
 */
export function validateRedactions(
  redactions: RedactionDefinition[],
  textLength: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (let i = 0; i < redactions.length; i++) {
    const result = validateRedaction(redactions[i], textLength);
    if (!result.valid) {
      errors.push(`Redaction ${i}: ${result.error}`);
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
 * Merge overlapping redaction ranges
 */
export function mergeOverlappingRedactions(
  redactions: RedactionDefinition[]
): RedactionDefinition[] {
  if (redactions.length <= 1) return redactions;

  // Sort by start offset
  const sorted = [...redactions].sort((a, b) => a.startOffset - b.startOffset);
  const merged: RedactionDefinition[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.startOffset <= last.endOffset) {
      // Overlapping or adjacent - merge
      last.endOffset = Math.max(last.endOffset, current.endOffset);
      // Keep the more specific type
      if (current.type !== "manual" && last.type === "manual") {
        last.type = current.type;
      }
    } else {
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Get preview of text with redactions marked (for admin UI)
 *
 * NOTE: This is for preview only, not for AI consumption.
 * Actual redaction permanently removes content.
 */
export function getRedactionPreview(
  text: string,
  redactions: RedactionDefinition[],
  marker: string = "[REDACTED]"
): string {
  if (redactions.length === 0) return text;

  const sorted = [...redactions].sort((a, b) => b.startOffset - a.startOffset);
  let result = text;

  for (const redaction of sorted) {
    if (
      redaction.startOffset >= 0 &&
      redaction.endOffset <= result.length &&
      redaction.startOffset < redaction.endOffset
    ) {
      result =
        result.substring(0, redaction.startOffset) +
        marker +
        result.substring(redaction.endOffset);
    }
  }

  return result;
}

/**
 * Calculate statistics about redactions
 */
export function getRedactionStats(
  textLength: number,
  redactions: RedactionDefinition[]
): {
  totalRedacted: number;
  percentRedacted: number;
  byType: Record<string, number>;
} {
  const byType: Record<string, number> = {};
  let totalRedacted = 0;

  for (const redaction of redactions) {
    const length = redaction.endOffset - redaction.startOffset;
    totalRedacted += length;
    byType[redaction.type] = (byType[redaction.type] || 0) + length;
  }

  return {
    totalRedacted,
    percentRedacted: textLength > 0 ? (totalRedacted / textLength) * 100 : 0,
    byType,
  };
}
