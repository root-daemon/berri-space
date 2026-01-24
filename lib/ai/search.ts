/**
 * AI Search Module
 *
 * Secure similarity search with org isolation and permission checks.
 *
 * SECURITY:
 * - Searches are ALWAYS org-scoped
 * - Results are ALWAYS permission-filtered
 * - No cross-org data leakage possible
 * - All queries are audited
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { generateQueryEmbedding, formatForPgvector } from "./embeddings";
import {
  SimilarityResult,
  AiQueryLogInsert,
  DEFAULT_EMBEDDING_CONFIG,
} from "./types";

// ============================================================================
// SIMILARITY SEARCH
// ============================================================================

export interface SearchOptions {
  /** Maximum number of results to return */
  limit?: number;
  /** Minimum similarity threshold (0-1, default 0.7) */
  similarityThreshold?: number;
  /** Filter to specific file IDs */
  fileIds?: string[];
  /** Filter to specific folder IDs (includes files in folders) */
  folderIds?: string[];
}

const DEFAULT_SEARCH_OPTIONS: Required<Omit<SearchOptions, "fileIds" | "folderIds">> = {
  limit: 10,
  similarityThreshold: 0.7,
};

/**
 * Search for similar document chunks.
 *
 * SECURITY: This function enforces:
 * - Organization isolation
 * - Permission checks (user must have view access to files)
 * - Audit logging
 *
 * @param supabase - Supabase client (with user's auth context)
 * @param supabaseAdmin - Supabase client with service role (for audit logging)
 * @param userId - Current user's ID
 * @param organizationId - Organization to search within
 * @param query - Search query text
 * @param options - Search options
 * @returns Array of similar chunks with metadata
 */
export async function searchSimilar(
  supabase: SupabaseClient,
  supabaseAdmin: SupabaseClient,
  userId: string,
  organizationId: string,
  query: string,
  options: SearchOptions = {}
): Promise<{ results: SimilarityResult[]; error?: string }> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_SEARCH_OPTIONS, ...options };

  try {
    // Validate query
    if (!query || query.trim().length === 0) {
      return { results: [], error: "Query cannot be empty" };
    }

    // Verify user is org member
    const { data: membership, error: memberError } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .single();

    if (memberError || !membership) {
      return { results: [], error: "User is not a member of this organization" };
    }

    // Generate query embedding
    const queryEmbedding = await generateQueryEmbedding(query, DEFAULT_EMBEDDING_CONFIG);

    // Use the secure database function for similarity search
    const { data: searchResults, error: searchError } = await supabase.rpc(
      "search_similar_chunks",
      {
        p_user_id: userId,
        p_organization_id: organizationId,
        p_query_embedding: formatForPgvector(queryEmbedding),
        p_limit: opts.limit,
        p_similarity_threshold: opts.similarityThreshold,
      }
    );

    if (searchError) {
      console.error("Search error:", searchError);
      return { results: [], error: "Search failed" };
    }

    // Map results
    const results: SimilarityResult[] = (searchResults || []).map((r: {
      chunk_id: string;
      file_id: string;
      file_name: string;
      chunk_index: number;
      content: string;
      similarity: number;
    }) => ({
      chunkId: r.chunk_id,
      fileId: r.file_id,
      fileName: r.file_name,
      chunkIndex: r.chunk_index,
      content: r.content,
      similarity: r.similarity,
    }));

    // Apply additional filters if specified
    let filteredResults = results;

    if (opts.fileIds && opts.fileIds.length > 0) {
      filteredResults = filteredResults.filter((r) => opts.fileIds!.includes(r.fileId));
    }

    // Log the query (using admin client to bypass RLS)
    const duration = Date.now() - startTime;
    await logQuery(
      supabaseAdmin,
      organizationId,
      userId,
      query,
      queryEmbedding,
      filteredResults.map((r) => r.fileId),
      filteredResults.length,
      duration
    );

    return { results: filteredResults };
  } catch (error) {
    console.error("Search error:", error);
    return {
      results: [],
      error: error instanceof Error ? error.message : "Unknown search error",
    };
  }
}

/**
 * Search with raw embedding (for advanced use cases).
 *
 * SECURITY: Same guarantees as searchSimilar.
 */
export async function searchWithEmbedding(
  supabase: SupabaseClient,
  supabaseAdmin: SupabaseClient,
  userId: string,
  organizationId: string,
  embedding: number[],
  options: SearchOptions = {}
): Promise<{ results: SimilarityResult[]; error?: string }> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_SEARCH_OPTIONS, ...options };

  try {
    // Verify user is org member
    const { data: membership, error: memberError } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .single();

    if (memberError || !membership) {
      return { results: [], error: "User is not a member of this organization" };
    }

    // Use the secure database function
    const { data: searchResults, error: searchError } = await supabase.rpc(
      "search_similar_chunks",
      {
        p_user_id: userId,
        p_organization_id: organizationId,
        p_query_embedding: formatForPgvector(embedding),
        p_limit: opts.limit,
        p_similarity_threshold: opts.similarityThreshold,
      }
    );

    if (searchError) {
      return { results: [], error: "Search failed" };
    }

    const results: SimilarityResult[] = (searchResults || []).map((r: {
      chunk_id: string;
      file_id: string;
      file_name: string;
      chunk_index: number;
      content: string;
      similarity: number;
    }) => ({
      chunkId: r.chunk_id,
      fileId: r.file_id,
      fileName: r.file_name,
      chunkIndex: r.chunk_index,
      content: r.content,
      similarity: r.similarity,
    }));

    // Log (without query text since we have raw embedding)
    const duration = Date.now() - startTime;
    await logQuery(
      supabaseAdmin,
      organizationId,
      userId,
      "[embedding query]",
      embedding,
      results.map((r) => r.fileId),
      results.length,
      duration
    );

    return { results };
  } catch (error) {
    return {
      results: [],
      error: error instanceof Error ? error.message : "Unknown search error",
    };
  }
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

/**
 * Log an AI query for audit purposes.
 * Uses service role to bypass RLS (only super_admin can read logs).
 */
async function logQuery(
  supabaseAdmin: SupabaseClient,
  organizationId: string,
  userId: string,
  queryText: string,
  queryEmbedding: number[],
  resultFileIds: string[],
  resultCount: number,
  durationMs: number
): Promise<void> {
  try {
    const logEntry: AiQueryLogInsert = {
      organization_id: organizationId,
      user_id: userId,
      query_text: queryText,
      query_embedding: queryEmbedding,
      result_file_ids: resultFileIds,
      result_count: resultCount,
      search_duration_ms: durationMs,
    };

    await supabaseAdmin.from("ai_query_log").insert({
      ...logEntry,
      query_embedding: formatForPgvector(queryEmbedding),
    });
  } catch (error) {
    // Don't fail the search if logging fails
    console.error("Failed to log AI query:", error);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get documents that are ready for AI search in an organization.
 */
export async function getAiReadyDocuments(
  supabase: SupabaseClient,
  organizationId: string
): Promise<{ fileId: string; fileName: string; chunkCount: number }[]> {
  const { data, error } = await supabase
    .from("document_processing")
    .select(`
      file_id,
      chunk_count,
      files!inner(name)
    `)
    .eq("organization_id", organizationId)
    .eq("status", "indexed");

  if (error) {
    console.error("Failed to get AI-ready documents:", error);
    return [];
  }

  return (data || []).map((d: { file_id: string; chunk_count: number | null; files: { name: string } }) => ({
    fileId: d.file_id,
    fileName: d.files.name,
    chunkCount: d.chunk_count || 0,
  }));
}

/**
 * Get chunk context (surrounding chunks) for better AI responses.
 */
export async function getChunkContext(
  supabase: SupabaseClient,
  chunkId: string,
  contextSize: number = 1
): Promise<{ before: string[]; after: string[] }> {
  // Get the chunk to find file_id and chunk_index
  const { data: chunk, error: chunkError } = await supabase
    .from("document_chunks")
    .select("file_id, chunk_index")
    .eq("id", chunkId)
    .single();

  if (chunkError || !chunk) {
    return { before: [], after: [] };
  }

  // Get surrounding chunks
  const { data: surrounding, error: surroundingError } = await supabase
    .from("document_chunks")
    .select("chunk_index, content")
    .eq("file_id", chunk.file_id)
    .gte("chunk_index", chunk.chunk_index - contextSize)
    .lte("chunk_index", chunk.chunk_index + contextSize)
    .order("chunk_index");

  if (surroundingError || !surrounding) {
    return { before: [], after: [] };
  }

  const before: string[] = [];
  const after: string[] = [];

  for (const c of surrounding) {
    if (c.chunk_index < chunk.chunk_index) {
      before.push(c.content);
    } else if (c.chunk_index > chunk.chunk_index) {
      after.push(c.content);
    }
  }

  return { before, after };
}
