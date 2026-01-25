/**
 * Chat Actions
 *
 * Server actions for AI chat functionality.
 */

"use server";

import { getCurrentUser, getCurrentOrganization, AuthenticationError } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import type {
  AiReadyFile,
  ConversationSummary,
  ConversationWithMessages,
  StoredMessage,
  ChatContext,
} from "./chat-types";

// ============================================================================
// TYPES
// ============================================================================

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

// ============================================================================
// LIST AI-READY FILES (OPTIMIZED)
// ============================================================================

/**
 * Lists all indexed files that the user has access to.
 * Uses optimized database function to check permissions in a single query.
 *
 * @returns List of files with fileId and fileName
 */
export async function listAiReadyFilesAction(): Promise<ActionResult<AiReadyFile[]>> {
  try {
    const user = await getCurrentUser();
    const { organization } = await getCurrentOrganization();
    const supabase = getServerSupabaseClient();

    // Use optimized RPC function that checks permissions in one query
    const { data, error } = await supabase.rpc("list_accessible_ai_files", {
      p_user_id: user.id,
      p_organization_id: organization.id,
    });

    if (error) {
      console.error("Error fetching accessible files:", error);
      return {
        success: false,
        error: "Failed to fetch files",
        code: "QUERY_ERROR",
      };
    }

    const files: AiReadyFile[] = (data || []).map((row: { file_id: string; file_name: string }) => ({
      fileId: row.file_id,
      fileName: row.file_name,
    }));

    return { success: true, data: files };
  } catch (error) {
    console.error("listAiReadyFilesAction error:", error);

    if (error instanceof AuthenticationError) {
      return {
        success: false,
        error: "Authentication required",
        code: "AUTH_ERROR",
      };
    }

    return {
      success: false,
      error: "An unexpected error occurred",
      code: "UNKNOWN_ERROR",
    };
  }
}

// ============================================================================
// CHAT HISTORY ACTIONS
// ============================================================================

/**
 * Lists all conversations for the current user.
 * Returns most recent first.
 */
export async function listConversationsAction(): Promise<ActionResult<ConversationSummary[]>> {
  try {
    const user = await getCurrentUser();
    const { organization } = await getCurrentOrganization();
    const supabase = getServerSupabaseClient();

    // Get conversations with message count
    const { data: conversations, error } = await supabase
      .from("chat_conversations")
      .select(`
        id,
        title,
        updated_at,
        chat_messages (
          id,
          content,
          role
        )
      `)
      .eq("user_id", user.id)
      .eq("organization_id", organization.id)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error fetching conversations:", error);
      return {
        success: false,
        error: "Failed to fetch conversations",
        code: "QUERY_ERROR",
      };
    }

    const summaries: ConversationSummary[] = (conversations || []).map((conv) => {
      const messages = conv.chat_messages as { id: string; content: string; role: string }[] || [];
      const firstUserMessage = messages.find((m) => m.role === "user");

      return {
        id: conv.id,
        title: conv.title,
        preview: firstUserMessage?.content.substring(0, 100) || "",
        updatedAt: new Date(conv.updated_at),
        messageCount: messages.length,
      };
    });

    return { success: true, data: summaries };
  } catch (error) {
    console.error("listConversationsAction error:", error);

    if (error instanceof AuthenticationError) {
      return {
        success: false,
        error: "Authentication required",
        code: "AUTH_ERROR",
      };
    }

    return {
      success: false,
      error: "An unexpected error occurred",
      code: "UNKNOWN_ERROR",
    };
  }
}

/**
 * Gets a conversation with all its messages.
 */
export async function getConversationAction(
  conversationId: string
): Promise<ActionResult<ConversationWithMessages>> {
  try {
    const user = await getCurrentUser();
    const supabase = getServerSupabaseClient();

    // Get conversation (RLS ensures user can only access their own)
    const { data: conversation, error: convError } = await supabase
      .from("chat_conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .single();

    if (convError || !conversation) {
      return {
        success: false,
        error: "Conversation not found",
        code: "NOT_FOUND",
      };
    }

    // Get messages
    const { data: messages, error: msgError } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (msgError) {
      console.error("Error fetching messages:", msgError);
      return {
        success: false,
        error: "Failed to fetch messages",
        code: "QUERY_ERROR",
      };
    }

    const storedMessages: StoredMessage[] = (messages || []).map((msg) => ({
      id: msg.id,
      role: msg.role as "user" | "assistant",
      content: msg.content,
      mentionedFileIds: msg.mentioned_file_ids || [],
      createdAt: new Date(msg.created_at),
    }));

    return {
      success: true,
      data: {
        id: conversation.id,
        title: conversation.title,
        createdAt: new Date(conversation.created_at),
        updatedAt: new Date(conversation.updated_at),
        messages: storedMessages,
      },
    };
  } catch (error) {
    console.error("getConversationAction error:", error);

    if (error instanceof AuthenticationError) {
      return {
        success: false,
        error: "Authentication required",
        code: "AUTH_ERROR",
      };
    }

    return {
      success: false,
      error: "An unexpected error occurred",
      code: "UNKNOWN_ERROR",
    };
  }
}

/**
 * Creates a new conversation with the first message.
 * Title is auto-generated from the first message.
 */
export async function createConversationAction(
  firstMessage: string,
  mentionedFileIds: string[] = []
): Promise<ActionResult<{ conversationId: string }>> {
  try {
    const user = await getCurrentUser();
    const { organization } = await getCurrentOrganization();
    const supabase = getServerSupabaseClient();

    // Generate title from first message (first 50 chars)
    const title = firstMessage.length > 50
      ? firstMessage.substring(0, 47) + "..."
      : firstMessage;

    // Create conversation
    const { data: conversation, error: convError } = await supabase
      .from("chat_conversations")
      .insert({
        user_id: user.id,
        organization_id: organization.id,
        title,
      })
      .select()
      .single();

    if (convError || !conversation) {
      console.error("Error creating conversation:", convError);
      return {
        success: false,
        error: "Failed to create conversation",
        code: "INSERT_ERROR",
      };
    }

    // Add the first user message
    const { error: msgError } = await supabase.from("chat_messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: firstMessage,
      mentioned_file_ids: mentionedFileIds,
    });

    if (msgError) {
      console.error("Error creating first message:", msgError);
      // Still return the conversation ID - the message will be lost but conversation exists
    }

    return { success: true, data: { conversationId: conversation.id } };
  } catch (error) {
    console.error("createConversationAction error:", error);

    if (error instanceof AuthenticationError) {
      return {
        success: false,
        error: "Authentication required",
        code: "AUTH_ERROR",
      };
    }

    return {
      success: false,
      error: "An unexpected error occurred",
      code: "UNKNOWN_ERROR",
    };
  }
}

/**
 * Adds a message to an existing conversation.
 */
export async function addMessageAction(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  mentionedFileIds: string[] = [],
  ragContext: ChatContext[] | null = null
): Promise<ActionResult<{ messageId: string }>> {
  try {
    const user = await getCurrentUser();
    const supabase = getServerSupabaseClient();

    // Verify conversation belongs to user (will fail due to RLS if not)
    const { data: conversation, error: convError } = await supabase
      .from("chat_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .single();

    if (convError || !conversation) {
      return {
        success: false,
        error: "Conversation not found",
        code: "NOT_FOUND",
      };
    }

    // Add message
    const { data: message, error: msgError } = await supabase
      .from("chat_messages")
      .insert({
        conversation_id: conversationId,
        role,
        content,
        mentioned_file_ids: role === "user" ? mentionedFileIds : [],
        rag_context: role === "assistant" ? ragContext : null,
      })
      .select()
      .single();

    if (msgError || !message) {
      console.error("Error adding message:", msgError);
      return {
        success: false,
        error: "Failed to add message",
        code: "INSERT_ERROR",
      };
    }

    return { success: true, data: { messageId: message.id } };
  } catch (error) {
    console.error("addMessageAction error:", error);

    if (error instanceof AuthenticationError) {
      return {
        success: false,
        error: "Authentication required",
        code: "AUTH_ERROR",
      };
    }

    return {
      success: false,
      error: "An unexpected error occurred",
      code: "UNKNOWN_ERROR",
    };
  }
}

/**
 * Deletes a conversation and all its messages.
 */
export async function deleteConversationAction(
  conversationId: string
): Promise<ActionResult<void>> {
  try {
    const user = await getCurrentUser();
    const supabase = getServerSupabaseClient();

    // Delete conversation (RLS ensures user can only delete their own)
    // Messages are cascade deleted
    const { error } = await supabase
      .from("chat_conversations")
      .delete()
      .eq("id", conversationId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Error deleting conversation:", error);
      return {
        success: false,
        error: "Failed to delete conversation",
        code: "DELETE_ERROR",
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    console.error("deleteConversationAction error:", error);

    if (error instanceof AuthenticationError) {
      return {
        success: false,
        error: "Authentication required",
        code: "AUTH_ERROR",
      };
    }

    return {
      success: false,
      error: "An unexpected error occurred",
      code: "UNKNOWN_ERROR",
    };
  }
}
