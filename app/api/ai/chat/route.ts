/**
 * AI Chat API Route
 *
 * Handles streaming chat requests with NotebookLM-style RAG (Retrieval-Augmented Generation).
 * Uses UI message stream protocol for useChat + DefaultChatTransport.
 *
 * Flow:
 * 1. Authenticate user
 * 2. Validate file access (if fileIds provided)
 * 3. Retrieve context via extended RAG (internal docs + external web fallback)
 * 4. Build prompts based on context mode
 * 5. Stream response from Gemini 2.5
 *
 * CONTEXT SELECTION DECISION TREE:
 * 1. User mentions @file → search ONLY those files
 *    - Found → "Based on your documents..."
 *    - Not found → General knowledge with disclaimer
 * 2. No @file mention → search ALL accessible documents
 *    - Found → "Based on your documents..."
 *    - Not found → Trigger external web search
 *      - External found → "I couldn't find this in your documents, but online..."
 *      - External empty → General knowledge with disclaimer
 *
 * SECURITY:
 * - User must be authenticated
 * - File access is validated before RAG
 * - All searches are org-scoped and permission-filtered
 * - Internal and external content are NEVER mixed silently
 * - External content is NEVER persisted to database
 */

import { streamText, generateId } from "ai";
import { google } from "@ai-sdk/google";
import { NextResponse } from "next/server";
import { getCurrentUser, getCurrentOrganization, AuthenticationError } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import {
  validateFileAccess,
  retrieveExtendedContext,
  buildExtendedChatPrompt,
} from "@/lib/ai/chat-service-extended";
import type { ChatMessage } from "@/lib/ai/chat-types";

// Set maximum duration for streaming
export const maxDuration = 30;

/** Extract plain text from a UI message (content string or parts[].text). */
function getMessageText(msg: { content?: string; parts?: Array<{ type: string; text?: string }> }): string {
  if (typeof msg.content === "string") return msg.content;
  if (!Array.isArray(msg.parts)) return "";
  return msg.parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => (p as { text: string }).text)
    .join("");
}

/** Normalize UI messages to { role, content } for RAG. */
function normalizeMessages(ui: Array<{ role?: string; content?: string; parts?: Array<{ type: string; text?: string }> }>): ChatMessage[] {
  return ui.map((m) => {
    const role = m.role === "user" ? "user" : m.role === "assistant" ? "assistant" : "system";
    return { role, content: getMessageText(m) };
  });
}

export async function POST(req: Request) {
  try {
    // 1. Parse request body (DefaultChatTransport sends id, messages, trigger, messageId; we add fileIds via body)
    const body = await req.json();
    const { messages, fileIds } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages array is required" },
        { status: 400 }
      );
    }

    const normalized = normalizeMessages(messages);
    const query = getMessageText(messages[messages.length - 1] ?? {});

    if (!query.trim()) {
      return NextResponse.json(
        { error: "Query cannot be empty" },
        { status: 400 }
      );
    }

    // 2. Authenticate user
    const user = await getCurrentUser();
    const { organization } = await getCurrentOrganization();

    // 3. Validate file access (if fileIds provided)
    if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
      try {
        await validateFileAccess(user.id, fileIds);
      } catch (error) {
        return NextResponse.json(
          {
            error: error instanceof Error ? error.message : "File access denied",
          },
          { status: 403 }
        );
      }
    }

    // 4. Retrieve extended RAG context with decision tree
    // Decision tree:
    // - If fileIds provided: search ONLY those files (no external fallback)
    // - If no fileIds: search all documents, then external web if needed
    const contextResult = await retrieveExtendedContext(
      user.id,
      organization.id,
      query,
      fileIds
    );

    // 5. Build prompts based on extended context result
    // - Internal context found → "Based on your documents..."
    // - External context found → "I couldn't find this in your documents, but online..."
    // - No context → General knowledge with disclaimer
    const {
      systemPrompt,
      userPrompt,
      mode,
      hasInternalContext,
      hasExternalContext,
    } = buildExtendedChatPrompt(contextResult, normalized);

    // Log context mode for debugging
    console.log(
      `[AI Chat] Mode: ${mode}, Internal: ${hasInternalContext}, External: ${hasExternalContext}, Query: "${query.substring(0, 50)}..."`
    );

    // 6. Stream response from Gemini 2.5 Flash (UI message stream for useChat)
    const result = streamText({
      model: google("gemini-2.5-flash"),
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.7,
      maxTokens: 2048,
    });

    // 7. Return UI message stream (DefaultChatTransport expects this)
    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      generateMessageId: generateId,
    });
  } catch (error) {
    console.error("Chat API error:", error);

    // Handle authentication errors
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Handle permission errors
    if (error instanceof PermissionError) {
      return NextResponse.json(
        { error: error.message },
        { status: 403 }
      );
    }

    // Handle other errors
    return NextResponse.json(
      {
        error: "An error occurred while processing your request",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
