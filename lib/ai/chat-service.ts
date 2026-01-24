/**
 * Chat Service Layer
 *
 * Encapsulates RAG logic, permission checks, and prompt building for AI chat.
 *
 * SECURITY:
 * - All file access is validated through permissions system
 * - RAG context is org-scoped and permission-filtered
 * - Prompts enforce "answer only from provided excerpts" constraint
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canUserAccess } from "@/lib/permissions";
import { searchSimilar } from "@/lib/ai/search";
import type { ChatContext, ChatPrompt, ChatMessage } from "./chat-types";

// ============================================================================
// FILE ACCESS VALIDATION
// ============================================================================

/**
 * Validates that user has view access to all mentioned files.
 *
 * @throws PermissionError if any file is not accessible
 */
export async function validateFileAccess(
  userId: string,
  fileIds: string[]
): Promise<void> {
  for (const fileId of fileIds) {
    const result = await canUserAccess(userId, "file", fileId, "view");
    if (!result.allowed) {
      throw new Error(
        `Access denied to file ${fileId}. ${result.reason || "Insufficient permissions"}`
      );
    }
  }
}

// ============================================================================
// RAG CONTEXT RETRIEVAL
// ============================================================================

/**
 * Retrieves relevant document chunks using RAG.
 *
 * @param userId - Current user ID
 * @param organizationId - Current organization ID
 * @param query - User's question
 * @param fileIds - Optional file IDs to restrict search scope
 * @returns Array of context chunks grouped by file
 */
export async function retrieveContext(
  userId: string,
  organizationId: string,
  query: string,
  fileIds?: string[]
): Promise<ChatContext[]> {
  const supabase = createServerSupabaseClient();
  const supabaseAdmin = createServerSupabaseClient();

  // Use searchSimilar with optional fileIds filter
  const { results, error } = await searchSimilar(
    supabase,
    supabaseAdmin,
    userId,
    organizationId,
    query,
    {
      limit: 15,
      similarityThreshold: 0.65,
      fileIds: fileIds,
    }
  );

  if (error) {
    console.error("RAG retrieval error:", error);
    return [];
  }

  // Group chunks by file
  const contextByFile = new Map<string, ChatContext>();

  for (const result of results) {
    const existing = contextByFile.get(result.fileId);

    if (existing) {
      existing.chunks.push(result.content);
      existing.similarity = Math.max(existing.similarity, result.similarity);
    } else {
      contextByFile.set(result.fileId, {
        fileId: result.fileId,
        fileName: result.fileName,
        chunks: [result.content],
        similarity: result.similarity,
      });
    }
  }

  // Sort by similarity (highest first)
  return Array.from(contextByFile.values()).sort(
    (a, b) => b.similarity - a.similarity
  );
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

/**
 * Builds system and user prompts for the LLM.
 *
 * @param context - Retrieved RAG context
 * @param messages - Conversation history
 * @returns Structured prompts for streaming
 */
export function buildChatPrompt(
  context: ChatContext[],
  messages: ChatMessage[]
): ChatPrompt {
  // Extract the latest user message
  const latestUserMessage =
    messages.filter((m) => m.role === "user").pop()?.content || "";

  // Build system prompt
  const systemPrompt = buildSystemPrompt(context);

  // Build user prompt with context
  const userPrompt = buildUserPrompt(context, latestUserMessage);

  return { systemPrompt, userPrompt };
}

/**
 * Builds the system prompt with instructions.
 */
function buildSystemPrompt(context: ChatContext[]): string {
  const hasContext = context.length > 0;

  let prompt = `You are an AI assistant helping users understand their documents.

CRITICAL RULES:
- Answer ONLY using the provided document excerpts below
- If the excerpts don't contain enough information, explicitly say so
- Do not use external knowledge or make assumptions
- Cite which file your answer comes from when possible
- Be concise and direct in your responses`;

  if (hasContext) {
    const fileNames = context.map((c) => c.fileName).join(", ");
    prompt += `\n\nReferenced files: ${fileNames}`;
  }

  return prompt;
}

/**
 * Builds the user prompt with document excerpts.
 */
function buildUserPrompt(
  context: ChatContext[],
  userMessage: string
): string {
  if (context.length === 0) {
    return `No relevant document excerpts were found. Please inform the user that you don't have access to relevant documents to answer their question.

User Question: ${userMessage}`;
  }

  let prompt = "Document Excerpts:\n\n";

  for (const ctx of context) {
    prompt += `--- File: ${ctx.fileName} ---\n`;
    for (const chunk of ctx.chunks) {
      prompt += `${chunk}\n\n`;
    }
  }

  prompt += `---\n\nUser Question: ${userMessage}`;

  return prompt;
}
