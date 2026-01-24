/**
 * AI Chat API Route
 *
 * Handles streaming chat requests with RAG (Retrieval-Augmented Generation).
 *
 * Flow:
 * 1. Authenticate user
 * 2. Validate file access (if fileIds provided)
 * 3. Retrieve relevant context via RAG
 * 4. Build prompts
 * 5. Stream response from Gemini 2.5
 *
 * SECURITY:
 * - User must be authenticated
 * - File access is validated before RAG
 * - All searches are org-scoped and permission-filtered
 */

import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import { NextResponse } from "next/server";
import { getCurrentUser, getCurrentOrganization, AuthenticationError } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import {
  validateFileAccess,
  retrieveContext,
  buildChatPrompt,
} from "@/lib/ai/chat-service";

// Set maximum duration for streaming
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    // 1. Parse request body
    const body = await req.json();
    const { messages, fileIds } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages array is required" },
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

    // 4. Extract query from latest user message
    const query = messages[messages.length - 1]?.content || "";

    if (!query.trim()) {
      return NextResponse.json(
        { error: "Query cannot be empty" },
        { status: 400 }
      );
    }

    // 5. Retrieve RAG context
    const context = await retrieveContext(
      user.id,
      organization.id,
      query,
      fileIds
    );

    // 6. Build prompts
    const { systemPrompt, userPrompt } = buildChatPrompt(context, messages);

    // 7. Stream response from Gemini 2.5 Flash
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

    // 8. Return streaming response
    return result.toDataStreamResponse();
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
