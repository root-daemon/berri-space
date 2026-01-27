/**
 * Extended Chat Service with External Web Search
 *
 * Implements NotebookLM-style RAG where internal documents are the primary source,
 * with external web search as a fallback when internal documents are insufficient.
 *
 * CONTEXT SELECTION DECISION TREE:
 *
 * 1. User mentions @file
 *    └─ Search ONLY those files
 *       ├─ Found relevant chunks → "Based on your documents..."
 *       └─ No relevant chunks → General knowledge with disclaimer
 *
 * 2. User does NOT mention files
 *    └─ Search ALL accessible documents
 *       ├─ Found relevant chunks → "Based on your documents..."
 *       └─ No relevant chunks → Trigger external web search
 *          ├─ External found → "I couldn't find this in your documents, but online..."
 *          └─ External empty → General knowledge, no source mention
 *
 * SECURITY:
 * - Internal and external context are NEVER mixed silently
 * - External content is NEVER persisted to database
 * - Distinct prompt templates ensure transparency
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { searchSimilar } from '@/lib/ai/search';
import { performExternalSearch, isExternalSearchAvailable } from './external-search';
import type { ChatContext, ChatMessage } from './chat-types';
import type {
  ExtendedContextMode,
  ExtendedContextRetrievalResult,
  ExtendedChatPromptResult,
  InternalContext,
} from './external-search-types';

// ============================================================================
// CONFIGURATION
// ============================================================================

const EXTERNAL_SEARCH_ENABLED = process.env.EXTERNAL_SEARCH_ENABLED !== 'false';

// ============================================================================
// EXTENDED CONTEXT RETRIEVAL
// ============================================================================

/**
 * Retrieve context using the NotebookLM-style decision tree.
 *
 * Decision tree:
 * 1. If fileIds provided → search ONLY those files (no external fallback)
 * 2. If no fileIds → search all documents
 *    - Found → return internal context
 *    - Not found → trigger external search
 *
 * @param userId - Current user ID
 * @param organizationId - Current organization ID
 * @param query - User's question
 * @param fileIds - Optional file IDs for explicit @file mode
 * @returns Extended context with mode metadata
 */
export async function retrieveExtendedContext(
  userId: string,
  organizationId: string,
  query: string,
  fileIds?: string[]
): Promise<ExtendedContextRetrievalResult> {
  const supabase = createServerSupabaseClient();
  const supabaseAdmin = createServerSupabaseClient();

  // Determine if user explicitly requested files
  const hasExplicitFiles = fileIds && Array.isArray(fileIds) && fileIds.length > 0;

  // Initialize result
  const result: ExtendedContextRetrievalResult = {
    internalContext: [],
    hasInternalContext: false,
    externalContext: [],
    hasExternalContext: false,
    mode: 'general_knowledge', // Default, will be updated
    requestedFileIds: hasExplicitFiles ? fileIds : undefined,
    searchPerformed: {
      internal: false,
      external: false,
    },
  };

  // Step 1: Always try internal search first
  console.log(`[Extended Context] Starting internal search, explicit files: ${hasExplicitFiles}`);

  const { results: searchResults, error: searchError } = await searchSimilar(
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

  result.searchPerformed.internal = true;

  if (searchError) {
    console.error('[Extended Context] Internal search error:', searchError);
  }

  // Process internal results
  if (searchResults && searchResults.length > 0) {
    result.internalContext = groupChunksByFile(searchResults);
    result.hasInternalContext = true;
    result.mode = hasExplicitFiles ? 'explicit_files' : 'automatic_search';

    console.log(
      `[Extended Context] Found ${result.internalContext.length} files with relevant content`
    );

    return result;
  }

  // Step 2: No internal results - decision branch
  console.log('[Extended Context] No internal results found');

  if (hasExplicitFiles) {
    // CASE 1: User explicitly requested files but no results
    // Do NOT search externally - fall back to general knowledge with disclaimer
    result.mode = 'explicit_files';
    console.log('[Extended Context] Explicit files requested, no external search');
    return result;
  }

  // CASE 2: No files mentioned and no internal results - try external search
  if (EXTERNAL_SEARCH_ENABLED) {
    console.log('[Extended Context] Attempting external search...');

    // Check if services are available before attempting
    const externalAvailable = await isExternalSearchAvailable();

    if (externalAvailable) {
      const externalResult = await performExternalSearch(query);
      result.searchPerformed.external = true;

      if (externalResult.hasContent) {
        result.externalContext = externalResult.contexts;
        result.hasExternalContext = true;
        result.mode = 'external_search';

        console.log(
          `[Extended Context] External search found ${result.externalContext.length} sources`
        );

        return result;
      } else {
        console.log('[Extended Context] External search returned no usable content');
        if (externalResult.errors.length > 0) {
          console.log('[Extended Context] External errors:', externalResult.errors);
        }
      }
    } else {
      console.log('[Extended Context] External search services unavailable');
    }
  } else {
    console.log('[Extended Context] External search is disabled');
  }

  // CASE 3: No results anywhere - general knowledge
  result.mode = 'general_knowledge';
  console.log('[Extended Context] Falling back to general knowledge');

  return result;
}

/**
 * Group search results by file for easier prompt building.
 */
function groupChunksByFile(
  results: Array<{
    fileId: string;
    fileName: string;
    content: string;
    similarity: number;
  }>
): InternalContext[] {
  const contextByFile = new Map<string, InternalContext>();

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
  return Array.from(contextByFile.values()).sort((a, b) => b.similarity - a.similarity);
}

// ============================================================================
// EXTENDED PROMPT BUILDING
// ============================================================================

/**
 * Build prompts based on extended context retrieval result.
 *
 * Uses distinct prompt templates for each mode to ensure transparency:
 * - Internal documents: "Based on your documents..."
 * - External sources: "I couldn't find this in your documents, but online..."
 * - General knowledge: "I don't have document context for this..."
 *
 * @param contextResult - Extended context retrieval result
 * @param messages - Conversation history
 * @returns Structured prompts with mode metadata
 */
export function buildExtendedChatPrompt(
  contextResult: ExtendedContextRetrievalResult,
  messages: ChatMessage[]
): ExtendedChatPromptResult {
  // Extract the latest user message
  const latestUserMessage =
    messages.filter((m) => m.role === 'user').pop()?.content || '';

  const { mode, hasInternalContext, hasExternalContext } = contextResult;

  // Select prompt builder based on mode
  if (hasInternalContext) {
    return buildInternalContextPrompt(
      contextResult.internalContext,
      latestUserMessage,
      mode
    );
  }

  if (hasExternalContext) {
    return buildExternalContextPrompt(
      contextResult.externalContext,
      latestUserMessage
    );
  }

  // No context - general knowledge
  return buildGeneralKnowledgePrompt(
    latestUserMessage,
    mode,
    contextResult.requestedFileIds
  );
}

/**
 * Build prompts for INTERNAL DOCUMENT CONTEXT mode.
 */
function buildInternalContextPrompt(
  context: InternalContext[],
  userMessage: string,
  mode: ExtendedContextMode
): ExtendedChatPromptResult {
  const fileNames = context.map((c) => c.fileName).join(', ');

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

  let userPrompt = 'Document Excerpts:\n\n';

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
    hasInternalContext: true,
    hasExternalContext: false,
    internalFileCount: context.length,
    externalSourceCount: 0,
  };
}

/**
 * Build prompts for EXTERNAL WEB CONTEXT mode.
 *
 * IMPORTANT: This mode is used ONLY when internal documents had no relevant content.
 * The prompt clearly indicates this is from web sources, not user's documents.
 */
function buildExternalContextPrompt(
  context: ExtendedContextRetrievalResult['externalContext'],
  userMessage: string
): ExtendedChatPromptResult {
  const systemPrompt = `You are an AI assistant helping users with their questions.

IMPORTANT CONTEXT:
I searched the user's documents but couldn't find relevant information for their question.
I then searched the web and found some potentially relevant information from external sources.

RESPONSE RULES:
1. Start your response with: "I couldn't find this in your documents, but here's what I found online:"
2. Synthesize information from the provided web sources
3. ALWAYS cite your sources using the provided URLs
4. Be clear that this information is from the web, NOT from the user's documents
5. If the web sources don't fully answer the question, acknowledge the limitations
6. Be concise and direct

CITATION FORMAT:
When citing information, include the source URL inline or at the end.
Example: "According to [Source Title](URL), ..."

DO NOT:
- Pretend this information is from the user's documents
- Make up URLs or sources
- Provide information without attribution`;

  let userPrompt = 'Web Sources:\n\n';

  for (const ctx of context) {
    userPrompt += `--- Source: ${ctx.title || 'Untitled'} ---\n`;
    userPrompt += `URL: ${ctx.url}\n\n`;
    for (const chunk of ctx.chunks) {
      userPrompt += `${chunk}\n\n`;
    }
  }

  userPrompt += `---\n\nUser Question: ${userMessage}`;

  return {
    systemPrompt,
    userPrompt,
    mode: 'external_search',
    hasInternalContext: false,
    hasExternalContext: true,
    internalFileCount: 0,
    externalSourceCount: context.length,
  };
}

/**
 * Build prompts for GENERAL KNOWLEDGE FALLBACK mode.
 *
 * Used when neither internal documents nor external search provided results.
 */
function buildGeneralKnowledgePrompt(
  userMessage: string,
  mode: ExtendedContextMode,
  requestedFileIds?: string[]
): ExtendedChatPromptResult {
  // Different disclaimer based on whether user explicitly requested files
  const hasExplicitFiles = mode === 'explicit_files' && requestedFileIds?.length;

  let disclaimerPrefix: string;
  let startPhrase: string;

  if (hasExplicitFiles) {
    disclaimerPrefix = "I couldn't find relevant information in the documents you mentioned.";
    startPhrase = "I couldn't find relevant information in the specified documents";
  } else {
    disclaimerPrefix = "I couldn't find relevant information in your documents or from web sources.";
    startPhrase = "I don't have document context for this";
  }

  const systemPrompt = `You are a helpful AI assistant.

CONTEXT SITUATION:
${disclaimerPrefix}

RESPONSE RULES:
1. Start with: "${startPhrase}, but here's what I can tell you based on general knowledge:"
2. Then provide a helpful response using your general knowledge
3. Be clear that your response is NOT based on the user's documents
4. Be concise and direct
5. If the question is specifically about their documents and you cannot help without document context, say so clearly

DO NOT:
- Pretend to have document context
- Make up information about documents
- Hallucinate document-based answers`;

  const userPrompt = `User Question: ${userMessage}`;

  return {
    systemPrompt,
    userPrompt,
    mode,
    hasInternalContext: false,
    hasExternalContext: false,
    internalFileCount: 0,
    externalSourceCount: 0,
  };
}

// ============================================================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================================================

export { validateFileAccess } from './chat-service';
