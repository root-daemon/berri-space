# CLAUDE.md — Project Root

## Project Summary

This is a Google Drive–like document management application with:
- Team and role-based access control
- Folder and file permissions
- An AI assistant that answers questions about documents
- Strict redaction rules controlling what AI can see

Frontend is implemented in Next.js App Router.
Backend, APIs, data, and AI logic are implemented incrementally.

---

## Locked Tech Stack (DO NOT CHANGE)

These choices are finalized and must not be changed unless explicitly requested.

- Frontend: Next.js (App Router), TypeScript, Tailwind
- Auth: Clerk
- Database: Supabase Postgres
- File Storage: Supabase Storage (S3-compatible)
- Vector DB:
  - MVP: Supabase pgvector
- AI Provider: Google Gemini
  - Embeddings: Gemini Embedding (gemini-embedding-001)
  - Chat/Generation: Gemini 2.5 Flash (gemini-2.5-flash)
  - SDK: Vercel AI SDK (`ai`, `@ai-sdk/google`) + `@google/generative-ai` 

---

## Non-Negotiable Principles

1. Backend enforces all permissions (UI is not trusted)
2. Permissions are checked before any data access
3. AI must never see raw or restricted content
4. Redaction is permanent removal, not masking
5. Authorization logic is centralized
6. All sensitive actions are auditable

If a solution violates any of these, it is incorrect.

---

## High-Level Authorization Model

Entities:
- User
- Team
- Folder
- File
- Role (admin, editor, viewer)

Rules:
- Users can belong to multiple teams
- Permissions may be granted to users or teams
- Folder permissions inherit to contained files
- admin > editor > viewer
- Only admins can manage permissions and redactions

---

## AI Chat Implementation

### Architecture
The AI chat feature uses **RAG (Retrieval-Augmented Generation)** to answer questions about documents:

1. **User Input**: User asks a question, optionally mentioning files with `@filename`
2. **Permission Check**: All mentioned files are validated for view access
3. **RAG Retrieval**: Query is embedded and similar chunks are retrieved via `searchSimilar`
4. **Prompt Building**: System prompt + document excerpts + user question
5. **LLM Streaming**: Gemini 2.5 Flash streams the response word-by-word
6. **Client Display**: `useChat` hook updates UI in real-time

### Key Features
- **Stateless**: No chat history persistence (each session is independent)
- **File Mentions**: Type `@` to select specific documents for context
- **Permission-Aware**: Only searches documents user has view access to
- **Org-Scoped**: All searches are isolated to user's organization
- **Streaming**: Responses appear word-by-word for better UX

### Security
- Backend validates all file access before RAG retrieval
- LLM only receives redacted (AI-safe) content from `document_chunks`
- Prompts enforce "answer only from provided excerpts" constraint
- All searches are audited in `ai_query_log`

### Implementation Files
- **Backend**: `app/api/ai/chat/route.ts`, `lib/ai/chat-service.ts`
- **Actions**: `lib/ai/chat-actions.ts` (listAiReadyFiles)
- **Components**: `components/chat-input.tsx`, `components/file-picker-dropdown.tsx`
- **Integration**: `components/ai-assistant-panel.tsx`, `app/ai/chat/[chatId]/page.tsx`

---

## How Claude Should Work in This Repo

Claude should:
- Work on one task at a time
- Prefer correctness over speed
- Be conservative with access
- Ask clarifying questions if security is ambiguous

Claude should NOT:
- Introduce new services or providers
- Bypass permission checks
- Duplicate authorization logic
- Implement features without access control

---

## Definition of Done

A task is complete only if:
- Permissions are enforced
- Errors are explicit
- Security assumptions are documented
- Code aligns with the locked stack