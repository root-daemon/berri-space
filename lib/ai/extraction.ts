/**
 * Text Extraction Module
 *
 * Extracts text from supported file formats.
 * Output goes to document_raw_text (SECURE, not AI-visible).
 *
 * SECURITY: Extracted text is NEVER sent to AI.
 * It must go through the redaction pipeline first.
 */

import {
  ExtractionResult,
  EXTRACTABLE_MIME_TYPES,
  ExtractableMimeType,
} from "./types";

// ============================================================================
// EXTRACTION FUNCTIONS
// ============================================================================

/**
 * Check if a MIME type is supported for text extraction
 */
export function isExtractable(mimeType: string): mimeType is ExtractableMimeType {
  return EXTRACTABLE_MIME_TYPES.includes(mimeType as ExtractableMimeType);
}

/**
 * Extract text from a file buffer based on MIME type
 *
 * @param buffer - File content as Buffer
 * @param mimeType - MIME type of the file
 * @returns Extraction result with text content or error
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractionResult> {
  if (!isExtractable(mimeType)) {
    return {
      success: false,
      error: `Unsupported MIME type for extraction: ${mimeType}`,
      method: "none",
    };
  }

  try {
    switch (mimeType) {
      case "application/pdf":
        return await extractFromPdf(buffer);

      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return await extractFromDocx(buffer);

      case "text/plain":
        return extractFromPlainText(buffer);

      default:
        return {
          success: false,
          error: `No extractor implemented for: ${mimeType}`,
          method: "none",
        };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown extraction error",
      method: "error",
    };
  }
}

/**
 * Extract text from PDF using pdf-parse
 */
async function extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
  try {
    // Dynamic import to avoid bundling issues
    const pdfParse = (await import("pdf-parse")).default;

    const data = await pdfParse(buffer, {
      // Limit pages for safety (can be configured)
      max: 1000,
    });

    const content = data.text.trim();

    return {
      success: true,
      content,
      characterCount: content.length,
      method: "pdf-parse",
    };
  } catch (error) {
    return {
      success: false,
      error: `PDF extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      method: "pdf-parse",
    };
  }
}

/**
 * Extract text from DOCX using mammoth
 */
async function extractFromDocx(buffer: Buffer): Promise<ExtractionResult> {
  try {
    // Dynamic import
    const mammoth = await import("mammoth");

    const result = await mammoth.extractRawText({ buffer });
    const content = result.value.trim();

    // Log warnings if any (but don't fail)
    if (result.messages.length > 0) {
      console.warn(
        "DOCX extraction warnings:",
        result.messages.map((m) => m.message)
      );
    }

    return {
      success: true,
      content,
      characterCount: content.length,
      method: "mammoth",
    };
  } catch (error) {
    return {
      success: false,
      error: `DOCX extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      method: "mammoth",
    };
  }
}

/**
 * Extract text from plain text file
 */
function extractFromPlainText(buffer: Buffer): ExtractionResult {
  try {
    const content = buffer.toString("utf-8").trim();

    return {
      success: true,
      content,
      characterCount: content.length,
      method: "plain",
    };
  } catch (error) {
    return {
      success: false,
      error: `Plain text extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      method: "plain",
    };
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate extracted text meets minimum requirements
 */
export function validateExtractedText(content: string): {
  valid: boolean;
  error?: string;
} {
  if (!content || content.length === 0) {
    return { valid: false, error: "Extracted text is empty" };
  }

  // Check for minimum content (avoid indexing near-empty documents)
  if (content.length < 10) {
    return { valid: false, error: "Extracted text too short (< 10 characters)" };
  }

  // Check for binary garbage (high ratio of non-printable characters)
  const printableCount = (content.match(/[\x20-\x7E\n\r\t]/g) || []).length;
  const printableRatio = printableCount / content.length;

  if (printableRatio < 0.8) {
    return {
      valid: false,
      error: "Extracted text appears to contain binary data",
    };
  }

  return { valid: true };
}
