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
import type {
  ChatContext,
  ChatPrompt,
  ChatMessage,
  ContextMode,
  ContextRetrievalResult,
  ChatPromptWithMetadata,
} from "./chat-types";

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
 * Retrieves relevant document chunks using RAG with mode-aware selection.
 *
 * CONTEXT SELECTION RULES:
 * 1. If fileIds provided (explicit @file mentions):
 *    - Search ONLY within those files
 *    - Do NOT search other documents
 * 2. If fileIds NOT provided:
 *    - Search ALL documents user has VIEW access to
 *    - Retrieve top N most relevant chunks
 *
 * @param userId - Current user ID
 * @param organizationId - Current organization ID
 * @param query - User's question
 * @param fileIds - Optional file IDs to restrict search scope (explicit @file mode)
 * @returns Context retrieval result with mode metadata
 */
export async function retrieveContext(
  userId: string,
  organizationId: string,
  query: string,
  fileIds?: string[]
): Promise<ContextRetrievalResult> {
  const supabase = createServerSupabaseClient();
  const supabaseAdmin = createServerSupabaseClient();

  // Determine context mode
  const hasExplicitFiles = fileIds && Array.isArray(fileIds) && fileIds.length > 0;
  const mode: ContextMode = hasExplicitFiles ? 'explicit_files' : 'automatic_search';

  // Use searchSimilar with optional fileIds filter
  // If explicit files: search only within those files
  // If automatic: search all accessible documents (no fileIds filter)
  const { results, error } = await searchSimilar(
    supabase,
    supabaseAdmin,
    userId,
    organizationId,
    query,
    {
      limit: 15,
      similarityThreshold: 0.65,
      fileIds: hasExplicitFiles ? fileIds : undefined,
    }
  );

  if (error) {
    console.error("RAG retrieval error:", error);
    return {
      context: [],
      mode,
      hasDocumentContext: false,
      requestedFileIds: hasExplicitFiles ? fileIds : undefined,
    };
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
  const context = Array.from(contextByFile.values()).sort(
    (a, b) => b.similarity - a.similarity
  );

  return {
    context,
    mode,
    hasDocumentContext: context.length > 0,
    requestedFileIds: hasExplicitFiles ? fileIds : undefined,
  };
}

/**
 * @deprecated Use retrieveContext which returns ContextRetrievalResult
 * Maintained for backwards compatibility during transition
 */
export async function retrieveContextLegacy(
  userId: string,
  organizationId: string,
  query: string,
  fileIds?: string[]
): Promise<ChatContext[]> {
  const result = await retrieveContext(userId, organizationId, query, fileIds);
  return result.context;
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

/**
 * Builds system and user prompts for the LLM based on context retrieval result.
 *
 * PROMPT CONSTRUCTION RULES:
 * 1. If document context exists:
 *    - Include excerpts explicitly
 *    - Instruct model to answer ONLY from provided content
 *    - Add "Based on your documents..." transparency prefix
 *
 * 2. If no document context exists:
 *    - Do NOT mention documents
 *    - Answer as general-purpose AI assistant
 *    - Add disclaimer about no document context found
 *
 * @param contextResult - Context retrieval result with mode metadata
 * @param messages - Conversation history
 * @returns Structured prompts for streaming with metadata
 */
export function buildChatPrompt(
  contextResult: ContextRetrievalResult,
  messages: ChatMessage[]
): ChatPromptWithMetadata {
  // Extract the latest user message
  const latestUserMessage =
    messages.filter((m) => m.role === "user").pop()?.content || "";

  const { context, mode, hasDocumentContext } = contextResult;

  // Select prompt template based on context availability
  if (hasDocumentContext) {
    // CASE 1: Document context found - answer from documents
    return buildDocumentContextPrompt(context, latestUserMessage, mode);
  } else {
    // CASE 2 & 3: No document context - fallback to general knowledge
    return buildGeneralKnowledgeFallbackPrompt(latestUserMessage, mode, contextResult.requestedFileIds);
  }
}

/**
 * Builds prompts for DOCUMENT CONTEXT mode.
 * Used when relevant document chunks were found.
 *
 * BEHAVIOR:
 * - First, check if the documents contain relevant information
 * - If YES: Answer from documents with "Based on your documents..."
 * - If NO: Fall back to general knowledge with clear disclaimer
 */
function buildDocumentContextPrompt(
  context: ChatContext[],
  userMessage: string,
  mode: ContextMode
): ChatPromptWithMetadata {
  const fileNames = context.map((c) => c.fileName).join(", ");

  const systemPrompt = `You are an AI assistant helping users with their questions.

You have access to document excerpts from the user's files. Follow these rules:

STEP 1 - CHECK RELEVANCE:
First, determine if the provided document excerpts contain information relevant to answering the user's question.

STEP 2 - RESPOND APPROPRIATELY:

IF the documents contain relevant information:
- Start your response with "Based on your documents, "
- Answer using ONLY the information from the provided excerpts
- Cite which file your answer comes from when possible
- Be concise and direct

IF the documents do NOT contain relevant information:
- Start your response with "I couldn't find relevant information in your documents, but here's what I can tell you:"
- Then provide a helpful answer using your general knowledge
- Be clear that this answer is NOT from their documents
- Be concise and direct

IMPORTANT:
- Do NOT make up information about what's in the documents
- Do NOT pretend documents contain information they don't have
- It's perfectly fine to use general knowledge when documents aren't helpful

Referenced files: ${fileNames}`;

  let userPrompt = "Document Excerpts:\n\n";

  for (const ctx of context) {
    userPrompt += `--- File: ${ctx.fileName} ---\n`;
    for (const chunk of ctx.chunks) {
      userPrompt += `${chunk}\n\n`;
    }
  }

  userPrompt += `---\n\nUser Question: ${userMessage}`;

  return {
    systemPrompt,
    userPrompt,
    mode,
    hasDocumentContext: true,
    fileCount: context.length,
  };
}

/**
 * Builds prompts for GENERAL KNOWLEDGE FALLBACK mode.
 * Used when no relevant document chunks were found.
 *
 * IMPORTANT: This mode does NOT mention documents or imply they were searched.
 * The AI responds as a general-purpose assistant with a clear disclaimer.
 */
function buildGeneralKnowledgeFallbackPrompt(
  userMessage: string,
  mode: ContextMode,
  requestedFileIds?: string[]
): ChatPromptWithMetadata {
  // Different disclaimer based on whether user explicitly requested files
  const disclaimerPrefix = mode === 'explicit_files'
    ? "I couldn't find relevant information in the documents you mentioned"
    : "I couldn't find relevant information in your documents";

  const systemPrompt = `You are a helpful AI assistant.

CONTEXT SITUATION:
${disclaimerPrefix}. You should:
1. First, briefly acknowledge that no relevant document content was found
2. Then, if you can help with general knowledge, provide a helpful response
3. Be clear that your response is NOT based on the user's documents

RESPONSE FORMAT:
- Start with: "I couldn't find relevant information in ${mode === 'explicit_files' ? 'the specified documents' : 'your documents'}, but here's what I can tell you based on general knowledge:"
- Then provide your helpful response
- Be concise and direct
- If the question is specifically about their documents and you cannot help without document context, say so clearly

DO NOT:
- Pretend to have document context
- Make up information about documents
- Hallucinate document-based answers`;

  const userPrompt = `User Question: ${userMessage}`;

  return {
    systemPrompt,
    userPrompt,
    mode,
    hasDocumentContext: false,
    fileCount: 0,
  };
}

// ============================================================================
// LEGACY SUPPORT
// ============================================================================

/**
 * @deprecated Use buildChatPrompt with ContextRetrievalResult
 * Legacy function for backwards compatibility during transition
 */
export function buildChatPromptLegacy(
  context: ChatContext[],
  messages: ChatMessage[]
): ChatPrompt {
  // Convert to new format
  const contextResult: ContextRetrievalResult = {
    context,
    mode: 'automatic_search',
    hasDocumentContext: context.length > 0,
  };

  const result = buildChatPrompt(contextResult, messages);
  return {
    systemPrompt: result.systemPrompt,
    userPrompt: result.userPrompt,
  };
}
