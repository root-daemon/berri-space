/**
 * Embeddings Module
 *
 * Generates vector embeddings for AI-safe text chunks using Google Gemini.
 *
 * SECURITY: This module ONLY processes AI-safe text (post-redaction).
 * Raw text NEVER reaches this module.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  TextChunk,
  EmbeddingConfig,
  DEFAULT_EMBEDDING_CONFIG,
} from "./types";

// ============================================================================
// GEMINI CLIENT
// ============================================================================

let geminiClient: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  if (!geminiClient) {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY environment variable is not set");
    }
    geminiClient = new GoogleGenerativeAI(apiKey);
  }
  return geminiClient;
}

// ============================================================================
// EMBEDDING GENERATION
// ============================================================================

/**
 * Generate embedding for a single text.
 *
 * @param text - AI-SAFE text (post-redaction)
 * @param config - Embedding configuration
 * @returns Embedding vector
 */
export async function generateEmbedding(
  text: string,
  config: EmbeddingConfig = DEFAULT_EMBEDDING_CONFIG
): Promise<number[]> {
  const client = getGeminiClient();
  
  // Use the models API for embeddings (if available) or getGenerativeModel
  // The @google/generative-ai package structure may vary by version
  let result: any;
  
  if ((client as any).models?.embedContent) {
    // Try models.embedContent API (newer structure)
    result = await (client as any).models.embedContent({
      model: config.model,
      contents: text,
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: config.dimensions,
    });
    
    if (result.embeddings && result.embeddings.length > 0) {
      const embedding = result.embeddings[0];
      return Array.isArray(embedding) ? embedding : (embedding.values || embedding);
    }
  } else {
    // Fallback: use getGenerativeModel (if embedContent exists on model)
    const model = client.getGenerativeModel({ model: config.model });
    if ((model as any).embedContent) {
      result = await (model as any).embedContent({
        content: { parts: [{ text }], role: "user" },
        taskType: "RETRIEVAL_DOCUMENT",
        outputDimensionality: config.dimensions,
      });
      
      if (result.embedding?.values) {
        return result.embedding.values;
      }
      if (Array.isArray(result.embedding)) {
        return result.embedding;
      }
    }
  }
  
  throw new Error("Failed to generate embedding: no embedding values returned or unsupported API structure");
}

/**
 * Generate embeddings for multiple texts in batches.
 *
 * @param texts - Array of AI-SAFE texts
 * @param config - Embedding configuration
 * @returns Array of embedding vectors
 */
export async function generateEmbeddings(
  texts: string[],
  config: EmbeddingConfig = DEFAULT_EMBEDDING_CONFIG
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const client = getGeminiClient();
  const embeddings: number[][] = [];

  // Process in batches - Gemini API supports batch embedding
  for (let i = 0; i < texts.length; i += config.batchSize) {
    const batch = texts.slice(i, i + config.batchSize);
    let result: any;

    // Try models.embedContent API (newer structure)
    if ((client as any).models?.embedContent) {
      result = await (client as any).models.embedContent({
        model: config.model,
        contents: batch,
        taskType: "RETRIEVAL_DOCUMENT",
        outputDimensionality: config.dimensions,
      });

      if (result.embeddings && result.embeddings.length === batch.length) {
        for (const embeddingData of result.embeddings) {
          const embedding = Array.isArray(embeddingData) ? embeddingData : (embeddingData.values || embeddingData);
          if (!embedding || !Array.isArray(embedding)) {
            throw new Error("Failed to extract embedding: invalid embedding format");
          }
          embeddings.push(embedding);
        }
        continue;
      }
    }

    // Fallback: process individually if batch API not available or failed
    const batchPromises = batch.map((text) => generateEmbedding(text, config));
    const batchEmbeddings = await Promise.all(batchPromises);
    embeddings.push(...batchEmbeddings);
  }

  return embeddings;
}

/**
 * Generate embeddings for chunks with progress callback.
 *
 * @param chunks - Array of text chunks (AI-SAFE)
 * @param config - Embedding configuration
 * @param onProgress - Optional progress callback
 * @returns Chunks with embeddings attached
 */
export async function generateChunkEmbeddings(
  chunks: TextChunk[],
  config: EmbeddingConfig = DEFAULT_EMBEDDING_CONFIG,
  onProgress?: (completed: number, total: number) => void
): Promise<Array<TextChunk & { embedding: number[] }>> {
  const result: Array<TextChunk & { embedding: number[] }> = [];
  const client = getGeminiClient();

  for (let i = 0; i < chunks.length; i += config.batchSize) {
    const batch = chunks.slice(i, i + config.batchSize);
    const batchTexts = batch.map((c) => c.content);
    let embeddingResult: any;

    // Try models.embedContent API (newer structure)
    if ((client as any).models?.embedContent) {
      embeddingResult = await (client as any).models.embedContent({
        model: config.model,
        contents: batchTexts,
        taskType: "RETRIEVAL_DOCUMENT",
        outputDimensionality: config.dimensions,
      });

      if (embeddingResult.embeddings && embeddingResult.embeddings.length === batch.length) {
        // Map embeddings back to chunks
        for (let j = 0; j < batch.length; j++) {
          const embeddingData = embeddingResult.embeddings[j];
          const embedding = Array.isArray(embeddingData) ? embeddingData : (embeddingData.values || embeddingData);
          
          if (!embedding || !Array.isArray(embedding)) {
            throw new Error(`Failed to extract embedding for chunk ${batch[j].index}: invalid embedding format`);
          }

          result.push({
            ...batch[j],
            embedding,
          });
        }

        if (onProgress) {
          onProgress(Math.min(i + config.batchSize, chunks.length), chunks.length);
        }
        continue;
      }
    }

    // Fallback: process individually if batch API not available or failed
    for (let j = 0; j < batch.length; j++) {
      const embedding = await generateEmbedding(batch[j].content, config);
      result.push({
        ...batch[j],
        embedding,
      });
    }

    if (onProgress) {
      onProgress(Math.min(i + config.batchSize, chunks.length), chunks.length);
    }
  }

  return result;
}

// ============================================================================
// QUERY EMBEDDING
// ============================================================================

/**
 * Generate embedding for a search query.
 *
 * @param query - User's search query
 * @param config - Embedding configuration
 * @returns Query embedding vector
 */
export async function generateQueryEmbedding(
  query: string,
  config: EmbeddingConfig = DEFAULT_EMBEDDING_CONFIG
): Promise<number[]> {
  // Normalize query (trim, collapse whitespace)
  const normalizedQuery = query.trim().replace(/\s+/g, " ");

  if (normalizedQuery.length === 0) {
    throw new Error("Query cannot be empty");
  }

  return generateEmbedding(normalizedQuery, config);
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Calculate cosine similarity between two vectors.
 * (For local testing/validation - production uses pgvector)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have same dimension");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Estimate embedding cost for a number of chunks.
 * Based on Google Gemini pricing (approximate).
 */
export function estimateEmbeddingCost(
  chunkCount: number,
  avgChunkTokens: number = 500,
  config: EmbeddingConfig = DEFAULT_EMBEDDING_CONFIG
): { tokens: number; estimatedCostUsd: number } {
  // Approximate: 1 token ~= 4 characters, but we use token estimate
  const totalTokens = chunkCount * avgChunkTokens;

  // Google Gemini embedding pricing (as of 2025):
  // gemini-embedding-001: $0.0001 per 1K tokens (input)
  // Note: Gemini embeddings are free for up to 1M tokens/month, then $0.0001 per 1K tokens
  const pricePerThousand = 0.0001;

  return {
    tokens: totalTokens,
    estimatedCostUsd: (totalTokens / 1000) * pricePerThousand,
  };
}

/**
 * Format embedding vector for pgvector insertion.
 * pgvector expects format: '[0.1,0.2,0.3,...]'
 */
export function formatForPgvector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/**
 * Parse embedding from pgvector format.
 */
export function parseFromPgvector(pgvectorString: string): number[] {
  // Remove brackets and parse
  const inner = pgvectorString.slice(1, -1);
  return inner.split(",").map(Number);
}
