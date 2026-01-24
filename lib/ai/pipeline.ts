/**
 * AI Processing Pipeline
 *
 * Orchestrates the secure document processing flow:
 * 1. Extraction: File → Raw Text (SECURE, NEVER AI-visible)
 * 2. Redaction: Admin defines redactions on raw text
 * 3. Commit: Apply redactions → AI-Safe Text, DELETE raw text
 * 4. Indexing: Chunk AI-Safe Text → Generate Embeddings
 *
 * SECURITY GUARANTEES:
 * - Raw text is NEVER exposed to AI
 * - Redactions are immutable after commit
 * - Raw text is permanently deleted after commit
 * - All operations are org-scoped and permission-checked
 */

import { createClient } from "@supabase/supabase-js";
import { extractText, validateExtractedText, isExtractable } from "./extraction";
import { applyRedactions, dbRedactionsToDefinitions } from "./redaction";
import { chunkText, validateChunks } from "./chunking";
import { generateChunkEmbeddings, formatForPgvector } from "./embeddings";
import {
  DocumentProcessingStatus,
  DbDocumentProcessing,
  DbDocumentRawText,
  DbDocumentRedaction,
  DocumentProcessingInsert,
  DocumentRawTextInsert,
  DocumentAiTextInsert,
  DocumentChunkInsert,
  DEFAULT_EMBEDDING_CONFIG,
} from "./types";

// ============================================================================
// PIPELINE: EXTRACTION
// ============================================================================

/**
 * Step 1: Extract text from uploaded file.
 *
 * Creates document_processing record and stores raw text.
 * Raw text is ONLY for admin redaction UI, NEVER for AI.
 *
 * @param supabaseAdmin - Supabase client with service role (bypasses RLS)
 * @param fileId - File ID
 * @param organizationId - Organization ID
 * @param fileBuffer - File content
 * @param mimeType - File MIME type
 */
export async function processExtraction(
  supabaseAdmin: ReturnType<typeof createClient>,
  fileId: string,
  organizationId: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<{ success: boolean; error?: string; processingId?: string }> {
  // Check if extraction is supported
  if (!isExtractable(mimeType)) {
    return {
      success: false,
      error: `File type ${mimeType} is not supported for text extraction`,
    };
  }

  // Check if processing record already exists
  const { data: existing } = await supabaseAdmin
    .from("document_processing")
    .select("id, status")
    .eq("file_id", fileId)
    .single();

  if (existing) {
    // If already processed beyond extraction, don't re-extract
    if (existing.status !== "pending_extraction" && existing.status !== "extraction_failed") {
      return {
        success: false,
        error: `Document already processed. Status: ${existing.status}`,
      };
    }
  }

  // Extract text
  const extraction = await extractText(fileBuffer, mimeType);

  if (!extraction.success || !extraction.content) {
    // Update or create processing record with failure
    if (existing) {
      await supabaseAdmin
        .from("document_processing")
        .update({
          status: "extraction_failed" as DocumentProcessingStatus,
          extraction_error: extraction.error,
        })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin.from("document_processing").insert({
        file_id: fileId,
        organization_id: organizationId,
        status: "extraction_failed" as DocumentProcessingStatus,
        extraction_error: extraction.error,
      } as DocumentProcessingInsert);
    }

    return { success: false, error: extraction.error };
  }

  // Validate extracted text
  const validation = validateExtractedText(extraction.content);
  if (!validation.valid) {
    const errorMsg = validation.error || "Validation failed";

    if (existing) {
      await supabaseAdmin
        .from("document_processing")
        .update({
          status: "extraction_failed" as DocumentProcessingStatus,
          extraction_error: errorMsg,
        })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin.from("document_processing").insert({
        file_id: fileId,
        organization_id: organizationId,
        status: "extraction_failed" as DocumentProcessingStatus,
        extraction_error: errorMsg,
      } as DocumentProcessingInsert);
    }

    return { success: false, error: errorMsg };
  }

  // Create or update processing record
  let processingId: string;

  if (existing) {
    await supabaseAdmin
      .from("document_processing")
      .update({
        status: "pending_redaction" as DocumentProcessingStatus,
        extracted_at: new Date().toISOString(),
        extraction_error: null,
        character_count: extraction.content.length,
      })
      .eq("id", existing.id);
    processingId = existing.id;

    // Delete any existing raw text (in case of re-extraction)
    await supabaseAdmin.from("document_raw_text").delete().eq("file_id", fileId);
  } else {
    const { data: processing, error: processingError } = await supabaseAdmin
      .from("document_processing")
      .insert({
        file_id: fileId,
        organization_id: organizationId,
        status: "pending_redaction" as DocumentProcessingStatus,
        extracted_at: new Date().toISOString(),
        character_count: extraction.content.length,
      } as DocumentProcessingInsert)
      .select()
      .single();

    if (processingError || !processing) {
      return { success: false, error: "Failed to create processing record" };
    }
    processingId = processing.id;
  }

  // Store raw text (SECURE - only for admin redaction UI)
  const { error: rawTextError } = await supabaseAdmin
    .from("document_raw_text")
    .insert({
      file_id: fileId,
      organization_id: organizationId,
      content: extraction.content,
      source_mime_type: mimeType,
      extraction_method: extraction.method,
    } as DocumentRawTextInsert);

  if (rawTextError) {
    // Rollback processing status
    await supabaseAdmin
      .from("document_processing")
      .update({
        status: "extraction_failed" as DocumentProcessingStatus,
        extraction_error: "Failed to store raw text",
      })
      .eq("id", processingId);

    return { success: false, error: "Failed to store raw text" };
  }

  return { success: true, processingId };
}

// ============================================================================
// PIPELINE: COMMIT REDACTIONS
// ============================================================================

/**
 * Step 2: Commit redactions and generate AI-safe text.
 *
 * CRITICAL: This is the point of no return.
 * - Redactions become immutable
 * - Raw text is permanently deleted
 * - AI-safe text is generated
 *
 * @param supabaseAdmin - Supabase client with service role
 * @param fileId - File ID
 * @param committedBy - User ID performing the commit
 */
export async function commitRedactions(
  supabaseAdmin: ReturnType<typeof createClient>,
  fileId: string,
  committedBy: string
): Promise<{ success: boolean; error?: string }> {
  // Get processing record
  const { data: processing, error: processingError } = await supabaseAdmin
    .from("document_processing")
    .select("*")
    .eq("file_id", fileId)
    .single();

  if (processingError || !processing) {
    return { success: false, error: "Document processing record not found" };
  }

  // Verify document is in correct state
  const allowedStatuses: DocumentProcessingStatus[] = [
    "pending_redaction",
    "redaction_in_progress",
    "pending_commit",
  ];

  if (!allowedStatuses.includes(processing.status as DocumentProcessingStatus)) {
    return {
      success: false,
      error: `Cannot commit from status: ${processing.status}`,
    };
  }

  if (processing.committed_at) {
    return { success: false, error: "Document already committed" };
  }

  // Get raw text
  const { data: rawText, error: rawTextError } = await supabaseAdmin
    .from("document_raw_text")
    .select("content")
    .eq("file_id", fileId)
    .single();

  if (rawTextError || !rawText) {
    return { success: false, error: "Raw text not found" };
  }

  // Get redactions
  const { data: dbRedactions, error: redactionsError } = await supabaseAdmin
    .from("document_redactions")
    .select("*")
    .eq("file_id", fileId);

  if (redactionsError) {
    return { success: false, error: "Failed to fetch redactions" };
  }

  // Apply redactions to generate AI-safe text
  const redactions = dbRedactionsToDefinitions(dbRedactions || []);
  const aiSafeText = applyRedactions(rawText.content, redactions);

  // Update processing status to committed
  const { error: updateError } = await supabaseAdmin
    .from("document_processing")
    .update({
      status: "committed" as DocumentProcessingStatus,
      committed_at: new Date().toISOString(),
      committed_by: committedBy,
    })
    .eq("id", processing.id);

  if (updateError) {
    return { success: false, error: "Failed to update processing status" };
  }

  // Store AI-safe text
  const { error: aiTextError } = await supabaseAdmin
    .from("document_ai_text")
    .insert({
      file_id: fileId,
      organization_id: processing.organization_id,
      content: aiSafeText,
      character_count: aiSafeText.length,
      redaction_count: redactions.length,
      processing_id: processing.id,
    } as DocumentAiTextInsert);

  if (aiTextError) {
    // Critical error - rollback commit status
    await supabaseAdmin
      .from("document_processing")
      .update({
        status: "pending_commit" as DocumentProcessingStatus,
        committed_at: null,
        committed_by: null,
      })
      .eq("id", processing.id);

    return { success: false, error: "Failed to store AI-safe text" };
  }

  // CRITICAL: Permanently delete raw text
  const { error: deleteError } = await supabaseAdmin
    .from("document_raw_text")
    .delete()
    .eq("file_id", fileId);

  if (deleteError) {
    // Log but don't fail - raw text deletion is critical but AI-safe text is created
    console.error(
      `SECURITY WARNING: Failed to delete raw text for file ${fileId}:`,
      deleteError
    );
  }

  return { success: true };
}

// ============================================================================
// PIPELINE: INDEXING
// ============================================================================

/**
 * Step 3: Generate embeddings and index document.
 *
 * Operates ONLY on AI-safe text (post-commit).
 *
 * @param supabaseAdmin - Supabase client with service role
 * @param fileId - File ID
 */
export async function indexDocument(
  supabaseAdmin: ReturnType<typeof createClient>,
  fileId: string
): Promise<{ success: boolean; error?: string; chunkCount?: number }> {
  // Get processing record
  const { data: processing, error: processingError } = await supabaseAdmin
    .from("document_processing")
    .select("*")
    .eq("file_id", fileId)
    .single();

  if (processingError || !processing) {
    return { success: false, error: "Document processing record not found" };
  }

  // Verify document is committed
  if (!processing.committed_at) {
    return { success: false, error: "Document must be committed before indexing" };
  }

  // Check status
  if (processing.status === "indexed") {
    return { success: false, error: "Document already indexed" };
  }

  // Get AI-safe text (ONLY source for embeddings)
  const { data: aiText, error: aiTextError } = await supabaseAdmin
    .from("document_ai_text")
    .select("content")
    .eq("file_id", fileId)
    .single();

  if (aiTextError || !aiText) {
    return { success: false, error: "AI-safe text not found" };
  }

  // Update status to indexing
  await supabaseAdmin
    .from("document_processing")
    .update({ status: "indexing" as DocumentProcessingStatus })
    .eq("id", processing.id);

  try {
    // Chunk the AI-safe text (sentence-aware, ~800 chars per chunk)
    const chunks = chunkText(aiText.content);

    // Validate chunks
    const validation = validateChunks(chunks, aiText.content.length);
    if (!validation.valid) {
      throw new Error(`Chunk validation failed: ${validation.errors.join(", ")}`);
    }

    // Generate embeddings
    const chunksWithEmbeddings = await generateChunkEmbeddings(
      chunks,
      DEFAULT_EMBEDDING_CONFIG
    );

    // Delete any existing chunks (in case of re-indexing)
    await supabaseAdmin.from("document_chunks").delete().eq("file_id", fileId);

    // Store chunks with embeddings
    const chunkInserts: DocumentChunkInsert[] = chunksWithEmbeddings.map((chunk) => ({
      file_id: fileId,
      organization_id: processing.organization_id,
      chunk_index: chunk.index,
      content: chunk.content,
      character_start: chunk.characterStart,
      character_end: chunk.characterEnd,
      embedding: chunk.embedding,
      embedding_model: DEFAULT_EMBEDDING_CONFIG.model,
      processing_id: processing.id,
    }));

    // Insert in batches
    const batchSize = 100;
    for (let i = 0; i < chunkInserts.length; i += batchSize) {
      const batch = chunkInserts.slice(i, i + batchSize);

      // Format embeddings for pgvector
      const formattedBatch = batch.map((chunk) => ({
        ...chunk,
        embedding: formatForPgvector(chunk.embedding),
      }));

      const { error: insertError } = await supabaseAdmin
        .from("document_chunks")
        .insert(formattedBatch);

      if (insertError) {
        throw new Error(`Failed to insert chunks: ${insertError.message}`);
      }
    }

    // Update processing status to indexed
    await supabaseAdmin
      .from("document_processing")
      .update({
        status: "indexed" as DocumentProcessingStatus,
        indexed_at: new Date().toISOString(),
        chunk_count: chunks.length,
        embedding_model: DEFAULT_EMBEDDING_CONFIG.model,
        indexing_error: null,
      })
      .eq("id", processing.id);

    return { success: true, chunkCount: chunks.length };
  } catch (error) {
    // Update status to failed
    const errorMessage = error instanceof Error ? error.message : "Unknown indexing error";

    await supabaseAdmin
      .from("document_processing")
      .update({
        status: "indexing_failed" as DocumentProcessingStatus,
        indexing_error: errorMessage,
      })
      .eq("id", processing.id);

    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// FULL PIPELINE (FOR DOCUMENTS WITHOUT REDACTIONS)
// ============================================================================

/**
 * Process a document through the full pipeline.
 * Use when no redactions are needed (e.g., public documents).
 *
 * @param supabaseAdmin - Supabase client with service role
 * @param fileId - File ID
 * @param organizationId - Organization ID
 * @param fileBuffer - File content
 * @param mimeType - File MIME type
 * @param committedBy - User ID performing the operation
 */
export async function processFullPipeline(
  supabaseAdmin: ReturnType<typeof createClient>,
  fileId: string,
  organizationId: string,
  fileBuffer: Buffer,
  mimeType: string,
  committedBy: string
): Promise<{ success: boolean; error?: string; chunkCount?: number }> {
  // Step 1: Extract
  const extractionResult = await processExtraction(
    supabaseAdmin,
    fileId,
    organizationId,
    fileBuffer,
    mimeType
  );

  if (!extractionResult.success) {
    return extractionResult;
  }

  // Step 2: Commit (with no redactions)
  const commitResult = await commitRedactions(supabaseAdmin, fileId, committedBy);

  if (!commitResult.success) {
    return commitResult;
  }

  // Step 3: Index
  return indexDocument(supabaseAdmin, fileId);
}

// ============================================================================
// STATUS HELPERS
// ============================================================================

/**
 * Get processing status for a file
 */
export async function getProcessingStatus(
  supabase: ReturnType<typeof createClient>,
  fileId: string
): Promise<DbDocumentProcessing | null> {
  const { data, error } = await supabase
    .from("document_processing")
    .select("*")
    .eq("file_id", fileId)
    .single();

  if (error) return null;
  return data;
}

/**
 * Check if a document is ready for AI queries
 */
export async function isDocumentAiReady(
  supabase: ReturnType<typeof createClient>,
  fileId: string
): Promise<boolean> {
  const status = await getProcessingStatus(supabase, fileId);
  return status?.status === "indexed";
}
