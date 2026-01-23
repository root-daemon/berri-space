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
  - Scale: Pinecone
- AI Provider: OpenAI

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