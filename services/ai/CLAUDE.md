# CLAUDE.md — services/ai/

This directory contains AI and RAG-related logic.

---

## Core Rule (ABSOLUTE)

AI must NEVER receive:
- Raw documents
- Unredacted content
- Data the user does not have permission to access

---

## Redaction Rules

- Redaction is permanent removal of content
- Masking or hiding text is not sufficient
- Only AI-visible content may be embedded or indexed

---

## RAG Flow

1. Authenticate user
2. Verify permission to ask AI
3. Retrieve only AI-visible chunks
4. Send chunks + question to LLM
5. Return response
6. Log interaction

---

## Vector Indexing

- Only redacted text is chunked
- Only redacted text is embedded
- Each chunk must reference its source file

---

## Safety Defaults

- If access is ambiguous, return no data
- Prefer partial answers over leaking data